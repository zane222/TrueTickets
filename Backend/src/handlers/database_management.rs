use chrono::Utc;
use serde_json::json;
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client,
    types::{AttributeValue, Put, Delete, TransactWriteItem, ReturnValue, KeysAndAttributes, TransactGetItem, Get},
};
use std::collections::HashMap;
use crate::http::{error_response, success_response, success_response_hashmap, success_response_items};

// --------------------------
// TICKETS
// --------------------------

pub async fn handle_get_ticket_by_number(
    ticket_number: &str,
    client: &Client,
) -> Response<Body> {
    let res = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.to_string()))
        .send()
        .await;

    match res {
        Ok(output) => {
            if let Some(item) = output.item {
                success_response_hashmap(item)
            } else {
                error_response(404, "Ticket not found", "No ticket with that number", None)
            }
        }
        Err(e) => error_response(500, "DynamoDB error", &format!("{}", e), None),
    }
}

pub async fn handle_get_tickets_by_customer_id(customer_id: String, client: &Client) -> Response<Body> {
    // Query Tickets table directly (assuming CustomerIdIndex exists on Tickets)
    // We want original casing for subjects, which lives in Tickets.
    let res = client.query()
        .table_name("Tickets")
        .index_name("CustomerIdIndex")
        .key_condition_expression("customer_id = :cid")
        .expression_attribute_values(":cid", AttributeValue::S(customer_id))
        .send()
        .await;

    match res {
        Ok(output) => {
            let items = output.items.unwrap_or_default();
            success_response_items(items)
        }
        Err(e) => error_response(500, "Failed to get tickets for customer", &format!("{}", e), None),
    }
}

pub async fn handle_search_tickets_by_subject(
    query: &str,
    client: &Client,
) -> Response<Body> {
    // 1. Search TicketSubjects (lowercase)
    // 2. BatchGet Tickets
    use futures::TryStreamExt;
    
    let query_lower = query.to_lowercase();
    let words: Vec<&str> = query_lower.split_whitespace().collect();
    if words.is_empty() {
        return success_response_items(Vec::new());
    }

    let mut filter_exprs = Vec::new();
    let mut expr_vals = HashMap::new();
    expr_vals.insert(":pk".to_string(), AttributeValue::S("ALL".to_string()));

    for (i, word) in words.iter().enumerate() {
        let key = format!(":q{}", i);
        filter_exprs.push(format!("contains(subject, {})", key));
        expr_vals.insert(key, AttributeValue::S(word.to_string()));
    }

    let filter_expression = filter_exprs.join(" AND ");
    
    let mut ticket_numbers: Vec<String> = Vec::new();
    
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

    let mut paginator = query_builder
        .into_paginator()
        .items()
        .send();
    
    while let Some(item) = paginator.try_next().await.unwrap_or(None) {
        if let Some(tn) = item.get("ticket_number").and_then(|v| v.as_n().ok()) {
            ticket_numbers.push(tn.clone());
        }
        if ticket_numbers.len() >= 15 {
            break;
        }
    }
    
    if ticket_numbers.is_empty() {
         return success_response_items(Vec::new());
    }

    // 2. Batch Get full tickets
    let keys: Vec<HashMap<String, AttributeValue>> = ticket_numbers.iter()
        .map(|tn| {
            let mut key = HashMap::new();
            key.insert("ticket_number".to_string(), AttributeValue::N(tn.clone()));
            key
        })
        .collect();
    
    let ka = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .build()
        .unwrap(); // keys are valid

    let batch_res = client.batch_get_item()
        .request_items("Tickets", ka)
        .send()
        .await;
        
    match batch_res {
        Ok(output) => {
             let responses = output.responses.unwrap_or_default();
             let items = responses.get("Tickets").cloned().unwrap_or_default();
             // Important: BatchGetItem doesn't guarantee order. We should probably sort them by ticket_number desc if we want consistency with the search order, 
             // but the user requirement "then responding with the full tickets" doesn't strictly imply preserving the 1-15 order, allowing client to sort. 
             // However, for best UX, let's sort them.
             let mut sorted_items = items;
             sorted_items.sort_by(|a, b| {
                 let a_tn = a.get("ticket_number").and_then(|v| v.as_n().ok()).and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
                 let b_tn = b.get("ticket_number").and_then(|v| v.as_n().ok()).and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
                 b_tn.cmp(&a_tn)
             });
             
             success_response_items(sorted_items)
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
            success_response_items(items)
        }
        Err(e) => error_response(500, "Failed to get recent tickets", &format!("{}", e), None),
    }
}

pub async fn handle_create_ticket(
    customer_id: String,
    customer_full_name: String,
    primary_phone: String,
    subject: String,
    details: String,
    status: Option<String>,
    password: Option<String>,
    estimated_time: Option<String>,
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

    let ticket_number = match counter_res {
        Ok(output) => output.attributes.unwrap()["counter_value"]
            .as_n().unwrap().parse::<i64>().unwrap(),
        Err(e) => return error_response(500, "Failed to get ticket number", &format!("{}", e), None),
    };

    let now = Utc::now().timestamp().to_string();

    let mut txn_builder = client.transact_write_items();
    
    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(Put::builder()
                .table_name("Tickets")
                .item("ticket_number", AttributeValue::N(ticket_number.to_string()))
                .item("gsi_pk", AttributeValue::S("ALL".to_string())) // Added for TicketNumberIndex
                .item("subject", AttributeValue::S(subject.clone())) // Stored with original casing
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("customer_full_name", AttributeValue::S(customer_full_name.clone())) // Also useful to have here
                .item("primary_phone", AttributeValue::S(primary_phone.clone()))
                .item("status", AttributeValue::S(status.clone().unwrap_or("open".to_string())))
                .item("details", AttributeValue::S(details))
                .item("password", AttributeValue::S(password.unwrap_or_default()))
                .item("estimated_time", AttributeValue::S(estimated_time.unwrap_or_default()))
                .item("created_at", AttributeValue::N(now.clone()))
                .item("last_updated", AttributeValue::N(now.clone()))
                .build()
                .expect("Failed to build Put item for Tickets"))
            .build()
    );
    
    // TicketSubjects: Lowercase subject, standard fields for search
    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(Put::builder()
                .table_name("TicketSubjects")
                .item("ticket_number", AttributeValue::N(ticket_number.to_string()))
                .item("gsi_pk", AttributeValue::S("ALL".to_string()))
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("subject", AttributeValue::S(subject.to_lowercase())) // Lowercase for search
                .item("created_at", AttributeValue::N(now.clone()))
                .build()
                .expect("Failed to build Put item for TicketSubjects"))
            .build()
    );

    let txn_res = txn_builder.send().await;

    match txn_res {
        Ok(_) => success_response(200, json!({ "ticket_number": ticket_number }).to_string()),
        Err(e) => error_response(500, "Failed to create ticket", &format!("{}", e), None),
    }
}

pub async fn handle_update_ticket(
    ticket_number: String,
    customer_full_name: Option<String>,
    primary_phone: Option<String>,
    subject: Option<String>,
    details: Option<String>,
    status: Option<String>,
    password: Option<String>,
    estimated_time: Option<String>,
    client: &Client,
) -> Response<Body> {
    let mut txn_builder = client.transact_write_items();

    
    // 1. Prepare Update for TicketSubjects (subject only needs update here if changed)
    // We only store subject, ticket_number, gsi_pk, customer_id, created_at in TicketSubjects now. 
    // Wait, the search implementation relies on filtered search on TicketSubjects. 
    // Does it need other fields? "The system must support substring search via full table scans for ticket subjects only"
    // So TicketSubjects really only needs subject.
    if let Some(s) = &subject {
        let update_builder = aws_sdk_dynamodb::types::Update::builder()
            .table_name("TicketSubjects")
            .key("ticket_number", AttributeValue::N(ticket_number.clone()))
            .update_expression("SET subject = :s")
            .expression_attribute_values(":s", AttributeValue::S(s.to_lowercase())); // Lowercase
            
        let update = update_builder.build().expect("Failed to build Update for TicketSubjects");
        txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());
    }

    // 2. Prepare Update for Tickets (everything else + last_updated)
    // We ALWAYS update Tickets because last_updated must change on any edit
    // However if NO fields are strictly for Tickets, we still need to update last_updated? 
    // The requirement says "Tickets and customers must store last-updated timestamps that change on any modification."
    // If we only change subject, does that count as modifying the ticket? Yes.
    // So we should update last_updated in Tickets table even if only subject changed?
    // Or does TicketSubjects need its own last_updated? 
    // The user said "return whether the respective entity has changed... based on a last-updated timestamp".
    // Entities are "Tickets" and "Customers".
    // I will assume the main "Tickets" table holds the authoritative last_updated for the entity.
    
    let mut update_parts = Vec::new();
    let mut expr_vals = HashMap::new();

    if let Some(s) = subject {
        update_parts.push("subject = :s".to_string());
        expr_vals.insert(":s".to_string(), AttributeValue::S(s));
    }
    if let Some(cfn) = customer_full_name {
        update_parts.push("customer_full_name = :cfn".to_string());
        expr_vals.insert(":cfn".to_string(), AttributeValue::S(cfn));
    }
    if let Some(st) = status {
        update_parts.push("status = :st".to_string());
        expr_vals.insert(":st".to_string(), AttributeValue::S(st));
    }
    if let Some(pp) = primary_phone {
        update_parts.push("primary_phone = :pp".to_string());
        expr_vals.insert(":pp".to_string(), AttributeValue::S(pp));
    }
    if let Some(d) = details {
        update_parts.push("details = :d".to_string());
        expr_vals.insert(":d".to_string(), AttributeValue::S(d));
    }
    if let Some(pw) = password {
        update_parts.push("password = :pw".to_string());
        expr_vals.insert(":pw".to_string(), AttributeValue::S(pw));
    }
    if let Some(et) = estimated_time {
        update_parts.push("estimated_time = :et".to_string());
        expr_vals.insert(":et".to_string(), AttributeValue::S(et));
    }

    update_parts.push("last_updated = :lu");
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    let update_expr = format!("SET {}", update_parts.join(", "));

    let mut update_builder = aws_sdk_dynamodb::types::Update::builder()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression(update_expr);

    for (k, v) in expr_vals {
        update_builder = update_builder.expression_attribute_values(k, v);
    }

    let update = update_builder.build().expect("Failed to build Update for Tickets");
    txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());


    let res = txn_builder.send().await;

    match res {
        Ok(_) => success_response(200, json!({"ticket_number": ticket_number}).to_string()),
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
        Ok(_) => success_response(200, json!({"ticket_number": ticket_number}).to_string()),
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

    match res {
        Ok(output) => {
            let item = output.item.unwrap_or_default();
            success_response_hashmap(item)
        },
        Err(e) => error_response(500, "Failed to get ticket last_updated", &format!("{}", e), None),
    }
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
            output.items.unwrap_or_default()
                .iter()
                .filter_map(|item| {
                    item.get("customer_id")
                        .and_then(|v| v.as_s().ok())
                        .map(|s| s.to_string())
                })
                .collect()
        },
        Err(e) => return error_response(500, "Failed to query phone index", &format!("{}", e), None),
    };

    if customer_ids.is_empty() {
        return success_response(200, "[]".to_string());
    }

    // Batch get full customer details from Customers table ONLY
    // Customers table now has full_name with correct casing
    let keys: Vec<HashMap<String, AttributeValue>> = customer_ids.iter()
        .map(|id| {
            let mut key = HashMap::new();
            key.insert("customer_id".to_string(), AttributeValue::S(id.clone()));
            key
        })
        .collect();

    let ka_customers = match KeysAndAttributes::builder()
        .set_keys(Some(keys.clone()))
        // projection_expression is optional, if we want everything we can omit it. 
        // User asked for: "id, full_name, and primary_phone"
        .projection_expression("customer_id, full_name, primary_phone") 
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
            success_response_items(customers)
        }
        Err(e) => error_response(500, "Failed to get customer details", &format!("{}", e), None),
    }
}

pub async fn handle_get_customer_by_id(customer_id: String, client: &Client) -> Response<Body> {
    let res = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .send()
        .await;

    match res {
        Ok(output) => {
             if let Some(item) = output.item {
                success_response_hashmap(item)
            } else {
                error_response(404, "Customer not found", "No customer with that ID", None)
            }
        }
        Err(e) => error_response(500, "Failed to get customer", &format!("{}", e), None),
    }
}

pub async fn handle_search_customers_by_name(query: &str, client: &Client) -> Response<Body> {
    // 1. Search CustomerNames (lowercase)
    // 2. BatchGet Customers
    use futures::TryStreamExt;
    
    let query_lower = query.to_lowercase();
    
    let mut customer_ids: Vec<String> = Vec::new();
    
    let mut paginator = client.scan()
        .table_name("CustomerNames")
        .filter_expression("contains(full_name, :q)")
        .expression_attribute_values(":q", AttributeValue::S(query_lower))
        .into_paginator()
        .items()
        .send();
    
    while let Some(item) = paginator.try_next().await.unwrap_or(None) {
        if let Some(id) = item.get("customer_id").and_then(|v| v.as_s().ok()) {
             customer_ids.push(id.clone());
        }
        if customer_ids.len() >= 15 {
            break;
        }
    }
    
    if customer_ids.is_empty() {
        return success_response_items(Vec::new());
    }
    
    // 2. Batch Get full customers
    let keys: Vec<HashMap<String, AttributeValue>> = customer_ids.iter()
        .map(|id| {
            let mut key = HashMap::new();
            key.insert("customer_id".to_string(), AttributeValue::S(id.clone()));
            key
        })
        .collect();
        
    let ka = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .build()
        .unwrap();

    let batch_res = client.batch_get_item()
        .request_items("Customers", ka)
        .send()
        .await;

    match batch_res {
        Ok(output) => {
            let responses = output.responses.unwrap_or_default();
            let items = responses.get("Customers").cloned().unwrap_or_default();
            success_response_items(items)
        }
        Err(e) => error_response(500, "Failed to get customer details", &format!("{}", e), None),
    }
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
    
    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(Put::builder()
                .table_name("Customers")
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("full_name", AttributeValue::S(full_name.clone())) // Stored with original casing
                .item("email", AttributeValue::S(email.clone()))
                .item("primary_phone", AttributeValue::S(phone_numbers[0].clone()))
                .item("phone_numbers", AttributeValue::L(phone_numbers.iter().map(|p| AttributeValue::S(p.clone())).collect()))
                .item("created_at", AttributeValue::N(now.clone()))
                .item("last_updated", AttributeValue::N(now.clone()))
                .build()
                .expect("Failed to build Put item for Customers"))
            .build()
    );

    txn_builder = txn_builder.transact_items(
        TransactWriteItem::builder()
            .put(Put::builder()
                .table_name("CustomerNames")
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("full_name", AttributeValue::S(full_name.to_lowercase())) // Lowercase for search
                .build()
                .expect("Failed to build Put item for CustomerNames"))
            .build()
    );

    for phone in &phone_numbers {
        let phone_put = Put::builder()
            .table_name("CustomerPhoneIndex")
            .item("phone_number", AttributeValue::S(phone.clone()))
            .item("customer_id", AttributeValue::S(customer_id.clone()))
            .build()
            .expect("Failed to build Put item for CustomerPhoneIndex");
        txn_builder = txn_builder.transact_items(TransactWriteItem::builder().put(phone_put).build());
    }

    let txn_res = txn_builder.send().await;

    match txn_res {
        Ok(_) => success_response(200, json!({ "customer_id": customer_id }).to_string()),
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
                output.item
                    .and_then(|item| item.get("phone_numbers").cloned())
                    .and_then(|v| v.as_l().ok().cloned())
                    .map(|list| {
                        list.iter()
                            .filter_map(|av| av.as_s().ok().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default()
            },
            Err(e) => return error_response(500, "Failed to get current customer", &format!("{}", e), None),
        };

        // Delete old phone index entries
        for phone in &old_phones {
            let delete = Delete::builder()
                .table_name("CustomerPhoneIndex")
                .key("phone_number", AttributeValue::S(phone.clone()))
                .key("customer_id", AttributeValue::S(customer_id.clone()))
                .build()
                .expect("Failed to build Delete item for CustomerPhoneIndex");
            txn_builder = txn_builder.transact_items(TransactWriteItem::builder().delete(delete).build());
        }

        // Add new phone index entries
        for phone in new_phones {
            let put = Put::builder()
                .table_name("CustomerPhoneIndex")
                .item("phone_number", AttributeValue::S(phone.clone()))
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .build()
                .expect("Failed to build Put item for CustomerPhoneIndex");
            txn_builder = txn_builder.transact_items(TransactWriteItem::builder().put(put).build());
        }
    }

    // 2. Update CustomerNames (if full_name changed)
    if let Some(fn_val) = full_name {
        let update = aws_sdk_dynamodb::types::Update::builder()
            .table_name("CustomerNames")
            .key("customer_id", AttributeValue::S(customer_id.clone()))
            .update_expression("SET full_name = :fn")
            .expression_attribute_values(":fn", AttributeValue::S(fn_val.to_lowercase())) // Lowercase for search
            .build()
            .expect("Failed to build Update for CustomerNames");
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
        update_parts.push("primary_phone = :pp".to_string());
        expr_vals.insert(":phones".to_string(), AttributeValue::L(new_phones.iter().map(|p| AttributeValue::S(p.clone())).collect()));
        expr_vals.insert(":pp".to_string(), AttributeValue::S(new_phones[0].clone()));
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

    let update = update_builder.build().expect("Failed to build Update for Customers");
    txn_builder = txn_builder.transact_items(TransactWriteItem::builder().update(update).build());

    // Execute Transaction
    let txn_res = txn_builder.send().await;

    match txn_res {
        Ok(_) => success_response(200, json!({ "customer_id": customer_id }).to_string()),
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

    match res {
        Ok(output) => {
            let item = output.item.unwrap_or_default();
            success_response_hashmap(item)
        },
        Err(e) => error_response(500, "Failed to get customer last_updated", &format!("{}", e), None),
    }
}
