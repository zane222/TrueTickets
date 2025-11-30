//! RepairShopr API proxy handler

use lambda_http::{Body, Request, RequestExt, Response};
use serde_json::Value;

use crate::http::success_response;


/// Handle proxying requests to RepairShopr API
pub async fn handle_repairshopr_proxy(
    event: &Request,
    path: &str,
    api_key: &str,
    target_url: &str,
) -> Result<Response<Body>, String> {
    let method = event.method().as_str();

    // Extract If-Modified-Since header if present (used for conditional polling)
    let if_modified_since = event
        .headers()
        .get("if-modified-since")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Extract request body
    let body = match event.body() {
        Body::Empty => None,
        Body::Text(s) => Some(s.clone()),
        Body::Binary(b) => Some(String::from_utf8_lossy(b).to_string()),
        _ => None,
    };

    // Build the full URL with query parameters
    let mut url = format!("{}{}", target_url, path);
    if let Some(params) = event.query_string_parameters_ref() {
        let query_parts: Vec<String> = params
            .iter()
            .map(|(k, v)| {
                format!(
                    "{}={}",
                    urlencoding::encode(k),
                    urlencoding::encode(v)
                )
            })
            .collect();

        if !query_parts.is_empty() {
            url.push('?');
            url.push_str(&query_parts.join("&"));
        }
    }

    // Create HTTP client and build request
    let client = reqwest::Client::new();

    let mut request_builder = match method {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => return Err(format!("Unsupported HTTP method: {}", method)),
    };

    // Add standard headers because the API doesn't like it if you don't have them
    request_builder = request_builder
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        )
        .header("Accept-Language", "en-US,en;q=0.9");

    // Add body if present
    if let Some(body_content) = body {
        request_builder = request_builder.body(body_content);
    }

    // Send request
    match request_builder.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let response_body = response
                .text()
                .await
                .unwrap_or_else(|_| "{}".to_string());

            // Check If-Modified-Since header for GET requests with polling
            // If the resource hasn't been modified since the header timestamp, return empty response
            if method == "GET" && let Some(if_modified_since) = if_modified_since {
                // Try to parse response and extract updated_at timestamp
                if let Ok(response_json) = serde_json::from_str::<Value>(&response_body) {
                    let updated_at = response_json
                        .get("ticket").and_then(|t| t.get("updated_at"))
                        .or_else(|| response_json.get("customer").and_then(|c| c.get("updated_at")))
                        .and_then(|u| u.as_str())
                        .map(|s| s.to_string());

                    // Compare timestamps (ISO 8601 format strings compare correctly lexicographically)
                    // If updated_at is not newer than if_modified_since, return empty response
                    if let Some(updated_at) = updated_at && updated_at <= if_modified_since {
                        // Resource not modified, return empty response with 304 status
                        return Ok(success_response(304, "{}".to_string()));
                    }
                }
            }

            Ok(success_response(status, response_body))
        }
        Err(e) => {
            let suggestion = format!(
                "Failed to send {} request to {}. Error: {}",
                method, url, e
            );
            Err(suggestion)
        }
    }
}
