export interface PhoneNumber {
  number: string;
  prefers_texting?: boolean;
  no_english?: boolean;
}

export interface TicketWithoutCustomer {
  ticket_number: number;
  subject: string;
  status: string;
  password?: string;
  device: string;
  created_at: number;
  last_updated: number;
  comments?: Comment[];
  attachments?: string[];
  items_left?: string[];
  line_items?: { subject: string; price: number }[];
}

export interface Ticket extends TicketWithoutCustomer {
  customer: Customer;
}

export interface Customer {
  customer_id: string;
  full_name: string;
  email?: string;
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
  password: string | null;
  items_left: string[] | null;
  device: string;
}

export interface UpdateTicket {
  subject: string | null;
  status: string | null;
  password: string | null;
  items_left: string[] | null;
  device: string | null;
}

export interface PostCustomer {
  full_name: string;
  email: string | null;
  phone_numbers: PhoneNumber[];
}

export interface UpdateCustomer {
  full_name: string | null;
  email: string | null;
  phone_numbers: PhoneNumber[] | null;
}

export interface PostComment {
  comment_body: string;
  tech_name: string;
}

export interface PostInviteUser {
  email: string;
  firstName: string;
}

export interface PostUpdateUserGroup {
  username: string;
  group: string;
}

export interface PostAttachment {
  ticket_id: string;
  image_data: string;
}
