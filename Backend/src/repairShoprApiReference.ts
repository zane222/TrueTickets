// ============================================================================
// Large Ticket (Full Payload)
// ============================================================================

export interface LargeTicket {
    id: number;
    number: number;
    subject: string;
    created_at: string;
    customer_id: number;
    customer_business_then_name: string;
    due_date: string | null;
    start_at: string | null;
    end_at: string | null;
    location_id: number | null;
    problem_type: string;
    status: string;
    properties: TicketProperties;
    user_id: number | null;
    updated_at: string | null;
    pdf_url: string | null;

    intake_form_html: string;
    signature_name: string | null;
    signature_date: string | null;

    asset_ids: (number | null)[];
    priority: string | null;
    resolved_at: string | null;

    outtake_form_name: string | null;
    outtake_form_date: string | null;
    outtake_form_html: string | null;

    address: string | null;

    comments?: Comment[];
    attachments?: Attachment[];
    ticket_timers: TicketTimer[];

    line_items: unknown[];
    worksheet_results: unknown[];

    assets: Asset[];
    appointments: unknown[];

    ticket_fields: TicketField[];
    ticket_answers: TicketAnswer[];

    customer: Customer;
    contact: unknown;
    user: User | null;

    ticket_type: TicketType;
    ticket_type_id: number | null;

    tag_list: string[];
    public_mentionables: Mentionable[];
    private_mentionables: Mentionable[];
}

// ============================================================================
// Ticket Properties
// ============================================================================

export interface TicketProperties {
    Model: string;
    Category: string;
    Password: string;
    Size: string;
    "AC Charger": string;
    "Tech Notes": string;
    "Problem Type": string;
    'Password (type "none" if no password)': string;
    "IMEI or S/N": string;
    "IMEI/Serial": string;
    "Ever Been Wet": string;
    "Previous Damage or Issues": string;
    "Current Issue:": string;
    [key: string]: unknown;
}

// ============================================================================
// Comments
// ============================================================================

export interface Comment {
    id: number;
    created_at: string;
    updated_at: string | null;
    ticket_id: number | null;
    subject: string;
    body: string;
    tech: string;
    hidden: boolean | null;
    user_id: number | null;
}

// ============================================================================
// Attachments
// ============================================================================

export interface Attachment {
    id: number;
    file_name: string;
    file: File;
    created_at: string;
    updated_at: string | null;
    attachable_type: string;
    attachable_id: number | null;
    account_id: number | null;
    private: boolean | null;
    content_type: string;
    file_size: number | null;
    md5: string;
    name: string;
}

export interface File {
    url: string;
    thumb: Thumb;
    main: Main;
}

export interface Thumb {
    url: string;
}

export interface Main {
    url: string;
}

// ============================================================================
// Ticket Timers
// ============================================================================

export interface TicketTimer {
    id: number;
    ticket_id: number | null;
    user_id: number | null;
    start_time: string | null;
    end_time: string | null;
    recorded: boolean | null;
    created_at: string;
    updated_at: string | null;
    billable: boolean | null;
    notes: string;
    toggl_id: number | null;
    product_id: number | null;
    comment_id: number | null;
    ticket_line_item_id: number | null;
    active_duration: number | null;
}

// ============================================================================
// Ticket Fields & Answers
// ============================================================================

export interface TicketField {
    id: number;
    name: string;
    field_type: string;
    required: boolean | null;
    account_id: number | null;
    created_at: string;
    updated_at: string | null;
    ticket_type_id: number | null;
    hidden: boolean | null;
    position: number | null;
    answers: Answer[];
}

export interface Answer {
    ticket_field_id: number;
    content: string;
    created_at: string;
    updated_at: string | null;
    account_id: number | null;
    id: number | null;
}

export interface TicketAnswer {
    ticket_field_id: number | null;
    content: string;
    created_at: string;
    updated_at: string | null;
    account_id: number | null;
    id: number | null;
}

// ============================================================================
// Assets
// ============================================================================

export interface Asset {
    id: number;
    name: string;
    customer_id: number;
    contact_id: number | null;
    created_at: string;
    updated_at: string | null;
    properties: AssetProperties;
    asset_type: string;
    asset_serial: string;
    external_rmm_link: string | null;
    customer: Customer;
    rmm_links: unknown[];
    has_live_chat: boolean | null;
    snmp_enabled: boolean | null;
    device_info: AssetDeviceInfo;
    rmm_store: RmmStore;
    address: string | null;
}

export interface AssetProperties {
    Make: string;
    "Service Tag": string;
    notification_billing: string;
    notification_reports: string;
    notification_marketing: string;
    blank: string;
    [key: string]: unknown;
}

export interface AssetDeviceInfo {
    snmp_config: SnmpConfig;
}

export interface SnmpConfig {
    port: number | null;
    enabled: boolean | null;
    version: number | null;
    community: string;
}

export interface RmmStore {
    id: number | null;
    asset_id: number | null;
    account_id: number | null;
    triggers: Triggers;
    windows_updates: Record<string, unknown>;
    emsisoft: Record<string, unknown>;
    general: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
}

export interface Triggers {
    bsod_triggered: string;
    time_triggered: string;
    no_av_triggered: string;
    defrag_triggered: string;
    firewall_triggered: string;
    app_crash_triggered: string;
    low_hd_space_triggered: string;
    smart_failure_triggered: string;
    device_manager_triggered: string;
    agent_offline_triggered: string;
}

// ============================================================================
// Customer
// ============================================================================

export interface Customer {
    id: number;
    firstname: string;
    lastname: string;
    fullname: string;
    business_name: string;
    email?: string | null;
    phone: string;
    mobile: string | null;
    created_at: string;
    updated_at: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    notes: string | null;
    properties: CustomerProperties;
    tag_list: string[];
}

export interface CustomerProperties {
    notification_billing: string;
    notification_reports: string;
    notification_marketing: string;
    [key: string]: unknown;
}

// ============================================================================
// User & Mentionables
// ============================================================================

export interface User {
    id: number | null;
    email: string;
    full_name: string;
    created_at: string;
    updated_at: string | null;
    group: string;
    "admin?": boolean | null;
    color: string;
}

export interface Mentionable {
    type: string;
    id: number;
    name: string;
    email: string;
}

// ============================================================================
// Ticket Type
// ============================================================================

export interface TicketType {
    id: number | null;
    name: string;
    account_id: number | null;
    created_at: string;
    updated_at: string | null;
    disabled: boolean | null;
    intake_terms: string | null;
    skip_intake: boolean | null;
    outtake_terms: string | null;
    skip_outtake: boolean | null;
    ticket_fields: TicketField[];
}

// IMPORTANT: Password should be read like this
export function getTicketPassword(
    ticket: SmallTicket | LargeTicket | Record<string, unknown>,
): string {
    try {
        // Normalize to a record for safe indexed access
        const t = ticket as Record<string, unknown>;
        // Check ticket_fields[0].ticket_type_id first, fallback to main ticket_type_id
        // Safely handle possibly-typed ticket_fields without using `any`.
        let typeId: number | undefined;
        const maybeFields = t["ticket_fields"];
        if (Array.isArray(maybeFields) && maybeFields.length > 0) {
            const first = maybeFields[0] as Record<string, unknown>;
            if (typeof first["ticket_type_id"] === "number") {
                typeId = first["ticket_type_id"] as number;
            }
        }
        if (typeId === undefined && typeof t["ticket_type_id"] === "number") {
            typeId = t["ticket_type_id"] as number;
        }
        const props = (t["properties"] || {}) as Record<string, unknown>;
        const invalid = new Set(["n", "na", "n/a", "none"]);
        const norm = (str: unknown): string =>
            typeof str === "string" ? str.toLowerCase().trim() : "";

        if (typeId === 9818 || typeId === 9836) {
            const normalizedPassword = norm(props["Password"]);
            if (normalizedPassword && !invalid.has(normalizedPassword)) {
                const pw = props["Password"];
                return typeof pw === "string" ? pw : "";
            }
        } else if (typeId === 9801) {
            const normalizedPassword = norm(props["passwordForPhone"]);
            if (normalizedPassword && !invalid.has(normalizedPassword)) {
                const pw = props["passwordForPhone"];
                return typeof pw === "string" ? pw : "";
            }
        }
        return "";
    } catch {
        return "";
    }
}