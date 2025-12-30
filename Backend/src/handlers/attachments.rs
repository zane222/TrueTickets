//! S3 attachment upload handler

use lambda_http::{Body, Response};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::primitives::ByteStream;
use serde_json::{json, Value};

use crate::http::{error_response, generate_short_id};

use aws_sdk_dynamodb::Client as DynamoDbClient;
use aws_sdk_dynamodb::types::AttributeValue;
use chrono::Utc;
use base64::Engine;

/// Handle attachment upload to ticket
pub async fn handle_upload_attachment(
    ticket_number: String,
    base64_data: &str,
    s3_client: &S3Client,
    db_client: &DynamoDbClient,
) -> Result<Value, Response<Body>> {
    // Decode base64 data to bytes
    let file_bytes = base64::engine::general_purpose::STANDARD.decode(base64_data)
        .map_err(|e| error_response(400, "Invalid base64 data", &format!("Could not decode base64 data: {:?}", e), None))?;

    // Get S3 bucket name from environment
    let bucket_name = std::env::var("S3_BUCKET_NAME")
        .map_err(|_| error_response(500, "Configuration Error", "S3_BUCKET_NAME environment variable not set", None))?;

    // Generate unique S3 key for the file
    let timestamp = Utc::now().timestamp();
    let file_id = generate_short_id(4);
    let s3_key = format!("attachments/{}/{}_{}", ticket_number, timestamp, file_id);

    // Upload file to S3
    let byte_stream = ByteStream::from(file_bytes);
    s3_client
        .put_object()
        .bucket(&bucket_name)
        .key(&s3_key)
        .body(byte_stream)
        .send()
        .await
        .map_err(|e| error_response(500, "S3 Upload Failed", &format!("Failed to upload file to S3: {:?}", e), Some("Check that the Lambda has S3 permissions and the bucket exists")))?;

    // Get the public URL of the uploaded file
    let s3_url = format!("https://{}.s3.amazonaws.com/{}", bucket_name, s3_key);

    // Update DynamoDB
    db_client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET attachments = list_append(if_not_exists(attachments, :empty), :a), last_updated = :lu")
        .expression_attribute_values(":a", AttributeValue::L(vec![AttributeValue::S(s3_url)]))
        .expression_attribute_values(":empty", AttributeValue::L(vec![]))
        .expression_attribute_values(":lu", AttributeValue::N(Utc::now().timestamp().to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update ticket attachments: {:?}", e), None))?;

    Ok(json!({"ticket_number": ticket_number}))
}
