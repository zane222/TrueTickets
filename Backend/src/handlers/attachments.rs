//! S3 attachment upload handler

use lambda_http::{Body, Response};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::primitives::ByteStream;
use serde_json::json;

use crate::http::{error_response, success_response};

use aws_sdk_dynamodb::Client as DynamoDbClient;
use aws_sdk_dynamodb::types::AttributeValue;
use chrono::Utc;

/// Handle attachment upload to ticket
pub async fn handle_upload_attachment(
    ticket_number: String,
    base64_data: &str,
    file_name: &str,
    s3_client: &S3Client,
    db_client: &DynamoDbClient,
) -> Response<Body> {
    // Decode base64 data to bytes
    use base64::Engine;
    let file_bytes = match base64::engine::general_purpose::STANDARD.decode(base64_data) {
        Ok(bytes) => bytes,
        Err(e) => {
            return error_response(
                400,
                "Invalid base64 data",
                &format!("Could not decode base64 data: {}", e),
                None,
            )
        }
    };

    // Get S3 bucket name from environment
    let bucket_name = match std::env::var("S3_BUCKET_NAME") {
        Ok(name) => name,
        Err(_) => {
            return error_response(
                500,
                "Configuration error",
                "S3_BUCKET_NAME environment variable not set",
                None,
            )
        }
    };

    // Generate unique S3 key for the file
    let timestamp = Utc::now().timestamp();
    let s3_key = format!("attachments/{}/{}_{}", ticket_number, timestamp, file_name);

    // Upload file to S3
    let byte_stream = ByteStream::from(file_bytes);
    match s3_client
        .put_object()
        .bucket(&bucket_name)
        .key(&s3_key)
        .body(byte_stream)
        .send()
        .await
    {
        Ok(_) => {
            // Get the public URL of the uploaded file
            let s3_url = format!("https://{}.s3.amazonaws.com/{}", bucket_name, s3_key);

            // Create attachment attribute
            let attachment = AttributeValue::M(
                vec![
                    ("file_name".to_string(), AttributeValue::S(file_name.to_string())),
                    ("url".to_string(), AttributeValue::S(s3_url)),
                    ("created_at".to_string(), AttributeValue::S(Utc::now().to_rfc3339())),
                ]
                .into_iter()
                .collect(),
            );

            // Update DynamoDB
            let db_res = db_client.update_item()
                .table_name("Tickets")
                .key("ticket_number", AttributeValue::N(ticket_number.clone()))
                .update_expression("SET attachments = list_append(if_not_exists(attachments, :empty), :a), last_updated = :lu")
                .expression_attribute_values(":a", AttributeValue::L(vec![attachment]))
                .expression_attribute_values(":empty", AttributeValue::L(vec![]))
                .expression_attribute_values(":lu", AttributeValue::S(Utc::now().to_rfc3339()))
                .send()
                .await;

            match db_res {
                Ok(_) => success_response(200, json!({"ticket_number": ticket_number}).to_string()),
                Err(e) => error_response(500, "Failed to update ticket attachments", &format!("{}", e), None),
            }
        }
        Err(e) => {
            error_response(
                500,
                "S3 upload failed",
                &format!("Failed to upload file to S3: {}", e),
                Some("Check that the Lambda has S3 permissions and the bucket exists"),
            )
        }
    }
}
