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
  [key: string]: unknown;
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
  data?: unknown;
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

export type AlertDisplayOptions = Partial<
  Pick<Alert, "duration" | "persistent" | "position">
>;

export interface AlertContextType {
  alerts: Alert[];
  addAlert: (alert: Partial<Alert>) => number;
  removeAlert: (id: number) => void;
  clearAllAlerts: () => void;
  clearDataChangedWarnings: () => void;
  showSuccess: (
    title: string,
    message?: string,
    options?: AlertDisplayOptions,
  ) => number;
  showError: (
    title: string,
    message?: string,
    options?: AlertDisplayOptions,
  ) => number;
  showWarning: (
    title: string,
    message?: string,
    options?: AlertDisplayOptions,
  ) => number;
  showDataChangedWarning: (
    title: string,
    message?: string,
    options?: AlertDisplayOptions,
  ) => number;
  showInfo: (
    title: string,
    message?: string,
    options?: AlertDisplayOptions,
  ) => number;
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
export interface PropsWithChildren<P = Record<string, unknown>> {
  children?: React.ReactNode;
}

// Helper type for async functions
export type AsyncFunction<T = unknown> = (...args: unknown[]) => Promise<T>;

// ============================================================================
// Auth Types (re-exports / aliases)
// ---------------------------------------------------------------------------
// Use the Amplify-provided types where possible and fall back to the minimal
// UI-focused shape for places that only require a subset of the full Amplify
// user object. This avoids redundant type definitions and keeps the app
// compatible with multiple Amplify versions.
// ============================================================================

import type {
  AmplifyAuthUser,
  AuthUserMinimal,
  IdTokenPayload,
  CognitoGroups,
} from "./amplify";

export type { AmplifyAuthUser, AuthUserMinimal, IdTokenPayload, CognitoGroups };

export interface UserGroup {
  groupName: string;
  description?: string;
}

/**
 * `AuthUser` in the app uses the full Amplify user type. This keeps the app
 * consistently typed with Amplify's definitions.
 */
export type AuthUser = AmplifyAuthUser;

/**
 * AuthSession is kept lightweight and mirrors the shape the app consumes.
 * Token payloads and groups are strongly typed via re-exports from `amplify`.
 */
export interface AuthSession {
  tokens?: {
    idToken?: {
      toString: () => string;
    };
    accessToken?: unknown;
  };
  credentials?: unknown;
  [key: string]: unknown;
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
  body?: unknown;
  code?: string;
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormField {
  name: string;
  label: string;
  type: string;
  value?: unknown;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  [key: string]: unknown;
}
