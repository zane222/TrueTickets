//! Shared database utilities and helper traits.
use aws_sdk_dynamodb::{
    types::AttributeValue,
    operation::put_item::builders::PutItemInputBuilder,
    types::builders::PutBuilder,
};

pub trait DynamoDbBuilderExt {
    fn item_if_not_empty(self, key: impl Into<String>, value: AttributeValue) -> Self;
}

fn av_is_empty(value: &AttributeValue) -> bool {
    match value {
        AttributeValue::S(s) => s.is_empty(),
        AttributeValue::L(l) => l.is_empty(),
        AttributeValue::M(m) => m.is_empty(),
        AttributeValue::Ss(ss) => ss.is_empty(),
        AttributeValue::Ns(ns) => ns.is_empty(),
        AttributeValue::Bs(bs) => bs.is_empty(),
        _ => false,
    }
}

impl DynamoDbBuilderExt for PutBuilder {

    fn item_if_not_empty(self, key: impl Into<String>, value: AttributeValue) -> Self {
        if !av_is_empty(&value) {
            self.item(key, value)
        } else {
            self
        }
    }
}

// Note: PutItemInputBuilder is the builder for client.put_item()
// PutBuilder is the builder used within transactions (Put::builder())
impl DynamoDbBuilderExt for PutItemInputBuilder {

    fn item_if_not_empty(self, key: impl Into<String>, value: AttributeValue) -> Self {
        if !av_is_empty(&value) {
            self.item(key, value)
        } else {
            self
        }
    }
}

use aws_sdk_dynamodb::Client as DynamoDbClient;
use std::collections::HashMap;

/// Fetches the hourly wage (in cents) for a list of users.
///
/// # Database Interactions
/// - **`Config` Table (Batch Get)**: Efficiently retrieves multiple items where `pk = "[User]#wage"`.
///
/// # Logic
/// - **Chunking**: Splits the request into chunks of 90 (DynamoDB limit is 100) to ensure reliable batch processing.
/// - **Deduplication**: Removes duplicate user names to avoid wasting database IO.
/// - **Defaults**: Returns 0 cents if no wage record is found for a user.
pub async fn get_wages_for_users(user_names: Vec<String>, client: &DynamoDbClient) -> HashMap<String, i64> {
    if user_names.is_empty() {
        return HashMap::new();
    }

    use aws_sdk_dynamodb::types::{KeysAndAttributes, AttributeValue};

    // Deduplicate names
    let unique_names: Vec<String> = {
        let mut n = user_names;
        n.sort();
        n.dedup();
        n
    };

    let mut wage_map = HashMap::new();
    
    for chunk in unique_names.chunks(90) {
        let mut keys = vec![];
        for name in chunk {
            let mut key_map = HashMap::new();
            key_map.insert("pk".to_string(), AttributeValue::S(format!("{}#wage", name)));
            keys.push(key_map);
        }

        let keys_and_attrs = KeysAndAttributes::builder().set_keys(Some(keys)).build();
        
        if let Ok(ka) = keys_and_attrs {
             let mut map = HashMap::new();
             map.insert("Config".to_string(), ka);
             
             let batch_result = execute_batch_get_with_retries(client, map).await;

            if let Ok(responses) = batch_result 
                && let Some(items) = responses.get("Config") {
                for item in items {
                    let pk = item.get("pk").and_then(|av| av.as_s().ok()).unwrap_or(&String::new()).to_string();
                    if let Some(name) = pk.strip_suffix("#wage") {
                        let cents = item.get("wage_cents")
                            .and_then(|av| av.as_n().ok())
                            .and_then(|n| n.parse::<i64>().ok())
                            .unwrap_or(0);
                        wage_map.insert(name.to_string(), cents);
                    }
                }
            }
        }
    }

    wage_map
}

use lambda_http::{Body, Response};
use crate::http::error_response;

/// Executes a `BatchGetItem` request with automatic retries for unprocessed keys.
///
/// # Logic
/// - **Exponential Backoff**: Waits exponentially longer (100ms, 200ms...) between retries to respect DynamoDB throttling.
/// - **Unprocessed Keys**: Automatically re-queues any keys that DynamoDB couldn't process in the initial batch.
/// - **Accumulation**: Merges results from all retry attempts into a single response map.
pub async fn execute_batch_get_with_retries(
    client: &DynamoDbClient,
    request_items: HashMap<String, aws_sdk_dynamodb::types::KeysAndAttributes>,
) -> Result<HashMap<String, Vec<HashMap<String, AttributeValue>>>, Response<Body>> {
    let mut accumulated_responses: HashMap<String, Vec<HashMap<String, AttributeValue>>> = HashMap::new();
    let mut current_request_items = request_items;
    let mut attempts = 0;
    const MAX_RETRIES: u32 = 5;

    loop {
        attempts += 1;
        let output = client.batch_get_item()
            .set_request_items(Some(current_request_items.clone()))
            .send()
            .await
            .map_err(|e| error_response(500, "DynamoDB Error", &format!("Failed to batch get items: {:?}", e), None))?;

        // Merge successful responses
        if let Some(responses) = output.responses {
            for (table_name, items) in responses {
                let entry = accumulated_responses.entry(table_name).or_default();
                entry.extend(items);
            }
        }

        // Check for unprocessed keys
        let unprocessed = output.unprocessed_keys.unwrap_or_default();
        if unprocessed.is_empty() {
            break;
        }

        if attempts >= MAX_RETRIES {
            return Err(error_response(503, "Service Unavailable", "Exceeded max retries for batch operation. DynamoDB might be throttled.", Some("Please try again later.")));
        }
        
        // Wait with strict exponential backoff
        tokio::time::sleep(std::time::Duration::from_millis(100 * (2_u64.pow(attempts)))).await;
        
        current_request_items = unprocessed;
    }

    Ok(accumulated_responses)
}
