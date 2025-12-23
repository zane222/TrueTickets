//! HTTP utilities for request/response handling and CORS

use lambda_http::{Body, Response};
use serde_json::{json};
use aws_sdk_dynamodb::types::AttributeValue;
use std::collections::HashMap;

/// CORS origin header for all responses
pub fn get_cors_origin_header() -> (&'static str, &'static str) {
    ("Access-Control-Allow-Origin", "*")
}

/// Full CORS headers for OPTIONS preflight responses only
pub fn get_cors_preflight_headers() -> Vec<(&'static str, &'static str)> {
    vec![
        ("Access-Control-Allow-Origin", "*"),
        (
            "Access-Control-Allow-Headers",
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,If-Modified-Since",
        ),
        ("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS"),
        ("Access-Control-Max-Age", "86400"),
    ]
}

/// Build an error response with consistent formatting
pub fn error_response(
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

    let (key, value) = get_cors_origin_header();
    Response::builder()
        .status(status)
        .header(key, value)
        .header("Content-Type", "application/json")
        .body(body.to_string().into())
        .expect("Couldn't create error response")
}

/// Build a successful response with CORS headers
pub fn success_response(status: u16, body: String) -> Response<Body> {
    let (key, value) = get_cors_origin_header();
    Response::builder()
        .status(status)
        .header(key, value)
        .header("Content-Type", "application/json")
        .body(body.into())
        .expect("Couldn't create success response")
}

/// Handle CORS preflight requests
pub fn handle_options() -> Response<Body> {
    let mut response = Response::builder().status(200);

    for (key, value) in get_cors_preflight_headers() {
        response = response.header(key, value);
    }

    response
        .header("Content-Type", "application/json")
        .body(Body::Empty)
        .expect("Couldn't handle CORS request")
}

/// Build a successful response from a DynamoDB item
pub fn success_response_hashmap(hash_map: HashMap<String, AttributeValue>) -> Response<Body> {
    match serde_dynamo::from_item::<_, serde_json::Value>(hash_map) {
        Ok(val) => {
             match serde_json::to_string(&val) {
                 Ok(json_str) => success_response(200, json_str),
                 Err(e) => error_response(500, "Serialization error", &format!("{}", e), None),
             }
        }
        Err(e) => error_response(500, "Serde Dynamo error", &format!("{}", e), None),
    }
}

/// Build a successful response from a list of DynamoDB items
pub fn success_response_items(items: Vec<HashMap<String, AttributeValue>>) -> Response<Body> {
    match serde_dynamo::from_items::<_, serde_json::Value>(items) {
        Ok(vals) => {
             match serde_json::to_string(&vals) {
                 Ok(json_str) => success_response(200, json_str),
                 Err(e) => error_response(500, "Serialization error", &format!("{}", e), None),
             }
        }
        Err(e) => error_response(500, "Serde Dynamo error", &format!("{}", e), None),
    }
}
