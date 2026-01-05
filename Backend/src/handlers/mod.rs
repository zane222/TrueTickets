//! Handler modules for Lambda function

pub mod attachments;
pub mod user_management;
pub mod tickets;
pub mod customers;
pub mod migration;
pub mod store_config;

// Re-export handler functions for convenience
pub use user_management::{handle_list_users, handle_update_user_group, handle_user_invitation};
pub use attachments::handle_upload_attachment;
pub use tickets::{
    handle_get_ticket_details, handle_quick_search_ticket, handle_search_tickets_by_subject, handle_get_recent_tickets,
    handle_create_ticket, handle_update_ticket, handle_add_ticket_comment, handle_get_tickets_by_suffix,
    handle_get_tickets_by_customer_id, handle_update_status
};
pub use customers::{
    handle_get_customers_by_phone, handle_create_customer, handle_update_customer,
    handle_search_customers_by_name, handle_get_customer_by_id
};
pub use migration::handle_migrate_tickets;
pub use store_config::{handle_get_store_config, handle_update_store_config};
pub mod financials;
pub use financials::{
    get_purchases, get_all_tickets_for_month_with_payments, update_purchases, handle_get_clock_logs,
    handle_clock_in, handle_get_clock_status, handle_update_user_wage, handle_update_clock_logs,
    handle_take_payment, handle_refund_payment
};
