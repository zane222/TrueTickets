//! HTTP utilities for request/response handling and CORS

use lambda_http::{Body, Response};
use serde_json::{json, Value};
use serde::de::DeserializeOwned;
use rand::Rng;
use rand::distr::Alphanumeric;

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

pub fn generate_short_id(len: usize) -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

/// Build a successful response with CORS headers
pub fn success_response(status: u16, body: &str) -> Response<Body> {
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

pub fn parse_json_body(body: &Body) -> Result<Value, Response<Body>> {
    let body_str = match body {
        Body::Empty => "{}",
        Body::Text(s) => s,
        Body::Binary(b) => {
            match std::str::from_utf8(b) {
                Ok(s) => s,
                Err(_) => return Err(error_response(400, "Invalid request body", "Could not parse request body as UTF-8", None)),
            }
        },
        _ => "{}",
    };

    let json: Value = match serde_json::from_str(body_str) {
        Ok(v) => v,
        Err(_) => return Err(error_response(400, "Invalid JSON", "Could not parse request body as JSON", None))
    };

    Ok(json)
}

pub fn get_value_in_json<T>(body: &Value, key: &str) -> Result<T, Response<Body>>
where
    T: DeserializeOwned,
{
    match body.get(key) {
        Some(v) => serde_json::from_value(v.clone()).map_err(|_| error_response(400, "Invalid parameter", &format!("{} is not a valid value", key), None)),
        None => Err(error_response(400, "Missing parameter", &format!("{} is required", key), None)),
    }
}
