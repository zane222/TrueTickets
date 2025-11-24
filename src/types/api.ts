// API Types based on RepairShopr API responses
// These types match the RepairShopr API responses and requests

// ============================================================================
// Properties Types
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

export interface CustomerProperties {
  notification_billing: string;
  notification_reports: string;
  notification_marketing: string;
  [key: string]: unknown;
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

// ============================================================================
// User Types
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

// ============================================================================
// Mentionable Types
// ============================================================================

export interface Mentionable {
  type: string;
  id: number;
  name: string;
  email: string;
}

// ============================================================================
// Customer Types
// ============================================================================

export interface Customer {
  id: number;
  firstname: string;
  lastname: string;
  fullname: string;
  business_name: string;
  email: string;
  phone: string;
  mobile: string | null;
  created_at: string;
  updated_at: string | null;
  pdf_url: string | null;
  address: string;
  address_2: string;
  city: string;
  state: string;
  zip: string;
  latitude: any;
  longitude: any;
  notes: string;
  get_sms: boolean | null;
  opt_out: boolean | null;
  disabled: boolean | null;
  no_email: boolean | null;
  location_id: any;
  location_name: any;
  properties: CustomerProperties;
  online_profile_url: string;
  tax_rate_id: any;
  notification_email: string;
  invoice_cc_emails: string;
  invoice_term_id: any;
  referred_by: string;
  ref_customer_id: any;
  business_and_full_name: string;
  business_then_name: string;
  contacts: any[];
  phones: Phone[];
  ticket_links: TicketLink[];
  invoice_links: InvoiceLink[];
}

export interface TicketLink {
  id: number;
  number: number;
  status: string;
  subject: string;
}

export interface InvoiceLink {
  id: number;
  number: string;
  took_payment: boolean;
  total: string;
  date: string;
}

export interface PostCustomer {
  business_name: string;
  firstname: string;
  lastname: string;
  phone: string;
  mobile: string;
  notes: string;
  get_sms: boolean;
}

// ============================================================================
// Comment Types
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

export interface PostComment {
  subject: string;
  body: string;
  sms_body: string;
  tech: string;
  hidden: boolean;
  do_not_email: boolean;
}

// ============================================================================
// Attachment Types
// ============================================================================

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
  name: any;
}

// ============================================================================
// Ticket Field Types
// ============================================================================

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

// ============================================================================
// Ticket Timer Types
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
  toggl_id: any;
  product_id: any;
  comment_id: any;
  ticket_line_item_id: any;
  active_duration: number | null;
}

// ============================================================================
// Ticket Type Types
// ============================================================================

export interface TicketType {
  name: string;
  account_id: number | null;
  created_at: string;
  updated_at: string | null;
  disabled: boolean | null;
  intake_terms: any;
  skip_intake: boolean | null;
  outtake_terms: any;
  skip_outtake: boolean | null;
  id: number | null;
  ticket_fields: TicketField[];
}

// ============================================================================
// Asset Types
// ============================================================================

export interface SnmpConfig {
  port: number | null;
  enabled: boolean | null;
  version: number | null;
  community: string;
}

/**
 * AssetDeviceInfo - renamed from DeviceInfo to avoid name collision with
 * UI-level DeviceInfo elsewhere in the codebase.
 */
export interface AssetDeviceInfo {
  snmp_config: SnmpConfig;
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

export type WindowsUpdates = Record<string, unknown>;

export type Emsisoft = Record<string, unknown>;

export type General = Record<string, unknown>;

export interface RmmStore {
  id: number | null;
  asset_id: number | null;
  account_id: number | null;
  triggers: Triggers;
  windows_updates: WindowsUpdates;
  emsisoft: Emsisoft;
  general: General;
  created_at: string;
  updated_at: string | null;
  override_alert_agent_offline_mins: any;
  override_alert_agent_rearm_after_mins: any;
  override_low_hd_threshold: any;
  override_autoresolve_offline_alert: any;
  override_low_hd_thresholds: any;
}

export interface Asset {
  id: number;
  name: string;
  customer_id: number;
  contact_id: any;
  created_at: string;
  updated_at: string | null;
  properties: AssetProperties;
  asset_type: string;
  asset_serial: string;
  external_rmm_link: any;
  customer: Customer;
  rmm_links: any[];
  has_live_chat: boolean | null;
  snmp_enabled: any;
  device_info: AssetDeviceInfo;
  rmm_store: RmmStore;
  address: any;
}

// ============================================================================
// Ticket Types
// ============================================================================

export interface SmallTicket {
  id: number;
  number: number;
  subject: string;
  created_at: string;
  customer_id: number;
  customer_business_then_name: string;
  due_date: string | null;
  resolved_at: string | null;
  start_at: string | null;
  end_at: string | null;
  location_id: number | null;
  problem_type: string;
  status: string;
  ticket_type_id: number | null;
  properties: TicketProperties;
  user_id: number | null;
  updated_at: string | null;
  pdf_url: string;
  priority: string;
  user: User;
}

export interface Ticket {
  id: number;
  number: number;
  subject: string;
  created_at: string;
  customer_id: number;
  customer_business_then_name: string;
  due_date: string | null;
  resolved_at: string | null;
  start_at: string | null;
  end_at: string | null;
  location_id: number | null;
  problem_type: string;
  status: string;
  ticket_type_id: number | null;
  properties: TicketProperties;
  user_id: number | null;
  updated_at: string | null;
  pdf_url: string;
  priority: string;
  comments: Comment[];
  user: User;
}

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
  pdf_url: any;
  intake_form_html: string;
  signature_name: any;
  signature_date: any;
  asset_ids: (number | null)[];
  priority: string | null;
  resolved_at: string | null;
  outtake_form_name: any;
  outtake_form_date: any;
  outtake_form_html: any;
  address: any;
  comments: Comment[];
  attachments: Attachment[];
  ticket_timers: TicketTimer[];
  line_items: any[];
  worksheet_results: any[];
  assets: Asset[];
  appointments: any[];
  ticket_fields: TicketField[];
  ticket_answers: TicketAnswer[];
  customer: Customer;
  contact: any;
  user: User | null;
  ticket_type: TicketType;
  ticket_type_id: number | null;
  tag_list: string[];
  public_mentionables: Mentionable[];
  private_mentionables: Mentionable[];
}

export interface PostTicket {
  customer_id: number;
  user_id: number;
  ticket_type_id: number;
  subject: string;
  problem_type: string;
  status: string;
  due_date: string;
  properties: TicketProperties;
}

// ============================================================================
// API Response Wrappers
// ============================================================================

export interface Meta {
  total_pages: number;
  total_entries: number;
  per_page: number;
  page: number;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SuperSmallTicket {
  number: number | null;
  subject: string;
}

export interface Source {
  table: SuperSmallTicket;
}

export interface Table {
  _id: number | null;
  _type: string;
  _index: string;
  _source: Source;
}

export interface Result {
  table: Table;
}

export interface SearchResult {
  quick_result: any;
  results: Result[];
  error: any;
}

// ============================================================================
// Phone Types
// ============================================================================

export interface Phone {
  customer_id: number;
  id: number;
  label: string | null;
  number: string;
  extension: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PostPhone {
  label: string;
  number: string;
  extension: string;
}

// ============================================================================
// API Key Type
// ============================================================================

export interface ApiKey {
  key: string;
}

// ============================================================================
// Utility Types for API Calls
// ============================================================================

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
  status?: number;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
}

export interface TicketQueryParams extends PaginationParams {
  query?: string;
  number?: string;
  status?: string;
  customer_id?: number;
}

export interface CustomerQueryParams extends PaginationParams {
  query?: string;
}

// ============================================================================
// User Management Types
// ============================================================================

export interface CognitoUserAttribute {
  Name: string;
  Value: string;
}

export interface CognitoUser {
  Username: string;
  Attributes: CognitoUserAttribute[];
  UserCreateDate?: string;
  UserLastModifiedDate?: string;
  Enabled?: boolean;
  UserStatus?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  username?: string;
}
