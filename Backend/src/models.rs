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
    #[serde(default)]
    pub prefers_texting: bool,
    #[serde(default)]
    pub no_english: bool,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TicketWithoutCustomer {
    pub ticket_number: i64,
    pub subject: String,
    pub customer_id: String,
    pub status: String,
    pub password: String,

    #[serde(default)]
    pub created_at: i64,

    #[serde(default)]
    pub last_updated: i64,

    #[serde(default)]
    pub comments: Vec<Comment>,

    #[serde(default)]
    pub attachments: Vec<String>,

    #[serde(default)]
    pub items_left: Vec<String>,
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
    pub email: String,
    pub phone_numbers: Vec<PhoneNumber>,

    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
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
