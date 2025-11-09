use lambda_http::{run, service_fn, Body, Request, RequestExt, Response};
use serde_json::{json, Value};
use aws_config::BehaviorVersion;
use aws_sdk_cognitoidentityprovider::Client as CognitoClient;
use aws_sdk_cognitoidentityprovider::types::AttributeType;

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

/// Extract user groups from the Cognito authorizer context
fn get_user_groups_from_event(event: &Request) -> Vec<String> {
    // Get user groups from the request context (populated by Cognito authorizer)
    let request_context = event.request_context();
    if let Some(authorizer) = request_context.authorizer() {
        if let Some(claims) = authorizer.fields.get("claims") {
            if let Some(groups) = claims.get("cognito:groups") {
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
            }
        }
    }
    vec![]
}

/// Check if user can invite other users
fn can_invite_users(user_groups: &[String]) -> bool {
    let allowed_groups = vec![
        "TrueTickets-Cacell-ApplicationAdmin",
        "TrueTickets-Cacell-Owner",
        "TrueTickets-Cacell-Manager",
    ];
    user_groups
        .iter()
        .any(|group| allowed_groups.contains(&group.as_str()))
}

/// Check if user can manage users
fn can_manage_users(user_groups: &[String]) -> bool {
    let allowed_groups = vec!["TrueTickets-Cacell-ApplicationAdmin", "TrueTickets-Cacell-Owner"];
    user_groups
        .iter()
        .any(|group| allowed_groups.contains(&group.as_str()))
}

/// Generate a secure temporary password that meets Cognito requirements
fn generate_temp_password() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    
    // Generate 6 random digits
    let digits: String = (0..6)
        .map(|_| rng.gen_range(0..10).to_string())
        .collect();
    
    // Add required special characters to ensure complexity
    format!("{}A1!", digits)
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

/// Handle user invitation
async fn handle_user_invitation(event: &Request, cognito_client: &CognitoClient) -> Response<Body> {
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
    let user_groups = get_user_groups_from_event(event);
    if !can_invite_users(&user_groups) {
        return error_response(
            403,
            "Insufficient permissions",
            "You do not have permission to invite users",
            Some("Only ApplicationAdmin, Owner, and Manager can invite users"),
        );
    }

    let user_pool_id = match std::env::var("USER_POOL_ID") {
        Ok(id) => id,
        Err(_) => {
            return error_response(
                500,
                "Configuration error",
                "USER_POOL_ID environment variable not set",
                None,
            )
        }
    };

    // Check if user already exists
    match cognito_client
        .admin_get_user()
        .user_pool_id(&user_pool_id)
        .username(email)
        .send()
        .await
    {
        Ok(user) => {
            eprintln!("User {} already exists with status: {:?}", email, user.user_status());
        }
        Err(e) => {
            if !e.to_string().contains("UserNotFoundException") {
                if e.to_string().contains("AccessDeniedException") {
                    return error_response(
                        500,
                        "Access denied",
                        "The Lambda's execution role is missing permissions to call Cognito admin APIs",
                        Some("Attach an IAM policy granting the cognito-idp:Admin* actions to the Lambda role"),
                    );
                }
                eprintln!("Error checking if user exists: {}", e);
            }
        }
    }

    // Create user attributes
    let mut user_attributes = vec![
        AttributeType::builder()
            .name("email")
            .value(email)
            .build()
            .unwrap(),
        AttributeType::builder()
            .name("email_verified")
            .value("true")
            .build()
            .unwrap(),
    ];

    if !first_name.is_empty() {
        user_attributes.push(
            AttributeType::builder()
                .name("custom:given_name")
                .value(first_name)
                .build()
                .unwrap(),
        );
    }

    // Create the user
    match cognito_client
        .admin_create_user()
        .user_pool_id(&user_pool_id)
        .username(email)
        .set_user_attributes(Some(user_attributes))
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await
    {
        Ok(response) => {
            let temp_password = generate_temp_password();

            // Set permanent password
            if let Err(e) = cognito_client
                .admin_set_user_password()
                .user_pool_id(&user_pool_id)
                .username(email)
                .password(&temp_password)
                .permanent(true)
                .send()
                .await
            {
                if e.to_string().contains("AccessDeniedException") {
                    return error_response(
                        500,
                        "Access denied",
                        "The Lambda's execution role is not authorized to set user password",
                        Some("Attach an IAM policy allowing cognito-idp:AdminSetUserPassword to the Lambda role"),
                    );
                }
                return error_response(
                    500,
                    "Password error",
                    &format!("Could not set user password: {}", e),
                    None,
                );
            }

            // Add user to default employee group
            if let Err(e) = cognito_client
                .admin_add_user_to_group()
                .user_pool_id(&user_pool_id)
                .username(email)
                .group_name("TrueTickets-Cacell-Employee")
                .send()
                .await
            {
                eprintln!("Warning: Could not add user to group: {}", e);
            }

            let user = response.user().unwrap();
            let user_info = json!({
                "username": user.username(),
                "enabled": user.enabled(),
                "created": user.user_create_date().map(|d| d.to_string()),
            });

            let response_body = json!({
                "message": format!("Invitation sent successfully to {}", email),
                "user": user_info,
            });

            success_response(200, response_body.to_string())
        }
        Err(e) => {
            let error_code = e.to_string();
            if error_code.contains("AccessDeniedException") {
                return error_response(
                    500,
                    "Access denied",
                    &format!("Could not invite user: {}", e),
                    Some("Attach an IAM policy allowing the required Cognito admin actions to the Lambda role"),
                );
            }
            error_response(
                400,
                "Could not invite user",
                &e.to_string(),
                None,
            )
        }
    }
}

/// Handle listing all users
async fn handle_list_users(event: &Request, cognito_client: &CognitoClient) -> Response<Body> {
    // Check user permissions
    let user_groups = get_user_groups_from_event(event);
    if !can_manage_users(&user_groups) {
        return error_response(
            403,
            "Insufficient permissions",
            "You do not have permission to view users",
            Some("Only ApplicationAdmin and Owner can view users"),
        );
    }

    let user_pool_id = match std::env::var("USER_POOL_ID") {
        Ok(id) => id,
        Err(_) => {
            return error_response(
                500,
                "Configuration error",
                "USER_POOL_ID environment variable not set",
                None,
            )
        }
    };

    match cognito_client
        .list_users()
        .user_pool_id(&user_pool_id)
        .limit(60)
        .send()
        .await
    {
        Ok(response) => {
            let mut users = vec![];

            for user in response.users() {
                let username = user.username().unwrap_or("").to_string();
                 
                // Get user groups
                let user_groups = match cognito_client
                    .admin_list_groups_for_user()
                    .user_pool_id(&user_pool_id)
                    .username(&username)
                    .send()
                    .await
                {
                    Ok(groups_response) => {
                        groups_response
                            .groups()
                            .iter()
                            .filter_map(|g| g.group_name().map(|s| s.to_string()))
                            .collect::<Vec<_>>()
                    }
                    Err(_) => vec![],
                };

                // Extract attributes
                let mut email = None;
                let mut given_name = None;

                for attr in user.attributes() {
                    if attr.name() == "email" {
                        email = attr.value().map(|s| s.to_string());
                    } else if attr.name() == "custom:given_name" {
                        given_name = attr.value().map(|s| s.to_string());
                    }
                }

                users.push(json!({
                    "username": username,
                    "email": email,
                    "given_name": given_name,
                    "enabled": user.enabled(),
                    "groups": user_groups,
                    "created": user.user_create_date().map(|d| d.to_string()),
                    "user_status": format!("{:?}", user.user_status()),
                }));
            }

            let response_body = json!({
                "users": users,
            });

            success_response(200, response_body.to_string())
        }
        Err(e) => {
            error_response(
                500,
                "Failed to list users",
                &e.to_string(),
                None,
            )
        }
    }
}

/// Handle updating user group
async fn handle_update_user_group(event: &Request, cognito_client: &CognitoClient) -> Response<Body> {
    // Check user permissions
    let user_groups = get_user_groups_from_event(event);
    if !can_manage_users(&user_groups) {
        return error_response(
            403,
            "Insufficient permissions",
            "You do not have permission to manage users",
            Some("Only ApplicationAdmin and Owner can manage users"),
        );
    }

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

    let user_pool_id = match std::env::var("USER_POOL_ID") {
        Ok(id) => id,
        Err(_) => {
            return error_response(
                500,
                "Configuration error",
                "USER_POOL_ID environment variable not set",
                None,
            )
        }
    };

    // Check if the new group is "delete" - if so, delete the user
    if new_group.to_lowercase() == "delete" {
        // Remove user from all groups first
        if let Ok(groups_response) = cognito_client
            .admin_list_groups_for_user()
            .user_pool_id(&user_pool_id)
            .username(username)
            .send()
            .await
        {
            for group in groups_response.groups() {
                if let Some(group_name) = group.group_name() {
                    let _ = cognito_client
                        .admin_remove_user_from_group()
                        .user_pool_id(&user_pool_id)
                        .username(username)
                        .group_name(group_name)
                        .send()
                        .await;
                }
            }
        }

        // Delete the user
        match cognito_client
            .admin_delete_user()
            .user_pool_id(&user_pool_id)
            .username(username)
            .send()
            .await
        {
            Ok(_) => {
                let response_body = json!({
                    "message": format!("User {} deleted successfully", username),
                });
                success_response(200, response_body.to_string())
            }
            Err(e) => {
                error_response(
                    500,
                    "Failed to delete user",
                    &e.to_string(),
                    None,
                )
            }
        }
    } else {
        // Get current user groups
        match cognito_client
            .admin_list_groups_for_user()
            .user_pool_id(&user_pool_id)
            .username(username)
            .send()
            .await
        {
            Ok(groups_response) => {
                // Remove user from all current groups
                for group in groups_response.groups() {
                    if let Some(group_name) = group.group_name() {
                        let _ = cognito_client
                            .admin_remove_user_from_group()
                            .user_pool_id(&user_pool_id)
                            .username(username)
                            .group_name(group_name)
                            .send()
                            .await;
                    }
                }

                // Add user to new group
                match cognito_client
                    .admin_add_user_to_group()
                    .user_pool_id(&user_pool_id)
                    .username(username)
                    .group_name(new_group)
                    .send()
                    .await
                {
                    Ok(_) => {
                        let response_body = json!({
                            "message": format!("User {} moved to group {}", username, new_group),
                        });
                        success_response(200, response_body.to_string())
                    }
                    Err(e) => {
                        error_response(
                            500,
                            "Failed to add user to group",
                            &e.to_string(),
                            None,
                        )
                    }
                }
            }
            Err(e) => {
                error_response(
                    500,
                    "Failed to get user groups",
                    &e.to_string(),
                    None,
                )
            }
        }
    }
}

/// Handle the Lambda event
async fn handle_lambda_event(event: Request, cognito_client: &CognitoClient) -> Result<Response<Body>, String> {
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

    // Route to user management endpoints
    if path == "/invite-user" && method == "POST" {
        return Ok(handle_user_invitation(&event, cognito_client).await);
    } else if path == "/users" && method == "GET" {
        return Ok(handle_list_users(&event, cognito_client).await);
    } else if path == "/update-user-group" && method == "POST" {
        return Ok(handle_update_user_group(&event, cognito_client).await);
    } else if path.starts_with("/api") {
        // Route to RepairShopr proxy for /api/* paths
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
    // Initialize AWS config and Cognito client
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let cognito_client = CognitoClient::new(&config);

    match handle_lambda_event(event, &cognito_client).await {
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