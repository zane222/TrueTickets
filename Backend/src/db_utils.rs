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
