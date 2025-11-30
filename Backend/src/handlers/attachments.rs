//! S3 attachment upload handler

use lambda_http::{Body, Response};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::primitives::ByteStream;
use serde_json::json;

use crate::http::{error_response, success_response};

/// Handle attachment upload to ticket
pub async fn handle_upload_attachment(
    ticket_id: i64,
    base64_data: &str,
    file_name: &str,
    api_key: &str,
    s3_client: &S3Client,
    target_url: &str,
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
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_else(|_| std::time::Duration::from_secs(0))
        .as_secs();
    let s3_key = format!("attachments/{}/{}_{}", ticket_id, timestamp, file_name);

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

            // Call RepairShopr attach_file_url endpoint
            let url = format!("{}/tickets/{}/attach_file_url", target_url, ticket_id);

            let attach_body = json!({
                "files": [
                    {
                        "url": s3_url,
                        "filename": file_name
                    }
                ]
            });

            let request_builder = reqwest::Client::new()
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .body(attach_body.to_string());

            match request_builder.send().await {
                Ok(response) => {
                    let status = response.status().as_u16();
                    let response_body = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "{}".to_string());
                    success_response(status, response_body)
                }
                Err(e) => {
                    error_response(
                        502,
                        "Bad Gateway",
                        &format!("Failed to attach file to ticket: {}", e),
                        Some("Check that the ticket ID is valid and the API key has permission"),
                    )
                }
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
