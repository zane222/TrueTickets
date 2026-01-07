//! Authorization and permission checking utilities

use lambda_http::{Request};
use rand::Rng;
use base64::{Engine as _, engine::general_purpose};
use serde_json::Value;

/// Extract user groups from the Cognito authorizer context or Authorization header
pub fn get_user_groups_from_event(event: &Request) -> Vec<String> {
    // Since the API Gateway Authorizer has already validated the token to let the request through,
    // we can trust the content of the token provided in the header.
    if let Some(auth_str) = event.headers().get("Authorization").and_then(|h| h.to_str().ok()) {
        let token = auth_str.strip_prefix("Bearer ").unwrap_or(auth_str);
        if let Some(claims) = parse_jwt_payload(token) && let Some(groups) = claims.get("cognito:groups") {
            return parse_groups_value(groups);
        }
    }
    
    vec![]
}

/// Helper to parse groups from a JSON value (string or array)
fn parse_groups_value(groups: &Value) -> Vec<String> {
    if let Some(groups_str) = groups.as_str() {
        return groups_str
            .split(',')
            .map(|g| g.trim().to_string())
            .filter(|g| !g.is_empty())
            .collect();
    } else if let Some(groups_array) = groups.as_array() {
        return groups_array
            .iter()
            .filter_map(|g| g.as_str().map(|s| s.to_string()))
            .collect();
    }
    vec![]
}

/// Helper to decode and parse JWT payload (without validation)
fn parse_jwt_payload(token: &str) -> Option<Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    
    // JWT payload is the second part
    let payload_part = parts[1];
    
    // Base64 decode (URL safe)
    // Add padding if needed
    let padding = match payload_part.len() % 4 {
        2 => "==",
        3 => "=",
        _ => "",
    };
    let padded_payload = format!("{}{}", payload_part, padding);
    
    match general_purpose::URL_SAFE_NO_PAD.decode(payload_part).or_else(|_| general_purpose::STANDARD.decode(&padded_payload)) {
        Ok(decoded) => serde_json::from_slice(&decoded).ok(),
        Err(_) => None,
    }
}

/// Check if user can invite other users
pub fn can_invite_users(user_groups: &[String]) -> bool {
    let allowed_groups = [
        "TrueTicketsAdmin",
        "StoreOwner",
        "StoreManager",
    ];
    user_groups
        .iter()
        .any(|group| allowed_groups.contains(&group.as_str()))
}

/// Check if user can manage users
pub fn is_admin_or_owner(user_groups: &[String]) -> bool {
    let allowed_groups = ["TrueTicketsAdmin", "StoreOwner"];
    user_groups
        .iter()
        .any(|group| allowed_groups.contains(&group.as_str()))
}

/// Generate a secure temporary password that meets Cognito requirements
pub fn generate_temp_password() -> String {
    let mut rng = rand::rng();

    // Generate 6 random digits
    let digits: String = (0..6)
        .map(|_| rng.random_range(0..10).to_string())
        .collect();

    // Add required special characters to ensure complexity
    format!("{:?}A1!", digits)
}

/// Extract given name from the Cognito authorizer context or Authorization header
pub fn get_given_name_from_event(event: &Request) -> Option<String> {
    if let Some(auth_str) = event.headers().get("Authorization").and_then(|h| h.to_str().ok()) {
        let token = auth_str.strip_prefix("Bearer ").unwrap_or(auth_str);
        if let Some(claims) = parse_jwt_payload(token) {
             if let Some(name) = claims.get("given_name") {
                 return name.as_str().map(|s| s.to_string());
             }
             if let Some(username) = claims.get("username").or(claims.get("cognito:username")) {
                  return username.as_str().map(|s| s.to_string());
             }
        }
    }
    None
}
