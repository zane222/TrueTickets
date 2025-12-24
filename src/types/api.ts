// Simplified API types matching the DynamoDB backend schema strictly.

export interface Ticket {
  ticket_number: number;
  customer_id: string;
  customer_full_name: string;
  primary_phone: string;
  subject: string;
  details: string;
  status: string;
  password?: string;
  estimated_time?: string;
  created_at: string;
  last_updated: string;
  comments?: Comment[];
  attachments?: Attachment[];
}

export interface Customer {
  customer_id: string;
  full_name: string;
  email: string;
  primary_phone: string;
  phone_numbers: string[];
  created_at: string;
  last_updated: string;
}

export interface Comment {
  comment_body: string;
  tech_name: string;
  created_at: string;
}

export interface Attachment {
  file_name: string;
  url: string;
  created_at: string;
}

export interface CognitoUser {
  username: string;
  email: string | null;
  given_name: string | null;
  enabled: boolean;
  groups: string[];
  created: string | null;
  user_status: string;
}

// No wrapper types needed for simple lists

export type SmallTicket = Ticket;
export type LargeTicket = Ticket;

export interface PostTicket {
  customer_id: string;
  customer_full_name: string;
  primary_phone: string;
  subject: string;
  details: string;
  status?: string;
  password?: string;
  estimated_time?: string;
}

export interface PostCustomer {
  full_name: string;
  primary_phone: string;
  email: string;
  phone_numbers: string[];
  created_at?: string;
}

export interface PostComment {
  comment_body: string;
  tech_name: string;
}
