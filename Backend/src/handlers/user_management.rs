//! User management handlers (invite, list, update)

use lambda_http::{Body, Request, Response};
use aws_sdk_cognitoidentityprovider::Client as CognitoClient;
use aws_sdk_cognitoidentityprovider::types::AttributeType;
use serde_json::{json, Value};

use crate::auth::{get_user_groups_from_event, can_manage_users, generate_temp_password};
use crate::http::error_response;

/// Handle user invitation
pub async fn handle_user_invitation(
    email: &str,
    first_name: &str,
    cognito_client: &CognitoClient,
) -> Result<Value, Response<Body>> {
    let user_pool_id = std::env::var("USER_POOL_ID")
        .map_err(|_| error_response(500, "Configuration Error", "USER_POOL_ID environment variable not set", None))?;

    // Check if user already exists (optional check, suppress error if not found)
    let _ = cognito_client
        .admin_get_user()
        .user_pool_id(&user_pool_id)
        .username(email)
        .send()
        .await;

    // Create user attributes
    let mut user_attributes = vec![
        AttributeType::builder()
            .name("email")
            .value(email)
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build email attribute: {:?}", e), None))?,
        AttributeType::builder()
            .name("email_verified")
            .value("true")
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build email_verified attribute: {:?}", e), None))?,
    ];

    if !first_name.is_empty() {
        user_attributes.push(
            AttributeType::builder()
                .name("custom:given_name")
                .value(first_name)
                .build()
                .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build given_name attribute: {:?}", e), None))?,
        );
    }

    // Create the user
    let response = cognito_client
        .admin_create_user()
        .user_pool_id(&user_pool_id)
        .username(email)
        .set_user_attributes(Some(user_attributes))
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await
        .map_err(|e| {
            let error_code = e.to_string();
            if error_code.contains("AccessDeniedException") {
                error_response(500, "Access Denied", &format!("Missing permissions to invite user: {:?}", e), Some("Check IAM policy for cognito-idp:AdminCreateUser"))
            } else {
                error_response(400, "Could Not Invite User", &e.to_string(), None)
            }
        })?;

    let temp_password = generate_temp_password();

    // Set permanent password
    cognito_client
        .admin_set_user_password()
        .user_pool_id(&user_pool_id)
        .username(email)
        .password(&temp_password)
        .permanent(true)
        .send()
        .await
        .map_err(|e| {
            if e.to_string().contains("AccessDeniedException") {
                error_response(500, "Access Denied", "Missing permissions to set user password", Some("Check IAM policy for cognito-idp:AdminSetUserPassword"))
            } else {
                error_response(500, "Password Error", &format!("Could not set user password: {:?}", e), None)
            }
        })?;

    // Add user to default employee group
    let _ = cognito_client
        .admin_add_user_to_group()
        .user_pool_id(&user_pool_id)
        .username(email)
        .group_name("TrueTickets-Cacell-Employee")
        .send()
        .await;

    let user = response.user().ok_or_else(|| error_response(500, "Data Error", "Successfully invited user but could not collect user info", None))?;

    Ok(json!({
        "message": format!("Invitation sent successfully to {:?}", email),
        "user": {
            "username": user.username(),
            "enabled": user.enabled(),
            "created": user.user_create_date().map(|d| d.to_string()),
        }
    }))
}

/// Handle listing all users
pub async fn handle_list_users(event: &Request, cognito_client: &CognitoClient) -> Result<Value, Response<Body>> {
    // Check user permissions
    let user_groups = get_user_groups_from_event(event);
    if !can_manage_users(&user_groups) {
        return Err(error_response(403, "Insufficient Permissions", "You do not have permission to view users", Some("Only ApplicationAdmin and Owner can view users")));
    }

    let user_pool_id = std::env::var("USER_POOL_ID")
        .map_err(|_| error_response(500, "Configuration Error", "USER_POOL_ID environment variable not set", None))?;

    let response = cognito_client
        .list_users()
        .user_pool_id(&user_pool_id)
        .limit(60)
        .send()
        .await
        .map_err(|e| error_response(500, "Cognito Error", &format!("Failed to list users: {:?}", e), None))?;

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

    Ok(json!(users))
}

/// Handle updating user group
pub async fn handle_update_user_group(
    username: &str,
    new_group: &str,
    cognito_client: &CognitoClient,
) -> Result<Value, Response<Body>> {
    let user_pool_id = std::env::var("USER_POOL_ID")
        .map_err(|_| error_response(500, "Configuration Error", "USER_POOL_ID environment variable not set", None))?;

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
        cognito_client
            .admin_delete_user()
            .user_pool_id(&user_pool_id)
            .username(username)
            .send()
            .await
            .map_err(|e| error_response(500, "Cognito Error", &format!("Failed to delete user {:?}: {:?}", username, e), None))?;

        Ok(json!({ "message": format!("User {:?} deleted successfully", username) }))
    } else {
        // Get current user groups
        let groups_response = cognito_client
            .admin_list_groups_for_user()
            .user_pool_id(&user_pool_id)
            .username(username)
            .send()
            .await
            .map_err(|e| error_response(500, "Cognito Error", &format!("Failed to get user groups for {:?}: {:?}", username, e), None))?;

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
        cognito_client
            .admin_add_user_to_group()
            .user_pool_id(&user_pool_id)
            .username(username)
            .group_name(new_group)
            .send()
            .await
            .map_err(|e| error_response(500, "Cognito Error", &format!("Failed to add user {:?} to group {:?}: {:?}", username, new_group, e), None))?;

        Ok(json!({ "message": format!("User {:?} moved to group {:?}", username, new_group) }))
    }
}
