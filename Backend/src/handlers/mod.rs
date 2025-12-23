//! Handler modules for Lambda function

pub mod attachments;
pub mod proxy;
pub mod user_management;
pub mod database_management;

// Re-export handler functions for convenience
pub use attachments::handle_upload_attachment;
pub use user_management::{handle_user_invitation, handle_list_users, handle_update_user_group};
pub use database_management::*;
