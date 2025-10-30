// Main Types Export File
// This file exports all types used throughout the application

// Export all API types
export * from "./api";

// Export all component types
export * from "./components";

// Re-export commonly used API types for convenience
export type {
  Customer,
  Ticket,
  LargeTicket,
  SmallTicket,
  Comment,
  User,
  TicketProperties,
  PostTicket,
  PostCustomer,
  PostComment,
} from "./api";

// Re-export commonly used component types
export type {
  RouteView,
  NavigateFunction,
  ApiContextValue,
} from "./components";

// ============================================================================
// UI Component Types (Non-API)
// ============================================================================

export interface DeviceInfo {
  device: string;
  itemsLeft: string[];
  estimatedTime: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}

// ============================================================================
// Route Types
// ============================================================================

export interface RouteState {
  view: string;
  ticketId?: number;
  customerId?: number;
  [key: string]: any;
}

export interface NavigationProps {
  goTo: (path: string) => void;
  navigate?: (path: string) => void;
}

// ============================================================================
// Search Types (UI)
// ============================================================================

export interface SearchResultItem {
  type: "ticket" | "customer";
  id: number;
  title: string;
  subtitle?: string;
  data?: any;
}

// ============================================================================
// Alert Types (UI)
// ============================================================================

export type AlertType = "success" | "error" | "warning" | "info";

export interface Alert {
  id: number;
  type: AlertType;
  title: string;
  message?: string;
  duration?: number;
  persistent?: boolean;
  position?: string;
}

export interface AlertContextType {
  alerts: Alert[];
  addAlert: (alert: Partial<Alert>) => number;
  removeAlert: (id: number) => void;
  clearAllAlerts: () => void;
  clearDataChangedWarnings: () => void;
  showSuccess: (title: string, message?: string, options?: any) => number;
  showError: (title: string, message?: string, options?: any) => number;
  showWarning: (title: string, message?: string, options?: any) => number;
  showDataChangedWarning: (
    title: string,
    message?: string,
    options?: any,
  ) => number;
  showInfo: (title: string, message?: string, options?: any) => number;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

export type StringOrNumber = string | number;

export type Awaitable<T> = T | Promise<T>;

// Helper type for React component props with children
export interface PropsWithChildren<P = {}> {
  children?: React.ReactNode;
}

// Helper type for async functions
export type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;

// ============================================================================
// Auth Types
// ============================================================================

export interface UserGroup {
  groupName: string;
  description?: string;
}

export interface AuthUser {
  username: string;
  email?: string;
  groups?: string[];
  attributes?: Record<string, any>;
  [key: string]: any;
}

export interface AuthSession {
  tokens?: {
    idToken?: {
      toString: () => string;
    };
    accessToken?: any;
  };
  credentials?: any;
  [key: string]: any;
}

// ============================================================================
// API Client Types
// ============================================================================

export interface ApiClientConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ApiError extends Error {
  status?: number;
  body?: any;
  code?: string;
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormField {
  name: string;
  label: string;
  type: string;
  value?: any;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  [key: string]: any;
}
