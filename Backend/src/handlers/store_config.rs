//! Store configuration handlers.
use serde_json::{json, Value};
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client,
    types::AttributeValue,
};
use crate::http::error_response;
use crate::models::{StoreConfig, UpdateStoreConfigRequest};

/// Retrieves the global store configuration (address, taxes, contact info).
///
/// # Database Interactions
/// - **`Config` Table**: Direct `GetItem` on the singleton item `pk = "config"`.
pub async fn handle_get_store_config(client: &Client) -> Result<Value, Response<Body>> {
    let output = client.get_item()
        .table_name("Config")
        .key("pk", AttributeValue::S("config".to_string()))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to get store config: {:?}", e), None))?;

    let item = match output.item {
        Some(item) => item,
        None => return Ok(json!({ "config": null })),
    };

    let config: StoreConfig = serde_dynamo::from_item(item)
        .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize store config: {:?}", e), None))?;
    
    Ok(json!({ "config": config }))
}

/// Updates the global store configuration.
///
/// # Database Interactions
/// - **`Config` Table**: `PutItem` (overwrite) on the singleton item `pk = "config"`.
pub async fn handle_update_store_config(
    req: UpdateStoreConfigRequest,
    client: &Client,
) -> Result<Value, Response<Body>> {
    client.put_item()
        .table_name("Config")
        .item("pk", AttributeValue::S("config".to_string()))
        .item("store_name", AttributeValue::S(req.store_name))
        .item("tax_rate", AttributeValue::N(req.tax_rate.to_string()))
        .item("address", AttributeValue::S(req.address))
        .item("city", AttributeValue::S(req.city))
        .item("state", AttributeValue::S(req.state))
        .item("zip", AttributeValue::S(req.zip))
        .item("phone", AttributeValue::S(req.phone))
        .item("email", AttributeValue::S(req.email))
        .item("disclaimer", AttributeValue::S(req.disclaimer))
        .send()
        .await
        .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to update store config: {:?}", e), None))?;

    Ok(json!({"status": "success"}))
}
