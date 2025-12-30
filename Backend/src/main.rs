mod auth;
mod handlers;
mod http;
mod models;
mod db_utils;

use lambda_http::{run, service_fn, Body, Request, Response, RequestExt};
use aws_config::BehaviorVersion;
use aws_sdk_cognitoidentityprovider::Client as CognitoClient;
use aws_sdk_dynamodb::Client as DynamoDbClient;
use aws_sdk_s3::Client as S3Client;

use auth::{can_invite_users, can_manage_users, get_user_groups_from_event};
use handlers::{
    handle_list_users, handle_update_user_group, handle_upload_attachment, handle_user_invitation,
    handle_get_ticket_by_number, handle_search_tickets_by_subject, handle_get_recent_tickets,
    handle_create_ticket, handle_update_ticket, handle_add_ticket_comment, handle_get_recent_tickets_filtered,
    handle_get_customers_by_phone, handle_create_customer,
    handle_update_customer, handle_get_tickets_by_customer_id,
    handle_search_customers_by_name, handle_get_customer_by_id, handle_get_tickets_by_suffix,
    handle_migrate_tickets
};
use models::{
    CreateTicketRequest, UpdateTicketRequest,
    CreateCustomerRequest, UpdateCustomerRequest
};
use http::{error_response, handle_options, success_response, parse_json_body, get_value_in_json};

/// Handle the Lambda event
async fn handle_lambda_event(event: Request, cognito_client: &CognitoClient, s3_client: &S3Client) -> Response<Body> {
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
        return error_response(400, "Invalid HTTP method", &format!("Method '{:?}' is not supported", method), Some("Ensure you are calling this Lambda via API Gateway"));
    }


    // Load AWS SDK config to create the DynamoDB client
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let dynamodb_client = DynamoDbClient::new(&config);

    // Route based on path and method
    match (path, method) {
        ("/invite-user", "POST") => {
            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return *resp,
            };

            let email: String = match get_value_in_json(&body, "email") {
                Ok(val) => val,
                Err(resp) => return *resp,
            };
            let first_name: String = match get_value_in_json(&body, "firstName") {
                Ok(val) => val,
                Err(resp) => return *resp,
            };

            // Check user permissions
            let user_groups = get_user_groups_from_event(&event);
            if !can_invite_users(&user_groups) {
                return error_response(403, "Insufficient permissions", "You do not have permission to invite users", Some("Only ApplicationAdmin, Owner, and Manager can invite users"));
            }

            match handle_user_invitation(&email, &first_name, cognito_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/users", "GET") => {
            match handle_list_users(&event, cognito_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/update-user-group", "POST") => {
            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return *resp,
            };

            let username: String = match get_value_in_json(&body, "username") {
                Ok(val) => val,
                Err(resp) => return *resp,
            };
            let new_group: String = match get_value_in_json(&body, "group") {
                Ok(val) => val,
                Err(resp) => return *resp,
            };

            // Check user permissions
            let user_groups = get_user_groups_from_event(&event);
            if !can_manage_users(&user_groups) {
                return error_response(403, "Insufficient permissions", "You do not have permission to manage users", Some("Only ApplicationAdmin and Owner can manage users"));
            }

            match handle_update_user_group(&username, &new_group, cognito_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/upload-attachment", "POST") => {
            // Extract and validate attachment data from request
            let body = match parse_json_body(event.body()) {
                Ok(body) => body,
                Err(response) => return *response,
            };

            let ticket_id: String = match get_value_in_json(&body, "ticket_id") {
                Ok(val) => val,
                Err(response) => return *response,
            };
            let image_data: String = match get_value_in_json(&body, "image_data") {
                Ok(val) => val,
                Err(response) => return *response,
            };

            // Extract base64 data from data URL if needed
            let base64_data = if image_data.starts_with("data:") {
                // Format: data:image/png;base64,xxxx
                match image_data.split(',').next_back() {
                    Some(data) => data,
                    None => return error_response(400, "Invalid data URL", "Could not extract base64 from data URL", None),
                }
            } else {
                &image_data
            };

            match handle_upload_attachment(ticket_id, base64_data, s3_client, &dynamodb_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        // -------------------------
        // TICKETS
        // -------------------------
        ("/tickets", "GET") => {
            let (first_parameter, value) = match event.query_string_parameters().iter().next() {
                Some((k, v)) => (k.to_string(), v.to_string()),
                None => return error_response(400, "Missing query parameter", "Provide a query parameter (e.g., ?number=123)", None),
            };

            let result = match first_parameter.as_str() {
                "number" => handle_get_ticket_by_number(&value, false, &dynamodb_client).await,
                "search_by_number" => handle_get_ticket_by_number(&value, true, &dynamodb_client).await,
                "ticket_number_last_3_digits" => handle_get_tickets_by_suffix(&value, &dynamodb_client).await,
                "subject_query" => handle_search_tickets_by_subject(&value, &dynamodb_client).await,
                "customer_id" => handle_get_tickets_by_customer_id(value.to_string(), &dynamodb_client).await,
                "get_recent" => {
                    // Check for device and status filters
                    let device = event.query_string_parameters().first("device").map(|s| s.to_string());
                    let status_param = event.query_string_parameters().first("status").map(|s| s.to_string());

                    if let (Some(d), Some(s)) = (device, status_param) {
                        // Parse status pipe separated
                        let statuses: Vec<String> = s.split('|').map(|st| st.trim().to_string()).collect();
                        handle_get_recent_tickets_filtered(d, statuses, &dynamodb_client).await
                    } else {
                        // Global recent
                        handle_get_recent_tickets(&dynamodb_client).await
                    }
                },
                _ => return error_response(400, "Unknown query parameter", &format!("Unsupported query parameter: {:?}", first_parameter), None),
            };

            match result {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/query_all", "GET") => {
            let query = match event.query_string_parameters().first("query") {
                Some(q) => q.to_string(),
                None => return error_response(400, "Missing query parameter", "Query parameter 'query' is required", None),
            };

            // Execute both searches concurrently
            let (tickets_result, customers_result) = tokio::join!(
                handle_search_tickets_by_subject(&query, &dynamodb_client),
                handle_search_customers_by_name(&query, &dynamodb_client)
            );

            // Handle results
            let tickets = match tickets_result {
                Ok(val) => val,
                Err(resp) => return resp,
            };

            let customers = match customers_result {
                Ok(val) => val,
                Err(resp) => return resp,
            };

            // Combine into single response
            let response = serde_json::json!({
                "tickets": tickets,
                "customers": customers
            });

            success_response(200, &response.to_string())
        }
        ("/tickets", "POST") => {
            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return *resp,
            };

            let req: CreateTicketRequest = match serde_json::from_value(body) {
                Ok(r) => r,
                Err(e) => return error_response(400, "Invalid Request Body", &format!("Failed to parse ticket creation request: {:?}", e), None),
            };

            match handle_create_ticket(req.customer_id, req.subject, req.password, req.items_left, req.device, &dynamodb_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/tickets", "PUT") => {
            let ticket_number: String = match event.query_string_parameters().first("number") {
                Some(n) => n.to_string(),
                None => return error_response(400, "Missing ticket number", "Query parameter 'number' is required", None),
            };

            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return *resp,
            };

            let req: UpdateTicketRequest = match serde_json::from_value(body) {
                Ok(r) => r,
                Err(e) => return error_response(400, "Invalid Request Body", &format!("Failed to parse ticket update request: {:?}", e), None),
            };

            // Validation: Ensure at least one field is not None
            if req.subject.is_none() && req.status.is_none() && req.password.is_none() && req.items_left.is_none() && req.device.is_none() {
                return error_response(400, "Empty Update", "At least one field must be provided for update", None);
            }

            match handle_update_ticket(ticket_number, req.subject, req.status, req.password, req.items_left, req.device, &dynamodb_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/tickets/comment", "POST") => {
            let ticket_number: String = match event.query_string_parameters().first("ticket_number") {
                Some(n) => n.to_string(),
                None => return error_response(400, "Missing ticket_number", "Query parameter 'ticket_number' is required", None),
            };

            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return *resp,
            };

            let comment_body: String = match get_value_in_json(&body, "comment_body") {
                Ok(val) => val,
                Err(resp) => return *resp,
            };
            let tech_name: String = match get_value_in_json(&body, "tech_name") {
                Ok(val) => val,
                Err(resp) => return *resp,
            };

            match handle_add_ticket_comment(ticket_number, comment_body, tech_name, &dynamodb_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }

        // -------------------------
        // MIGRATION
        // -------------------------
        ("/migrate-tickets", "GET") => {
            let latest_ticket_number: i64 = match event.query_string_parameters().first("latest_ticket_number").and_then(|v| v.parse::<i64>().ok()) {
                Some(n) => n,
                None => return error_response(400, "Missing or invalid latest_ticket_number", "latest_ticket_number must be provided as a query parameter (number)", None),
            };

            let count: i64 = match event.query_string_parameters().first("count").and_then(|v| v.parse::<i64>().ok()) {
                Some(c) => c,
                None => return error_response(400, "Missing or invalid count", "count must be provided as a query parameter (number)", None),
            };

            let api_key = match std::env::var("MIGRATION_API_KEY") {
                Ok(key) => key,
                Err(_) => return error_response(500, "Configuration Error", "MIGRATION_API_KEY environment variable not set", None),
            };

            match handle_migrate_tickets(latest_ticket_number, count, api_key, &dynamodb_client, s3_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }

        // -------------------------
        // CUSTOMERS
        // -------------------------
        ("/customers", "GET") | ("/customers/autocomplete", "GET") => {
            let result = if let Some(phone) = event.query_string_parameters().first("phone_number") {
                handle_get_customers_by_phone(phone.to_string(), &dynamodb_client).await
            } else if let Some(query) = event.query_string_parameters().first("query") {
                handle_search_customers_by_name(query, &dynamodb_client).await
            } else if let Some(id) = event.query_string_parameters().first("id") {
                handle_get_customer_by_id(id.to_string(), &dynamodb_client).await
            } else {
                return error_response(400, "Missing query parameter", "Provide either 'phone_number', 'query', or 'id'", None);
            };

            match result {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/customers", "POST") => {
            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return *resp,
            };

            let req: CreateCustomerRequest = match serde_json::from_value(body) {
                Ok(r) => r,
                Err(e) => return error_response(400, "Invalid Request Body", &format!("Failed to parse customer creation request: {:?}", e), None),
            };

            // Validation: Ensure phone_numbers is not empty
            if req.phone_numbers.is_empty() {
                return error_response(400, "Validation Error", "At least one phone number is required", None);
            }

            match handle_create_customer(req.full_name, req.email, req.phone_numbers, &dynamodb_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        ("/customers", "PUT") => {
            let customer_id: String = match event.query_string_parameters().first("customer_id") {
                Some(c) => c.to_string(),
                None => return error_response(400, "Missing customer_id", "Query parameter 'customer_id' is required", None),
            };

            let body = match parse_json_body(event.body()) {
                Ok(b) => b,
                Err(resp) => return *resp,
            };

            let req: UpdateCustomerRequest = match serde_json::from_value(body) {
                Ok(r) => r,
                Err(e) => return error_response(400, "Invalid Request Body", &format!("Failed to parse customer update request: {:?}", e), None),
            };

            // Validation: Ensure at least one field is not None
            if req.full_name.is_none() && req.email.is_none() && req.phone_numbers.is_none() {
                return error_response(400, "Empty Update", "At least one field must be provided for update", None);
            }

            match handle_update_customer(customer_id, req.full_name, req.email, req.phone_numbers, &dynamodb_client).await {
                Ok(val) => success_response(200, &val.to_string()),
                Err(resp) => resp,
            }
        }
        _ => error_response(405, "Method not allowed", path, Some("You're sending a request that doesn't exist.")),
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
        let response = success_response(200, "{}");
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
