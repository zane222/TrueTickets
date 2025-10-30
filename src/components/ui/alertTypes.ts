/**
 * alertTypes.ts
 *
 * Shared types and small constants used by the Alert system.
 * These are intentionally kept in a separate file so the React
 * component file (`AlertSystem.tsx`) only exports components and
 * hooks, avoiding fast-refresh / lint issues caused by exporting
 * non-component values from files that also export components.
 */

/**
 * Allowed alert categories.
 */
export type AlertType = "success" | "error" | "warning" | "info";

/**
 * Allowed positions for alerts (expandable).
 */
export type AlertPosition =
  | "top-center"
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

/**
 * Core Alert shape used by the provider and renderers.
 */
export interface Alert {
  id: number;
  type: AlertType;
  title: string;
  message?: string;
  /**
   * Duration in milliseconds. A value of 0 indicates "never auto-dismiss".
   */
  duration?: number;
  /**
   * If true, this alert is considered persistent and will not be cleared
   * by blanket "clear" operations (used for things like data-changed warnings).
   */
  persistent?: boolean;
  /**
   * Optional position hint for layout purposes.
   */
  position?: AlertPosition;
}

/**
 * Options that callers may pass when showing convenience alerts.
 * Narrowly scoped so we don't reintroduce `any`.
 */
export type AlertDisplayOptions = Partial<
  Pick<Alert, "duration" | "persistent" | "position">
>;

/**
 * Shape of the Alert Context provided to the app. Keep signatures strict
 * so downstream files don't need to use `any`.
 */
export interface AlertContextType {
  alerts: Alert[];

  /**
   * Add an alert. Caller may supply a partial Alert (id will be generated).
   * Returns the generated alert id.
   */
  addAlert: (alert: Partial<Omit<Alert, "id">>) => number;

  /**
   * Remove an alert by id.
   */
  removeAlert: (id: number) => void;

  /**
   * Clear all alerts immediately.
   */
  clearAllAlerts: () => void;

  /**
   * Clear only the persistent/data-changed style warnings while leaving
   * other alerts intact.
   */
  clearDataChangedWarnings: () => void;

  /**
   * Convenience helpers for common alert types. Each returns the alert id.
   */
  showSuccess: (title: string, message?: string, options?: AlertDisplayOptions) => number;
  showError: (title: string, message?: string, options?: AlertDisplayOptions) => number;
  showWarning: (title: string, message?: string, options?: AlertDisplayOptions) => number;
  showDataChangedWarning: (
    title: string,
    message?: string,
    options?: AlertDisplayOptions,
  ) => number;
  showInfo: (title: string, message?: string, options?: AlertDisplayOptions) => number;
}

/**
 * Small constant map of alert types to avoid repeating string literals.
 */
export const ALERT_TYPES: { SUCCESS: AlertType; ERROR: AlertType; WARNING: AlertType; INFO: AlertType } =
  {
    SUCCESS: "success",
    ERROR: "error",
    WARNING: "warning",
    INFO: "info",
  };
