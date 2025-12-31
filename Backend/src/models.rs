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
pub struct TicketWithoutCustomer {
    pub ticket_number: i64,
    pub subject: String,
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
