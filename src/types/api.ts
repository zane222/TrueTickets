export interface PhoneNumber {
  number: string;
  prefers_texting: boolean;
  no_english: boolean;
}

export interface TicketWithoutCustomer {
  ticket_number: number;
  subject: string;
  customer_id: string;
  status: string;
  password: string;
  created_at: number;
  last_updated: number;
  comments: Comment[];
  attachments: string[];
  items_left: string[];
}

export interface Ticket extends TicketWithoutCustomer {
  customer: Customer;
}

export interface Customer {
  customer_id: string;
  full_name: string;
  email: string;
  phone_numbers: PhoneNumber[];
  created_at: number; // Backend is i64
  last_updated: number; // Backend is i64
}

export interface Comment {
  comment_body: string;
  tech_name: string;
  created_at: number; // Backend is i64
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


export interface PostTicket {
  customer_id: string;
  subject: string;
  password?: string;
  items_left?: string[];
}

export interface PostCustomer {
  full_name: string;
  email: string;
  phone_numbers: PhoneNumber[];
}

export interface PostComment {
  comment_body: string;
  tech_name: string;
}
