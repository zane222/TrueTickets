// Component-specific type definitions

import { LargeTicket, SmallTicket, Customer } from "./api";

// ============================================================================
// Route Types
// ============================================================================

export interface RouteView {
  view: string;
  ticketId?: number;
  customerId?: number;
  [key: string]: unknown;
}

export interface NavigateFunction {
  (to: string): void;
}

// ============================================================================
// API Context Types
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
// Filter Types
// ============================================================================

export interface TicketFilter {
  status?: string;
  device?: string;
  searchQuery?: string;
}

// ============================================================================
// User Management Types
// ============================================================================

export interface UserGroups {
  userGroups: string[];
  refreshUserGroups: () => Promise<void>;
  userName: string;
}

// ============================================================================
// Form State Types
// ============================================================================

export interface TicketFormState {
  subject: string;
  status: string;
  customer_id?: number;
  properties?: Record<string, string>;
}

export interface CustomerFormState {
  firstname: string;
  lastname: string;
  business_name: string;
  mobile: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}
