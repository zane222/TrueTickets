use chrono::Utc;
use serde_json::{json, Value};
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client,
    types::{AttributeValue, Put, Delete, TransactWriteItem, KeysAndAttributes},
};
use std::collections::HashMap;
use crate::http::{error_response, generate_short_id};
use crate::models::{
    Customer, CustomerIdOnly, TicketLastUpdated, CustomerPhonesOnly, PhoneNumber
};

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

    if let Some(unprocessed) = &batch_output.unprocessed_keys {
        if !unprocessed.is_empty() {
            return Err(error_response(530, "Partial Batch Success", "Some customer details could not be retrieved due to DynamoDB throughput limits. Please retry.", Some("Retry the request")));
        }
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
    let mut filter_exprs = Vec::new();
    let mut expr_vals = HashMap::new();

    for (i, word) in query.split_whitespace().map(|q| q.to_lowercase()).enumerate() {
        let key = format!(":q{}", i);
        filter_exprs.push(format!("contains(full_name_lc, {})", key));
        expr_vals.insert(key, AttributeValue::S(word));
    }

    if filter_exprs.is_empty() {
        return Ok(json!([]));
    }

    let filter_expression = filter_exprs.join(" AND ");

    let mut scan_builder = client.scan()
        .table_name("CustomerNames")
        .filter_expression(filter_expression);

    for (k, v) in expr_vals {
        scan_builder = scan_builder.expression_attribute_values(k, v);
    }

    let mut paginator = scan_builder
        .into_paginator()
        .items()
        .send();

    let mut customer_ids: Vec<String> = Vec::new();

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

    if let Some(unprocessed) = &batch_output.unprocessed_keys {
        if !unprocessed.is_empty() {
            return Err(error_response(503, "Partial Batch Success", "Some customer details could not be retrieved due to DynamoDB throughput limits. Please retry.", Some("Retry the search")));
        }
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

    let mut txn_items = Vec::new();

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

    txn_items.push(TransactWriteItem::builder().put(put_customer).build());

    let put_name = Put::builder()
        .table_name("CustomerNames")
        .item("customer_id", AttributeValue::S(customer_id.clone()))
        .item("full_name_lc", AttributeValue::S(full_name.to_lowercase())) // Lowercase for search
        .build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer name Put item: {}", e), None))?;

    txn_items.push(TransactWriteItem::builder().put(put_name).build());

    for phone in &phone_numbers {
        let phone_put = Put::builder()
            .table_name("CustomerPhoneIndex")
            .item("phone_number", AttributeValue::S(phone.number.clone()))
            .item("customer_id", AttributeValue::S(customer_id.clone()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer phone Put item for {}: {}", phone.number, e), None))?;
        txn_items.push(TransactWriteItem::builder().put(phone_put).build());
    }

    client.transact_write_items()
        .set_transact_items(Some(txn_items))
        .send()
        .await
        .map_err(|e| {
            if let Some(service_err) = e.as_service_error() {
                if service_err.is_transaction_canceled_exception() {
                    return error_response(409, "Conflict", "Customer ID collision detected. This is extremely rare, but please try again.", None);
                }
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
    let mut txn_items = Vec::new();

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
            txn_items.push(TransactWriteItem::builder().delete(delete).build());
        }

        // Add new phone index entries
        for phone in new_phones {
            let put = Put::builder()
                .table_name("CustomerPhoneIndex")
                .item("phone_number", AttributeValue::S(phone.number.clone()))
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .build()
                .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build Put item for phone {}: {}", phone.number, e), None))?;
            txn_items.push(TransactWriteItem::builder().put(put).build());
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
        txn_items.push(TransactWriteItem::builder().update(update).build());
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
    txn_items.push(TransactWriteItem::builder().update(update).build());

    // Execute Transaction
    client.transact_write_items()
        .set_transact_items(Some(txn_items))
        .send()
        .await
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
