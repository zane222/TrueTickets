use lambda_http::{run, service_fn, Body, Request, RequestExt, Response};
use serde_json::json;

const TARGET_URL: &str = "https://Cacell.repairshopr.com/api/v1";

/// Standard CORS headers for all responses
fn get_cors_headers() -> Vec<(&'static str, &'static str)> {
    vec![
        ("Access-Control-Allow-Origin", "*"),
        (
            "Access-Control-Allow-Headers",
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        ),
        ("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS"),
        ("Access-Control-Max-Age", "86400"),
    ]
}

/// Build an error response with consistent formatting
fn error_response(
    status: u16,
    error: &str,
    details: &str,
    suggestion: Option<&str>,
) -> Response<Body> {
    let mut body = json!({
        "error": error,
        "details": details,
    });

    if let Some(suggestion) = suggestion {
        body["suggestion"] = json!(suggestion);
    }

    let mut response = Response::builder().status(status);

    for (key, value) in get_cors_headers() {
        response = response.header(key, value);
    }

    response
        .header("Content-Type", "application/json")
        .body(body.to_string().into())
        .unwrap()
}

/// Build a successful response with CORS headers
fn success_response(status: u16, body: String) -> Response<Body> {
    let mut response = Response::builder().status(status);

    for (key, value) in get_cors_headers() {
        response = response.header(key, value);
    }

    response
        .header("Content-Type", "application/json")
        .body(body.into())
        .unwrap()
}

/// Handle CORS preflight requests
fn handle_options() -> Response<Body> {
    let mut response = Response::builder().status(200);

    for (key, value) in get_cors_headers() {
        response = response.header(key, value);
    }

    response
        .header("Content-Type", "application/json")
        .body(Body::Empty)
        .unwrap()
}

/// Handle RepairShopr API proxy requests
async fn handle_repairshopr_proxy(
    event: &Request,
    path: &str,
    api_key: &str,
) -> Result<Response<Body>, String> {
    let method = event.method().to_string();

    // Extract request body
    let body = match event.body() {
        Body::Empty => None,
        Body::Text(s) => Some(s.clone()),
        Body::Binary(b) => Some(String::from_utf8_lossy(b).to_string()),
    };

    // Build the full URL with query parameters
    let mut url = format!("{}{}", TARGET_URL, path);
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

    let mut request_builder = match method.as_str() {
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

/// Handle the Lambda event
async fn handle_lambda_event(event: Request) -> Result<Response<Body>, String> {
    // Get API key from environment
    let api_key = std::env::var("REPAIRSHOPR_API_KEY")
        .map_err(|_| "REPAIRSHOPR_API_KEY environment variable not set".to_string())?;

    let method = event.method().to_string();
    let mut path = event.uri().path().to_string();
    
    // Strip /Prod or /prod prefix if it exists
    if path.starts_with("/Prod") {
        path = path[5..].to_string();
    } else if path.starts_with("/prod") {
        path = path[5..].to_string();
    }
    
    let path = path.as_str();

    // Handle CORS preflight requests
    if method == "OPTIONS" {
        return Ok(handle_options());
    }

    // Validate HTTP method
    if !["GET", "POST", "PUT", "DELETE", "PATCH"].contains(&method.as_str()) {
        return Ok(error_response(
            400,
            "Invalid event format",
            "This Lambda function only accepts API Gateway events",
            Some("Ensure you are calling this Lambda via API Gateway"),
        ));
    }

    // Route to RepairShopr proxy for /api/* paths
    if path.starts_with("/api") {
        let modified_path = path.strip_prefix("/api").unwrap_or("");
        match handle_repairshopr_proxy(&event, modified_path, &api_key).await {
            Ok(response) => Ok(response),
            Err(e) => Ok(error_response(
                502,
                "Bad Gateway (rs)",
                &e,
                Some("A network error occurred when trying to reach RepairShopr."),
            )),
        }
    } else {
        // Method not allowed for other paths
        Ok(error_response(
            405,
            "Method not allowed",
            path,
            Some("You're sending a request that doesn't exist."),
        ))
    }
}

/// Main Lambda handler function
async fn function_handler(event: Request) -> Result<Response<Body>, lambda_http::Error> {
    match handle_lambda_event(event).await {
        Ok(response) => Ok(response),
        Err(e) => {
            eprintln!("ERROR: Internal server error (rt): {}", e);
            Ok(error_response(
                500,
                &e,
                "An unexpected error occurred in the Lambda function.",
                Some("Check the Lambda logs for more details."),
            ))
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    lambda_http::tracing::init_default_subscriber();
    run(service_fn(function_handler)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cors_headers() {
        let headers = get_cors_headers();
        assert_eq!(headers.len(), 4);
        assert!(headers.iter().any(|(k, _)| *k == "Access-Control-Allow-Origin"));
    }

    #[test]
    fn test_error_response_format() {
        let response = error_response(400, "Bad Request", "Invalid input", Some("Check your request"));
        assert_eq!(response.status(), 400);
        assert!(response.headers().contains_key("Access-Control-Allow-Origin"));
    }

    #[test]
    fn test_handle_options() {
        let response = handle_options();
        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers().get("Access-Control-Allow-Origin").unwrap(),
            "*"
        );
    }

    #[test]
    fn test_success_response() {
        let response = success_response(200, "{}".to_string());
        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "application/json"
        );
    }
}
