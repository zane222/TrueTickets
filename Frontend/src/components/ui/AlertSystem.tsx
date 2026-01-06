/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import type {
  Alert as AlertTypeShape,
  AlertContextType,
  AlertDisplayOptions,
  AlertType,
} from "../ui/alertTypes";
import { ALERT_TYPES } from "../ui/alertTypes";

/**
 * Internal Alert rendering component (not exported).
 * Renders either an inline or global alert box depending on props.
 */
const AlertRenderer: React.FC<{
  alert: AlertTypeShape;
  onClose: (id: number) => void;
  inline?: boolean;
  className?: string;
}> = ({ alert, onClose, inline = false }) => {
  const getAlertStyles = (type: AlertType) => {
    switch (type) {
      case "success":
        return {
          backgroundColor: "#1e3a8a",
          color: "#ffffff",
          Icon: CheckCircle,
        };
      case "error":
        return {
          backgroundColor: "var(--md-sys-color-error)",
          color: "var(--md-sys-color-on-error)",
          Icon: AlertCircle,
        };
      case "warning":
        return {
          backgroundColor: "#fbbf24",
          color: "#1f2937",
          Icon: AlertTriangle,
        };
      case "info":
      default:
        return {
          backgroundColor: "var(--md-sys-color-secondary-container)",
          color: "var(--md-sys-color-on-secondary-container)",
          Icon: Info,
        };
    }
  };

  const styles = getAlertStyles(alert.type as AlertType);
  const IconComponent = styles.Icon;

  if (inline) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="rounded-md p-3 flex items-center gap-2"
        style={{ backgroundColor: styles.backgroundColor, color: styles.color }}
      >
        <IconComponent className="w-4 h-4 flex-shrink-0" />
        <div className="text-md">{alert.message || alert.title}</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className="rounded-md p-4 mb-3 flex items-start gap-3"
      style={{
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      }}
    >
      <IconComponent className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <div className="text-md font-medium" style={{ color: styles.color }}>
          {alert.title}
        </div>
        {alert.message && (
          <div
            className="text-md mt-1 opacity-90"
            style={{ color: styles.color }}
          >
            {alert.message}
          </div>
        )}
      </div>
      <button
        onClick={() => onClose(alert.id)}
        className="flex-shrink-0 p-1 hover:bg-black/10 rounded"
        style={{ color: styles.color }}
        aria-label="Close alert"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

/**
 * Alert context definition and provider
 */
const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = (): AlertContextType => {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return ctx;
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [alerts, setAlerts] = useState<AlertTypeShape[]>([]);

  // Listen for API errors from apiClient
  useEffect(() => {
    const handleApiError = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string }>;
      const message = customEvent.detail?.message || "An unexpected error occurred";

      // Use the internal addAlert to avoid dependency cycles or closure staleness
      setAlerts((prev) => {
        const id = Math.floor(Date.now() + Math.random() * 1000000);
        const newAlert: AlertTypeShape = {
          id,
          type: ALERT_TYPES.ERROR,
          title: "API Error",
          message,
          duration: 5000,
          persistent: false,
        };

        // Auto-remove after 5 seconds
        setTimeout(() => {
          setAlerts((current) => current.filter((a) => a.id !== id));
        }, 5000);

        return [...prev, newAlert];
      });
    };

    window.addEventListener("api-error", handleApiError);
    return () => window.removeEventListener("api-error", handleApiError);
  }, []);

  const removeAlert = useCallback((id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addAlert = useCallback(
    (partial: Partial<Omit<AlertTypeShape, "id">>): number => {
      const id = Math.floor(Date.now() + Math.random() * 1000000);
      const newAlert: AlertTypeShape = {
        id,
        type: (partial.type as AlertType) || ALERT_TYPES.INFO,
        title: partial.title || "Notification",
        message: partial.message || "",
        duration: partial.duration ?? 5000,
        persistent: partial.persistent ?? false,
        position: partial.position,
      };

      setAlerts((prev) => [...prev, newAlert]);

      if ((newAlert.duration ?? 0) > 0) {
        window.setTimeout(() => {
          removeAlert(id);
        }, newAlert.duration);
        // timer is implicitly handled by closure/React state updates
      }

      return id;
    },
    [removeAlert],
  );

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const clearDataChangedWarnings = useCallback(() => {
    setAlerts((prev) => prev.filter((a) => !a.persistent));
  }, []);

  const showSuccess = useCallback(
    (title: string, message = "", options: AlertDisplayOptions = {}) =>
      addAlert({ type: ALERT_TYPES.SUCCESS, title, message, ...options }),
    [addAlert],
  );

  const showError = useCallback(
    (title: string, message = "", options: AlertDisplayOptions = {}) =>
      addAlert({
        type: ALERT_TYPES.ERROR,
        title,
        message,
        duration: 0,
        ...options,
      }),
    [addAlert],
  );

  const showWarning = useCallback(
    (title: string, message = "", options: AlertDisplayOptions = {}) =>
      addAlert({ type: ALERT_TYPES.WARNING, title, message, ...options }),
    [addAlert],
  );

  const showDataChangedWarning = useCallback(
    (title: string, message = "", options: AlertDisplayOptions = {}) =>
      addAlert({
        type: ALERT_TYPES.WARNING,
        title,
        message,
        duration: 0,
        persistent: true,
        position: "top-center",
        ...options,
      }),
    [addAlert],
  );

  const showInfo = useCallback(
    (title: string, message = "", options: AlertDisplayOptions = {}) =>
      addAlert({ type: ALERT_TYPES.INFO, title, message, ...options }),
    [addAlert],
  );

  const value = useMemo(
    () => ({
      alerts,
      addAlert,
      removeAlert,
      clearAllAlerts,
      clearDataChangedWarnings,
      showSuccess,
      showError,
      showWarning,
      showDataChangedWarning,
      showInfo,
    }),
    [
      alerts,
      addAlert,
      removeAlert,
      clearAllAlerts,
      clearDataChangedWarnings,
      showSuccess,
      showError,
      showWarning,
      showDataChangedWarning,
      showInfo,
    ],
  );

  const topCenterAlerts = alerts.filter((a) => a.position === "top-center");
  const rightAlerts = alerts.filter((a) => a.position !== "top-center");

  return (
    <AlertContext.Provider value={value}>
      {children}

      {/* Top center alerts (persistent / data-changed) */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full pointer-events-none">
        <AnimatePresence>
          {topCenterAlerts.map((alert) => (
            <div key={alert.id} className="pointer-events-auto px-4">
              <AlertRenderer alert={alert} onClose={removeAlert} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Right side alerts */}
      <div className="fixed top-4 right-4 z-50 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {rightAlerts.map((alert) => (
            <div key={alert.id} className="pointer-events-auto px-4">
              <AlertRenderer alert={alert} onClose={removeAlert} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </AlertContext.Provider>
  );
};

/**
 * Convenience hook that exposes the commonly used alert methods under
 * short names for component use.
 */
export const useAlertMethods = () => {
  const {
    showSuccess,
    showError,
    showWarning,
    showDataChangedWarning,
    showInfo,
    clearDataChangedWarnings,
  } = useAlert();

  return useMemo(() => ({
    success: showSuccess,
    error: showError,
    warning: showWarning,
    dataChanged: showDataChangedWarning,
    info: showInfo,
    clearDataChangedWarnings,
  }), [
    showSuccess,
    showError,
    showWarning,
    showDataChangedWarning,
    showInfo,
    clearDataChangedWarnings,
  ]);
};

/**
 * Inline message components (for showing inline messages inside forms).
 * These are small wrappers around AlertRenderer configured as inline alerts.
 */
export const InlineMessage: React.FC<{
  message?: string;
  type?: AlertType;
  className?: string;
}> = ({ message = "", type = "info" }) => {
  if (!message) return null;
  const fakeAlert: AlertTypeShape = {
    id: 0,
    type,
    title: message,
    message,
    duration: 0,
  };
  // onClose is a noop for inline messages
  return <AlertRenderer alert={fakeAlert} onClose={() => { }} inline />;
};

export const InlineSuccessMessage: React.FC<{ message?: string }> = ({
  message = "Success!",
}) => <InlineMessage message={message} type="success" />;

export const InlineWarningMessage: React.FC<{ message?: string }> = ({
  message = "Warning",
}) => <InlineMessage message={message} type="warning" />;

export const InlineInfoMessage: React.FC<{ message?: string }> = ({
  message = "Info",
}) => <InlineMessage message={message} type="info" />;

export const InlineErrorMessage: React.FC<{ message?: string }> = ({
  message = "Error",
}) => <InlineMessage message={message} type="error" />;