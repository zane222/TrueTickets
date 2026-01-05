//! Shared data models and structs used across the application.
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Comment {
    pub comment_body: String,
    pub tech_name: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PhoneNumber {
    pub number: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefers_texting: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_english: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LineItem {
    pub subject: String,
    pub price_cents: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TicketWithoutCustomer {
    pub ticket_number: i64,
    pub subject: String,
    #[allow(dead_code)] // subject_lower is not read, but is needed for serde::dynamo to write to
    #[serde(skip_serializing, default)]
    pub subject_lower: String,
    #[serde(skip_serializing)]
    pub customer_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    pub device: String,
    pub created_at: i64,
    pub last_updated: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comments: Option<Vec<Comment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items_left: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_items: Option<Vec<LineItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paid_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_paid_cents: Option<i64>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TinyTicketWithoutCustomer {
    pub ticket_number: i64,
    pub subject: String,
    pub customer_id: String,
    pub status: String,
    pub device: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TinyTicket {
    #[serde(flatten)]
    pub details: TinyTicketWithoutCustomer,
    pub customer_name: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Ticket {
    #[serde(flatten)]
    pub details: TicketWithoutCustomer,
    pub customer: Customer,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Customer {
    pub customer_id: String,
    pub full_name: String,
    #[allow(dead_code)] // full_name_lower is not read, but is needed for serde::dynamo to write to
    #[serde(skip_serializing, default)]
    pub full_name_lower: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    pub phone_numbers: Vec<PhoneNumber>,
    pub created_at: i64,
    pub last_updated: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CounterValue {
    pub counter_value: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CustomerIdOnly {
    pub customer_id: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TicketNumberOnly {
    pub ticket_number: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CustomerPhonesOnly {
    pub phone_numbers: Vec<PhoneNumber>,
}

// Request Bodies
#[derive(Debug, Deserialize, Serialize)]
pub struct CreateTicketRequest {
    pub customer_id: String,
    pub subject: String,
    pub password: Option<String>,
    pub items_left: Option<Vec<String>>,
    pub device: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateTicketRequest {
    pub subject: Option<String>,
    pub password: Option<String>,
    pub items_left: Option<Vec<String>>,
    pub line_items: Option<Vec<LineItem>>,
    pub device: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateCustomerRequest {
    pub full_name: String,
    pub email: Option<String>,
    pub phone_numbers: Vec<PhoneNumber>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateCustomerRequest {
    pub full_name: Option<String>,
    pub email: Option<String>,
    pub phone_numbers: Option<Vec<PhoneNumber>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct StoreConfig {
    pub store_name: String,
    pub tax_rate: f64,
    pub address: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub phone: String,
    pub email: String,
    pub disclaimer: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateStoreConfigRequest {
    pub store_name: String,
    pub tax_rate: f64,
    pub address: String,
    pub city: String,
    pub state: String,
    pub zip: String,
    pub phone: String,
    pub email: String,
    pub disclaimer: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PurchaseItem {
    pub name: String,
    pub amount_cents: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct MonthPurchases {
    pub month_year: String, // PK: YYYY-MM
    pub items: Vec<PurchaseItem>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdatePurchasesRequest {
    pub purchases: Vec<PurchaseItem>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TimeEntry {
    pub pk: String,         // PK: "ALL"
    pub user_name: String,
    pub timestamp: i64,
    pub is_clock_out: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateClockLogsRequest {
    pub user_name: String,
    pub start_of_day: i64,
    pub end_of_day: i64,
    pub segments: Vec<TimeSegment>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TimeSegment {
    pub start: i64,
    pub end: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct UserResponse {
    pub username: String,
    pub email: Option<String>,
    pub given_name: Option<String>,
    pub enabled: bool,
    pub groups: Vec<String>,
    pub created: Option<String>,
    pub user_status: String,
    pub wage_cents: i64,
}
