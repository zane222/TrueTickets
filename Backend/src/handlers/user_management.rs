//! User management handlers (invite, list, update)

use lambda_http::{Body, Request, Response};
use aws_sdk_cognitoidentityprovider::Client as CognitoClient;
use aws_sdk_cognitoidentityprovider::types::AttributeType;
use serde_json::json;

use crate::auth::{get_user_groups_from_event, can_manage_users, generate_temp_password};
use crate::http::{error_response, success_response};

/// Handle user invitation
pub async fn handle_user_invitation(
    email: &str,
    first_name: &str,
    cognito_client: &CognitoClient,
) -> Response<Body> {
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
            .expect("Couldn't add email when inviting user"),
        AttributeType::builder()
            .name("email_verified")
            .value("true")
            .build()
            .expect("Couldn't set email to verified when inviting user"),
    ];

    if !first_name.is_empty() {
        user_attributes.push(
            AttributeType::builder()
                .name("custom:given_name")
                .value(first_name)
                .build()
                .expect("Couldn't add given name when inviting user"),
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

            let user = response.user().expect("Couldn't collect user info after successfully inviting them");
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
pub async fn handle_list_users(event: &Request, cognito_client: &CognitoClient) -> Response<Body> {
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

            success_response(200, json!(users).to_string())
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
pub async fn handle_update_user_group(
    username: &str,
    new_group: &str,
    cognito_client: &CognitoClient,
) -> Response<Body> {

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
