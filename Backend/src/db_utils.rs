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

pub async fn get_wages_for_users(user_names: Vec<String>, client: &DynamoDbClient) -> HashMap<String, f64> {
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
    
    // DynamoDB BatchGetItem limit is 100 items. 
    // We'll process in chunks of 90 to be safe and simple.
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
             
             let batch_result = client.batch_get_item()
                .set_request_items(Some(map))
                .send()
                .await;

            if let Ok(output) = batch_result 
                && let Some(responses) = output.responses 
                && let Some(items) = responses.get("Config") {
                for item in items {
                    let pk = item.get("pk").and_then(|av| av.as_s().ok()).unwrap_or(&String::new()).to_string();
                    if let Some(name) = pk.strip_suffix("#wage") {
                        let wage = item.get("wage")
                            .and_then(|av| av.as_n().ok())
                            .and_then(|n| n.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        wage_map.insert(name.to_string(), wage);
                    }
                }
            }
        }
    }

    wage_map
}
