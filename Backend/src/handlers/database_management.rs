use std::collections::HashMap;
use chrono::Utc;
use serde_json::json;
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client,
    types::{AttributeValue, Put, TransactWriteItem},
};
use crate::http::{error_response, success_response};

// --------------------------
// TICKETS
// --------------------------

fn success_response_hashmap(hash_map: HashMap<String, AttributeValue>) -> Response<Body> {
    hash_map
}

pub async fn handle_get_ticket_by_number(
    ticket_number: &str,
    client: &Client,
) -> Response<Body> {
    let res = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.to_string()))
        .send()
        .await;

    match res {
        Ok(output) => {
            if let Some(item) = output.item {
                success_response_hashmap(item)
            } else {
                error_response(404, "Ticket not found", "No ticket with that number", None)
            }
        }
        Err(e) => error_response(500, "DynamoDB error", &format!("{}", e), None),
    }
}

pub async fn handle_search_tickets_by_subject(
    query: &str,
    client: &Client,
) -> Response<Body> {
    let res = client.scan()
        .table_name("TicketSubjects")
        .filter_expression("contains(subject, :q)")
        .expression_attribute_values(":q", AttributeValue::S(query.to_string()))
        .limit(15)
        .send()
        .await;

    match res {
        Ok(output) => {
            let items = output.items.unwrap_or_default();
            success_response(items)
        }
        Err(e) => error_response(500, "DynamoDB error", &format!("{}", e), None),
    }
}

pub async fn handle_get_recent_tickets(client: &Client) -> Response<Body> {
    let res = client.query()
        .table_name("Tickets")
        .index_name("TicketNumberIndex")
        .scan_index_forward(false) // descending
        .limit(30)
        .send()
        .await;

    match res {
        Ok(output) => success_response(output.items.unwrap_or_default()),
        Err(e) => error_response(500, "DynamoDB error", &format!("{}", e), None),
    }
}

pub async fn handle_create_ticket(
    customer_id: String,
    subject: String,
    details: String,
    status: Option<String>,
    client: &Client,
) -> Response<Body> {
    // Atomically get next ticket number
    let counter_res = client.update_item()
        .table_name("Counters")
        .key("counter_name", AttributeValue::S("ticket_number".to_string()))
        .update_expression("SET counter_value = if_not_exists(counter_value, :zero) + :inc")
        .expression_attribute_values(":inc", AttributeValue::N("1".to_string()))
        .expression_attribute_values(":zero", AttributeValue::N("0".to_string()))
        .return_values(aws_sdk_dynamodb::model::ReturnValue::UpdatedNew)
        .send()
        .await;

    let ticket_number = match counter_res {
        Ok(output) => output.attributes.unwrap()["counter_value"]
            .as_n().unwrap().parse::<i64>().unwrap(),
        Err(e) => return error_response(500, "Failed to get ticket number", &format!("{}", e), None),
    };

    let now = Utc::now().to_rfc3339();

    let txn_items = vec![
        TransactWriteItem::builder()
            .put(Put::builder()
                .table_name("Tickets")
                .item("ticket_number", AttributeValue::N(ticket_number.to_string()))
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("subject", AttributeValue::S(subject.clone()))
                .item("details", AttributeValue::S(details))
                .item("status", AttributeValue::S(status.unwrap_or("open".to_string())))
                .item("last_updated", AttributeValue::S(now.clone()))
                .build())
            .build(),
        TransactWriteItem::builder()
            .put(Put::builder()
                .table_name("TicketSubjects")
                .item("ticket_number", AttributeValue::N(ticket_number.to_string()))
                .item("subject", AttributeValue::S(subject))
                .build())
            .build()
    ];

    let txn_res = client.transact_write_items()
        .transact_items(txn_items)
        .send()
        .await;

    match txn_res {
        Ok(_) => success_response(json!({ "ticket_number": ticket_number })),
        Err(e) => error_response(500, "Failed to create ticket", &format!("{}", e), None),
    }
}

pub async fn handle_update_ticket(
    ticket_number: String,
    subject: Option<String>,
    details: Option<String>,
    status: Option<String>,
    client: &Client,
) -> Response<Body> {
    let mut update_expr = Vec::new();
    let mut expr_vals = std::collections::HashMap::new();

    if let Some(s) = subject {
        update_expr.push("subject = :s".to_string());
        expr_vals.insert(":s".to_string(), AttributeValue::S(s));
    }
    if let Some(d) = details {
        update_expr.push("details = :d".to_string());
        expr_vals.insert(":d".to_string(), AttributeValue::S(d));
    }
    if let Some(st) = status {
        update_expr.push("status = :st".to_string());
        expr_vals.insert(":st".to_string(), AttributeValue::S(st));
    }

    update_expr.push("last_updated = :lu".to_string());
    expr_vals.insert(":lu".to_string(), AttributeValue::S(Utc::now().to_rfc3339()));

    let update_expr = format!("SET {}", update_expr.join(", "));

    let res = client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression(update_expr)
        .set_expression_attribute_values(Some(expr_vals))
        .send()
        .await;

    match res {
        Ok(_) => success_response(json!({"ticket_number": ticket_number})),
        Err(e) => error_response(500, "Failed to update ticket", &format!("{}", e), None),
    }
}

pub async fn handle_add_ticket_comment(
    ticket_number: String,
    comment_body: String,
    tech_name: String,
    client: &Client,
) -> Response<Body> {
    let comment = AttributeValue::M(
        vec![
            ("comment_body".to_string(), AttributeValue::S(comment_body)),
            ("tech_name".to_string(), AttributeValue::S(tech_name)),
            ("created_at".to_string(), AttributeValue::S(Utc::now().to_rfc3339())),
        ]
        .into_iter().collect()
    );

    let res = client.update_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .update_expression("SET comments = list_append(if_not_exists(comments, :empty), :c), last_updated = :lu")
        .expression_attribute_values(":c", AttributeValue::L(vec![comment]))
        .expression_attribute_values(":empty", AttributeValue::L(vec![]))
        .expression_attribute_values(":lu", AttributeValue::S(Utc::now().to_rfc3339()))
        .send()
        .await;

    match res {
        Ok(_) => success_response(json!({"ticket_number": ticket_number})),
        Err(e) => error_response(500, "Failed to add comment", &format!("{}", e), None),
    }
}

pub async fn handle_get_ticket_last_updated(ticket_number: String, client: &Client) -> Response<Body> {
    let res = client.get_item()
        .table_name("Tickets")
        .key("ticket_number", AttributeValue::N(ticket_number.clone()))
        .projection_expression("last_updated")
        .send()
        .await;

    match res {
        Ok(output) => success_response(output.item.unwrap_or_default()),
        Err(e) => error_response(500, "Failed to get ticket last_updated", &format!("{}", e), None),
    }
}

// --------------------------
// CUSTOMERS
// --------------------------

pub async fn handle_get_customers_by_phone(phone_number: String, client: &Client) -> Response<Body> {
    let res = client.query()
        .table_name("CustomerPhoneIndex")
        .key_condition_expression("phone_number = :p")
        .expression_attribute_values(":p", AttributeValue::S(phone_number))
        .send()
        .await;

    match res {
        Ok(output) => success_response(output.items.unwrap_or_default()),
        Err(e) => error_response(500, "Failed to get customers", &format!("{}", e), None),
    }
}

pub async fn handle_create_customer(
    full_name: String,
    phone_numbers: Vec<String>,
    client: &Client,
) -> Response<Body> {
    let customer_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let mut txn_items = vec![
        TransactWriteItem::builder()
            .put(Put::builder()
                .table_name("Customers")
                .item("customer_id", AttributeValue::S(customer_id.clone()))
                .item("full_name", AttributeValue::S(full_name.clone()))
                .item("primary_phone", AttributeValue::S(phone_numbers[0].clone()))
                .item("phone_numbers", AttributeValue::L(phone_numbers.iter().map(|p| AttributeValue::S(p.clone())).collect()))
                .item("last_updated", AttributeValue::S(now.clone()))
                .build())
            .build()
    ];

    for phone in &phone_numbers {
        let phone_put = Put::builder()
            .table_name("CustomerPhoneIndex")
            .item("phone_number", AttributeValue::S(phone.clone()))
            .item("customer_id", AttributeValue::S(customer_id.clone()))
            .build();
        txn_items.push(TransactWriteItem::builder().put(phone_put).build());
    }

    let txn_res = client.transact_write_items()
        .transact_items(txn_items)
        .send()
        .await;

    match txn_res {
        Ok(_) => success_response(json!({ "customer_id": customer_id })),
        Err(e) => error_response(500, "Failed to create customer", &format!("{}", e), None),
    }
}

pub async fn handle_update_customer(
    customer_id: String,
    full_name: Option<String>,
    phone_numbers: Option<Vec<String>>,
    client: &Client,
) -> Response<Body> {
    let mut update_expr = Vec::new();
    let mut expr_vals = std::collections::HashMap::new();

    if let Some(fn_val) = full_name {
        update_expr.push("full_name = :fn".to_string());
        expr_vals.insert(":fn".to_string(), AttributeValue::S(fn_val));
    }

    if let Some(pn) = phone_numbers {
        update_expr.push("phone_numbers = :phones".to_string());
        update_expr.push("primary_phone = :pp".to_string());
        expr_vals.insert(":phones".to_string(), AttributeValue::L(pn.iter().map(|p| AttributeValue::S(p.clone())).collect()));
        expr_vals.insert(":pp".to_string(), AttributeValue::S(pn[0].clone()));
    }

    update_expr.push("last_updated = :lu".to_string());
    expr_vals.insert(":lu".to_string(), AttributeValue::S(Utc::now().to_rfc3339()));

    let update_expr = format!("SET {}", update_expr.join(", "));

    let res = client.update_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .update_expression(update_expr)
        .set_expression_attribute_values(Some(expr_vals))
        .send()
        .await;

    match res {
        Ok(_) => success_response(json!({ "customer_id": customer_id })),
        Err(e) => error_response(500, "Failed to update customer", &format!("{}", e), None),
    }
}

pub async fn handle_get_customer_last_updated(customer_id: String, client: &Client) -> Response<Body> {
    let res = client.get_item()
        .table_name("Customers")
        .key("customer_id", AttributeValue::S(customer_id.clone()))
        .projection_expression("last_updated")
        .send()
        .await;

    match res {
        Ok(output) => success_response(output.item.unwrap_or_default()),
        Err(e) => error_response(500, "Failed to get customer last_updated", &format!("{}", e), None),
    }
}
