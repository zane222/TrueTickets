use chrono::Utc;
use serde_json::{json, Value};
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client,
    types::{AttributeValue, Put, TransactWriteItem, KeysAndAttributes},
};
use std::collections::{HashMap, HashSet};
use crate::http::error_response;
use crate::models::{
    TicketWithoutCustomer, Ticket, Customer, CounterValue,
    TicketNumberOnly, TinyTicket, TinyTicketWithoutCustomer, UpdateTicketRequest
};
use crate::db_utils::DynamoDbBuilderExt;

pub async fn handle_get_ticket_by_number(
    ticket_number: &str,
    searching: bool,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Get Ticket
    let output = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get ticket '{:?}', probably there's no ticket under that number: {:?}", ticket_number, e), None))?;

    let ticket_item = match output.item {
        Some(item) => item,
        None => {
            if searching {
                return Ok(json!({ "ticket": null }));
            } else {
                return Err(error_response(404, "Ticket Not Found", "No ticket with that number", None));
            }
        }
    };

    let ticket_nocust: TicketWithoutCustomer = serde_dynamo::from_item(ticket_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {:?}", e), None))?;

    // 2. Get Customer
    let cust_output = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(ticket_nocust.customer_id.clone()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {:?}", e), None))?;

    let customer_item = cust_output.item
        .ok_or_else(|| error_response(404, "Customer Not Found", "Ticket exists but linked customer is missing", None))?;

    let customer: Customer = serde_dynamo::from_item(customer_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {:?}", e), None))?;

    // 3. Compose response
    if searching {
        let tiny_details = TinyTicketWithoutCustomer {
            ticket_number: ticket_nocust.ticket_number,
            subject: ticket_nocust.subject,
            customer_id: ticket_nocust.customer_id,
            status: ticket_nocust.status,
            device: ticket_nocust.device,
            created_at: ticket_nocust.created_at,
        };

        let tiny_ticket = TinyTicket {
            details: tiny_details,
            customer_name: customer.full_name,
        };

        let val = serde_json::to_value(&tiny_ticket)
            .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize tiny ticket: {:?}", e), None))?;
        
        Ok(json!({ "ticket": val }))
    } else {
        let full_ticket = Ticket {
            details: ticket_nocust,
            customer,
        };

        let val = serde_json::to_value(&full_ticket)
            .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize ticket: {:?}", e), None))?;

        Ok(val)
    }
}

pub async fn handle_get_tickets_by_customer_id(customer_id: String, client: &Client) -> Result<Value, Response<Body>> {
    // Query Tickets by customer id
    let output = client.query()
        .table_name("Tickets")
        .index_name("CustomerIdIndex")
        .key_condition_expression("customer_id = :cid")
        .expression_attribute_values(":cid", AttributeValue::S(customer_id))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query tickets for customer: {:?}", e), None))?;

    let tickets_nocust: Vec<TicketWithoutCustomer> = serde_dynamo::from_items(output.items.unwrap_or_else(Vec::new))
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets: {:?}", e), None))?;

    serde_json::to_value(&tickets_nocust)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize tickets: {:?}", e), None))
}

pub async fn handle_search_tickets_by_subject(
    query: &str,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // get all ticket numbers that match the query, the GSI only has the ticket number.
    // we have to do a batch get to get the customer_id from the ticket by the ticket number, 
    // then again to get the customer name from the customer by the customer_id

    // 1. Build the query and get the resulting ticket numbers
    let mut filter_exprs = Vec::new();
    let mut expr_vals = HashMap::new();
    expr_vals.insert(":pk".to_string(), AttributeValue::S("ALL".to_string()));

    for (i, word) in query.split_whitespace().map(|q| q.to_lowercase()).enumerate() {
        let key = format!(":q{}", i);
        filter_exprs.push(format!("contains(subject_lower, {})", key));
        expr_vals.insert(key, AttributeValue::S(word));
    }

    if filter_exprs.is_empty() { return Ok(json!([])); }

    let filter_expression = filter_exprs.join(" AND ");

    let mut base_query_builder = client.query()
        .table_name("Tickets")
        .index_name("TicketSearchIndex")
        .key_condition_expression("gsi_pk = :pk")
        .filter_expression(filter_expression)
        .scan_index_forward(false)
        .projection_expression("ticket_number");

    for (k, v) in expr_vals {
        base_query_builder = base_query_builder.expression_attribute_values(k, v);
    }

    let mut ticket_numbers: Vec<String> = Vec::with_capacity(15);
    let mut last_evaluated_key = None;

    loop {
        let mut query_builder = base_query_builder.clone();
        if let Some(key) = last_evaluated_key {
            query_builder = query_builder.set_exclusive_start_key(Some(key));
        }

        let output = query_builder.send().await
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query ticket subjects: {:?}", e), None))?;

        if let Some(items) = output.items {
            for item in items {
                let tn: TicketNumberOnly = serde_dynamo::from_item(item)
                    .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket subject search result: {:?}", e), None))?;
                ticket_numbers.push(tn.ticket_number.to_string());
                if ticket_numbers.len() >= 15 { break; }
            }
        }

        last_evaluated_key = output.last_evaluated_key;
        if last_evaluated_key.is_none() || ticket_numbers.len() >= 15 {
            break;
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
        .projection_expression("ticket_number, subject, customer_id, #st, device, created_at")
        .expression_attribute_names("#st", "status")
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for tickets: {:?}", e), None))?;



    let mut request_items = HashMap::new();
    request_items.insert("Tickets".to_string(), ka);

    let output = crate::db_utils::execute_batch_get_with_retries(client, request_items).await?;

    let ticket_items = output.get("Tickets").cloned().unwrap_or_else(Vec::new);
    let mut tickets_nocust: Vec<TinyTicketWithoutCustomer> = serde_dynamo::from_items(ticket_items)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets from batch result: {:?}", e), None))?;

    // BatchGetItem doesn't guarantee order results in the same order as the requests so sorting is needed
    tickets_nocust.sort_by_key(|ticket| ticket.ticket_number);

    let tickets = merge_customers_into_tiny_tickets(tickets_nocust, client).await?;

    serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize search results: {:?}", e), None))
}

pub async fn handle_get_recent_tickets(client: &Client) -> Result<Value, Response<Body>> {
    let output = client.query()
        .table_name("Tickets")
        .index_name("TicketNumberIndex")
        .key_condition_expression("gsi_pk = :pk")
        .expression_attribute_values(":pk", AttributeValue::S("ALL".to_string()))
        .scan_index_forward(false)
        .limit(30)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query recent tickets: {:?}", e), None))?;

    let tickets_nocust: Vec<TinyTicketWithoutCustomer> = serde_dynamo::from_items(output.items.unwrap_or_else(Vec::new))
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets: {:?}", e), None))?;

    let tickets = merge_customers_into_tiny_tickets(tickets_nocust, client).await?;

    serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize recent tickets: {:?}", e), None))
}

pub async fn handle_get_recent_tickets_filtered(
    device: String,
    statuses: Vec<String>,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let mut tasks = Vec::new();

    for status in statuses {
        let status_device = format!("{}#{}", status, device);
        // We need to clone client for each async move, usually client is cheap to clone (Arc internal)
        let client_clone = client.clone();

        let task = tokio::spawn(async move {
            client_clone.query()
                .table_name("Tickets")
                .index_name("StatusDeviceIndex")
                .key_condition_expression("status_device = :sd")
                .expression_attribute_values(":sd", AttributeValue::S(status_device))
                .scan_index_forward(false) // Newest first
                .limit(20)
                .send()
                .await
        });
        tasks.push(task);
    }

    let mut all_tickets_nocust = Vec::new();

    for task in tasks {
        let items = task
            .await
            .map_err(|e| error_response(500, "Concurrency Error", &format!("Task join error: {:?}", e), None))?
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query tickets by status/device: {:?}", e), None))?
            .items.unwrap_or_else(Vec::new);

        if items.is_empty() { continue; }

        let parsed: Vec<TinyTicketWithoutCustomer> = serde_dynamo::from_items(items)
            .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to parse filtered tickets: {:?}", e), None))?;

        all_tickets_nocust.extend(parsed);
    }

    // Sort merge results by ticket_number descending and take top 20
    all_tickets_nocust.sort_by(|a, b| b.ticket_number.cmp(&a.ticket_number));
    all_tickets_nocust.truncate(20);

    let tickets = merge_customers_into_tiny_tickets(all_tickets_nocust, client).await?;

    serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize filtered recent tickets: {:?}", e), None))
}

pub async fn handle_create_ticket(
    customer_id: String,
    subject: String,
    password: Option<String>,
    items_left: Option<Vec<String>>,
    device: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let mut retry_count = 0;
    const MAX_RETRIES: u32 = 5;

    loop {
        // 1. Get current counter value
        let counter_get = client.get_item()
            .table_name("Config")
            .key("pk", AttributeValue::S("ticket_number_counter".to_string()))
            .consistent_read(true)
            .send()
            .await
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to read ticket counter: {:?}", e), None))?;

        let current_val: i64 = match counter_get.item {
            Some(item) => {
                let cv: CounterValue = serde_dynamo::from_item(item)
                    .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to parse ticket counter: {:?}", e), None))?;
                cv.counter_value
            }
            None => return Err(error_response(500, "Data Integrity Error", "Ticket counter not found in database. Please initialize the counter.", None)),
        };

        let next_val = current_val + 1;
        let ticket_number = next_val.to_string();
        let now = Utc::now().timestamp().to_string();
        let status = "Diagnosing".to_string();
        let status_device = format!("{}#{}", status, device);

        // 2. Transact: Atomic increment (if matches current) + Puts
        let update_counter = aws_sdk_dynamodb::types::Update::builder()
            .table_name("Config")
            .key("pk", AttributeValue::S("ticket_number_counter".to_string()))
            .update_expression("SET counter_value = :new")
            .condition_expression("counter_value = :old OR attribute_not_exists(counter_value)")
            .expression_attribute_values(":new", AttributeValue::N(next_val.to_string()))
            .expression_attribute_values(":old", AttributeValue::N(current_val.to_string()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build counter update: {:?}", e), None))?;

        let put_ticket = Put::builder()
            .table_name("Tickets")
            .item("ticket_number", AttributeValue::N(ticket_number.clone()))
            .item("gsi_pk", AttributeValue::S("ALL".to_string()))
            .item("subject", AttributeValue::S(subject.clone()))
            .item("subject_lower", AttributeValue::S(subject.to_lowercase()))
            .item("customer_id", AttributeValue::S(customer_id.clone()))
            .item("status", AttributeValue::S(status.clone()))
            .item("device", AttributeValue::S(device.clone()))
            .item("status_device", AttributeValue::S(status_device))
            .item_if_not_empty("password", AttributeValue::S(password.clone().unwrap_or_default()))
            .item_if_not_empty("items_left", AttributeValue::L(items_left.clone().unwrap_or_default().into_iter().map(AttributeValue::S).collect()))
            .item("created_at", AttributeValue::N(now.clone()))
            .item("last_updated", AttributeValue::N(now.clone()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build ticket Put item: {:?}", e), None))?;

        let result = client.transact_write_items()
            .transact_items(TransactWriteItem::builder().update(update_counter).build())
            .transact_items(TransactWriteItem::builder().put(put_ticket).build())
            .send()
            .await;

        match result {
            Ok(_) => return Ok(json!({ "ticket_number": ticket_number })),
            Err(e) => {
                if let Some(service_err) = e.as_service_error() && service_err.is_transaction_canceled_exception() {
                    // Check if it's a condition failure (concurrent update)
                    if retry_count < MAX_RETRIES {
                        retry_count += 1;
                        // Small backoff could be added here
                        continue;
                    }
                }
                return Err(error_response(500, "Transaction Error", &format!("Failed to execute create ticket transaction: {:?}", e), None));
            }
        }
    }
}

pub async fn handle_update_ticket(
    ticket_number: String,
    req: UpdateTicketRequest,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let (subject, password, items_left, line_items, device) = (
        req.subject,
        req.password,
        req.items_left,
        req.line_items,
        req.device,
    );

    // If device is updated, we need to update the composite key status_device
    // We need current status for that.
    
    let mut current_status = None;

    if device.is_some() {
        let output = client.get_item()
            .table_name("Tickets")
            .key("ticket_number", AttributeValue::N(ticket_number.clone()))
            .projection_expression("#st")
            .expression_attribute_names("#st", "status")
            .send()
            .await
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch ticket status for device update: {:?}", e), None))?;
        
        if let Some(item) = output.item.as_ref().and_then(|item| item.get("status")).and_then(|av| av.as_s().ok()) {
            current_status = Some(item.clone());
        }
    }

    let mut update_parts = Vec::new();
    let mut remove_parts = Vec::new();
    let mut expr_vals = HashMap::new();
    let expr_names: HashMap<String, String> = HashMap::new();

    if let Some(s) = subject {
        update_parts.push("subject = :s".to_string());
        expr_vals.insert(":s".to_string(), AttributeValue::S(s.clone()));
        update_parts.push("subject_lower = :sl".to_string());
        expr_vals.insert(":sl".to_string(), AttributeValue::S(s.to_lowercase()));
    }
    // if let Some(st) = status {
    //     update_parts.push("#st = :st".to_string());
    //     expr_vals.insert(":st".to_string(), AttributeValue::S(st));
    //     expr_names.insert("#st".to_string(), "status".to_string());
    // }
    
    // Handle password: None = no change, Some("") = remove, Some(value) = update
    if let Some(pw) = password {
        if pw.is_empty() {
            remove_parts.push("password".to_string());
        } else {
            update_parts.push("password = :pw".to_string());
            expr_vals.insert(":pw".to_string(), AttributeValue::S(pw));
        }
    }
    
    // Handle items_left: None = no change, Some([]) = remove, Some(vec) = update
    if let Some(items) = items_left {
        if items.is_empty() {
            remove_parts.push("items_left".to_string());
        } else {
            update_parts.push("items_left = :il".to_string());
            expr_vals.insert(":il".to_string(), AttributeValue::L(items.into_iter().map(AttributeValue::S).collect()));
        }
    }

    // Handle line_items: None = no change, Some([]) = remove, Some(vec) = update
    if let Some(items) = line_items {
        if items.is_empty() {
            remove_parts.push("line_items".to_string());
        } else {
            update_parts.push("line_items = :lis".to_string());
            expr_vals.insert(":lis".to_string(), AttributeValue::L(items.into_iter().map(|li| {
                AttributeValue::M(vec![
                    ("subject".to_string(), AttributeValue::S(li.subject)),
                    ("price_cents".to_string(), AttributeValue::N(li.price_cents.to_string())),
                ].into_iter().collect())
            }).collect()));
        }
    }
    
    if let Some(d) = &device {
        update_parts.push("device = :d".to_string());
        expr_vals.insert(":d".to_string(), AttributeValue::S(d.clone()));
    }

    // Status update logic moved to handle_update_status

    // Update status_device composite key if we have both parts
    if let (Some(s), Some(d)) = (current_status, device) {
        let status_device = format!("{}#{}", s, d);
        update_parts.push("status_device = :sd".to_string());
        expr_vals.insert(":sd".to_string(), AttributeValue::S(status_device));
    }

    update_parts.push("last_updated = :lu".to_string());
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    // Build update expression with both SET and REMOVE clauses
    let mut update_expr_parts = Vec::new();
    if !update_parts.is_empty() {
        update_expr_parts.push(format!("SET {}", update_parts.join(", ")));
    }
    if !remove_parts.is_empty() {
        update_expr_parts.push(format!("REMOVE {}", remove_parts.join(", ")));
    }
    let update_expr = update_expr_parts.join(" ");

    let mut request = client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression(update_expr);

    for (k, v) in expr_vals {
        request = request.expression_attribute_values(k, v);
    }

    // Add names if needed (for status which is reserved word)
    if !expr_names.is_empty() {
        for (k, v) in expr_names {
            request = request.expression_attribute_names(k, v);
        }
    }

    request.send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update ticket: {:?}", e), None))?;

    Ok(json!({"ticket_number": ticket_number}))
}

pub async fn handle_update_status(
    ticket_number: String,
    status: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Fetch current ticket to get device and line_items (for validation)
    let projection = "device, #st, line_items".to_string();

    let output = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .projection_expression(projection)
        .expression_attribute_names("#st", "status")
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch ticket for status update: {:?}", e), None))?;

    let item = output.item.ok_or_else(|| error_response(404, "Not Found", "Ticket not found", None))?;
    
    let device = item.get("device").and_then(|av| av.as_s().ok()).cloned().unwrap_or_else(|| "Other".to_string());
    let current_status = item.get("status").and_then(|av| av.as_s().ok()).cloned().unwrap_or_default();

    // 2. Validation: Prevent manual Resolve/Un-resolve if line items exist
    let line_items_av = item.get("line_items");
    let has_line_items = if let Some(AttributeValue::L(list)) = line_items_av {
        !list.is_empty()
    } else {
        false
    };

    if has_line_items {
        if status == "Resolved" && current_status != "Resolved" {
             return Err(error_response(400, "Bad Request", "Cannot resolve ticket with line items directly. Use 'Take Payment'.", None));
        }
        if current_status == "Resolved" && status != "Resolved" {
             return Err(error_response(400, "Bad Request", "Cannot un-resolve ticket with line items directly. Use 'Refund'.", None));
        }
    }

    // 3. Update
    let mut update_parts = Vec::new();
    let mut expr_vals = HashMap::new();
    let mut expr_names = HashMap::new();

    update_parts.push("#st = :st".to_string());
    expr_vals.insert(":st".to_string(), AttributeValue::S(status.clone()));
    expr_names.insert("#st".to_string(), "status".to_string());

    let status_device = format!("{}#{}", status.clone(), device);
    update_parts.push("status_device = :sd".to_string());
    expr_vals.insert(":sd".to_string(), AttributeValue::S(status_device));



    update_parts.push("last_updated = :lu".to_string());
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    let mut update_expr_parts = Vec::new();
    if !update_parts.is_empty() {
        update_expr_parts.push(format!("SET {}", update_parts.join(", ")));
    }

    let mut request = client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression(update_expr_parts.join(" "));

    for (k, v) in expr_vals {
        request = request.expression_attribute_values(k, v);
    }
    for (k, v) in expr_names {
        request = request.expression_attribute_names(k, v);
    }

    request.send().await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update status: {:?}", e), None))?;

    Ok(json!({"ticket_number": ticket_number.clone(), "status": status.clone()}))
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
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to add comment to ticket {:?}: {:?}", ticket_number, e), None))?;

    Ok(json!({"ticket_number": ticket_number}))
}

pub async fn handle_get_tickets_by_suffix(suffix: &str, client: &Client) -> Result<Value, Response<Body>> {
    let suffix_val: i64 = suffix.parse::<i64>().map_err(|_| error_response(400, "Invalid Suffix", "Suffix must be a number", None))?;

    // 1. Get current counter
    let counter_output = client.get_item()
        .table_name("Config")
        .key("pk", AttributeValue::S("ticket_number_counter".to_string()))
        .consistent_read(true)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to read ticket counter: {:?}", e), None))?;

    let current_counter: i64 = match counter_output.item {
        Some(item) => {
            let cv: CounterValue = serde_dynamo::from_item(item)
                .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to parse ticket counter: {:?}", e), None))?;
            cv.counter_value
        },
        None => return Err(error_response(500, "Data Integrity Error", "Ticket counter not found in database. Please initialize the counter.", None)),
    };

    // 2. Calculate potential ticket numbers
    let mut ticket_numbers = Vec::new();
    let mut current_base = (current_counter / 1000) * 1000 + suffix_val;
    if current_base > current_counter { // if the query is 200 and the counter is 30150, then the base is 30200, which is too large, the queries should start at 1000 below that
        current_base -= 1000;
    }

    while current_base > 0 && ticket_numbers.len() < 7 {
        ticket_numbers.push(current_base.to_string());
        current_base -= 1000;
    }

    if ticket_numbers.is_empty() {
        return Ok(json!([]));
    }

    // 3. Batch Get Tickets
    let keys: Vec<HashMap<String, AttributeValue>> = ticket_numbers.into_iter()
        .map(|tn| {
            let mut key = HashMap::new();
            key.insert("ticket_number".to_string(), AttributeValue::N(tn));
            key
        })
        .collect();

    let ka = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .projection_expression("ticket_number, subject, customer_id, #st, device, created_at")
        .expression_attribute_names("#st", "status")
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for tickets: {:?}", e), None))?;



    let mut request_items = HashMap::new();
    request_items.insert("Tickets".to_string(), ka);

    let output = crate::db_utils::execute_batch_get_with_retries(client, request_items).await?;

    let ticket_items = output.get("Tickets").cloned().unwrap_or_else(Vec::new);
    let mut tickets_nocust: Vec<TinyTicketWithoutCustomer> = serde_dynamo::from_items(ticket_items)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets from batch result: {:?}", e), None))?;

    // Sort descending by ticket number (most recent first)
    tickets_nocust.sort_by(|a, b| b.ticket_number.cmp(&a.ticket_number));

    // 4. Merge customers
    let tickets = merge_customers_into_tiny_tickets(tickets_nocust, client).await?;

    serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize search results: {:?}", e), None))
}

pub async fn merge_customers_into_tiny_tickets(
    tickets_nocust: Vec<TinyTicketWithoutCustomer>,
    client: &Client,
) -> Result<Vec<TinyTicket>, Response<Body>> {
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
        .projection_expression("customer_id, full_name") // Only need ID and Name
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for customers: {:?}", e), None))?;



    let mut request_items = HashMap::new();
    request_items.insert("Customers".to_string(), ka);

    let batch_output = crate::db_utils::execute_batch_get_with_retries(client, request_items).await?;

    let customer_items = batch_output.get("Customers").cloned().unwrap_or_else(Vec::new);
    
    let mut customer_names = HashMap::new();
    for item in customer_items {
        if let (Some(cid), Some(fname)) = (item.get("customer_id").and_then(|av| av.as_s().ok()), item.get("full_name").and_then(|av| av.as_s().ok())) {
            customer_names.insert(cid.clone(), fname.clone());
        }
    }

    let mut tickets = Vec::new();
    for details in tickets_nocust {
        let name = customer_names.get(&details.customer_id).cloned().unwrap_or_else(|| "Unknown".to_string());
        tickets.push(TinyTicket {
            details,
            customer_name: name,
        });
    }

    Ok(tickets)
}

pub async fn merge_full_customers_into_tickets(
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

    // We want the FULL customer object this time
    let ka = KeysAndAttributes::builder()
        .set_keys(Some(keys))
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for customers: {:?}", e), None))?;

    let mut request_items = HashMap::new();
    request_items.insert("Customers".to_string(), ka);

    let batch_output = crate::db_utils::execute_batch_get_with_retries(client, request_items).await?;

    let customer_items = batch_output.get("Customers").cloned().unwrap_or_else(Vec::new);
    let customers: Vec<Customer> = serde_dynamo::from_items(customer_items)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customers: {:?}", e), None))?;
    
    let mut customer_map = HashMap::new();
    for c in customers {
        customer_map.insert(c.customer_id.clone(), c);
    }

    let mut tickets = Vec::new();
    for details in tickets_nocust {
        if let Some(customer) = customer_map.get(&details.customer_id).cloned() {
            tickets.push(Ticket {
                details,
                customer,
            });
        }
    }
    
    Ok(tickets)
}

pub async fn handle_dont_fix_ticket(
    ticket_number: String,
    tech_name: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Get current ticket to get line items and device
    let output = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch ticket for dont_fix: {:?}", e), None))?;

    let item = output.item.ok_or_else(|| error_response(404, "Not Found", "Ticket not found", None))?;
    
    // Deserialize to check line items
    let ticket: TicketWithoutCustomer = serde_dynamo::from_item(item.clone())
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {:?}", e), None))?;

    let line_items = ticket.line_items.unwrap_or_default();
    let device = ticket.device;

    // 2. Prepare updates
    let mut update_parts = Vec::new();
    let mut expr_vals = HashMap::new();
    let mut expr_names = HashMap::new();

    // Archive line items to comment
    if !line_items.is_empty() {
        let mut items_str = String::from("[Don't fix]\nPrevious line items:\n");
        for item in line_items {
            items_str.push_str(&format!("- {}: ${:.2}\n", item.subject, item.price_cents as f64 / 100.0));
        }

        let author_name = format!("{} (System)", tech_name);

        let comment = AttributeValue::M(
            vec![
                ("comment_body".to_string(), AttributeValue::S(items_str)),
                ("tech_name".to_string(), AttributeValue::S(author_name)),
                ("created_at".to_string(), AttributeValue::N(Utc::now().timestamp().to_string())),
            ]
            .into_iter().collect()
        );
        
        update_parts.push("comments = list_append(if_not_exists(comments, :empty), :c)".to_string());
        expr_vals.insert(":c".to_string(), AttributeValue::L(vec![comment]));
        expr_vals.insert(":empty".to_string(), AttributeValue::L(vec![]));
    }

    // Clear line items
    let mut remove_parts = Vec::new();
    remove_parts.push("line_items".to_string());

    // Update status to Ready
    update_parts.push("#st = :st".to_string());
    expr_vals.insert(":st".to_string(), AttributeValue::S("Ready".to_string()));
    expr_names.insert("#st".to_string(), "status".to_string());

    let status_device = format!("{}#{}", "Ready", device);
    update_parts.push("status_device = :sd".to_string());
    expr_vals.insert(":sd".to_string(), AttributeValue::S(status_device));

    update_parts.push("last_updated = :lu".to_string());
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    // Construct Expression
    let mut update_expr_parts = Vec::new();
    if !update_parts.is_empty() {
        update_expr_parts.push(format!("SET {}", update_parts.join(", ")));
    }
    if !remove_parts.is_empty() {
        update_expr_parts.push(format!("REMOVE {}", remove_parts.join(", ")));
    }

    let update_expr = update_expr_parts.join(" ");

    let mut request = client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression(update_expr);

    for (k, v) in expr_vals {
        request = request.expression_attribute_values(k, v);
    }
    for (k, v) in expr_names {
        request = request.expression_attribute_names(k, v);
    }

    request.send().await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update ticket for dont_fix: {:?}", e), None))?;

    Ok(json!({"ticket_number": ticket_number, "status": "Ready"}))
}
