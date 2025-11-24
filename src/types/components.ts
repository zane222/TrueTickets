// Component-specific type definitions



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
// ---------------------------------------------------------------------------
// The ApiContextValue methods are generic so callers can request typed
// responses without using `as` casts. This keeps the context flexible while
// enabling strong typing at call sites via `api.get<MyType>(...)`.
export interface ApiContextValue {
  lambdaUrl: string;
  setLambdaUrl: (url: string) => void;
  /**
   * Generic GET helper.
   * Usage: const data = await api.get<{ tickets: SmallTicket[] }>(path);
   */
  get: <T = unknown>(path: string) => Promise<T>;
  /**
   * Generic POST helper.
   */
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  /**
   * Generic PUT helper.
   */
  put: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  /**
   * Generic DELETE helper.
   */
  del: <T = unknown>(path: string) => Promise<T>;
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
