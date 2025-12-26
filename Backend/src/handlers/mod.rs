//! Handler modules for Lambda function

pub mod attachments;
pub mod user_management;
pub mod tickets;
pub mod customers;

// Re-export handler functions for convenience
pub use attachments::handle_upload_attachment;
pub use user_management::{handle_user_invitation, handle_list_users, handle_update_user_group};
pub use tickets::{
    handle_get_ticket_by_number, handle_search_tickets_by_subject, handle_get_recent_tickets,
    handle_create_ticket, handle_update_ticket, handle_add_ticket_comment,
    handle_get_ticket_last_updated, handle_get_tickets_by_suffix, handle_get_tickets_by_customer_id
};
pub use customers::*;
