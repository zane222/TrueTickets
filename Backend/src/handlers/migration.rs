use chrono::Utc;
use serde_json::{json, Value};
use lambda_http::{Body, Response};
use aws_sdk_dynamodb::{
    Client as DynamoDbClient,
    types::{AttributeValue, Put, TransactWriteItem},
};
use aws_sdk_s3::Client as S3Client;
use aws_sdk_s3::primitives::ByteStream;
use serde::Deserialize;
use crate::http::{error_response, generate_short_id};
use crate::models::{Comment, PhoneNumber};

// Structures matching the LargeTicket API response

#[derive(Debug, Deserialize)]
struct LargeTicket {
    number: i64,
    subject: String,
    status: String,
    created_at: String,
    customer_id: i64,
    updated_at: String,
    properties: TicketProperties,
    ticket_type_id: Option<i64>,
    ticket_fields: Vec<TicketField>,
    comments: Vec<ApiComment>,
    attachments: Vec<ApiAttachment>,
    customer: ApiCustomer,
}

#[derive(Debug, Deserialize)]
struct TicketProperties {
    #[serde(rename = "Password")]
    password: Option<String>,
    #[serde(rename = "Password (type \"none\" if no password)")]
    password_alt: Option<String>,
    #[serde(rename = "passwordForPhone")]
    password_for_phone: Option<String>,
    #[serde(rename = "AC Charger")]
    ac_charger: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TicketField {
    ticket_type_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ApiComment {
    body: String,
    tech: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct ApiAttachment {
    file: AttachmentFile,
}

#[derive(Debug, Deserialize)]
struct AttachmentFile {
    url: String,
}

#[derive(Debug, Deserialize)]
struct ApiCustomer {
    business_and_full_name: String,
    email: Option<String>,
    phone: Option<String>,
    created_at: String,
    updated_at: Option<String>,
}

/// Parse ISO 8601 timestamp to Unix timestamp
fn parse_timestamp(iso_string: &str) -> Result<i64, Response<Body>> {
    chrono::DateTime::parse_from_rfc3339(iso_string)
        .map(|dt| dt.timestamp())
        .map_err(|e| error_response(500, "Timestamp Parse Error", &format!("Failed to parse timestamp '{}': {}", iso_string, e), None))
}

/// Extract password from ticket using the same logic as apiReference.ts
fn extract_password(ticket: &LargeTicket) -> String {
    let type_id = ticket.ticket_fields.first()
        .and_then(|f| f.ticket_type_id)
        .or(ticket.ticket_type_id);

    let invalid_values = ["n", "na", "n/a", "none"];
    let normalize = |s: &str| s.to_lowercase().trim().to_string();

    if let Some(tid) = type_id {
        if tid == 9818 || tid == 9836 {
            if let Some(pw) = &ticket.properties.password {
                let normalized = normalize(pw);
                if !normalized.is_empty() && !invalid_values.contains(&normalized.as_str()) {
                    return pw.clone();
                }
            }
        } else if tid == 9801 {
            if let Some(pw) = &ticket.properties.password_for_phone {
                let normalized = normalize(pw);
                if !normalized.is_empty() && !invalid_values.contains(&normalized.as_str()) {
                    return pw.clone();
                }
            }
        }
    }

    if let Some(pw) = &ticket.properties.password_alt {
        let normalized = normalize(pw);
        if !normalized.is_empty() && !invalid_values.contains(&normalized.as_str()) {
            return pw.clone();
        }
    }

    String::new()
}

/// Check if AC Charger should be added to items_left
fn check_ac_charger(ticket: &LargeTicket) -> Vec<String> {
    let mut items_left = Vec::new();
    if let Some(ac_charger) = &ticket.properties.ac_charger {
        let normalized = ac_charger.to_lowercase().trim().to_string();
        if normalized == "true" || normalized == "yes" || normalized == "1" {
            items_left.push("AC Charger".to_string());
        }
    }
    items_left
}

/// Get device type from subject text based on keywords
fn get_device_type_from_subject(subject_text: &str) -> String {
    let subject_lower = subject_text.to_lowercase();
    let words: Vec<&str> = subject_lower.split_whitespace().collect();

    // Hashmap of keywords to device types
    // Using a simple match or if/else chain might be cleaner given we reconstruct the map every time otherwise
    // But for direct port of user logic:

    for word in words {
        match word {
            // Phone keywords
            "iphone" | "iph" | "ip" | "galaxy" | "pixel" | "oneplus" | "samsung" | "huawei" | "phone" | "moto" => return "Phone".to_string(),
            // Tablet keywords
            "ipad" | "tablet" | "kindle" | "tab" => return "Tablet".to_string(),
            // Laptop keywords
            "laptop" | "macbook" | "thinkpad" | "elitebook" | "chromebook" | "inspiron" | "predator" | "latitude" | "ltop" => return "Laptop".to_string(),
            // Desktop keywords
            "desktop" | "dtop" | "pc" | "tower" | "omen" => return "Desktop".to_string(),
            // Watch keywords
            "watch" | "smartwatch" => return "Watch".to_string(),
            // Console keywords
            "playstation" | "xbox" | "nintendo" | "switch" | "ps6" | "ps5" | "ps4" | "console" | "controller" => return "Console".to_string(),
            _ => continue,
        }
    }

    "Other".to_string()
}

/// Convert external API status to internal status
fn convert_status(status: &str) -> String {
    match status {
        "New" => "Diagnosing",
        "Scheduled" => "Finding Price",
        "Call Customer" => "Approval Needed",
        "Waiting for Parts" => "Waiting for Parts",
        "Waiting on Customer" => "Waiting (Other)",
        "In Progress" => "In Progress",
        "Customer Reply" => "Ready",
        "Ready!" => "Ready",
        "Resolved" => "Resolved",
        _ => "Other",
    }.to_string()
}

/// Download file from URL and upload to S3
async fn download_and_upload_attachment(
    url: &str,
    ticket_number: i64,
    s3_client: &S3Client,
) -> Result<String, Response<Body>> {
    // Normalize URL (replace Unicode ampersand escapes if present)
    let normalized_url = url.replace("\\u0026", "&");

    let client = reqwest::Client::new();
    let response = client
        .get(&normalized_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| error_response(500, "Download Failed", &format!("Failed to download attachment from {}: {}", url, e), None))?;

    let file_bytes = response.bytes()
        .await
        .map_err(|e| error_response(500, "Download Failed", &format!("Failed to read attachment bytes: {}", e), None))?;

    let bucket_name = std::env::var("S3_BUCKET_NAME")
        .map_err(|_| error_response(500, "Configuration Error", "S3_BUCKET_NAME environment variable not set", None))?;

    let timestamp = Utc::now().timestamp();
    let file_id = generate_short_id(4);
    let s3_key = format!("attachments/{}/{}_{}", ticket_number, timestamp, file_id);

    let byte_stream = ByteStream::from(file_bytes);
    s3_client
        .put_object()
        .bucket(&bucket_name)
        .key(&s3_key)
        .body(byte_stream)
        .send()
        .await
        .map_err(|e| error_response(500, "S3 Upload Failed", &format!("Failed to upload attachment to S3: {}", e), Some("Check that the Lambda has S3 permissions and the bucket exists")))?;

    Ok(format!("https://{}.s3.amazonaws.com/{}", bucket_name, s3_key))
}

/// Main migration handler
pub async fn handle_migrate_tickets(
    latest_ticket_number: i64,
    count: i64,
    api_key: String,
    db_client: &DynamoDbClient,
    s3_client: &S3Client,
) -> Result<Value, Response<Body>> {
    let mut migrated_count = 0;

    let http_client = reqwest::Client::new();

    if count > 5 {
        return Err(error_response(500, "Count too large", "Count must be less than or equal to 5", None));
    }
    for i in 0..count {
        let current_ticket_number = latest_ticket_number - i;
        let api_url = format!("my.link/tickets?number={}", current_ticket_number);

        let response = http_client
            .get(&api_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            )
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await
            .map_err(|e| error_response(500, "API Request Failed", &format!("Failed to fetch ticket {}: {}", current_ticket_number, e), None))?;

        if !response.status().is_success() {
             return Err(error_response(500, "API Error", &format!("API returned status {} for ticket {}", response.status(), current_ticket_number), None));
        }

        let root: serde_json::Value = response.json()
            .await
            .map_err(|e| error_response(500, "JSON Parse Error", &format!("Failed to parse JSON for ticket {}: {}", current_ticket_number, e), None))?;

        let ticket_value = root.get("ticket")
            .ok_or_else(|| error_response(500, "Missing Field", &format!("Response for ticket {} is missing 'ticket' field", current_ticket_number), None))?;

        let ticket: LargeTicket = serde_json::from_value(ticket_value.clone())
            .map_err(|e| error_response(500, "Deserialization Error", &format!("Failed to deserialize ticket {}: {}", current_ticket_number, e), None))?;

        if ticket.number != current_ticket_number {
            return Err(error_response(500, "API Error", &format!("API returned a ticket number different from what was requested, requested '{}', got '{}'", current_ticket_number, ticket.number), None));
        }
        let password = extract_password(&ticket);
        let items_left = check_ac_charger(&ticket);

        let created_at = parse_timestamp(&ticket.created_at)?;
        let last_updated = parse_timestamp(&ticket.updated_at)?;

        // 1. Migrate Customer
        let api_cust = &ticket.customer;
        let cust_id = ticket.customer_id.to_string();
        let cust_created_at = parse_timestamp(&api_cust.created_at)?;
        let cust_last_updated = if let Some(ref cu) = api_cust.updated_at {
             parse_timestamp(cu)?
        } else {
             cust_created_at
        };

        let mut cust_txn_items = Vec::new();

        let mut phone_numbers = Vec::new();
        if let Some(ref p) = api_cust.phone {
            phone_numbers.push(PhoneNumber {
                number: p.clone(),
                prefers_texting: false,
                no_english: false,
            });
        }

        let put_customer = Put::builder()
            .table_name("Customers")
            .item("customer_id", AttributeValue::S(cust_id.clone()))
            .item("full_name", AttributeValue::S(api_cust.business_and_full_name.clone()))
            .item("email", AttributeValue::S(api_cust.email.clone().unwrap_or_default()))
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
            .item("created_at", AttributeValue::N(cust_created_at.to_string()))
            .item("last_updated", AttributeValue::N(cust_last_updated.to_string()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer Put item: {}", e), None))?;

        cust_txn_items.push(TransactWriteItem::builder().put(put_customer).build());

        // CustomerNames table
        let put_name = Put::builder()
            .table_name("CustomerNames")
            .item("customer_id", AttributeValue::S(cust_id.clone()))
            .item("n", AttributeValue::S(api_cust.business_and_full_name.to_lowercase()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer name Put item: {}", e), None))?;

        cust_txn_items.push(TransactWriteItem::builder().put(put_name).build());

        // CustomerPhoneIndex table
        if let Some(ref p) = api_cust.phone {
            let put_phone = Put::builder()
                .table_name("CustomerPhoneIndex")
                .item("phone_number", AttributeValue::S(p.clone()))
                .item("customer_id", AttributeValue::S(cust_id.clone()))
                .build()
                .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build customer phone Put item: {}", e), None))?;
            cust_txn_items.push(TransactWriteItem::builder().put(put_phone).build());
        }

        // 2. Download and upload attachments
        let mut attachment_urls = Vec::new();
        for attachment in &ticket.attachments {
            // We propagate errors here now
            let s3_url = download_and_upload_attachment(&attachment.file.url, ticket.number, s3_client).await?;
            attachment_urls.push(s3_url);
        }

        // 3. Convert comments
        let comments: Vec<Comment> = ticket.comments.iter().map(|c| {
            Comment {
                comment_body: c.body.clone(),
                tech_name: c.tech.clone(),
                created_at: parse_timestamp(&c.created_at).unwrap_or(created_at),
            }
        }).collect();

        // 4. Migrate Ticket
        let device = get_device_type_from_subject(&ticket.subject);
        let status = convert_status(&ticket.status);
        let status_device = format!("{}#{}", status, device);

        let mut ticket_txn_items = Vec::new();

        // Add customer items to the transaction
        ticket_txn_items.extend(cust_txn_items);

        let mut put_ticket_builder = Put::builder()
            .table_name("Tickets")
            .item("ticket_number", AttributeValue::N(ticket.number.to_string()))
            .item("gsi_pk", AttributeValue::S("ALL".to_string()))
            .item("subject", AttributeValue::S(ticket.subject.clone()))
            .item("customer_id", AttributeValue::S(ticket.customer_id.to_string()))
            .item("status", AttributeValue::S(status))
            .item("device", AttributeValue::S(device))
            .item("status_device", AttributeValue::S(status_device))
            .item("password", AttributeValue::S(password))
            .item("created_at", AttributeValue::N(created_at.to_string()))
            .item("last_updated", AttributeValue::N(last_updated.to_string()));

        if !items_left.is_empty() {
            put_ticket_builder = put_ticket_builder.item("items_left", AttributeValue::L(
                items_left.into_iter().map(|s| AttributeValue::S(s)).collect()
            ));
        }

        if !attachment_urls.is_empty() {
            put_ticket_builder = put_ticket_builder.item("attachments", AttributeValue::L(
                attachment_urls.iter().map(|s| AttributeValue::S(s.clone())).collect()
            ));
        }

        if !comments.is_empty() {
            let comment_attrs: Vec<AttributeValue> = comments.iter().map(|c| {
                AttributeValue::M(
                    vec![
                        ("comment_body".to_string(), AttributeValue::S(c.comment_body.clone())),
                        ("tech_name".to_string(), AttributeValue::S(c.tech_name.clone())),
                        ("created_at".to_string(), AttributeValue::N(c.created_at.to_string())),
                    ].into_iter().collect()
                )
            }).collect();
            put_ticket_builder = put_ticket_builder.item("comments", AttributeValue::L(comment_attrs));
        }

        let put_ticket = put_ticket_builder.build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build ticket Put item: {}", e), None))?;

        ticket_txn_items.push(TransactWriteItem::builder().put(put_ticket).build());

        let put_subject = Put::builder()
            .table_name("TicketSubjects")
            .item("ticket_number", AttributeValue::N(ticket.number.to_string()))
            .item("gsi_pk", AttributeValue::S("ALL".to_string()))
            .item("s", AttributeValue::S(ticket.subject.to_lowercase()))
            .build()
            .map_err(|e| error_response(500, "Builder Error", &format!("Failed to build ticket subject Put item: {}", e), None))?;

        ticket_txn_items.push(TransactWriteItem::builder().put(put_subject).build());

        db_client.transact_write_items()
            .set_transact_items(Some(ticket_txn_items))
            .send()
            .await
            .map_err(|e| error_response(500, "Transaction Error", &format!("Failed to migrate ticket {}: {}", ticket.number, e), None))?;

        migrated_count += 1;
    }

    // Update counter using the input parameter directly
    let _ = db_client.update_item()
        .table_name("Counters")
        .key("counter_name", AttributeValue::S("ticket_number".to_string()))
        .update_expression("SET counter_value = :new")
        .expression_attribute_values(":new", AttributeValue::N(latest_ticket_number.to_string()))
        .condition_expression("counter_value < :new")
        .send()
        .await
        .map_err(|e| error_response(500, "Counter Update Error", &format!("Failed to update ticket counter: {}", e), None))?;

    Ok(json!({
        "migrated_count": migrated_count,
        "highest_ticket_number": latest_ticket_number
    }))
}
