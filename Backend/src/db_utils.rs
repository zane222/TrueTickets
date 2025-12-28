use aws_sdk_dynamodb::{
    types::AttributeValue,
    operation::put_item::builders::PutItemInputBuilder,
    types::builders::PutBuilder,
};

pub trait DynamoDbBuilderExt {
    fn item_if_some(self, key: impl Into<String>, value: Option<AttributeValue>) -> Self;
}

impl DynamoDbBuilderExt for PutBuilder {
    fn item_if_some(self, key: impl Into<String>, value: Option<AttributeValue>) -> Self {
        if let Some(v) = value {
            self.item(key, v)
        } else {
            self
        }
    }
}

// Note: PutItemInputBuilder is the builder for client.put_item()
// PutBuilder is the builder used within transactions (Put::builder())
impl DynamoDbBuilderExt for PutItemInputBuilder {
    fn item_if_some(self, key: impl Into<String>, value: Option<AttributeValue>) -> Self {
        if let Some(v) = value {
            self.item(key, v)
        } else {
            self
        }
    }
}
