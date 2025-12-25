use chrono::Utc;
use serde_json::{json, Value};
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client,
    types::{AttributeValue, Put, Delete, TransactWriteItem, ReturnValue, KeysAndAttributes},
};
use std::collections::{HashMap, HashSet};
use crate::http::{error_response, success_response};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TicketWithoutCustomer {
    pub ticket_number: i64,
    pub subject: String,
    pub customer_id: String,
    pub status: String,

    #[serde(default)]
    pub password: Option<String>,


    #[serde(default)]
    pub created_at: i64,

    #[serde(default)]
    pub last_updated: i64,

    #[serde(default)]
    pub comments: Vec<Value>,
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
    pub phone_numbers: Vec<String>,

    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub last_updated: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct CounterValue {
    pub counter_value: String,
}
// --------------------------
// TICKETS
// --------------------------

pub async fn handle_get_ticket_by_number(
    ticket_number: &str,
    client: &Client,
) -> Response<Body> {
    // 1. Get Ticket
    let res = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.to_string()))
        .send()
        .await;

    let ticket_item = match res {
        Ok(output) => {
            if let Some(item) = output.item {
                item
            } else {
                return error_response(404, "Ticket not found", "No ticket with that number", None);
            }
        }
        Err(e) => return error_response(500, "DynamoDB error", &format!("{}", e), None),
    };

    let ticket_nocust: TicketWithoutCustomer = match serde_dynamo::from_item(ticket_item) {
        Ok(t) => t,
        Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {}", e), None),
    };

    // 2. Get Customer
    let cust_res = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(ticket_nocust.customer_id.clone()))
        .send()
        .await;

    let customer: Customer = match cust_res {
        Ok(output) => {
            if let Some(item) = output.item {
                 match serde_dynamo::from_item(item) {
                     Ok(c) => c,
                     Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {}", e), None),
                 }
            } else {
                // If customer is missing, that's a data integrity issue, but we still need to return something or error.
                // Let's error.
                return error_response(404, "Customer not found", "Ticket exists but linked customer is missing", None);
            }
        },
        Err(e) => return error_response(500, "DynamoDB error", &format!("{}", e), None),
    };

    // 3. Compose response
    let full_ticket = Ticket {
        details: ticket_nocust,
        customer: customer,
    };

    match serde_json::to_string(&full_ticket) {
        Ok(json) => success_response(200, &json),
        Err(e) => error_response(500, "Serialization Error", &format!("{}", e), None),
    }
}

pub async fn handle_get_tickets_by_customer_id(customer_id: String, client: &Client) -> Response<Body> {
    // Fetch Customer details first so they can be attached to each ticket
    let customer_res = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .send()
        .await;

    let customer_data = match customer_res {
        Ok(out) => {
            if let Some(item) = out.item {
                match serde_dynamo::from_item(item) {
                    Ok(json) => json,
                    Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {}", e), None),
                }
            } else {
                return error_response(404, "Customer not found", "No customer with that ID", None);
            }
        },
        Err(e) => return error_response(500, "Failed to get customer", &format!("{}", e), None),
    };

    let customer: Customer = match serde_json::from_value(customer_data) {
        Ok(c) => c,
        Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {}", e), None),
    };

    // Query Tickets by customer id
    let res = client.query()
        .table_name("Tickets")
        .index_name("CustomerIdIndex")
        .key_condition_expression("customer_id = :cid")
        .expression_attribute_values(":cid", AttributeValue::S(customer_id))
        .send()
        .await;

    match res {
        Ok(output) => {
            let mut tickets_nocust = Vec::new();
            for item in output.items.unwrap_or_default() {
                match serde_dynamo::from_item(item) {
                    Ok(t) => tickets_nocust.push(t),
                    Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {}", e), None),
                }
            }

            let tickets: Vec<Ticket> = tickets_nocust.into_iter().map(|details| Ticket {
                details,
                customer: customer.clone(),
            }).collect();

            match serde_json::to_string(&tickets) {
                Ok(json) => success_response(200, &json),
                Err(e) => error_response(500, "Serialization Error", &format!("{}", e), None),
            }
        }
        Err(e) => error_response(500, "Failed to get tickets for customer", &format!("{}", e), None),
    }
}

pub async fn handle_search_tickets_by_subject(
    query: &str,
    client: &Client,
) -> Response<Body> {
    // Search TicketSubjects (lowercase)
    // BatchGet Tickets
    let mut filter_exprs = Vec::new();
    let mut expr_vals = HashMap::new();
    expr_vals.insert(":pk".to_string(), AttributeValue::S("ALL".to_string()));

    for (i, word) in query.split_whitespace().map(|q| q.to_lowercase()).enumerate() {
        let key = format!(":q{}", i);
        filter_exprs.push(format!("contains(subject_lc, {})", key));
        expr_vals.insert(key, AttributeValue::S(word));
    }

    if filter_exprs.is_empty() {
        return success_response(200, "[]");
    }

    let filter_expression = filter_exprs.join(" AND ");

    let mut query_builder = client.query()
        .table_name("TicketSubjects")
        .index_name("TicketNumberIndex")
        .key_condition_expression("gsi_pk = :pk")
        .filter_expression(filter_expression)
        .scan_index_forward(false)
        .projection_expression("ticket_number"); // Only need the key
    for (k, v) in expr_vals {
        query_builder = query_builder.expression_attribute_values(k, v);
    }

    // can only read 1mb per request, so do this to make requests automatically for when it needs to read more
    let mut paginator = query_builder
        .into_paginator()
        .items()
        .send();

    #[derive(Deserialize)]
    struct TicketWithOnlySubject {
        ticket_number: String,
    }

    // collect the ticket numbers into a Vec
    let mut ticket_numbers: Vec<String> = Vec::new();
    loop {
        if ticket_numbers.len() >= 15 {
            break;
        }
        let page = match paginator.try_next().await {
            Ok(p) => p,
            Err(e) => return error_response(500, "Pagination Error", &format!("Failed to get next page: {}", e), None),
        };
        match page {
             Some(item) => {
                 match serde_dynamo::from_item::<_, TicketWithOnlySubject>(item) {
                    Ok(tn) => ticket_numbers.push(tn.ticket_number),
                    Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket subject: {}", e), None),
                }
             },
             None => break,
        }
    }

    if ticket_numbers.is_empty() {
         return success_response(200, "[]");
    }

    // Batch Get full tickets from ticket numbers
    let keys: Vec<HashMap<String, AttributeValue>> = ticket_numbers.into_iter()
        .map(|tn| {
            let mut key = HashMap::new();
            key.insert("ticket_number".to_string(), AttributeValue::N(tn));
            key
        })
        .collect();

    let ka = match KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .build() {
            Ok(res) => res,
            Err(e) => return error_response(500, "Batch key build error", &format!("There could be an issue with the server configuration. Error: {}", e), None),
        };

    let batch_res = client.batch_get_item()
        .request_items("Tickets", ka)
        .send()
        .await;

    match batch_res {
        Ok(output) => {
            let mut tickets_nocust = Vec::<TicketWithoutCustomer>::new();
            for item in output.responses.unwrap_or_default().remove("Tickets").unwrap_or_default() {
                match serde_dynamo::from_item(item) {
                    Ok(t) => tickets_nocust.push(t),
                    Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {}", e), None),
                }
            }

            // BatchGetItem doesn't guarantee order results in the same order as the requests so sorting is needed
            tickets_nocust.sort_by_key(|ticket| ticket.ticket_number);

            let tickets = match batch_fetch_and_merge_customers(tickets_nocust, client).await {
                Ok(t) => t,
                Err(e) => return e,
            };

            match serde_json::to_string(&tickets) {
                Ok(json) => success_response(200, &json),
                Err(e) => error_response(500, "Serialization Error", &format!("{}", e), None),
            }
        }
        Err(e) => error_response(500, "Failed to get ticket details", &format!("{}", e), None),
    }
}

pub async fn handle_get_recent_tickets(client: &Client) -> Response<Body> {
    // Query "Tickets" table directly using GSI "TicketNumberIndex" (pk="ALL")
    // Tickets now has gsi_pk = "ALL"

    let res = client.query()
        .table_name("Tickets")
        .index_name("TicketNumberIndex")
        .key_condition_expression("gsi_pk = :pk")
        .expression_attribute_values(":pk", AttributeValue::S("ALL".to_string()))
        .scan_index_forward(false)
        .limit(30)
        .send()
        .await;

    match res {
        Ok(output) => {
            let items = output.items.unwrap_or_default();
            let mut tickets_nocust = Vec::new();
            for item in items {
                match serde_dynamo::from_item(item) {
                     Ok(t) => tickets_nocust.push(t),
                     Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {}", e), None),
                }
            }
            let tickets = match batch_fetch_and_merge_customers(tickets_nocust, client).await {
                Ok(t) => t,
                Err(e) => return e,
            };

            match serde_json::to_string(&tickets) {
                Ok(json) => success_response(200, &json),
                Err(e) => error_response(500, "Serialization Error", &format!("{}", e), None),
            }
        }
        Err(e) => error_response(500, "Failed to get recent tickets", &format!("{}", e), None),
    }
}

pub async fn handle_create_ticket(
    customer_id: String,
    subject: String,
    password: Option<String>,
    client: &Client,
) -> Response<Body> {
    // Atomically get next ticket number
    let counter_res = client.update_item()
        .table_name("Counters")
        .key("counter_name", AttributeValue::S("ticket_number".to_string()))
        .update_expression("SET counter_value = if_not_exists(counter_value, :zero) + :inc")
        .expression_attribute_values(":inc", AttributeValue::N("1".to_string()))
        .expression_attribute_values(":zero", AttributeValue::N("0".to_string()))
        .return_values(ReturnValue::UpdatedNew)
        .send()
        .await;

    let CounterValue { counter_value: ticket_number } = {
        let output = match counter_res {
            Ok(o) => o,
            Err(e) => {
                return error_response(500, "Failed to get ticket number", &e.to_string(), None)
            }
        };

        let attrs = match output.attributes {
            Some(a) => a,
            None => {
                return error_response(500, "Failed to get ticket number", "Update returned no attributes", None)
            }
        };

        match serde_dynamo::from_item(attrs) {
            Ok(v) => v,
            Err(e) => {
                return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket number value: {}", e), None)
            }
        }
    };

    let now = Utc::now().timestamp().to_string();

    let mut txn_builder = client.transact_write_items();

    let put_ticket = match Put::builder()
                .table_name("Tickets")
                .item("ticket_number", AttributeValue::N(ticket_number.clone()))
                .item("gsi_pk", AttributeValue::S("ALL".to_string())) // Added for TicketNumberIndex
                .item("subject", AttributeValue::S(subject.clone())) // Stored with original casing
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("status", AttributeValue::S("Diagnosing".to_string()))
                .item("password", AttributeValue::S(password.unwrap_or_default()))
                .item("created_at", AttributeValue::N(now.clone()))
                .item("last_updated", AttributeValue::N(now.clone()))
                .build() {
                    Ok(p) => p,
                    Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Put item for Tickets: {}", e), None),
                };

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_ticket)
            .build()
    );

    // TicketSubjects: Lowercase subject, standard fields for search
    let put_subject = match Put::builder()
                .table_name("TicketSubjects")
                .item("ticket_number", AttributeValue::N(ticket_number.clone()))
                .item("gsi_pk", AttributeValue::S("ALL".to_string()))
                .item("subject_lc", AttributeValue::S(subject.to_lowercase())) // Lowercase for search
                .build() {
                    Ok(p) => p,
                    Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Put item for TicketSubjects: {}", e), None),
                };

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_subject)
            .build()
    );

    let txn_res = txn_builder.send().await;

    match txn_res {
        Ok(_) => {
             success_response(200, &json!({ "ticket_number": ticket_number }).to_string())
        },
        Err(e) => error_response(500, "Failed to create ticket", &e.to_string(), None),
    }
}

pub async fn handle_update_ticket(
    ticket_number: String,
    subject: Option<String>,
    status: Option<String>,
    password: Option<String>,
    client: &Client,
) -> Response<Body> {
    let mut txn_builder = client.transact_write_items();

    if let Some(s) = &subject {
        let update_builder = aws_sdk_dynamodb::types::Update::builder()
            .table_name("TicketSubjects")
            .key("ticket_number", AttributeValue::N(ticket_number.clone()))
            .update_expression("SET subject_lc = :s")
            .expression_attribute_values(":s", AttributeValue::S(s.to_lowercase())); // Lowercase

        let update = match update_builder.build() {
            Ok(u) => u,
            Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Update for TicketSubjects: {}", e), None),
        };
        txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());
    }

    let mut update_parts = Vec::new();
    let mut expr_vals = HashMap::new();

    if let Some(s) = subject {
        update_parts.push("subject = :s".to_string());
        expr_vals.insert(":s".to_string(), AttributeValue::S(s));
    }
    if let Some(st) = status {
        update_parts.push("status = :st".to_string());
        expr_vals.insert(":st".to_string(), AttributeValue::S(st));
    }
    if let Some(pw) = password {
        update_parts.push("password = :pw".to_string());
        expr_vals.insert(":pw".to_string(), AttributeValue::S(pw));
    }

    update_parts.push("last_updated = :lu".to_string());
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    let update_expr = format!("SET {}", update_parts.join(", "));

    let mut update_builder = aws_sdk_dynamodb::types::Update::builder()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression(update_expr);

    for (k, v) in expr_vals {
        update_builder = update_builder.expression_attribute_values(k, v);
    }

    let update = match update_builder.build() {
        Ok(u) => u,
        Err(e) => return error_response(500, "Failed to build Update for Tickets", &format!("Error: {}", e.to_string()), None),
    };
    txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());

    let res = txn_builder.send().await;

    match res {
        Ok(_) => success_response(200, &json!({"ticket_number": ticket_number}).to_string()),
        Err(e) => error_response(500, "Failed to update ticket", &format!("{}", e), None),
    }
}

pub async fn handle_add_ticket_comment(
    ticket_number: String,
    comment_body: String,
    tech_name: String,
    client: &Client,
) -> Response<Body> {
    let comment = AttributeValue::M(
        vec![
            ("comment_body".to_string(), AttributeValue::S(comment_body)),
            ("tech_name".to_string(), AttributeValue::S(tech_name)),
            ("created_at".to_string(), AttributeValue::N(Utc::now().timestamp().to_string())),
        ]
        .into_iter().collect()
    );

    let res = client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET comments = list_append(if_not_exists(comments, :empty), :c), last_updated = :lu")
        .expression_attribute_values(":c", AttributeValue::L(vec![comment]))
        .expression_attribute_values(":empty", AttributeValue::L(vec![]))
        .expression_attribute_values(":lu", AttributeValue::N(Utc::now().timestamp().to_string()))
        .send()
        .await;

    match res {
        Ok(_) => success_response(200, &json!({"ticket_number": ticket_number}).to_string()),
        Err(e) => error_response(500, "Failed to add comment", &format!("{}", e), None),
    }
}

pub async fn handle_get_ticket_last_updated(ticket_number: String, client: &Client) -> Response<Body> {
    let res = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .projection_expression("last_updated")
        .send()
        .await;

    #[derive(Deserialize)]
    struct LastUpdated {
        last_updated: String,
    }

    let LastUpdated { last_updated } = match res {
        Ok(output) => {
            if let Some(item) = output.item {
                match serde_dynamo::from_item(item) {
                    Ok(val) => val,
                    Err(_) => return error_response(500, "Invalid data", "last_updated missing or invalid", None),
                }
            } else {
                return error_response(404, "Ticket not found", "No ticket with that number", None)
            }
        },
        Err(e) => return error_response(500, "Failed to get ticket last_updated", &format!("{}", e), None),
    };

    success_response(200, &json!({ "last_updated": last_updated }).to_string())
}

// --------------------------
// CUSTOMERS
// --------------------------

pub async fn handle_get_customers_by_phone(phone_number: String, client: &Client) -> Response<Body> {
    // First query the phone index to get customer IDs
    let index_res = client.query()
        .table_name("CustomerPhoneIndex")
        .key_condition_expression("phone_number = :p")
        .expression_attribute_values(":p", AttributeValue::S(phone_number))
        .send()
        .await;

    let customer_ids: Vec<String> = match index_res {
        Ok(output) => {
            let items = output.items.unwrap_or_default();
            let mut ids = Vec::new();
            for item in items {
                match item.get("customer_id").and_then(|v| v.as_s().ok()) {
                    Some(s) => ids.push(s.to_string()),
                    None => return error_response(500, "Data Integrity Error", "Missing or invalid customer_id in phone index", None),
                }
            }
            ids
        },
        Err(e) => return error_response(500, "Failed to query phone index", &format!("{}", e), None),
    };

    // Batch get full customer details from Customers table
    let keys: Vec<HashMap<String, AttributeValue>> = customer_ids.into_iter()
        .map(|id| {
            let mut key = HashMap::new();
            key.insert("customer_id".to_string(), AttributeValue::S(id));
            key
        })
        .collect();

    if keys.is_empty() {
        return success_response(200, "[]");
    }

    let ka_customers = match KeysAndAttributes::builder()
        .set_keys(Some(keys))
        // projection_expression is optional, if we want everything we can omit it.
        // User asked for: "id, full_name, and primary_phone"
        .projection_expression("customer_id, full_name, phone_numbers")
        .build() {
            Ok(ka) => ka,
            Err(e) => return error_response(500, "Failed to build batch get customers", &format!("{}", e), None),
        };

    let batch_res = client.batch_get_item()
        .request_items("Customers", ka_customers)
        .send()
        .await;

    match batch_res {
        Ok(output) => {
            let responses = output.responses.unwrap_or_default();
            let customers = responses.get("Customers").cloned().unwrap_or_default();
            let mut json_items = Vec::new();
            for item in customers {
                match serde_dynamo::from_item(item) {
                     Ok(json) => json_items.push(json),
                     Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {}", e), None),
                }
            }
            success_response(200, &serde_json::Value::Array(json_items).to_string())
        }
        Err(e) => error_response(500, "Failed to get customer details", &format!("{}", e), None),
    }
}

pub async fn handle_get_customer_by_id(customer_id: String, client: &Client) -> Response<Body> {
    let res = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id))
        .send()
        .await;

    let customer: Customer = match res {
        Ok(output) => {
            if let Some(item) = output.item {
                match serde_dynamo::from_item(item) {
                    Ok(customer) => customer,
                    Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {}", e), None),
                }
            } else {
                return error_response(404, "Customer not found", "No customer with that ID", None)
            }
        }
        Err(e) => return error_response(500, "Failed to get customer", &format!("{}", e), None),
    };

    match serde_json::to_string(&customer) {
        Ok(json) => success_response(200, &json),
        Err(e) => error_response(500, "Serialization Error", &format!("{}", e), None),
    }
}

pub async fn handle_search_customers_by_name(query: &str, client: &Client) -> Response<Body> {
    // Search CustomerNames (lowercase)
    let query_lower = query.to_lowercase();

    let mut customer_ids: Vec<String> = Vec::new();

    let mut paginator = client.scan()
        .table_name("CustomerNames")
        .filter_expression("contains(full_name_lc, :q)")
        .expression_attribute_values(":q", AttributeValue::S(query_lower))
        .into_paginator()
        .items()
        .send();

    loop {
        if customer_ids.len() >= 15 {
            break;
        }
        let item_opt = match paginator.try_next().await {
            Ok(opt) => opt,
            Err(e) => return error_response(500, "Pagination Error", &format!("Failed to scan customers: {}", e), None),
        };

        if let Some(item) = item_opt {
             if let Some(id) = item.get("customer_id").and_then(|v| v.as_s().ok()) {
                  customer_ids.push(id.clone());
             } else {
                 return error_response(500, "Data Error", "Missing or invalid customer_id in search result", None);
             }
        } else {
            break;
        }
    }

    if customer_ids.is_empty() {
        return success_response(200, "[]");
    }

    // Batch Get full customers
    let keys: Vec<HashMap<String, AttributeValue>> = customer_ids.into_iter()
        .map(|id| {
            let mut key = HashMap::new();
            key.insert("customer_id".to_string(), AttributeValue::S(id));
            key
        })
        .collect();

    let ka = match KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .build() {
            Ok(k) => k,
            Err(e) => return error_response(500, "Builder Error", &format!("Failed to build KeysAndAttributes: {}", e), None),
        };

    let batch_res = client.batch_get_item()
        .request_items("Customers", ka)
        .send()
        .await;

    let json_items = match batch_res {
        Ok(output) => {
            let responses = output.responses.unwrap_or_default();
            let items = responses.get("Customers").cloned().unwrap_or_default();
            let mut json_items = Vec::new();
            for item in items {
                match serde_dynamo::from_item(item) {
                     Ok(json) => json_items.push(json),
                     Err(e) => return error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {}", e), None),
                }
            }
            json_items
        }
        Err(e) => return error_response(500, "Failed to get customer details", &format!("{}", e), None),
    };

    success_response(200, &serde_json::Value::Array(json_items).to_string())
}

pub async fn handle_create_customer(
    full_name: String,
    email: String,
    phone_numbers: Vec<String>,
    client: &Client,
) -> Response<Body> {
    let customer_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp().to_string();

    let mut txn_builder = client.transact_write_items();

    let put_customer = match Put::builder()
                .table_name("Customers")
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("full_name", AttributeValue::S(full_name.clone())) // Stored with original casing
                .item("email", AttributeValue::S(email.clone()))

                .item("phone_numbers", AttributeValue::L(phone_numbers.iter().map(|p| AttributeValue::S(p.clone())).collect()))
                .item("created_at", AttributeValue::N(now.clone()))
                .item("last_updated", AttributeValue::N(now.clone()))
                .build() {
                    Ok(p) => p,
                    Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Put item for Customers: {}", e), None),
                };

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_customer)
            .build()
    );

    let put_name = match Put::builder()
                .table_name("CustomerNames")
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("full_name_lc", AttributeValue::S(full_name.to_lowercase())) // Lowercase for search
                .build() {
                    Ok(p) => p,
                    Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Put item for CustomerNames: {}", e), None),
                };

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_name)
            .build()
    );

    for phone in &phone_numbers {
        let phone_put = match Put::builder()
            .table_name("CustomerPhoneIndex")
            .item("phone_number", AttributeValue::S(phone.clone()))
            .item("customer_id", AttributeValue::S(customer_id.clone()))
            .build() {
                Ok(p) => p,
                Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Put item for CustomerPhoneIndex: {}", e), None),
            };
        txn_builder = txn_builder.transact_items(TransactWriteItem::builder().put(phone_put).build());
    }

    let txn_res = txn_builder.send().await;

    match txn_res {
        Ok(_) => success_response(200, &json!({ "customer_id": customer_id }).to_string()),
        Err(e) => error_response(500, "Failed to create customer", &format!("{}", e), None),
    }
}

pub async fn handle_update_customer(
    customer_id: String,
    full_name: Option<String>,
    email: Option<String>,
    phone_numbers: Option<Vec<String>>,
    client: &Client,
) -> Response<Body> {
    let mut txn_builder = client.transact_write_items();

    // 1. Handle Phone Changes (Index management)
    if let Some(ref new_phones) = phone_numbers {
        // First, get the current customer to find old phone numbers
        let current_res = client.get_item()
            .table_name("Customers")
            .key("customer_id", AttributeValue::S(customer_id.clone()))
            .projection_expression("phone_numbers")
            .send()
            .await;

        let old_phones: Vec<String> = match current_res {
            Ok(output) => {
                if let Some(item) = output.item {
                     if let Some(list_av) = item.get("phone_numbers") {
                          if let Ok(list) = list_av.as_l() {
                               let mut phones = Vec::new();
                               for av in list {
                                   match av.as_s() {
                                       Ok(s) => phones.push(s.to_string()),
                                       Err(_) => return error_response(500, "Data Integrity Error", "Non-string phone number found", None),
                                   }
                               }
                               phones
                          } else {
                               return error_response(500, "Data Integrity Error", "phone_numbers is not a list", None);
                          }
                     } else {
                         Vec::new()
                     }
                } else {
                    Vec::new()
               }
            },
            Err(e) => return error_response(500, "Failed to get current customer", &format!("{}", e), None),
        };

        // Delete old phone index entries
        for phone in &old_phones {
            let delete = match Delete::builder()
                .table_name("CustomerPhoneIndex")
                .key("phone_number", AttributeValue::S(phone.clone()))
                .key("customer_id", AttributeValue::S(customer_id.clone()))
                .build() {
                    Ok(d) => d,
                    Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Delete item for CustomerPhoneIndex: {}", e), None),
                };
            txn_builder = txn_builder.transact_items(TransactWriteItem::builder().delete(delete).build());
        }

        // Add new phone index entries
        for phone in new_phones {
            let put = match Put::builder()
                .table_name("CustomerPhoneIndex")
                .item("phone_number", AttributeValue::S(phone.clone()))
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .build() {
                    Ok(p) => p,
                    Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Put item for CustomerPhoneIndex: {}", e), None),
                };
            txn_builder = txn_builder.transact_items(TransactWriteItem::builder().put(put).build());
        }
    }

    // 2. Update CustomerNames (if full_name changed)
    if let Some(ref fn_val) = full_name {
        let update_builder = aws_sdk_dynamodb::types::Update::builder()
            .table_name("CustomerNames")
            .key("customer_id", AttributeValue::S(customer_id.clone()))
            .update_expression("SET full_name_lc = :fn")
            .expression_attribute_values(":fn", AttributeValue::S(fn_val.to_lowercase())); // Lowercase for search
            
        let update = match update_builder.build() {
            Ok(u) => u,
            Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Update for CustomerNames: {}", e), None),
        };
        txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());
    }

    // 3. Update Customers (email, phones, last_updated)
    // We ALWAYS update Customers for last_updated
    let mut update_parts = vec![
        "last_updated = :lu".to_string(),
    ];
    let mut expr_vals = HashMap::new();
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    if let Some(ref new_phones) = phone_numbers {
        update_parts.push("phone_numbers = :phones".to_string());
        expr_vals.insert(":phones".to_string(), AttributeValue::L(new_phones.iter().map(|p| AttributeValue::S(p.clone())).collect()));
    }

    if let Some(e) = email {
        update_parts.push("email = :e".to_string());
        expr_vals.insert(":e".to_string(), AttributeValue::S(e));
    }

    // Also update full_name in Customers if it changed (original case)
    if let Some(fn_val) = full_name {
        update_parts.push("full_name = :fn".to_string());
        expr_vals.insert(":fn".to_string(), AttributeValue::S(fn_val));
    }

    let update_expr = format!("SET {}", update_parts.join(", "));

    let mut update_builder = aws_sdk_dynamodb::types::Update::builder()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .update_expression(update_expr);

    for (k, v) in expr_vals {
        update_builder = update_builder.expression_attribute_values(k, v);
    }

    let update = match update_builder.build() {
        Ok(u) => u,
        Err(e) => return error_response(500, "Builder Error", &format!("Failed to build Update for Customers: {}", e), None),
    };
    txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());

    // Execute Transaction
    let txn_res = txn_builder.send().await;

    match txn_res {
        Ok(_) => success_response(200, &json!({ "customer_id": customer_id }).to_string()),
        Err(e) => error_response(500, "Failed to update customer", &format!("{}", e), None),
    }
}

pub async fn handle_get_customer_last_updated(customer_id: String, client: &Client) -> Response<Body> {
    let res = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .projection_expression("last_updated")
        .send()
        .await;

    #[derive(Deserialize)]
    struct LastUpdated {
        last_updated: String,
    }

    match res {
        Ok(output) => {
            if let Some(item) = output.item {
                let LastUpdated { last_updated } = match serde_dynamo::from_item(item) {
                    Ok(val) => val,
                    Err(_) => return error_response(500, "Invalid data", "last_updated missing or invalid", None),
                };
                success_response(200, &json!({ "last_updated": last_updated }).to_string())
            } else {
                error_response(404, "Customer not found", "No customer with that ID", None)
            }
        },
        Err(e) => error_response(500, "Failed to get customer last_updated", &format!("{}", e), None),
    }
}

async fn batch_fetch_and_merge_customers(
    tickets_nocust: Vec<TicketWithoutCustomer>,
    client: &Client,
) -> Result<Vec<Ticket>, Response<Body>> {
    let customer_ids: Vec<String> = tickets_nocust.iter()
        .map(|t| t.customer_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if customer_ids.is_empty() {
        return Ok(Vec::new());
    }

    let keys: Vec<HashMap<String, AttributeValue>> = customer_ids.iter()
        .map(|id| {
            let mut key = HashMap::new();
            key.insert("customer_id".to_string(), AttributeValue::S(id.clone()));
            key
        })
        .collect();

    let ka = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .projection_expression("customer_id, full_name, email, phone_numbers, created_at, last_updated") // Fetch full customer
        .build()
        .map_err(|e| error_response(500, "Failed to build keys", &format!("{}", e), None))?;

    let batch_res = client.batch_get_item()
        .request_items("Customers", ka)
        .send()
        .await
        .map_err(|e| error_response(500, "Failed to batch get customers", &format!("{}", e), None))?;

    let responses = batch_res.responses.unwrap_or_default();
    let customer_items = responses.get("Customers").cloned().unwrap_or_default();

    let mut customer_map: HashMap<String, Customer> = HashMap::new();
    for item in customer_items {
        if let Ok(cust) = serde_dynamo::from_item::<_, Customer>(item) {
             customer_map.insert(cust.customer_id.clone(), cust);
        }
    }

    let tickets: Vec<Ticket> = tickets_nocust.into_iter().map(|details| {
        let customer = customer_map.get(&details.customer_id).cloned().unwrap_or_else(|| {
             // Fallback if customer missing
             Customer {
                 customer_id: details.customer_id.clone(),
                 full_name: "Unknown".to_string(),
                 email: "".to_string(),
                 phone_numbers: Vec::new(),
                 created_at: 0,
                 last_updated: 0,
             }
        });
        Ticket {
            details,
            customer,
        }
    }).collect();

    Ok(tickets)
}
