mod auth;
mod handlers;
mod http;

use lambda_http::{run, service_fn, Body, Request, Response, RequestExt};
use serde_json::Value;
use serde::de::DeserializeOwned;
use aws_config::BehaviorVersion;
use aws_sdk_cognitoidentityprovider::Client as CognitoClient;
use aws_sdk_dynamodb::Client as DynamoDbClient;
use aws_sdk_s3::Client as S3Client;

use auth::{can_invite_users, can_manage_users, get_user_groups_from_event};
use handlers::{handle_list_users, handle_update_user_group, handle_upload_attachment, handle_user_invitation};
use http::{error_response, handle_options};

const TARGET_URL: &str = "https://Cacell.repairshopr.com/api/v1";

/// Handle the Lambda event
async fn handle_lambda_event(event: Request, cognito_client: &CognitoClient, s3_client: &S3Client) -> Response<Body> {
    // Get API key from environment
    let api_key = match std::env::var("REPAIRSHOPR_API_KEY") {
        Ok(v) => v,
        Err(_) => {
            return error_response(
                500,
                "Configuration error",
                "REPAIRSHOPR_API_KEY environment variable not set",
                None,
            )
        }
    };

    let method = event.method().as_str();
    let path = event.uri().path();

    // Strip /Prod or /prod prefix if it exists
    let path = if path.starts_with("/Prod") || path.starts_with("/prod") {
        &path[5..]
    } else {
        path
    };

    // Handle CORS preflight requests
    if method == "OPTIONS" {
        return handle_options();
    }

    // Validate HTTP method
    if !matches!(method, "GET" | "POST" | "PUT") {
        return error_response(
            400,
            "Invalid HTTP method",
            &format!("Method '{}' is not supported", method),
            Some("Ensure you are calling this Lambda via API Gateway"),
        );
    }


    // Load AWS SDK config to create the DynamoDB client
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let dynamodb_client = DynamoDbClient::new(&config);

    // Route based on path and method
    match (path, method) {
        ("/invite-user", "POST") => {
            // Extract and validate invitation data from request
            let body_str = match event.body() {
                Body::Empty => "{}",
                Body::Text(s) => s,
                Body::Binary(b) => {
                    match std::str::from_utf8(b) {
                        Ok(s) => s,
                        Err(_) => {
                            return error_response(
                                400,
                                "Invalid request body",
                                "Could not parse request body as UTF-8",
                                None,
                            )
                        }
                    }
                }
                _ => "{}",
            };

            let body: Value = match serde_json::from_str(body_str) {
                Ok(v) => v,
                Err(_) => {
                    return error_response(
                        400,
                        "Invalid JSON",
                        "Could not parse request body as JSON",
                        None,
                    )
                }
            };

            let email = match body.get("email").and_then(|v| v.as_str()) {
                Some(e) => e,
                None => {
                    return error_response(
                        400,
                        "Missing parameter",
                        "Email is required",
                        None,
                    )
                }
            };

            let first_name = body.get("firstName").and_then(|v| v.as_str()).unwrap_or("");

            // Check user permissions
            let user_groups = get_user_groups_from_event(&event);
            if !can_invite_users(&user_groups) {
                return error_response(
                    403,
                    "Insufficient permissions",
                    "You do not have permission to invite users",
                    Some("Only ApplicationAdmin, Owner, and Manager can invite users"),
                );
            }

            handle_user_invitation(email, first_name, cognito_client).await
        }
        ("/users", "GET") => {
            handle_list_users(&event, cognito_client).await
        }
        ("/update-user-group", "POST") => {
            // Extract and validate user group update data from request
            let body_str = match event.body() {
                Body::Empty => "{}",
                Body::Text(s) => s,
                Body::Binary(b) => {
                    match std::str::from_utf8(b) {
                        Ok(s) => s,
                        Err(_) => {
                            return error_response(
                                400,
                                "Invalid request body",
                                "Could not parse request body as UTF-8",
                                None,
                            )
                        }
                    }
                },
                _ => "{}",
            };

            let body: Value = match serde_json::from_str(body_str) {
                Ok(v) => v,
                Err(_) => {
                    return error_response(
                        400,
                        "Invalid JSON",
                        "Could not parse request body as JSON",
                        None,
                    )
                }
            };

            let username = match body.get("username").and_then(|v| v.as_str()) {
                Some(u) => u,
                None => {
                    return error_response(
                        400,
                        "Missing parameter",
                        "Username is required",
                        None,
                    )
                }
            };

            let new_group = match body.get("group").and_then(|v| v.as_str()) {
                Some(g) => g,
                None => {
                    return error_response(
                        400,
                        "Missing parameter",
                        "Group is required",
                        None,
                    )
                }
            };

            // Check user permissions
            let user_groups = get_user_groups_from_event(&event);
            if !can_manage_users(&user_groups) {
                return error_response(
                    403,
                    "Insufficient permissions",
                    "You do not have permission to manage users",
                    Some("Only ApplicationAdmin and Owner can manage users"),
                );
            }

            handle_update_user_group(username, new_group, cognito_client).await
        }
        ("/upload-attachment", "POST") => {
            // Extract and validate attachment data from request
            let body = match parse_json_body(event.body()) {
                Ok(body) => body,
                Err(response) => return response,
            };

            let ticket_id: i64 = match get_value_in_json(&body, "ticket_id") {
                Ok(val) => val,
                Err(response) => return response,
            };
            let image_data: String = match get_value_in_json(&body, "image_data") {
                Ok(val) => val,
                Err(response) => return response,
            };
            let file_name: String = match get_value_in_json(&body, "file_name") {
                Ok(val) => val,
                Err(response) => return response,
            };

            // Extract base64 data from data URL if needed
            let base64_data = if image_data.starts_with("data:") {
                // Format: data:image/png;base64,xxxx
                match image_data.split(',').next_back() {
                    Some(data) => data,
                    None => {
                        return error_response(
                            400,
                            "Invalid data URL",
                            "Could not extract base64 from data URL",
                            None,
                        )
                    }
                }
            } else {
                &image_data
            };

            handle_upload_attachment(ticket_id, base64_data, &file_name, &api_key, s3_client, TARGET_URL).await
        }
        // -------------------------
        // TICKETS
        // -------------------------
        ("/tickets", "GET") => { // it could be /tickets?number=12345 or /tickets?query=lcd. Each calls a different function
            if let Some(number) = event.query_string_parameters().first("number") {
                handle_get_ticket_by_number(number, &dynamodb_client).await
            } else if let Some(query) = event.query_string_parameters().first("subject_query") {
                handle_search_tickets_by_subject(query, &dynamodb_client).await
            } else {
                return error_response(
                    400,
                    "Missing query parameter",
                    "Provide either 'number' or 'subject_query'",
                    None,
                );
            }
        }
        ("/recent_tickets_list", "GET") => {
            handle_get_recent_tickets(&dynamodb_client).await
        }
        ("/ticket", "POST") => {
            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return resp,
            };

            let customer_id: String = match get_value_in_json(&body, "customer_id") {
                Ok(val) => val,
                Err(resp) => return resp,
            };
            let subject: String = match get_value_in_json(&body, "subject") {
                Ok(val) => val,
                Err(resp) => return resp,
            };
            let details: String = match get_value_in_json(&body, "details") {
                Ok(val) => val,
                Err(resp) => return resp,
            };
            let status: Option<String> = body.get("status").and_then(|v| v.as_str()).map(|s| s.to_string());

            handle_create_ticket(customer_id, subject, details, status, &dynamodb_client).await
        }
        ("/ticket", "PUT") => {
            let ticket_number: String = match event.query_string_parameters().first("number") {
                Some(n) => n.to_string(),
                None => return error_response(400, "Missing ticket number", "Query parameter 'number' is required", None),
            };

            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return resp,
            };

            let subject = body.get("subject").and_then(|v| v.as_str()).map(|s| s.to_string());
            let details = body.get("details").and_then(|v| v.as_str()).map(|s| s.to_string());
            let status = body.get("status").and_then(|v| v.as_str()).map(|s| s.to_string());

            handle_update_ticket(ticket_number, subject, details, status, &dynamodb_client).await
        }
        ("/ticket/comment", "POST") => {
            let ticket_number: String = match event.query_string_parameters().first("ticket_number") {
                Some(n) => n.to_string(),
                None => return error_response(400, "Missing ticket_number", "Query parameter 'ticket_number' is required", None),
            };

            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return resp,
            };

            let comment_body: String = match get_value_in_json(&body, "comment_body") {
                Ok(val) => val,
                Err(resp) => return resp,
            };
            let tech_name: String = match get_value_in_json(&body, "tech_name") {
                Ok(val) => val,
                Err(resp) => return resp,
            };

            handle_add_ticket_comment(ticket_number, comment_body, tech_name, &dynamodb_client).await
        }
        ("/ticket_was_changed", "GET") => {
            let ticket_number: String = match event.query_string_parameters().get("number") {
                Some(n) => n.to_string(),
                None => return error_response(400, "Missing ticket number", "Query parameter 'number' is required", None),
            };
            handle_get_ticket_last_updated(ticket_number, &dynamodb_client).await
        }

        // -------------------------
        // CUSTOMERS
        // -------------------------
        ("/customers", "GET") => {
            let phone_number: String = match event.query_string_parameters().first("phone_number") {
                Some(p) => p.to_string(),
                None => return error_response(400, "Missing phone_number", "Query parameter 'phone_number' is required", None),
            };
            handle_get_customers_by_phone(phone_number, &dynamodb_client).await
        }
        ("/customer", "POST") => {
            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return resp,
            };

            let full_name: String = match get_value_in_json(&body, "full_name") {
                Ok(val) => val,
                Err(resp) => return resp,
            };
            let phone_numbers: Vec<String> = match body.get("phone_numbers") {
                Some(v) => match serde_json::from_value(v.clone()) {
                    Ok(vec) => vec,
                    Err(_) => return error_response(400, "Invalid phone_numbers", "phone_numbers must be an array of strings", None),
                },
                None => return error_response(400, "Missing phone_numbers", "phone_numbers array is required", None),
            };

            handle_create_customer(full_name, phone_numbers, &dynamodb_client).await
        }
        ("/customer", "PUT") => {
            let customer_id: String = match event.query_string_parameters().get("customer_id") {
                Some(c) => c.to_string(),
                None => return error_response(400, "Missing customer_id", "Query parameter 'customer_id' is required", None),
            };

            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return resp,
            };

            let full_name = body.get("full_name").and_then(|v| v.as_str()).map(|s| s.to_string());
            let phone_numbers = body.get("phone_numbers").and_then(|v| serde_json::from_value(v.clone()).ok());

            handle_update_customer(customer_id, full_name, phone_numbers, &dynamodb_client).await
        }
        ("/customer_was_changed", "GET") => {
            let customer_id: String = match event.query_string_parameters().get("customer_id") {
                Some(c) => c.to_string(),
                None => return error_response(400, "Missing customer_id", "Query parameter 'customer_id' is required", None),
            };
            handle_get_customer_last_updated(customer_id, &dynamodb_client).await
        }
        _ => {
            // Method not allowed for other paths
            error_response(
                405,
                "Method not allowed",
                path,
                Some("You're sending a request that doesn't exist."),
            )
        }
    }
}

fn parse_json_body(body: &Body) -> Result<Value, Response<Body>> {
    let body_str = match body {
        Body::Empty => "{}",
        Body::Text(s) => s,
        Body::Binary(b) => {
            match std::str::from_utf8(b) {
                Ok(s) => s,
                Err(_) => {
                    return Err(error_response(
                        400,
                        "Invalid request body",
                        "Could not parse request body as UTF-8",
                        None,
                    ))
                }
            }
        },
        _ => "{}",
    };

    let json: Value = match serde_json::from_str(body_str) {
        Ok(v) => v,
        Err(_) => {
            return Err(error_response(
                400,
                "Invalid JSON",
                "Could not parse request body as JSON",
                None,
            ))
        }
    };

    Ok(json)
}

fn get_value_in_json<T>(body: &Value, key: &str) -> Result<T, Response<Body>>
where
    T: DeserializeOwned,
{
    match body.get(key) {
        Some(v) => {
            serde_json::from_value(v.clone()).map_err(|_| {
                error_response(
                    400,
                    "Invalid parameter",
                    &format!("{} is not a valid value", key),
                    None,
                )
            })
        },
        None => {
            return Err(error_response(
                400,
                "Missing parameter",
                &format!("{} is required", key),
                None,
            ))
        }
    }
}

/// Main Lambda handler function
async fn function_handler(event: Request) -> Result<Response<Body>, lambda_http::Error> {
    // Initialize AWS config and clients
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let cognito_client = CognitoClient::new(&config);
    let s3_client = S3Client::new(&config);

    Ok(handle_lambda_event(event, &cognito_client, &s3_client).await)
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    lambda_http::tracing::init_default_subscriber();
    run(service_fn(function_handler)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{get_cors_preflight_headers, success_response};
    use crate::auth::{can_invite_users, can_manage_users, generate_temp_password};

    #[test]
    fn test_cors_headers() {
        let headers = get_cors_preflight_headers();
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

    #[test]
    fn test_can_invite_users() {
        let admin_groups = vec!["TrueTickets-Cacell-ApplicationAdmin".to_string()];
        assert!(can_invite_users(&admin_groups));

        let manager_groups = vec!["TrueTickets-Cacell-Manager".to_string()];
        assert!(can_invite_users(&manager_groups));

        let employee_groups = vec!["TrueTickets-Cacell-Employee".to_string()];
        assert!(!can_invite_users(&employee_groups));
    }

    #[test]
    fn test_can_manage_users() {
        let admin_groups = vec!["TrueTickets-Cacell-ApplicationAdmin".to_string()];
        assert!(can_manage_users(&admin_groups));

        let owner_groups = vec!["TrueTickets-Cacell-Owner".to_string()];
        assert!(can_manage_users(&owner_groups));

        let manager_groups = vec!["TrueTickets-Cacell-Manager".to_string()];
        assert!(!can_manage_users(&manager_groups));
    }

    #[test]
    fn test_generate_temp_password() {
        let password = generate_temp_password();
        assert!(password.len() >= 9);
        assert!(password.contains('A'));
        assert!(password.contains('1'));
        assert!(password.contains('!'));
    }
}
