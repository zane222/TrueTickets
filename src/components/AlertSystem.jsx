import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

// Alert context
const AlertContext = createContext();

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

// Alert types
export const ALERT_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Alert component
const Alert = ({ alert, onClose, inline = false }) => {
  const getAlertStyles = (type) => {
    switch (type) {
      case ALERT_TYPES.SUCCESS:
        return {
          backgroundColor: 'var(--md-sys-color-primary-container)',
          color: 'var(--md-sys-color-on-primary-container)',
          icon: CheckCircle
        };
      case ALERT_TYPES.ERROR:
        return {
          backgroundColor: 'var(--md-sys-color-error)',
          color: 'var(--md-sys-color-on-error)',
          icon: AlertCircle
        };
      case ALERT_TYPES.WARNING:
        return {
          backgroundColor: '#fbbf24', // Yellow background
          color: '#1f2937', // Dark gray text for better contrast
          icon: AlertTriangle
        };
      case ALERT_TYPES.INFO:
        return {
          backgroundColor: 'var(--md-sys-color-secondary-container)',
          color: 'var(--md-sys-color-on-secondary-container)',
          icon: Info
        };
      default:
        return {
          backgroundColor: 'var(--md-sys-color-secondary-container)',
          color: 'var(--md-sys-color-on-secondary-container)',
          icon: Info
        };
    }
  };

  const styles = getAlertStyles(alert.type);
  const IconComponent = styles.icon;

  // Inline version for forms
  if (inline) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-md p-4 flex items-center gap-2"
        style={{
          backgroundColor: styles.backgroundColor,
          color: styles.color
        }}
      >
        <IconComponent className="w-4 h-4 flex-shrink-0" />
        <div className="text-md">{alert.message || alert.title}</div>
      </motion.div>
    );
  }

  // Global alert version
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      className="rounded-md p-4 mb-3 flex items-start gap-3"
      style={{
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        // Force text color for warnings to override CSS variables
        '--text-color': styles.color
      }}
    >
      <IconComponent className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <div className="text-md font-medium" style={{ color: styles.color }}>{alert.title}</div>
        {alert.message && (
          <div className="text-md mt-1 opacity-90" style={{ color: styles.color }}>{alert.message}</div>
        )}
      </div>
      <button
        onClick={() => onClose(alert.id)}
        className="flex-shrink-0 p-1 hover:bg-black/10 rounded"
        style={{ color: styles.color }}
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

// Alert provider component
export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);

  const addAlert = useCallback((alert) => {
    const id = Date.now() + Math.random();
    const newAlert = {
      id,
      type: ALERT_TYPES.INFO,
      title: 'Notification',
      message: '',
      duration: 5000,
      ...alert
    };

    setAlerts(prev => [...prev, newAlert]);

    // Auto-remove alert after duration
    if (newAlert.duration > 0) {
      setTimeout(() => {
        removeAlert(id);
      }, newAlert.duration);
    }

    return id;
  }, []);

  const removeAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Clear only data changed warnings (persistent alerts)
  const clearDataChangedWarnings = useCallback(() => {
    setAlerts(prev => prev.filter(alert => !alert.persistent));
  }, []);

  // Convenience methods
  const showSuccess = useCallback((title, message = '', options = {}) => {
    return addAlert({
      type: ALERT_TYPES.SUCCESS,
      title,
      message,
      ...options
    });
  }, [addAlert]);

  const showError = useCallback((title, message = '', options = {}) => {
    return addAlert({
      type: ALERT_TYPES.ERROR,
      title,
      message,
      duration: 0, // Error alerts don't auto-dismiss
      ...options
    });
  }, [addAlert]);

  const showWarning = useCallback((title, message = '', options = {}) => {
    return addAlert({
      type: ALERT_TYPES.WARNING,
      title,
      message,
      ...options
    });
  }, [addAlert]);

  // Special method for data changed warnings - persistent and positioned at top center
  const showDataChangedWarning = useCallback((title, message = '', options = {}) => {
    return addAlert({
      type: ALERT_TYPES.WARNING,
      title,
      message,
      duration: 0, // Never auto-dismiss
      persistent: true, // Mark as persistent
      position: 'top-center', // Special positioning
      ...options
    });
  }, [addAlert]);

  const showInfo = useCallback((title, message = '', options = {}) => {
    return addAlert({
      type: ALERT_TYPES.INFO,
      title,
      message,
      ...options
    });
  }, [addAlert]);

  const value = {
    alerts,
    addAlert,
    removeAlert,
    clearAllAlerts,
    clearDataChangedWarnings,
    showSuccess,
    showError,
    showWarning,
    showDataChangedWarning,
    showInfo
  };

  // Separate alerts by position
  const topCenterAlerts = alerts.filter(alert => alert.position === 'top-center');
  const rightAlerts = alerts.filter(alert => !alert.position || alert.position !== 'top-center');

  return (
    <AlertContext.Provider value={value}>
      {children}
      
      {/* Top center alerts (data changed warnings) */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full">
        <AnimatePresence>
          {topCenterAlerts.map(alert => (
            <Alert
              key={alert.id}
              alert={alert}
              onClose={removeAlert}
            />
          ))}
        </AnimatePresence>
      </div>
      
      {/* Right side alerts (regular notifications) */}
      <div className="fixed top-4 right-4 z-50 max-w-sm w-full">
        <AnimatePresence>
          {rightAlerts.map(alert => (
            <Alert
              key={alert.id}
              alert={alert}
              onClose={removeAlert}
            />
          ))}
        </AnimatePresence>
      </div>
    </AlertContext.Provider>
  );
};

// Hook for easy access to alert methods
export const useAlertMethods = () => {
  const { showSuccess, showError, showWarning, showDataChangedWarning, showInfo, clearDataChangedWarnings } = useAlert();
  
  return {
    success: showSuccess,
    error: showError,
    warning: showWarning,
    dataChanged: showDataChangedWarning,
    info: showInfo,
    clearDataChangedWarnings
  };
};

// Inline message components for forms
export function InlineMessage({ message, type = ALERT_TYPES.ERROR, className = '' }) {
  if (!message) return null;
  
  return (
    <Alert 
      alert={{ 
        id: 'inline', 
        type, 
        message, 
        title: message 
      }} 
      onClose={() => {}} 
      inline={true} 
      className={className}
    />
  );
}

export function InlineSuccessMessage({ message, className = '' }) {
  return <InlineMessage message={message} type={ALERT_TYPES.SUCCESS} className={className} />;
}

export function InlineWarningMessage({ message, className = '' }) {
  return <InlineMessage message={message} type={ALERT_TYPES.WARNING} className={className} />;
}

export function InlineInfoMessage({ message, className = '' }) {
  return <InlineMessage message={message} type={ALERT_TYPES.INFO} className={className} />;
}

export function InlineErrorMessage({ message, className = '' }) {
  return <InlineMessage message={message} type={ALERT_TYPES.ERROR} className={className} />;
}
