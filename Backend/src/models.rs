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
    pub prefers_texting: bool,
    pub no_english: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TicketWithoutCustomer {
    pub ticket_number: i64,
    pub subject: String,
    pub customer_id: String,
    pub status: String,
    pub password: Option<String>,
    pub device: String,
    pub created_at: i64,
    pub last_updated: i64,
    pub comments: Option<Vec<Comment>>,
    pub attachments: Option<Vec<String>>,
    pub items_left: Option<Vec<String>>,
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
    pub email: Option<String>,
    pub phone_numbers: Vec<PhoneNumber>,
    pub created_at: i64,
    pub last_updated: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CounterValue {
    pub counter_value: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CustomerIdOnly {
    pub customer_id: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TicketNumberOnly {
    pub ticket_number: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
pub struct TicketLastUpdated {
    pub last_updated: String,
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
    pub status: Option<String>,
    pub password: Option<String>,
    pub items_left: Option<Vec<String>>,
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

