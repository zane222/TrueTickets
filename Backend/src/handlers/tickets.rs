//! Ticket management handlers (create, update, search, get).
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

/// Retrieves a ticket with only the necessary fields to display in search results, and gracefully handles missing tickets.
/// # Database Interactions
/// - **`Tickets` Table**: `GetItem` with `ProjectionExpression`.
/// - **`Customers` Table**: `GetItem` to fetch customer name.
///
/// # Logic
/// - Optimizes bandwidth by only fetching necessary fields (`ticket_number`, `subject`, `status`, etc.).
/// - Deserializes directly into `TinyTicketWithoutCustomer`, then into `TinyTicket` by adding the customer's name
/// - Returns `{ "ticket": TinyTicket }` or `{ "ticket": null }` if not found.
pub async fn handle_quick_search_ticket(
    ticket_number: &str,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Get partial ticket
    let output = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.to_string()))
        .projection_expression("ticket_number, subject, customer_id, #st, device, created_at")
        .expression_attribute_names("#st", "status")
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to search ticket: {:?}", e), None))?;

    let ticket_item = match output.item {
        Some(item) => item,
        None => return Ok(json!({ "ticket": null })),
    };

    let ticket_nocust: TinyTicketWithoutCustomer = serde_dynamo::from_item(ticket_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tiny ticket: {:?}", e), None))?;

    // 2. Get Customer Name only
    let customer_item = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(ticket_nocust.customer_id.clone()))
        .projection_expression("full_name")
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {:?}", e), None))?
        .item
        .ok_or_else(|| error_response(404, "Customer Not Found", "Ticket exists but linked customer is missing", None))?;

    let customer_name = customer_item.get("full_name")
        .and_then(|av| av.as_s().ok())
        .cloned()
        .unwrap_or_else(|| "Unknown".to_string());

    let tiny_ticket = TinyTicket {
        details: ticket_nocust,
        customer_name,
    };

    Ok(json!({ "ticket": tiny_ticket }))
}

/// Retrieves the full details of a ticket and its associated customer.
///
/// # Database Interactions
/// - **`Tickets` Table**: Direct `GetItem` (fetch all attributes).
/// - **`Customers` Table**: Direct `GetItem` (fetch all attributes).
///
/// # Logic
/// - Returns `Ticket` struct (Ticket + Customer).
/// - Returns 404 if ticket not found.
pub async fn handle_get_ticket_details(
    ticket_number: &str,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Get Ticket
    let ticket_item = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get ticket '{:?}', probably there's no ticket under that number: {:?}", ticket_number, e), None))?
        .item
        .ok_or_else(|| error_response(404, "Ticket Not Found", "No ticket with that number", None))?;

    let ticket_nocust: TicketWithoutCustomer = serde_dynamo::from_item(ticket_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket: {:?}", e), None))?;

    // 2. Get Customer
    let customer_item = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(ticket_nocust.customer_id.clone()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {:?}", e), None))?
        .item
        .ok_or_else(|| error_response(404, "Customer Not Found", "Ticket exists but linked customer is missing", None))?;

    let customer: Customer = serde_dynamo::from_item(customer_item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {:?}", e), None))?;

    // 3. Compose response
    let full_ticket = Ticket {
        details: ticket_nocust,
        customer,
    };

    serde_json::to_value(&full_ticket)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize ticket: {:?}", e), None))
}

/// Fetches all tickets belonging to a specific customer.
///
/// # Database Interactions
/// - **`Tickets` Table**: Uses `Query` on the `CustomerIdIndex` GSI to retrieve all tickets for a specific customer.
///
/// # Logic
/// - Returns a list of `TicketWithoutCustomer` since the caller presumably already knows the customer details.
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

/// Searches for tickets based on keywords in the subject line.
///
/// # Database Interactions
/// 1. **`Tickets` Table (GSI Scan/Query)**: Queries the `TicketSearchIndex`.
///    - Uses `gsi_pk = "ALL"` (a partition of "all tickets").
///    - Applies a `contains(subject_lower, :word)` filter for each word in the query.
///    - **Note**: This is effectively an inorder "scan" of all tickets, but only reading the subject_lower attribute.
/// 2. **`Tickets` Table (Batch Get)**: After finding matching ticket numbers from the index, it performs a `BatchGetItem` to retrieve the full ticket details. This is because the GSI needs to not project extra attributes for it to be efficiently searchable.
/// 3. **`Customers` Table (Batch Get)**: Fetches customer names for the retrieved tickets to return each ticket with its customer name.
///
/// # Logic
/// - **Tokenization**: Searches for tickets in which all words in the query must be present in their subject (using subject_lower for case-insensitive search).
/// - **Pagination**: Manually iterates 'pages' of the index query until 15 results are found or the index is exhausted.
/// - **Batch Operation**: Merges Ticket data with Customer data in a batch operation.
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

/// Retrieves the most recently created or updated tickets.
///
/// # Database Interactions
/// - **`Tickets` Table**: Queries the `TicketNumberIndex` GSI.
///   - Key Condition: `gsi_pk = "ALL"`
///   - Sort Order: Descending (ScanIndexForward = false) to get newest first.
///   - Limit: 30 items.
///
/// # Logic
/// - Efficiently retrieves the latest tickets without scanning the entire table.
/// - BatchGetItem join with `Customers` table to provide customer names for the UI.
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

/// Creates a new ticket with a sequential ticket number.
///
/// # Database Interactions
/// This function utilizes **DynamoDB Transactions** to ensure strict sequential ordering of ticket numbers.
/// It interacts with two tables in a single atomic operation:
/// 1. **`Config` Table**:
///    - **Read**: Fetches the current `ticket_number_counter` (PK: "ticket_number_counter").
///    - **Update**: Atomically increments the counter using a conditional check (`counter_value = :old`).
/// 2. **`Tickets` Table**:
///    - **Insert**: Creates a new ticket item with the newly generated incremented number.
///
/// # Logic & Concurrency
/// - Implementation uses **Optimistic Locking** on the `Config` table counter.
/// - If the counter has changed between the initial read and the write (due to another concurrent request), the transaction fails.
/// - The function automatically **retries** (up to 5 times) to handle these high-concurrency partial failures without erroring to the client.
///
/// > **Note**: This retry mechanism has not been tested yet.
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
                    // Check if it's a condition failure (ticket was already made with this number)
                    if retry_count < MAX_RETRIES {
                        retry_count += 1;
                        continue;
                    }
                }
                return Err(error_response(500, "Transaction Error", &format!("Failed to execute create ticket transaction: {:?}", e), None));
            }
        }
    }
}

/// Updates an existing ticket's details.
///
/// # Database Interactions
/// - **`Tickets` Table**: Uses `UpdateItem` to modify specific attributes of a ticket identified by `ticket_number`.
///
/// # Logic & Dynamic Querying
/// - **Dynamic Expression Building**: The update expression (`SET ... REMOVE ...`) is constructed at runtime based on which fields are present (`Some`) in the request.
/// - **Partial Updates**: Only the fields provided in the `UpdateTicketRequest` are modified; others are left unchanged.
/// - **Automatic Timestamp**: The `last_updated` field is always set to the current UTC timestamp, strictly server-side.
/// - **Complex Types**: Handles mapping of complex structures like `line_items` (array of objects) into DynamoDB `List<Map>` format.
pub async fn handle_update_ticket(
    ticket_number: String,
    req: UpdateTicketRequest,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let mut update_expr = "SET last_updated = :lu".to_string();
    let mut expr_vals = HashMap::new();
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    if let Some(s) = &req.subject {
        update_expr.push_str(", subject = :s, subject_lower = :sl");
        expr_vals.insert(":s".to_string(), AttributeValue::S(s.clone()));
        expr_vals.insert(":sl".to_string(), AttributeValue::S(s.to_lowercase()));
    }

    if let Some(pw) = &req.password {
        if pw.is_empty() {
            update_expr.push_str(" REMOVE password");
        } else {
            update_expr.push_str(", password = :pw");
            expr_vals.insert(":pw".to_string(), AttributeValue::S(pw.clone()));
        }
    }

    if let Some(items) = &req.items_left {
        if items.is_empty() {
            update_expr.push_str(" REMOVE items_left");
        } else {
            update_expr.push_str(", items_left = :il");
            expr_vals.insert(":il".to_string(), AttributeValue::L(items.iter().map(|i| AttributeValue::S(i.clone())).collect()));
        }
    }

    if let Some(items) = &req.line_items {
        if items.is_empty() {
            update_expr.push_str(" REMOVE line_items");
        } else {
            update_expr.push_str(", line_items = :lis");
            expr_vals.insert(":lis".to_string(), AttributeValue::L(items.iter().map(|li| {
                AttributeValue::M(vec![
                    ("subject".to_string(), AttributeValue::S(li.subject.clone())),
                    ("price_cents".to_string(), AttributeValue::N(li.price_cents.to_string())),
                ].into_iter().collect())
            }).collect()));
        }
    }

    if let Some(d) = &req.device {
        update_expr.push_str(", device = :d");
        expr_vals.insert(":d".to_string(), AttributeValue::S(d.clone()));
    }

    let mut request_builder = client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression(update_expr);

    for (k, v) in expr_vals {
        request_builder = request_builder.expression_attribute_values(k, v);
    }

    request_builder.send().await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update ticket: {:?}", e), None))?;

    Ok(json!({"ticket_number": ticket_number}))
}

/// Updates the status of a ticket.
///
/// # Database Interactions
/// - **`Tickets` Table**: Uses `UpdateItem` with a Conditional Write.
///
/// # Logic & Consistency
/// - **Strict Conditional Logic**: If a ticket has line items it cannot be:
///   - Set to resolved (should use take payment) 
///   - Set away from resolved (should use refund).
/// - **Error Handling**: Catches the specific `ConditionalCheckFailedException` to return a 400 Bad Request with a helpful message (e.g., "Cannot update status of a resolved ticket...").
pub async fn handle_update_status(
    ticket_number: String,
    status: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET #st = :st, last_updated = :lu")
        .condition_expression("(attribute_not_exists(line_items) OR size(line_items) = :zero) OR (#st <> :resolved AND :st <> :resolved)")
        .expression_attribute_names("#st", "status")
        .expression_attribute_values(":st", AttributeValue::S(status.clone()))
        .expression_attribute_values(":lu", AttributeValue::N(Utc::now().timestamp().to_string()))
        .expression_attribute_values(":zero", AttributeValue::N("0".to_string()))
        .expression_attribute_values(":resolved", AttributeValue::S("Resolved".to_string()))
        .send()
        .await
        .map_err(|e| {
            if let Some(service_err) = e.as_service_error() && service_err.is_conditional_check_failed_exception() {
                return error_response(400, "Bad Request", "Cannot update status of a resolved ticket with line items. Use 'Take Payment' or 'Refund'.", None);
            }
            error_response(500, "DynamoDB Error", &format!("Failed to update status: {:?}", e), None)
        })?;

    Ok(json!({"ticket_number": ticket_number, "status": status}))
}

/// Appends a new comment to a ticket.
///
/// # Database Interactions
/// - **`Tickets` Table**: Uses `UpdateItem` with `list_append`.
///
/// # Logic
/// - **Atomic Append**: Safely adds to the `comments` list without race conditions.
/// - **Initialization**: Uses `if_not_exists` to create the `comments` list if this is the first comment.
/// - **Audit Trail**: Captures `tech_name` and `timestamp` server-side.
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

/// Searches for recent tickets ending with a specific 3-digit number (e.g., searching for "123" finds "35123", "34123", "33123").
///
/// # Database Interactions
/// 1. **`Config` Table**: Reads the current `ticket_number_counter` to determine the search range.
/// 2. **`Tickets` Table (Batch Get)**: Gets 7 most recent potential tickets
///
/// # Logic
/// - **Math-based Search**: Calculates every possible ticket number that could match the suffix starting from the current maximum ticket number.
/// - **Optimization**: Limits results to the last 7 matches.
pub async fn handle_get_tickets_by_suffix(suffix: i64, client: &Client) -> Result<Value, Response<Body>> {
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
    let mut current_base = (current_counter / 1000) * 1000 + suffix;
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
    tickets_nocust.sort_by_key(|a| -a.ticket_number);

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
