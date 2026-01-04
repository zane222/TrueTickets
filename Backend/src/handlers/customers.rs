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
    Customer, CustomerIdOnly, CustomerPhonesOnly, PhoneNumber
};
use crate::db_utils::DynamoDbBuilderExt;

async fn get_customers_from_ids(customer_ids: Vec<String>, client: &Client) -> Result<Value, Response<Body>> {
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
        .build()
        .map_err(|e| error_response(500, "Batch Key Builder Error", &format!("Failed to build batch get keys for customers: {:?}", e), None))?;

    let mut request_items = HashMap::new();
    request_items.insert("Customers".to_string(), ka_customers);

    let batch_output = crate::db_utils::execute_batch_get_with_retries(client, request_items).await?;

    let customers = batch_output.get("Customers").cloned().unwrap_or_else(Vec::new);
    let json_items: Vec<Customer> = serde_dynamo::from_items(customers)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer details: {:?}", e), None))?;
    Ok(json!(json_items))
}

pub async fn handle_get_customers_by_phone(phone_number: String, client: &Client) -> Result<Value, Response<Body>> {
    // First query the phone index to get customer IDs
    let index_output = client.query()
        .table_name("CustomerPhoneIndex")
        .key_condition_expression("phone_number = :p")
        .expression_attribute_values(":p", AttributeValue::S(phone_number))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to query phone index: {:?}", e), None))?;

    let items = index_output.items.unwrap_or_else(Vec::new);
    let mut customer_ids = Vec::new();
    for item in items {
        let cid: CustomerIdOnly = serde_dynamo::from_item(item)
            .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize phone number index entry: {:?}", e), None))?;
        customer_ids.push(cid.customer_id);
    }

    get_customers_from_ids(customer_ids, client).await
}

pub async fn handle_get_customer_by_id(customer_id: String, client: &Client) -> Result<Value, Response<Body>> {
    let output = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get customer: {:?}", e), None))?;

    let item = output.item
        .ok_or_else(|| error_response(404, "Customer Not Found", "No customer with that ID", None))?;

    let customer: Customer = serde_dynamo::from_item(item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer: {:?}", e), None))?;

    serde_json::to_value(&customer)
        .map_err(|e| error_response(500, "Serialization Error", &format!("Failed to serialize customer: {:?}", e), None))
}

pub async fn handle_search_customers_by_name(query: &str, client: &Client) -> Result<Value, Response<Body>> {
    let mut filter_exprs = Vec::new();
    let mut expr_vals = HashMap::new();

    for (i, word) in query.split_whitespace().map(|q| q.to_lowercase()).enumerate() {
        let key = format!(":q{}", i);
        filter_exprs.push(format!("contains(full_name_lower, {})", key));
        expr_vals.insert(key, AttributeValue::S(word));
    }

    if filter_exprs.is_empty() {
        return Ok(json!([]));
    }

    expr_vals.insert(":pk".to_string(), AttributeValue::S("ALL".to_string()));

    let filter_expression = filter_exprs.join(" AND ");

    let mut scan_builder = client.query()
        .table_name("Customers")
        .index_name("CustomerSearchIndex")
        .key_condition_expression("gsi_pk = :pk")
        .filter_expression(filter_expression)
        .scan_index_forward(false) // Newest first
        .projection_expression("customer_id");

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
            .map_err(|e| error_response(500, "Pagination Error", &format!("Failed to scan customer names: {:?}", e), None))?;

        if let Some(item) = item_opt {
             let cid: CustomerIdOnly = serde_dynamo::from_item(item)
                  .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize customer search result: {:?}", e), None))?;
             customer_ids.push(cid.customer_id);
        } else {
            break;
        }
    }

    get_customers_from_ids(customer_ids, client).await
}

pub async fn handle_create_customer(
    full_name: String,
    email: Option<String>,
    phone_numbers: Vec<PhoneNumber>,
    client: &Client,
) -> Result<Value, Response<Body>> {
    let customer_id = generate_short_id(8);
    let now = Utc::now().timestamp().to_string();

    let mut txn_items = Vec::new();

    let put_customer = Put::builder()
        .table_name("Customers")
        .condition_expression("attribute_not_exists(customer_id)")
        .item("customer_id", AttributeValue::S(customer_id.clone()))
        .item("gsi_pk", AttributeValue::S("ALL".to_string()))
        .item("full_name", AttributeValue::S(full_name.clone())) // Stored with original casing
        .item("full_name_lower", AttributeValue::S(full_name.to_lowercase())) // Lowercase for GSI search
        .item_if_not_empty("email", AttributeValue::S(email.unwrap_or_default()))
        .item("phone_numbers", AttributeValue::L(
            phone_numbers.iter().map(|p| {
                let mut map = HashMap::new();
                map.insert("number".to_string(), AttributeValue::S(p.number.clone()));
                if p.prefers_texting.unwrap_or(false) {
                    map.insert("prefers_texting".to_string(), AttributeValue::Bool(true));
                }
                if p.no_english.unwrap_or(false) {
                    map.insert("no_english".to_string(), AttributeValue::Bool(true));
                }
                AttributeValue::M(map)
            }).collect()
        ))
        .item("created_at", AttributeValue::N(now.clone()))
        .item("last_updated", AttributeValue::N(now.clone()))
        .build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer Put item: {:?}", e), None))?;

    txn_items.push(TransactWriteItem::builder().put(put_customer).build());

    for phone in &phone_numbers {
        let phone_put = Put::builder()
            .table_name("CustomerPhoneIndex")
            .item("phone_number", AttributeValue::S(phone.number.clone()))
            .item("customer_id", AttributeValue::S(customer_id.clone()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer phone Put item for {:?}: {:?}", phone.number, e), None))?;
        txn_items.push(TransactWriteItem::builder().put(phone_put).build());
    }

    client.transact_write_items()
        .set_transact_items(Some(txn_items))
        .send()
        .await
        .map_err(|e| {
            if let Some(service_err) = e.as_service_error() && service_err.is_transaction_canceled_exception() {
                return error_response(409, "Conflict", "Customer ID collision detected. This is extremely rare, but please try again.", None);
            }
            error_response(500, "Transaction Error", &format!("Failed to execute create customer transaction: {:?}", e), None)
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
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get current customer to update phones: {:?}", e), None))?;

        let old_phones: Vec<String> = if let Some(item) = current_output.item {
            let res: CustomerPhonesOnly = serde_dynamo::from_item(item)
                .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to parse current phone numbers: {:?}", e), None))?;
            res.phone_numbers.into_iter().map(|p| p.number).collect()
        } else {
            Vec::new()
        };

        let new_phone_numbers: Vec<String> = new_phones.iter().map(|p| p.number.clone()).collect();

        // Delete old phone index entries that are NOT in the new list
        for phone in &old_phones {
            if !new_phone_numbers.contains(phone) {
                let delete = Delete::builder()
                    .table_name("CustomerPhoneIndex")
                    .key("phone_number", AttributeValue::S(phone.clone()))
                    .key("customer_id", AttributeValue::S(customer_id.clone()))
                    .build()
                    .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build delete item for phone {:?}: {:?}", phone, e), None))?;
                txn_items.push(TransactWriteItem::builder().delete(delete).build());
            }
        }

        // Add new phone index entries that are NOT in the old list
        for phone in new_phones {
            if !old_phones.contains(&phone.number) {
                let put = Put::builder()
                    .table_name("CustomerPhoneIndex")
                    .item("phone_number", AttributeValue::S(phone.number.clone()))
                    .item("customer_id", AttributeValue::S(customer_id.clone()))
                    .build()
                    .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build Put item for phone {:?}: {:?}", phone.number, e), None))?;
                txn_items.push(TransactWriteItem::builder().put(put).build());
            }
        }
    }

    // 2. Update Customers (email, phones, last_updated)
    // We ALWAYS update Customers for last_updated
    let mut update_parts = vec![
        "last_updated = :lu".to_string(),
    ];
    let mut remove_parts = Vec::new();
    let mut expr_vals = HashMap::new();
    expr_vals.insert(":lu".to_string(), AttributeValue::N(Utc::now().timestamp().to_string()));

    if let Some(new_phones) = &phone_numbers {
        update_parts.push("phone_numbers = :phones".to_string());
        expr_vals.insert(":phones".to_string(), AttributeValue::L(
            new_phones.iter().map(|p| {
                let mut map = HashMap::new();
                map.insert("number".to_string(), AttributeValue::S(p.number.clone()));
                if p.prefers_texting.unwrap_or(false) {
                    map.insert("prefers_texting".to_string(), AttributeValue::Bool(true));
                }
                if p.no_english.unwrap_or(false) {
                    map.insert("no_english".to_string(), AttributeValue::Bool(true));
                }
                AttributeValue::M(map)
            }).collect()
        ));
    }

    // Handle email: None = no change, Some("") = remove, Some(value) = update
    if let Some(e) = email {
        if e.is_empty() {
            remove_parts.push("email".to_string());
        } else {
            update_parts.push("email = :e".to_string());
            expr_vals.insert(":e".to_string(), AttributeValue::S(e));
        }
    }

    // Also update full_name in Customers if it changed (original case)
    if let Some(fn_val) = full_name {
        update_parts.push("full_name = :fn".to_string());
        expr_vals.insert(":fn".to_string(), AttributeValue::S(fn_val.clone()));

        // Also update full_name_lower
        update_parts.push("full_name_lower = :fnl".to_string());
        expr_vals.insert(":fnl".to_string(), AttributeValue::S(fn_val.to_lowercase()));
    }

    // Build update expression with both SET and REMOVE clauses
    let mut update_expr_parts = Vec::new();
    if !update_parts.is_empty() {
        update_expr_parts.push(format!("SET {}", update_parts.join(", ")));
    }
    if !remove_parts.is_empty() {
        update_expr_parts.push(format!("REMOVE {}", remove_parts.join(", ")));
    }
    let update_expr = update_expr_parts.join(" ");

    let mut update_builder = aws_sdk_dynamodb::types::Update::builder()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .update_expression(update_expr);

    for (k, v) in expr_vals {
        update_builder = update_builder.expression_attribute_values(k, v);
    }

    let update = update_builder.build()
        .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build update for customer: {:?}", e), None))?;
    txn_items.push(TransactWriteItem::builder().update(update).build());

    // Execute Transaction
    client.transact_write_items()
        .set_transact_items(Some(txn_items))
        .send()
        .await
        .map_err(|e| error_response(500, "Transaction Error", &format!("Failed to execute update customer transaction: {:?}", e), None))?;

    Ok(json!({ "customer_id": customer_id }))
}
