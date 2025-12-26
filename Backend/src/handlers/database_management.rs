use chrono::Utc;
use serde_json::{json, Value};
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client,
    types::{AttributeValue, Put, Delete, TransactWriteItem, ReturnValue, KeysAndAttributes},
};
use std::collections::{HashMap, HashSet};
use crate::http::{error_response, generate_short_id};
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
// --------------------------
// TICKETS
// --------------------------

pub async fn handle_get_ticket_by_number(
    ticket_number: &str,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Get Ticket
    let output = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get ticket: {}", e), None))?;

    let ticket_item = output.item
        .ok_or_else(|| error_response(404, "Ticket Not Found", "No ticket with that number", None))?;

    let ticket_nocust: TicketWithoutCustomer = serde_dynamo::from_item(ticket_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {}", e), None))?;

    // 2. Get Customer
    let cust_output = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(ticket_nocust.customer_id.clone()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {}", e), None))?;

    let customer_item = cust_output.item
        .ok_or_else(|| error_response(404, "Customer Not Found", "Ticket exists but linked customer is missing", None))?;

    let customer: Customer = serde_dynamo::from_item(customer_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {}", e), None))?;

    // 3. Compose response
    let full_ticket = Ticket {
        details: ticket_nocust,
        customer,
    };

    serde_json::to_value(&full_ticket)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize ticket: {}", e), None))
}

pub async fn handle_get_tickets_by_customer_id(customer_id: String, client: &Client) -> Result<Value, Response<Body>> {
    // Fetch Customer details first so they can be attached to each ticket
    let customer_output = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {}", e), None))?;

    let customer_item = customer_output.item
        .ok_or_else(|| error_response(404, "Customer Not Found", "No customer with that ID", None))?;

    let customer: Customer = serde_dynamo::from_item(customer_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {}", e), None))?;

    // Query Tickets by customer id
    let output = client.query()
        .table_name("Tickets")
        .index_name("CustomerIdIndex")
        .key_condition_expression("customer_id = :cid")
        .expression_attribute_values(":cid", AttributeValue::S(customer_id))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query tickets for customer: {}", e), None))?;

    let tickets_nocust: Vec<TicketWithoutCustomer> = serde_dynamo::from_items(output.items.unwrap_or_else(Vec::new))
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets: {}", e), None))?;

    let tickets: Vec<Ticket> = tickets_nocust.into_iter().map(|details| Ticket {
        details,
        customer: customer.clone(),
    }).collect();

    serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize tickets: {}", e), None))
}

pub async fn handle_search_tickets_by_subject(
    query: &str,
    client: &Client,
) -> Result<Value, Response<Body>> {
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
        return Ok(json!([]));
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

    // collect the ticket numbers into a Vec
    let mut ticket_numbers: Vec<String> = Vec::new();
    loop {
        if ticket_numbers.len() >= 15 {
            break;
        }
        let page = paginator.try_next().await
            .map_err(|e| error_response(500, "Pagination Error", &format!("Failed to get next page of ticket subjects: {}", e), None))?;

        match page {
            Some(item) => {
                let tn: TicketNumberOnly = serde_dynamo::from_item(item)
                    .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket subject search result: {}", e), None))?;
                ticket_numbers.push(tn.ticket_number);
            },
            None => break,
        }
    }

    if ticket_numbers.is_empty() {
        return Ok(json!([]));
    }

    // Batch Get full tickets from ticket numbers
    let keys: Vec<HashMap<String, AttributeValue>> = ticket_numbers.into_iter()
        .map(|tn| {
            let mut key = HashMap::new();
            key.insert("ticket_number".to_string(), AttributeValue::N(tn));
            key
        })
        .collect();

    let ka = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for tickets: {}", e), None))?;

    let output = client.batch_get_item()
        .request_items("Tickets", ka)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to batch get ticket details: {}", e), None))?;

    if let Some(unprocessed) = output.unprocessed_keys && !unprocessed.is_empty() {
        return Err(error_response(503, "Partial Batch Success", "Some ticket details could not be retrieved due to DynamoDB throughput limits. Please retry.", Some("Retry the search")));
    }

    let responses = output.responses.unwrap_or_else(HashMap::new);
    let ticket_items = responses.get("Tickets").cloned().unwrap_or_else(Vec::new);
    let mut tickets_nocust: Vec<TicketWithoutCustomer> = serde_dynamo::from_items(ticket_items)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets from batch result: {}", e), None))?;

    // BatchGetItem doesn't guarantee order results in the same order as the requests so sorting is needed
    tickets_nocust.sort_by_key(|ticket| ticket.ticket_number);

    let tickets = batch_fetch_and_merge_customers(tickets_nocust, client).await?;

    serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize search results: {}", e), None))
}

pub async fn handle_get_recent_tickets(client: &Client) -> Result<Value, Response<Body>> {
    // Query "Tickets" table directly using GSI "TicketNumberIndex" (pk="ALL")
    // Tickets now has gsi_pk = "ALL"

    let output = client.query()
        .table_name("Tickets")
        .index_name("TicketNumberIndex")
        .key_condition_expression("gsi_pk = :pk")
        .expression_attribute_values(":pk", AttributeValue::S("ALL".to_string()))
        .scan_index_forward(false)
        .limit(30)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query recent tickets: {}", e), None))?;

    let tickets_nocust: Vec<TicketWithoutCustomer> = serde_dynamo::from_items(output.items.unwrap_or_else(Vec::new))
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets: {}", e), None))?;

    let tickets = batch_fetch_and_merge_customers(tickets_nocust, client).await?;

    serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize recent tickets: {}", e), None))
}

pub async fn handle_create_ticket(
    customer_id: String,
    subject: String,
    password: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // Atomically get next ticket number
    let counter_output = client.update_item()
        .table_name("Counters")
        .key("counter_name", AttributeValue::S("ticket_number".to_string()))
        .update_expression("SET counter_value = if_not_exists(counter_value, :zero) + :inc")
        .expression_attribute_values(":inc", AttributeValue::N("1".to_string()))
        .expression_attribute_values(":zero", AttributeValue::N("0".to_string()))
        .return_values(ReturnValue::UpdatedNew)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to increment ticket number: {}", e), None))?;

    let attrs = counter_output.attributes
        .ok_or_else(|| error_response(500, "Data Error", "Counter update returned no attributes", None))?;

    let CounterValue { counter_value: ticket_number } = serde_dynamo::from_item(attrs)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket number: {}", e), None))?;

    let now = Utc::now().timestamp().to_string();

    let mut txn_builder = client.transact_write_items();

    let put_ticket = Put::builder()
        .table_name("Tickets")
        .item("ticket_number", AttributeValue::N(ticket_number.clone()))
        .item("gsi_pk", AttributeValue::S("ALL".to_string())) // Added for TicketNumberIndex
        .item("subject", AttributeValue::S(subject.clone())) // Stored with original casing
        .item("customer_id", AttributeValue::S(customer_id.clone()))
        .item("status", AttributeValue::S("Diagnosing".to_string()))
        .item("password", AttributeValue::S(password.clone()))
        .item("created_at", AttributeValue::N(now.clone()))
        .item("last_updated", AttributeValue::N(now.clone()))
        .build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build ticket Put item: {}", e), None))?;

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_ticket)
            .build()
    );

    // TicketSubjects: Lowercase subject, standard fields for search
    let put_subject = Put::builder()
        .table_name("TicketSubjects")
        .item("ticket_number", AttributeValue::N(ticket_number.clone()))
        .item("gsi_pk", AttributeValue::S("ALL".to_string()))
        .item("subject_lc", AttributeValue::S(subject.to_lowercase())) // Lowercase for search
        .build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build ticket subject Put item: {}", e), None))?;

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_subject)
            .build()
    );

    txn_builder.send().await
        .map_err(|e| error_response(500, "Transaction Error", &format!("Failed to execute create ticket transaction: {}", e), None))?;

    Ok(json!({ "ticket_number": ticket_number }))
}

pub async fn handle_update_ticket(
    ticket_number: String,
    subject: Option<String>,
    status: Option<String>,
    password: Option<String>,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let mut txn_builder = client.transact_write_items();

    if let Some(s) = &subject {
        let update = aws_sdk_dynamodb::types::Update::builder()
            .table_name("TicketSubjects")
            .key("ticket_number", AttributeValue::N(ticket_number.clone()))
            .update_expression("SET subject_lc = :s")
            .expression_attribute_values(":s", AttributeValue::S(s.to_lowercase())) // Lowercase
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build update for ticket subjects: {}", e), None))?;

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

    let update = update_builder.build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build update for ticket: {}", e), None))?;

    txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());

    txn_builder.send().await
        .map_err(|e| error_response(500, "Transaction Error", &format!("Failed to execute update ticket transaction: {}", e), None))?;

    Ok(json!({"ticket_number": ticket_number}))
}

pub async fn handle_add_ticket_comment(
    ticket_number: String,
    comment_body: String,
    tech_name: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let comment = AttributeValue::M(
        vec![
            ("comment_body".to_string(), AttributeValue::S(comment_body)),
            ("tech_name".to_string(), AttributeValue::S(tech_name)),
            ("created_at".to_string(), AttributeValue::N(Utc::now().timestamp().to_string())),
        ]
        .into_iter().collect()
    );

    client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET comments = list_append(if_not_exists(comments, :empty), :c), last_updated = :lu")
        .expression_attribute_values(":c", AttributeValue::L(vec![comment]))
        .expression_attribute_values(":empty", AttributeValue::L(vec![]))
        .expression_attribute_values(":lu", AttributeValue::N(Utc::now().timestamp().to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to add comment to ticket {}: {}", ticket_number, e), None))?;

    Ok(json!({"ticket_number": ticket_number}))
}

pub async fn handle_get_ticket_last_updated(ticket_number: String, client: &Client) -> Result<Value, Response<Body>> {
    let output = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .projection_expression("last_updated")
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get ticket last_updated: {}", e), None))?;

    let item = output.item
        .ok_or_else(|| error_response(404, "Ticket Not Found", "No ticket with that number", None))?;

    let lu: TicketLastUpdated = serde_dynamo::from_item(item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket last_updated: {}", e), None))?;

    Ok(json!({ "last_updated": lu.last_updated }))
}

// --------------------------
// CUSTOMERS
// --------------------------

pub async fn handle_get_customers_by_phone(phone_number: String, client: &Client) -> Result<Value, Response<Body>> {
    // First query the phone index to get customer IDs
    let index_output = client.query()
        .table_name("CustomerPhoneIndex")
        .key_condition_expression("phone_number = :p")
        .expression_attribute_values(":p", AttributeValue::S(phone_number))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query phone index: {}", e), None))?;

    let items = index_output.items.unwrap_or_else(Vec::new);
    let mut customer_ids = Vec::new();
    for item in items {
        let cid: CustomerIdOnly = serde_dynamo::from_item(item)
            .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize phone number index entry: {}", e), None))?;
        customer_ids.push(cid.customer_id);
    }

    // Batch get full customer details from Customers table
    if customer_ids.is_empty() {
        return Ok(json!([]));
    }

    let keys: Vec<HashMap<String, AttributeValue>> = customer_ids.into_iter()
        .map(|id| {
            let mut key = HashMap::new();
            key.insert("customer_id".to_string(), AttributeValue::S(id));
            key
        })
        .collect();

    let ka_customers = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .projection_expression("customer_id, full_name, phone_numbers")
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for customers: {}", e), None))?;

    let batch_output = client.batch_get_item()
        .request_items("Customers", ka_customers)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to batch get customer details: {}", e), None))?;

    if let Some(unprocessed) = &batch_output.unprocessed_keys && !unprocessed.is_empty() {
        return Err(error_response(530, "Partial Batch Success", "Some customer details could not be retrieved due to DynamoDB throughput limits. Please retry.", Some("Retry the request")));
    }

    let responses = batch_output.responses.unwrap_or_else(HashMap::new);
    let customers = responses.get("Customers").cloned().unwrap_or_else(Vec::new);
    let json_items: Vec<Value> = serde_dynamo::from_items(customers)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer details: {}", e), None))?;
    Ok(Value::Array(json_items))
}

pub async fn handle_get_customer_by_id(customer_id: String, client: &Client) -> Result<Value, Response<Body>> {
    let output = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {}", e), None))?;

    let item = output.item
        .ok_or_else(|| error_response(404, "Customer Not Found", "No customer with that ID", None))?;

    let customer: Customer = serde_dynamo::from_item(item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {}", e), None))?;

    serde_json::to_value(&customer)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize customer: {}", e), None))
}

pub async fn handle_search_customers_by_name(query: &str, client: &Client) -> Result<Value, Response<Body>> {
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
        let item_opt = paginator.try_next().await
            .map_err(|e| error_response(500, "Pagination Error", &format!("Failed to scan customer names: {}", e), None))?;

        if let Some(item) = item_opt {
             let cid: CustomerIdOnly = serde_dynamo::from_item(item)
                 .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer search result: {}", e), None))?;
             customer_ids.push(cid.customer_id);
        } else {
            break;
        }
    }

    if customer_ids.is_empty() {
        return Ok(json!([]));
    }

    // Batch Get full customers
    let keys: Vec<HashMap<String, AttributeValue>> = customer_ids.into_iter()
        .map(|id| {
            let mut key = HashMap::new();
            key.insert("customer_id".to_string(), AttributeValue::S(id));
            key
        })
        .collect();

    let ka = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for customers: {}", e), None))?;

    let batch_output = client.batch_get_item()
        .request_items("Customers", ka)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to batch get customer details: {}", e), None))?;

    if let Some(unprocessed) = &batch_output.unprocessed_keys && !unprocessed.is_empty() {
        return Err(error_response(503, "Partial Batch Success", "Some customer details could not be retrieved due to DynamoDB throughput limits. Please retry.", Some("Retry the search")));
    }

    let responses = batch_output.responses.unwrap_or_else(HashMap::new);
    let items = responses.get("Customers").cloned().unwrap_or_else(Vec::new);
    let json_items: Vec<Value> = serde_dynamo::from_items(items)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer details: {}", e), None))?;

    Ok(Value::Array(json_items))
}

pub async fn handle_create_customer(
    full_name: String,
    email: String,
    phone_numbers: Vec<PhoneNumber>,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let customer_id = generate_short_id(10);
    let now = Utc::now().timestamp().to_string();

    let mut txn_builder = client.transact_write_items();

    let put_customer = Put::builder()
        .table_name("Customers")
        .condition_expression("attribute_not_exists(customer_id)")
        .item("customer_id", AttributeValue::S(customer_id.clone()))
        .item("full_name", AttributeValue::S(full_name.clone())) // Stored with original casing
        .item("email", AttributeValue::S(email.clone()))
        .item("phone_numbers", AttributeValue::L(
            phone_numbers.iter().map(|p| {
                AttributeValue::M(
                    vec![
                        ("number".to_string(), AttributeValue::S(p.number.clone())),
                        ("prefers_texting".to_string(), AttributeValue::Bool(p.prefers_texting)),
                        ("no_english".to_string(), AttributeValue::Bool(p.no_english)),
                    ].into_iter().collect()
                )
            }).collect()
        ))
        .item("created_at", AttributeValue::N(now.clone()))
        .item("last_updated", AttributeValue::N(now.clone()))
        .build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer Put item: {}", e), None))?;

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_customer)
            .build()
    );

    let put_name = Put::builder()
        .table_name("CustomerNames")
        .item("customer_id", AttributeValue::S(customer_id.clone()))
        .item("full_name_lc", AttributeValue::S(full_name.to_lowercase())) // Lowercase for search
        .build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer name Put item: {}", e), None))?;

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(put_name)
            .build()
    );

    for phone in &phone_numbers {
        let phone_put = Put::builder()
            .table_name("CustomerPhoneIndex")
            .item("phone_number", AttributeValue::S(phone.number.clone()))
            .item("customer_id", AttributeValue::S(customer_id.clone()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer phone Put item for {}: {}", phone.number, e), None))?;
        txn_builder = txn_builder.transact_items(TransactWriteItem::builder().put(phone_put).build());
    }

    txn_builder.send().await
        .map_err(|e| {
            if let Some(service_err) = e.as_service_error() && service_err.is_transaction_canceled_exception() {
                return error_response(409, "Conflict", "Customer ID collision detected. This is extremely rare, but please try again.", None);
            }
            error_response(500, "Transaction Error", &format!("Failed to execute create customer transaction: {}", e), None)
        })?;

    Ok(json!({ "customer_id": customer_id }))
}

pub async fn handle_update_customer(
    customer_id: String,
    full_name: Option<String>,
    email: Option<String>,
    phone_numbers: Option<Vec<PhoneNumber>>,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let mut txn_builder = client.transact_write_items();

    // 1. Handle Phone Changes (Index management)
    if let Some(ref new_phones) = phone_numbers {
        // First, get the current customer to find old phone numbers
        let current_output = client.get_item()
            .table_name("Customers")
            .key("customer_id", AttributeValue::S(customer_id.clone()))
            .projection_expression("phone_numbers")
            .send()
            .await
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get current customer to update phones: {}", e), None))?;

        let old_phones: Vec<String> = if let Some(item) = current_output.item {
            let res: CustomerPhonesOnly = serde_dynamo::from_item(item)
                .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to parse current phone numbers: {}", e), None))?;
            res.phone_numbers.into_iter().map(|p| p.number).collect()
        } else {
            Vec::new()
        };

        // Delete old phone index entries
        for phone in &old_phones {
            let delete = Delete::builder()
                .table_name("CustomerPhoneIndex")
                .key("phone_number", AttributeValue::S(phone.clone()))
                .key("customer_id", AttributeValue::S(customer_id.clone()))
                .build()
                .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build delete item for phone {}: {}", phone, e), None))?;
            txn_builder = txn_builder.transact_items(TransactWriteItem::builder().delete(delete).build());
        }

        // Add new phone index entries
        for phone in new_phones {
            let put = Put::builder()
                .table_name("CustomerPhoneIndex")
                .item("phone_number", AttributeValue::S(phone.number.clone()))
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .build()
                .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build Put item for phone {}: {}", phone.number, e), None))?;
            txn_builder = txn_builder.transact_items(TransactWriteItem::builder().put(put).build());
        }
    }

    // 2. Update CustomerNames (if full_name changed)
    if let Some(fn_val) = &full_name {
        let update = aws_sdk_dynamodb::types::Update::builder()
            .table_name("CustomerNames")
            .key("customer_id", AttributeValue::S(customer_id.clone()))
            .update_expression("SET full_name_lc = :fn")
            .expression_attribute_values(":fn", AttributeValue::S(fn_val.to_lowercase())) // Lowercase for search
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build update for customer names: {}", e), None))?;
        txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());
    }

    // 3. Update Customers (email, phones, last_updated)
    // We ALWAYS update Customers for last_updated
    let mut update_parts = vec![
        "last_updated = :lu".to_string(),
    ];
    let mut expr_vals = HashMap::new();
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    if let Some(new_phones) = &phone_numbers {
        update_parts.push("phone_numbers = :phones".to_string());
        expr_vals.insert(":phones".to_string(), AttributeValue::L(
            new_phones.iter().map(|p| {
                AttributeValue::M(
                    vec![
                        ("number".to_string(), AttributeValue::S(p.number.clone())),
                        ("prefers_texting".to_string(), AttributeValue::Bool(p.prefers_texting)),
                        ("no_english".to_string(), AttributeValue::Bool(p.no_english)),
                    ].into_iter().collect()
                )
            }).collect()
        ));
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

    let update = update_builder.build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build update for customer: {}", e), None))?;
    txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());

    // Execute Transaction
    txn_builder.send().await
        .map_err(|e| error_response(500, "Transaction Error", &format!("Failed to execute update customer transaction: {}", e), None))?;

    Ok(json!({ "customer_id": customer_id }))
}

pub async fn handle_get_customer_last_updated(customer_id: String, client: &Client) -> Result<Value, Response<Body>> {
    let item = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id))
        .projection_expression("last_updated")
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {}", e), None))?
        .item
        .ok_or_else(|| error_response(404, "Customer Not Found", "No customer with that ID", None))?;

    let lu: TicketLastUpdated = serde_dynamo::from_item(item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer last_updated: {}", e), None))?;

    Ok(json!({ "last_updated": lu.last_updated }))
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
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for customers: {}", e), None))?;

    let batch_output = client.batch_get_item()
        .request_items("Customers", ka)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to batch get customers: {}", e), None))?;

    if let Some(unprocessed) = batch_output.unprocessed_keys && !unprocessed.is_empty() {
        return Err(error_response(503, "Partial Batch Success", "Some customer details could not be retrieved due to DynamoDB throughput limits. Merge failed.", Some("Check throughput and retry")));
    }

    let responses = batch_output.responses.unwrap_or_else(HashMap::new);
    let customer_items = responses.get("Customers").cloned().unwrap_or_else(Vec::new);

    let customers_vec: Vec<Customer> = serde_dynamo::from_items(customer_items)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customers in batch: {}", e), None))?;

    let customer_map: HashMap<String, Customer> = customers_vec.into_iter()
        .map(|c| (c.customer_id.clone(), c))
        .collect();

    let mut tickets = Vec::new();
    for details in tickets_nocust {
        let customer = customer_map.get(&details.customer_id).cloned();
        match customer {
            Some(c) => {
                tickets.push(Ticket {
                    details,
                    customer: c,
                });
            }
            None => {
                return Err(error_response(500, "Data Integrity Error", &format!("Ticket {} refers to missing customer_id {}", details.ticket_number, details.customer_id), None));
            }
        }
    }

    Ok(tickets)
}
