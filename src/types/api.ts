// API Types based on RepairShoprObjects.cs
// These types match the RepairShopr API responses and requests

// ============================================================================
// Properties Types
// ============================================================================

export interface TicketProperties {
  Model?: string;
  Category?: string;
  Password?: string;
  Size?: string;
  "AC Charger"?: string;
  "Tech Notes"?: string;
  "Problem Type"?: string;
  'Password (type "none" if no password)'?: string;
  "IMEI or S/N"?: string;
  "IMEI/Serial"?: string;
  "Ever Been Wet"?: string;
  "Previous Damage or Issues"?: string;
  "Current Issue:"?: string;
  // Legacy field names for compatibility
  acCharger?: string;
  techNotes?: string;
  problemType?: string;
  passwordForPhone?: string;
  imeiOrSn?: string;
  imeiOrSnForPhone?: string;
  everBeenWet?: string;
  previousDamageOrIssues?: string;
  currentIssue?: string;
  [key: string]: any;
}

export interface CustomerProperties {
  notification_billing?: string;
  notification_reports?: string;
  notification_marketing?: string;
  [key: string]: any;
}

export interface AssetProperties {
  Make?: string;
  "Service Tag"?: string;
  notification_billing?: string;
  notification_reports?: string;
  notification_marketing?: string;
  blank?: string;
  [key: string]: any;
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id?: number;
  email?: string;
  full_name?: string;
  created_at?: string;
  updated_at?: string;
  group?: string;
  "admin?"?: boolean;
  color?: string;
}

// ============================================================================
// Customer Types
// ============================================================================

export interface Customer {
  id: number;
  firstname?: string;
  lastname?: string;
  fullname?: string;
  business_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  created_at?: string;
  updated_at?: string;
  pdf_url?: string;
  address?: string;
  address_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: any;
  longitude?: any;
  notes?: string;
  get_sms?: boolean;
  opt_out?: boolean;
  disabled?: boolean;
  no_email?: boolean;
  location_id?: any;
  properties?: CustomerProperties;
  online_profile_url?: string;
  tax_rate_id?: any;
  notification_email?: string;
  invoice_cc_emails?: string;
  invoice_term_id?: any;
  referred_by?: string;
  ref_customer_id?: any;
  business_and_full_name?: string;
  business_then_name?: string;
  location_name?: any;
  contacts?: any[];
}

export interface PostCustomer {
  business_name?: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  mobile?: string;
  notes?: string;
  get_sms?: boolean;
}

// ============================================================================
// Comment Types
// ============================================================================

export interface Comment {
  id: number;
  created_at?: string;
  updated_at?: string;
  ticket_id?: number;
  subject?: string;
  body?: string;
  tech?: string;
  hidden?: boolean;
  user_id?: number;
}

export interface PostComment {
  subject?: string;
  body?: string;
  sms_body?: string;
  tech?: string;
  hidden?: boolean;
  do_not_email?: boolean;
}

// ============================================================================
// Attachment Types
// ============================================================================

export interface File {
  url?: string;
  thumb?: Thumb;
  main?: Main;
}

export interface Thumb {
  url?: string;
}

export interface Main {
  url?: string;
}

export interface Attachment {
  id: number;
  file_name?: string;
  file?: File;
  created_at?: string;
  updated_at?: string;
  attachable_type?: string;
  attachable_id?: number;
  account_id?: number;
  private?: boolean;
  content_type?: string;
  file_size?: number;
  md5?: string;
  name?: any;
}

// ============================================================================
// Ticket Field Types
// ============================================================================

export interface Answer {
  ticket_field_id?: number;
  content?: string;
  created_at?: string;
  updated_at?: string;
  account_id?: number;
  id?: number;
}

export interface TicketAnswer {
  ticket_field_id?: number;
  content?: string;
  created_at?: string;
  updated_at?: string;
  account_id?: number;
  id?: number;
}

export interface TicketField {
  id: number;
  name?: string;
  field_type?: string;
  required?: boolean;
  account_id?: number;
  created_at?: string;
  updated_at?: string;
  ticket_type_id?: number;
  hidden?: boolean;
  position?: number;
  answers?: Answer[];
}

// ============================================================================
// Ticket Timer Types
// ============================================================================

export interface TicketTimer {
  id: number;
  ticket_id?: number;
  user_id?: number;
  start_time?: string;
  end_time?: string;
  recorded?: boolean;
  created_at?: string;
  updated_at?: string;
  billable?: boolean;
  notes?: string;
  toggl_id?: any;
  product_id?: any;
  comment_id?: any;
  ticket_line_item_id?: any;
  active_duration?: number;
}

// ============================================================================
// Ticket Type Types
// ============================================================================

export interface TicketType {
  name?: string;
  account_id?: number;
  created_at?: string;
  updated_at?: string;
  disabled?: boolean;
  intake_terms?: any;
  skip_intake?: boolean;
  outtake_terms?: any;
  skip_outtake?: boolean;
  id?: number;
  ticket_fields?: TicketField[];
}

// ============================================================================
// Asset Types
// ============================================================================

export interface SnmpConfig {
  port?: number;
  enabled?: boolean;
  version?: number;
  community?: string;
}

export interface DeviceInfo {
  snmp_config?: SnmpConfig;
}

export interface Triggers {
  bsod_triggered?: string;
  time_triggered?: string;
  no_av_triggered?: string;
  defrag_triggered?: string;
  firewall_triggered?: string;
  app_crash_triggered?: string;
  low_hd_space_triggered?: string;
  smart_failure_triggered?: string;
  device_manager_triggered?: string;
  agent_offline_triggered?: string;
}

export interface WindowsUpdates {}

export interface Emsisoft {}

export interface General {}

export interface RmmStore {
  id?: number;
  asset_id?: number;
  account_id?: number;
  triggers?: Triggers;
  windows_updates?: WindowsUpdates;
  emsisoft?: Emsisoft;
  general?: General;
  created_at?: string;
  updated_at?: string;
  override_alert_agent_offline_mins?: any;
  override_alert_agent_rearm_after_mins?: any;
  override_low_hd_threshold?: any;
  override_autoresolve_offline_alert?: any;
  override_low_hd_thresholds?: any;
}

export interface Asset {
  id: number;
  name?: string;
  customer_id?: number;
  contact_id?: any;
  created_at?: string;
  updated_at?: string;
  properties?: AssetProperties;
  asset_type?: string;
  asset_serial?: string;
  external_rmm_link?: any;
  customer?: Customer;
  rmm_links?: any[];
  has_live_chat?: boolean;
  snmp_enabled?: any;
  device_info?: DeviceInfo;
  rmm_store?: RmmStore;
  address?: any;
}

// ============================================================================
// Ticket Types
// ============================================================================

export interface SmallTicket {
  id: number;
  number: number;
  subject?: string;
  created_at?: string;
  customer_id?: number;
  customer_business_then_name?: string;
  due_date?: string;
  resolved_at?: string;
  start_at?: string;
  end_at?: string;
  location_id?: number;
  problem_type?: string;
  status?: string;
  ticket_type_id?: number;
  properties?: TicketProperties;
  user_id?: number;
  updated_at?: string;
  pdf_url?: string;
  priority?: string;
  user?: User;
  customer?: Customer;
  device_type?: string;
}

export interface Ticket {
  id: number;
  number: number;
  subject?: string;
  created_at?: string;
  customer_id?: number;
  customer_business_then_name?: string;
  due_date?: string;
  resolved_at?: string;
  start_at?: string;
  end_at?: string;
  location_id?: number;
  problem_type?: string;
  status?: string;
  ticket_type_id?: number;
  properties?: TicketProperties;
  user_id?: number;
  updated_at?: string;
  pdf_url?: string;
  priority?: string;
  comments?: Comment[];
  user?: User;
}

export interface LargeTicket {
  id: number;
  number: number;
  subject?: string;
  created_at?: string;
  customer_id?: number;
  customer_business_then_name?: string;
  due_date?: string;
  start_at?: string;
  end_at?: string;
  location_id?: number;
  problem_type?: string;
  status?: string;
  properties?: TicketProperties;
  user_id?: number;
  updated_at?: string;
  pdf_url?: any;
  intake_form_html?: string;
  signature_name?: any;
  signature_date?: any;
  asset_ids?: number[];
  priority?: string;
  resolved_at?: string;
  outtake_form_name?: any;
  outtake_form_date?: any;
  outtake_form_html?: any;
  address?: any;
  comments?: Comment[];
  attachments?: Attachment[];
  ticket_timers?: TicketTimer[];
  line_items?: any[];
  worksheet_results?: any[];
  assets?: Asset[];
  appointments?: any[];
  ticket_fields?: TicketField[];
  ticket_answers?: TicketAnswer[];
  customer?: Customer;
  contact?: any;
  user?: User;
  ticket_type?: TicketType;
  ticket_type_id?: number;
}

export interface PostTicket {
  customer_id: number;
  user_id?: number;
  ticket_type_id?: number;
  subject: string;
  problem_type?: string;
  status?: string;
  due_date?: string;
  properties?: TicketProperties;
}

// ============================================================================
// API Response Wrappers
// ============================================================================

export interface Meta {
  total_pages?: number;
  total_entries?: number;
  per_page?: number;
  page?: number;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SuperSmallTicket {
  number?: number;
  subject?: string;
}

export interface Source {
  table?: SuperSmallTicket;
}

export interface Table {
  _id?: number;
  _type?: string;
  _index?: string;
  _source?: Source;
}

export interface Result {
  table?: Table;
}

export interface SearchResult {
  quick_result?: any;
  results?: Result[];
  error?: any;
}

// ============================================================================
// Phone Types
// ============================================================================

export interface Phone {
  customer_id?: number;
  id?: number;
  phone_id?: number; // Legacy field name for backward compatibility
  label?: string;
  number?: string;
  extension?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PostPhone {
  label?: string;
  number: string;
  extension?: string;
}

// ============================================================================
// API Key Type
// ============================================================================

export interface ApiKey {
  key: string;
}

// ============================================================================
// API Context Type
// ============================================================================

export interface ApiContextValue {
  lambdaUrl: string;
  setLambdaUrl: (url: string) => void;
  get: (path: string) => Promise<unknown>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  put: (path: string, body?: unknown) => Promise<unknown>;
  del: (path: string) => Promise<unknown>;
}

// ============================================================================
// Utility Types for API Calls
// ============================================================================

export interface ApiResponse<T = any> {
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
