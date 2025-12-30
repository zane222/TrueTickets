//! Authorization and permission checking utilities

use lambda_http::{Request, RequestExt};
use rand::Rng;

/// Extract user groups from the Cognito authorizer context
pub fn get_user_groups_from_event(event: &Request) -> Vec<String> {
    // Get user groups from the request context (populated by Cognito authorizer)
    let request_context = event.request_context();
    if let Some(authorizer) = request_context.authorizer()
        && let Some(claims) = authorizer.fields.get("claims")
        && let Some(groups) = claims.get("cognito:groups")
    {
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
    vec![]
}

/// Check if user can invite other users
pub fn can_invite_users(user_groups: &[String]) -> bool {
    let allowed_groups = [
        "TrueTickets-Cacell-ApplicationAdmin",
        "TrueTickets-Cacell-Owner",
        "TrueTickets-Cacell-Manager",
    ];
    user_groups
        .iter()
        .any(|group| allowed_groups.contains(&group.as_str()))
}

/// Check if user can manage users
pub fn can_manage_users(user_groups: &[String]) -> bool {
    let allowed_groups = ["TrueTickets-Cacell-ApplicationAdmin", "TrueTickets-Cacell-Owner"];
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
