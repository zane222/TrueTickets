use serde_json::{json, Value};
use aws_sdk_dynamodb::{
    Client,
    types::{AttributeValue, Put},
};
use lambda_http::{Body, Response};
use crate::http::error_response;
use crate::models::{MonthPurchases, PurchaseItem, TimeEntry, TicketWithoutCustomer};

// Helper: Calculate revenue from tickets
// We scan tickets for the month (created_at or last_updated? "Revenue" usually means when money is received).
// For simplicity, we'll sum up "price" from line items of Resolved tickets in that month.
// Or if the user wants "this month's revenue", maybe by completion date.
// For now, let's just Scan tickets with status="Resolved" and calculate total.
// To filter by month, we'd ideally have a GSI on date.
// Given the low volume (placeholder was 20 items), a Scan with filter is fine.
async fn calculate_revenue(
    year: i32,
    month: u32,
    client: &Client,
) -> Result<f64, String> {
    // Start/End timestamps for the month
    // Note: chrono dependency is available in project
    use chrono::{TimeZone, Utc};
    
    let start_of_month = Utc.with_ymd_and_hms(year, month, 1, 0, 0, 0).unwrap();
    let next_month = if month == 12 { 1 } else { month + 1 };
    let next_year = if month == 12 { year + 1 } else { year };
    let start_of_next_month = Utc.with_ymd_and_hms(next_year, next_month, 1, 0, 0, 0).unwrap();
    
    let start_ts = start_of_month.timestamp();
    let end_ts = start_of_next_month.timestamp();

    // Query/Scan tickets.
    // Since we don't have a DATE index that is global, we might rely on the fact that ticket numbers are roughly chronological,
    // or just Scan.
    // Let's Scan Tickets where status = 'Resolved' and last_updated between start_ts and end_ts.
    // (Assuming revenue is recognized when ticket is resolved/picked up).
    
    let mut revenue: f64 = 0.0;
    let mut last_evaluated_key = None;

    loop {
        let mut scan_builder = client.scan()
            .table_name("Tickets")
            .filter_expression("#st = :resolved AND last_updated BETWEEN :start AND :end")
            .expression_attribute_names("#st", "status") // status is reserved
            .expression_attribute_values(":resolved", AttributeValue::S("Resolved".to_string()))
            .expression_attribute_values(":start", AttributeValue::N(start_ts.to_string()))
            .expression_attribute_values(":end", AttributeValue::N(end_ts.to_string()));

        if let Some(key) = last_evaluated_key {
            scan_builder = scan_builder.set_exclusive_start_key(Some(key));
        }

        let output = scan_builder.send().await.map_err(|e| format!("{:?}", e))?;

        if let Some(items) = output.items {
            for item in items {
                // Parse ticket to get line items
                let ticket: Result<TicketWithoutCustomer, _> = serde_dynamo::from_item(item.clone());
                 if let Ok(t) = ticket {
                     // Check line_items
                     if let Some(lis) = t.line_items {
                         for li in lis {
                             revenue += li.price;
                         }
                     }
                 }
            }
        }

        last_evaluated_key = output.last_evaluated_key;
        if last_evaluated_key.is_none() {
            break;
        }
    }
    
    Ok(revenue)
}

pub async fn get_revenue_payroll_and_purchases(
    year: i32,
    month: u32,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let month_year_pk = format!("{:04}-{:02}", year, month);

    // 1. Get Revenue
    let revenue_val = calculate_revenue(year, month, client).await.unwrap_or(0.0);
    // Create a dummy single entry for revenue to match frontend expectation (list of objects)
    let revenue_list = json!([{
        "ticket": { "subject": "Monthly Service Revenue", "ticket_number": 0 }, // Placeholder structure
        "amount": revenue_val
    }]);

    // 2. Get Purchases
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

    // 3. Get Payroll / Clock Logs
    // Query TimeEntries with PK = YYYY-MM
    let time_output = client.query()
        .table_name("TimeEntries")
        .key_condition_expression("month_year = :pk")
        .expression_attribute_values(":pk", AttributeValue::S(month_year_pk.clone()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch time entries: {:?}", e), None))?;

    let entries: Vec<TimeEntry> = serde_dynamo::from_items(time_output.items.unwrap_or_default())
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize time entries: {:?}", e), None))?;

    // Group by user and calculate hours
    // This is a naive calculation: sum(out_time) - sum(in_time).
    // Assumes paired in/out. If missing out, ignore last in? Or just simple diff.
    // Better: Sort by user, then time. Iterate.
    
    use std::collections::HashMap;
    let mut user_hours: HashMap<String, f64> = HashMap::new();
    
    // Sort entries by timestamp
    let mut sorted_entries = entries.clone(); // Clone for payroll calculation
    sorted_entries.sort_by_key(|e| e.timestamp);
    
    // Group by user
    let mut user_logs: HashMap<String, Vec<TimeEntry>> = HashMap::new();
    for e in sorted_entries {
        user_logs.entry(e.user_name.clone()).or_default().push(e);
    }
    
    for (user, logs) in user_logs {
        let mut total_seconds: i64 = 0;
        let mut last_in: Option<i64> = None;
        
        for log in logs {
            if !log.is_clock_out {
                last_in = Some(log.timestamp);
            } else if let Some(in_ts) = last_in {
                total_seconds += log.timestamp - in_ts;
                last_in = None;
            }
        }
        
        // Convert to hours
        let hours = total_seconds as f64 / 3600.0;
        user_hours.insert(user, hours);
    }

    // Convert to response format
    // Fetch wages for all users found in entries
    let user_names: Vec<String> = user_hours.keys().cloned().collect();
    let wage_map = crate::db_utils::get_wages_for_users(user_names, client).await;

    let payroll_list: Vec<Value> = user_hours.into_iter().map(|(name, hours)| {
        let wage = wage_map.get(&name).copied().unwrap_or(0.0);
        json!({
            "name": name,
            "amount": (hours * wage * 100.0).round() / 100.0, // Cost
            "hours": (hours * 100.0).round() / 100.0
        })
    }).collect();

    Ok(json!({
        "all_revenue": revenue_list,
        "employees_payroll": payroll_list,
        "purchases": purchases_list
    }))
}

pub async fn update_purchases(
    year: i32,
    month: u32,
    body: Value,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let month_year_pk = format!("{:04}-{:02}", year, month);

    // Body is expected to be { "items": [...] } or just the array directly? 
    // The previous code returned "success", so we assume frontend sends the updated list or a wrapped object.
    // Let's assume body IS the list of items or contains "purchases".
    // Financials code usually sends `purchases` as an array.
    
    let items_array = if let Some(arr) = body.get("purchases").and_then(|v| v.as_array()) {
        arr
    } else if let Some(arr) = body.as_array() {
        arr
    } else {
        return Err(error_response(400, "Invalid Request", "Expected array of purchases", None));
    };

    let items: Vec<PurchaseItem> = serde_json::from_value(Value::Array(items_array.clone()))
        .map_err(|e| error_response(400, "Deserialization Error", &format!("Failed to parse purchases: {:?}", e), None))?;

    let month_purchases = MonthPurchases {
        month_year: month_year_pk.clone(),
        items,
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

pub async fn handle_get_clock_logs(
    year: i32,
    month: u32,
    client: &Client,
) -> Result<Value, Response<Body>> {


    // Similar to payroll calculation but returns raw logs formatted for calendar
    let month_year_pk = format!("{:04}-{:02}", year, month);
    
    let time_output = client.query()
        .table_name("TimeEntries")
        .key_condition_expression("month_year = :pk")
        .expression_attribute_values(":pk", AttributeValue::S(month_year_pk))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch time entries: {:?}", e), None))?;

    let entries: Vec<TimeEntry> = serde_dynamo::from_items(time_output.items.unwrap_or_default())
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize time entries: {:?}", e), None))?;

    // Collect unique usernames
    let user_name_list: Vec<String> = entries.iter().map(|e| e.user_name.clone()).collect();
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
        let wage = wage_map.get(&name).copied().unwrap_or(0.0);
        json!({
            "name": name,
            "wage": wage
        })
    }).collect();

    Ok(json!({
        "clock_logs": logs,
        "wages": wages_list
    }))
}

pub async fn handle_clock_in(
    given_name: String,
    client: &Client,
) -> Result<Value, Response<Body>> {
    use chrono::{Utc, Datelike};

    let now = Utc::now();
    let timestamp = now.timestamp();
    let year = now.year();
    let month = now.month();
    let month_year_pk = format!("{:04}-{:02}", year, month);

    let clocked_in_pk = format!("{}#is_clocked_in", given_name);

    // 1. Get Config to check status
    // Consistent read is good, but the ConditionExpression is the real guard.
    let config_output = client.get_item()
        .table_name("Config")
        .key("pk", AttributeValue::S(clocked_in_pk.clone()))
        .consistent_read(true)
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to fetch status: {:?}", e), None))?;

    let is_currently_clocked_in = if let Some(item) = config_output.item {
        *item.get("clocked_in").and_then(|av| av.as_bool().ok()).unwrap_or(&false)
    } else {
        false
    };
    
    // If currently In, we want to perform CLOCK OUT action.
    let is_clock_out = is_currently_clocked_in; 
    let action_str = if is_clock_out { "Clocked Out" } else { "Clocked In" };
    let new_status = !is_currently_clocked_in;

    // 2. Prepare TimeEntry
    let entry_id = format!("{}#{}", given_name, timestamp);
    let time_entry = TimeEntry {
        month_year: month_year_pk,
        entry_id,
        user_name: given_name.clone(),
        timestamp,
        is_clock_out,
    };

    let entry_item = serde_dynamo::to_item(&time_entry)
        .map_err(|_e| error_response(500, "Serialization Error", "Failed to serialize time entry", None))?;

    // 3. Prepare Config Update (Put with Condition)
    // We always PUT now (store bool), never Delete.
    let put_config_builder = Put::builder()
        .table_name("Config")
        .item("pk", AttributeValue::S(clocked_in_pk))
        .item("clocked_in", AttributeValue::Bool(new_status))
        .item("last_updated", AttributeValue::N(timestamp.to_string()));

    let put_config = if is_currently_clocked_in {
        // Condition: Must be currently true
        put_config_builder
            .condition_expression("clocked_in = :true")
            .expression_attribute_values(":true", AttributeValue::Bool(true))
            .build()
    } else {
        // Condition: Must be currently false OR not exist
        put_config_builder
            .condition_expression("clocked_in = :false OR attribute_not_exists(clocked_in)")
            .expression_attribute_values(":false", AttributeValue::Bool(false))
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
            "message": format!("Successfully {} for {}", action_str, given_name),
            "clocked_in": new_status,
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

pub async fn handle_am_i_clocked_in(
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

pub async fn handle_update_user_wage(
    given_name: String,
    wage: f64,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let wage_pk = format!("{}#wage", given_name);

    client.put_item()
        .table_name("Config")
        .item("pk", AttributeValue::S(wage_pk))
        .item("wage", AttributeValue::N(wage.to_string()))
        .item("last_updated", AttributeValue::N(chrono::Utc::now().timestamp().to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update wage: {:?}", e), None))?;

    Ok(json!({
        "message": format!("Successfully updated wage for {}", given_name),
        "wage": wage
    }))
}

