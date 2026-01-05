//! Financial operations handlers (payments, payroll, purchases).
use serde_json::{json, Value};
use aws_sdk_dynamodb::{Client, types::{AttributeValue, Put}};
use lambda_http::{Body, Response};
use crate::http::error_response;
use crate::models::{MonthPurchases, TimeEntry, TicketWithoutCustomer, LineItem};
use chrono::Utc;

/// Retrieves the list of purchases for a specific month.
///
/// # Database Interactions
/// - **`Purchases` Table**: Direct `GetItem` using `YYYY-MM` string as the partition key.
///
/// # Logic
/// - Returns an empty list if no purchases record exists for that month.
pub async fn get_purchases(
    year: i32,
    month: u32,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let month_year_pk = format!("{:04}-{:02}", year, month);

    // 1. Get Purchases
    // Fetch from Purchases table, PK = YYYY-MM
    let purchases_output = client.get_item()
        .table_name("Purchases")
        .key("month_year", AttributeValue::S(month_year_pk.clone()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch purchases: {:?}", e), None))?;

    let purchases_list = if let Some(item) = purchases_output.item {
        let mp: MonthPurchases = serde_dynamo::from_item(item)
            .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize purchases: {:?}", e), None))?;
        mp.items
    } else {
        Vec::new()
    };

    Ok(json!({
        "purchases": purchases_list
    }))
}

/// Retrieves all tickets paid within a specific time range.
///
/// # Database Interactions
/// - **`Tickets` Table (GSI Query)**: Queries `RevenueIndex` (Sparse GSI).
///   - Key Condition: `gsi_pk = "ALL" AND paid_at BETWEEN :start AND :end`.
///   - Filter: Only returns tickets that have a `paid_at` timestamp (implicitly done by the sparse index).
/// - **`Customers` Table (Batch Get)**: Fetches full customer details to populate the ticket objects.
///
/// # Logic
/// - **Sparse Indexing**: Efficiently queries only paid tickets without scanning the full ticket history.
/// - **Ordering**: Returns results ordered by payment date (latest first).
pub async fn get_all_tickets_for_month_with_payments(
    start_ts: i64,
    end_ts: i64,
    client: &Client,
) -> Result<Value, Response<Body>> {

    use aws_sdk_dynamodb::types::AttributeValue;

    // Step 1: Query GSI to get tickets (Sparse GSI on resolved_at)
    let mut tickets_nocust: Vec<TicketWithoutCustomer> = Vec::new();
    let mut last_evaluated_key = None;

    loop {
         let mut query_builder = client.query()
            .table_name("Tickets")
            .index_name("RevenueIndex")
            .key_condition_expression("gsi_pk = :all AND paid_at BETWEEN :start AND :end")
            .expression_attribute_values(":all", AttributeValue::S("ALL".to_string()))
            .expression_attribute_values(":start", AttributeValue::N(start_ts.to_string()))
            .expression_attribute_values(":end", AttributeValue::N(end_ts.to_string()))
            .scan_index_forward(false); // Sort by paid_at descending (most recent first)

        if let Some(key) = last_evaluated_key {
            query_builder = query_builder.set_exclusive_start_key(Some(key));
        }

        let output = query_builder.send().await
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query revenue tickets: {:?}", e), None))?;

        if let Some(items) = output.items {
            let page: Vec<TicketWithoutCustomer> = serde_dynamo::from_items(items)
                .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize tickets: {:?}", e), None))?;
            tickets_nocust.extend(page);
        }

        last_evaluated_key = output.last_evaluated_key;
        if last_evaluated_key.is_none() {
            break;
        }
    }

    // Step 2: Merge full customer objects
    let tickets = crate::handlers::tickets::merge_full_customers_into_tickets(tickets_nocust, client).await?;

    let result = serde_json::to_value(&tickets)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize tickets: {:?}", e), None))?;

    Ok(result)
}

/// Updates (overwrites) the entire list of purchases for a specific month.
///
/// # Database Interactions
/// - **`Purchases` Table**: `PutItem` to completely replace the record for the given `YYYY-MM`.
///
/// # Logic
/// - **Overwrite Strategy**: The client sends the full state of purchases for the month; the backend replaces the existing entry.
pub async fn update_purchases(
    year: i32,
    month: u32,
    purchases: Vec<crate::models::PurchaseItem>,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let month_purchases = MonthPurchases {
        month_year: format!("{:04}-{:02}", year, month),
        items: purchases,
    };

    let item_value = serde_dynamo::to_item(month_purchases)
        .map_err(|_e| error_response(500, "Serialization Error", "Failed to serialize purchases for DB", None))?;

    client.put_item()
        .table_name("Purchases")
        .set_item(Some(item_value))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to save purchases: {:?}", e), None))?;

    Ok(json!({
        "success": true,
        "message": "Purchases updated successfully"
    }))
}

/// Retrieves time sheet logs for all users within a date range.
///
/// # Database Interactions
/// - **`TimeEntries` Table (Query)**: Queries partition `ALL` with sort key `timestamp` in range.
/// - **`Config` Table (Batch Get)**: Fetches wages for all unique users found in the logs.
///
/// # Logic
/// - **Aggregated Response**: Returns both the raw log entries and the current wage rates for the relevant users.
/// - **Frontend Processing**: The backend provides raw data; the frontend (IncomeTab) calculates total hours and payout.
pub async fn handle_get_clock_logs(
    start_ts: i64,
    end_ts: i64,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let mut last_evaluated_key = None;
    let mut entries: Vec<TimeEntry> = Vec::new();

    loop {
        let mut query_builder = client.query()
            .table_name("TimeEntries")
            .key_condition_expression("pk = :pk AND #ts BETWEEN :start AND :end")
            .expression_attribute_names("#ts", "timestamp")
            .expression_attribute_values(":pk", AttributeValue::S("ALL".to_string()))
            .expression_attribute_values(":start", AttributeValue::N(start_ts.to_string()))
            .expression_attribute_values(":end", AttributeValue::N(end_ts.to_string()));

        if let Some(key) = last_evaluated_key {
            query_builder = query_builder.set_exclusive_start_key(Some(key));
        }

        let output = query_builder.send().await
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch time entries: {:?}", e), None))?;

        if let Some(items) = output.items {
            let page: Vec<TimeEntry> = serde_dynamo::from_items(items)
                .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize time entries: {:?}", e), None))?;
            entries.extend(page);
        }

        last_evaluated_key = output.last_evaluated_key;
        if last_evaluated_key.is_none() {
            break;
        }
    }

    // Collect unique usernames
    let user_name_list: Vec<String> = entries.iter()
        .map(|e| e.user_name.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let wage_map = crate::db_utils::get_wages_for_users(user_name_list.clone(), client).await;

    // Transform to frontend format: { user: "Name", out: bool, timestamp: 123 }
    let logs: Vec<Value> = entries.into_iter().map(|e| {
        json!({
            "user": e.user_name,
            "out": e.is_clock_out,
            "timestamp": e.timestamp
        })
    }).collect();

    let wages_list: Vec<Value> = user_name_list.into_iter().map(|name| {
        let wage_cents = wage_map.get(&name).copied().unwrap_or(0);
        json!({
            "name": name,
            "wage_cents": wage_cents
        })
    }).collect();

    Ok(json!({
        "clock_logs": logs,
        "wages": wages_list
    }))
}

/// records a user clocking in or out.
///
/// # Database Interactions
/// Uses `TransactWriteItems` to ensure state consistency:
/// 1. **`TimeEntries` Table**: `PutItem` creates a new immutable log entry.
/// 2. **`Config` Table**: `PutItem` updates the mutable `[User]#is_clocked_in` state.
///
/// # Logic & Consistency
/// - **Condition Checks**:
///   - To Clock In: User must be currently clocked OUT (or have no state).
///   - To Clock Out: User must be currently clocked IN.
/// - **Concurrency**: Prevents double-clocking via DynamoDB conditional writes.
pub async fn handle_clock_in(
    given_name: String,
    clocking_in: bool,
    client: &Client,
) -> Result<Value, Response<Body>> {
    use chrono::Utc;

    let now = Utc::now();
    let timestamp = now.timestamp();

    let clocked_in_pk = format!("{}#is_clocked_in", given_name);

    // 2. Prepare TimeEntry
    let time_entry = TimeEntry {
        pk: "ALL".to_string(),
        user_name: given_name.clone(),
        timestamp,
        is_clock_out: !clocking_in,
    };

    let entry_item: std::collections::HashMap<String, AttributeValue> = serde_dynamo::to_item(&time_entry)
        .map_err(|_e| error_response(500, "Serialization Error", "Failed to serialize time entry", None))?;

    // 3. Prepare Config Update (Put with Condition)
    // We always PUT now (store bool), never Delete.
    let put_config_builder = Put::builder()
        .table_name("Config")
        .item("pk", AttributeValue::S(clocked_in_pk))
        .item("clocked_in", AttributeValue::Bool(clocking_in))
        .item("last_updated", AttributeValue::N(timestamp.to_string()));

    let put_config = if clocking_in {
        // Clocking IN: Must be currently false OR not exist
        put_config_builder
            .condition_expression("clocked_in = :false OR attribute_not_exists(clocked_in)")
            .expression_attribute_values(":false", AttributeValue::Bool(false))
            .build()
    } else {
        // Clocking OUT: Must be currently true
        put_config_builder
            .condition_expression("clocked_in = :true")
            .expression_attribute_values(":true", AttributeValue::Bool(true))
            .build()
    }.map_err(|e| error_response(500, "Builder Error", &format!("Failed to build put config: {:?}", e), None))?;

    // 4. Time Entry Put
    let put_entry = Put::builder()
        .table_name("TimeEntries")
        .set_item(Some(entry_item))
        .build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build put entry: {:?}", e), None))?;

    // 5. Transact
    let result = client.transact_write_items()
        .transact_items(aws_sdk_dynamodb::types::TransactWriteItem::builder().put(put_entry).build())
        .transact_items(aws_sdk_dynamodb::types::TransactWriteItem::builder().put(put_config).build())
        .send()
        .await;

    match result {
        Ok(_) => Ok(json!({
            "message": format!("Successfully {} for {}", if clocking_in { "Clocked In" } else { "Clocked Out" }, given_name),
            "clocked_in": clocking_in,
            "timestamp": timestamp
        })),
        Err(e) => {
            if let Some(service_err) = e.as_service_error() && service_err.is_transaction_canceled_exception() {
                return Err(error_response(409, "Conflict", "State changed during processing. Please try again.", None));
            }
            Err(error_response(500, "Transaction Error", &format!("Failed to execute clock in/out transaction: {:?}", e), None))
        }
    }
}

/// Checks the current clock-in status of a user.
///
/// # Database Interactions
/// - **`Config` Table**: Consistent Read of `[User]#is_clocked_in`.
///
/// # Logic
/// - Defaults to `false` if no state record exists.
pub async fn handle_get_clock_status(
    given_name: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let clocked_in_pk = format!("{}#is_clocked_in", given_name);

    let config_output = client.get_item()
        .table_name("Config")
        .key("pk", AttributeValue::S(clocked_in_pk))
        .consistent_read(true)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch status: {:?}", e), None))?;

    let is_clocked_in = if let Some(item) = config_output.item {
        *item.get("clocked_in").and_then(|av| av.as_bool().ok()).unwrap_or(&false)
    } else {
        false
    };

    Ok(json!({
        "clocked_in": is_clocked_in
    }))
}

/// Updates the hourly wage for a specific user.
///
/// # Database Interactions
/// - **`Config` Table**: `PutItem` on `[User]#wage`.
pub async fn handle_update_user_wage(
    given_name: String,
    wage_cents: i64,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let wage_pk = format!("{}#wage", given_name);

    client.put_item()
        .table_name("Config")
        .item("pk", AttributeValue::S(wage_pk))
        .item("wage_cents", AttributeValue::N(wage_cents.to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update wage: {:?}", e), None))?;

    Ok(json!({
        "message": format!("Successfully updated wage for {}", given_name),
        "wage_cents": wage_cents
    }))
}

/// Manually corrects time sheet entries for a user on a specific day.
///
/// # Database Interactions
/// A complex transaction that "rewrites history" for a user's day:
/// 1. **Query**: Fetches existing logs for the user/day range.
/// 2. **Transaction**:
///    - **Deletes** all existing entries for that user/day.
///    - **Inserts** new entries based on the provided segments.
///
/// # Logic
/// - **Destructive Update**: Completely replaces the day's logs for the user to ensure consistency without trying to diff individual timestamps.
/// > **Note**: This has not been tested yet and still needs to be looked over carefully.
pub async fn handle_update_clock_logs(
    req: crate::models::UpdateClockLogsRequest,
    client: &Client,
) -> Result<Value, Response<Body>> {
    use aws_sdk_dynamodb::types::{AttributeValue, TransactWriteItem, Put, Delete};

    // 1. Query Existing Logs for this User and Date Range
    let query_builder = client.query()
        .table_name("TimeEntries")
        .key_condition_expression("pk = :pk AND #ts BETWEEN :start AND :end")
        .expression_attribute_names("#ts", "timestamp")
        .expression_attribute_values(":pk", AttributeValue::S("ALL".to_string()))
        .expression_attribute_values(":start", AttributeValue::N(req.start_of_day.to_string()))
        .expression_attribute_values(":end", AttributeValue::N(req.end_of_day.to_string()));

    let output = query_builder.send().await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch existing logs: {:?}", e), None))?;

    let existing_logs: Vec<TimeEntry> = if let Some(items) = output.items {
        serde_dynamo::from_items(items)
            .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize logs: {:?}", e), None))?
    } else {
        Vec::new()
    };

    // Filter for THIS user only
    let user_logs: Vec<TimeEntry> = existing_logs.into_iter()
        .filter(|e| e.user_name == req.user_name)
        .collect();

    // 2. Prepare TransactWriteItems
    let mut transact_items = Vec::new();

    // Delete existing
    for log in user_logs {
        let delete = Delete::builder()
            .table_name("TimeEntries")
            .key("pk", AttributeValue::S("ALL".to_string()))
            .key("timestamp", AttributeValue::N(log.timestamp.to_string()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build delete: {:?}", e), None))?;

        transact_items.push(TransactWriteItem::builder().delete(delete).build());
    }

    // 3. Create New Entries
    for segment in req.segments {
        // 3a. Clock In Entry
        let in_entry = TimeEntry {
            pk: "ALL".to_string(),
            user_name: req.user_name.clone(),
            timestamp: segment.start,
            is_clock_out: false,
        };
        let in_item = serde_dynamo::to_item(&in_entry)
            .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize in_entry: {:?}", e), None))?;

        let put_in = Put::builder()
            .table_name("TimeEntries")
            .set_item(Some(in_item))
            .build()
             .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build put in: {:?}", e), None))?;
        transact_items.push(TransactWriteItem::builder().put(put_in).build());

        // 3b. Clock Out Entry
        let out_entry = TimeEntry {
            pk: "ALL".to_string(),
            user_name: req.user_name.clone(),
            timestamp: segment.end,
            is_clock_out: true,
        };
        let out_item = serde_dynamo::to_item(&out_entry)
            .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize out_entry: {:?}", e), None))?;

        let put_out = Put::builder()
            .table_name("TimeEntries")
            .set_item(Some(out_item))
            .build()
             .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build put out: {:?}", e), None))?;
        transact_items.push(TransactWriteItem::builder().put(put_out).build());
    }

    if !transact_items.is_empty() {
        client.transact_write_items()
            .set_transact_items(Some(transact_items))
            .send()
            .await
            .map_err(|e| error_response(500, "Transaction Error", &format!("Failed to update logs: {:?}", e), None))?;
    }

    Ok(json!({ "success": true }))
}

/// Processes a payment for a ticket.
///
/// # Database Interactions
/// 1. **Fetch**: Parallel fetch of `Tickets` (for line items) and `Config` (for tax rate).
/// 2. **Update**: `UpdateItem` on `Tickets` table.
///
/// # Logic
/// - **Calculation**: Computes total from line items + tax rate.
/// - **Receipt Generation**: Formats a text receipt block and appends it to comments.
/// - **State Transition**: Sets status to "Resolved", adds `paid_at` timestamp.
/// - **Safety**: Conditional write prevents resolving a ticket that is already resolved or in an invalid state.
pub async fn handle_take_payment(
    ticket_number: String,
    tech_name: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Fetch ticket line items and tax rate concurrently
    let ticket_future = client
        .get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .projection_expression("line_items")
        .send();

    let config_future = client
        .get_item()
        .table_name("Config")
        .key("pk", AttributeValue::S("config".to_string()))
        .projection_expression("tax_rate")
        .send();

    let (ticket_result, config_result) = tokio::join!(ticket_future, config_future);

    let ticket_item = ticket_result
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch ticket: {:?}", e), None))?
        .item
        .ok_or_else(|| error_response(404, "Not Found", "Ticket not found", None))?;

    let config_item = config_result
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get config for tax rate: {:?}", e), None))?
        .item;

    // 2. Calculate Total
    let line_items_av = ticket_item.get("line_items");
    let line_items: Vec<LineItem> = if let Some(AttributeValue::L(list)) = line_items_av {
        serde_dynamo::from_attribute_value(AttributeValue::L(list.clone())).unwrap_or_default()
    } else {
        Vec::new()
    };

    let subtotal_cents: i64 = line_items.iter().map(|li| li.price_cents).sum();

    let tax_rate = config_item
        .and_then(|c| c.get("tax_rate").cloned())
        .and_then(|v| v.as_n().ok().and_then(|n| n.parse::<f64>().ok()))
        .unwrap_or(0.0);

    let total_paid_cents = (subtotal_cents as f64 * (1.0 + tax_rate / 100.0)).round() as i64;

    // 3. Generate Receipt Comment
    let comment = line_items_to_comment(&line_items, total_paid_cents, &tech_name, "[Payment Taken]");
    let now_ts = Utc::now().timestamp().to_string();

    // 4. Update Ticket
    client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET #st = :st, paid_at = :pa, total_paid_cents = :tpc, last_updated = :lu, comments = list_append(if_not_exists(comments, :empty), :c)")
        .condition_expression("#st <> :resolved_check")
        .expression_attribute_names("#st", "status")
        .expression_attribute_values(":st", AttributeValue::S("Resolved".to_string()))
        .expression_attribute_values(":resolved_check", AttributeValue::S("Resolved".to_string()))
        .expression_attribute_values(":pa", AttributeValue::N(now_ts.clone()))
        .expression_attribute_values(":tpc", AttributeValue::N(total_paid_cents.to_string()))
        .expression_attribute_values(":lu", AttributeValue::N(now_ts.clone()))
        .expression_attribute_values(":c", AttributeValue::L(vec![comment]))
        .expression_attribute_values(":empty", AttributeValue::L(vec![]))
        .send()
        .await
        .map_err(|e| {
            if let Some(service_err) = e.as_service_error() && service_err.is_conditional_check_failed_exception() {
                return error_response(409, "Conflict", "Ticket might be already resolved or state changed.", None);
            }
            error_response(500, "Transaction Error", &format!("Failed to execute payment transaction: {:?}", e), None)
        })?;

    Ok(json!({
        "success": true,
        "message": "Payment taken and ticket resolved",
        "ticket_number": ticket_number,
        "total_paid_cents": total_paid_cents
    }))
}

/// Refunds a payment and reopens the ticket.
///
/// # Database Interactions
/// - **`Tickets` Table**: `UpdateItem` to revert status and remove payment fields.
///
/// # Logic
/// - **State Transition**: Sets status back to "In Progress".
/// - **Data Cleanup**: Removes `paid_at` and `total_paid_cents`.
/// - **Audit**: Appends a "Payment Refunded" system comment.
/// - **Condition**: Can only refund a ticket that is currently "Resolved".
pub async fn handle_refund_payment(
    ticket_number: String,
    tech_name: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let new_status = "In Progress";
    let now_ts = Utc::now().timestamp().to_string();

    let comment = AttributeValue::M(
        vec![
            ("comment_body".to_string(), AttributeValue::S("[Payment Refunded]".to_string())),
            ("tech_name".to_string(), AttributeValue::S(format!("{} (System)", tech_name))),
            ("created_at".to_string(), AttributeValue::N(now_ts.clone()))
        ]
        .into_iter().collect()
    );

    client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET #st = :st, last_updated = :lu, comments = list_append(if_not_exists(comments, :empty), :c) REMOVE paid_at, total_paid_cents")
        .condition_expression("#st = :resolved_check")
        .expression_attribute_names("#st", "status")
        .expression_attribute_values(":st", AttributeValue::S(new_status.to_string()))
        .expression_attribute_values(":resolved_check", AttributeValue::S("Resolved".to_string()))
        .expression_attribute_values(":lu", AttributeValue::N(now_ts.clone()))
        .expression_attribute_values(":c", AttributeValue::L(vec![comment]))
        .expression_attribute_values(":empty", AttributeValue::L(vec![]))
        .send()
        .await
        .map_err(|e| {
            if let Some(service_err) = e.as_service_error() && service_err.is_conditional_check_failed_exception() {
                return error_response(400, "Bad Request", "Ticket must be Resolved to refund", None);
            }
            error_response(500, "DynamoDB Error", &format!("Failed to execute refund update: {:?}", e), None)
        })?;

    Ok(json!({
        "success": true,
        "message": "Payment refunded and ticket reopened",
        "ticket_number": ticket_number
    }))
}

fn line_items_to_comment(
    line_items: &[crate::models::LineItem],
    total_paid_cents: i64,
    tech_name: &str,
    message: &str,
) -> AttributeValue {
    let mut line_item_strings = Vec::new();
    for li in line_items {
        line_item_strings.push(format!(
            "- {}: ${:.2}",
            li.subject,
            (li.price_cents as f64) / 100.0
        ));
    }
    let total_fmt = format!("{:.2}", (total_paid_cents as f64) / 100.0);
    let receipt_body = format!(
        "{}\n{}\nTotal paid: ${}",
        message,
        line_item_strings.join("\n"),
        total_fmt
    );

    let now_ts = chrono::Utc::now().timestamp().to_string();
    AttributeValue::M(
        vec![
            (
                "comment_body".to_string(),
                AttributeValue::S(receipt_body),
            ),
            (
                "tech_name".to_string(),
                AttributeValue::S(format!("{} (System)", tech_name)),
            ),
            ("created_at".to_string(), AttributeValue::N(now_ts)),
        ]
        .into_iter()
        .collect(),
    )
}

/// Marks a ticket as "Ready" (finished working on it, still needs to be picked up) and removes line items with logging them in the comments.
///
/// # Database Interactions
/// 1. **Fetch**: Gets ticket to ensure line items exist (receipt generation).
/// 2. **Update**: `UpdateItem` to set status and generate receipt.
///
/// # Logic
/// - **Requirement**: Ticket must have line items.
/// - **Action**: Generates a zero-dollar receipt/statement, clears line items (logic moved to "Comments"), and sets status to "Ready".
pub async fn handle_dont_fix_ticket(
    ticket_number: String,
    tech_name: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    // 1. Get current ticket to get line items
    let output = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .projection_expression("line_items")
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch ticket for dont_fix: {:?}", e), None))?;

    let item = output.item.ok_or_else(|| error_response(404, "Not Found", "Ticket not found", None))?;

    let line_items_av = item.get("line_items");
    let line_items: Vec<crate::models::LineItem> = if let Some(AttributeValue::L(list)) = line_items_av {
        serde_dynamo::from_attribute_value(AttributeValue::L(list.clone())).unwrap_or_default()
    } else {
        return Err(error_response(400, "Bad Request", "Cannot mark a ticket with no line items as 'Don't Fix'", None));
    };

    let comment = line_items_to_comment(&line_items, 0, &tech_name, "[Don't fix]");

    client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET #st = :st, last_updated = :lu, comments = list_append(if_not_exists(comments, :empty), :c) REMOVE line_items")
        .expression_attribute_names("#st", "status")
        .expression_attribute_values(":st", AttributeValue::S("Ready".to_string()))
        .expression_attribute_values(":lu", AttributeValue::N(Utc::now().timestamp().to_string()))
        .expression_attribute_values(":c", AttributeValue::L(vec![comment]))
        .expression_attribute_values(":empty", AttributeValue::L(vec![]))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update ticket for dont_fix: {:?}", e), None))?;

    Ok(json!({"ticket_number": ticket_number, "status": "Ready"}))
}
