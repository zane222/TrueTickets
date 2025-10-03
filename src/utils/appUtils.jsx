// Utility functions for the True Tickets application

/**
 * Class name utility function
 */
export function cx(...xs) { 
  return xs.filter(Boolean).join(" "); 
}

/**
 * Format date string to locale string
 */
export function fmtDate(dateString) {
  try {
    return new Date(dateString).toLocaleString(undefined, {
      year: "numeric",
      month: "numeric",   // "Sep"
      day: "numeric",
      hour: undefined,
      minute: undefined, // removes minutes
      second: undefined, // removes seconds
    });
  } catch { 
    return dateString; 
  }
}

/**
 * Format time string to locale string
 */
export function fmtTime(timeString) {
  try {
    return new Date(timeString).toLocaleString(undefined, {
      year: undefined,
      month: undefined, 
      day: undefined,
      hour: "numeric",
      minute: "2-digit", // keeps minutes like "08"
      second: undefined, // removes seconds
    });
  } catch { 
    return timeString; 
  }
}

/**
 * Format date and time string
 */
export function fmtDateAndTime(dateTimeString) {
  try {
    return fmtDate(dateTimeString) + " | " + fmtTime(dateTimeString);
  } catch { 
    return dateTimeString; 
  }
}

/**
 * Format phone number
 */
export function formatPhone(phoneNumber = "") {
  const digits = phoneNumber.replace(/\D/g, ""); // remove anything not a digit
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phoneNumber;
}

/**
 * Get ticket password from ticket object
 */
export function getTicketPassword(ticket) {
  try {
    // Check ticket_fields[0].ticket_type_id first, fallback to main ticket_type_id
    const typeId = ticket?.ticket_fields?.[0]?.ticket_type_id || ticket?.ticket_type_id;
    const props = ticket?.properties || {};
    const invalid = new Set(["n", "na", "n/a", "none"]);
    const norm = (str) => (typeof str === 'string' ? str.toLowerCase().trim() : "");
    
    if (typeId === 9818 || typeId === 9836) {
      const normalizedPassword = norm(props.Password);
      if (normalizedPassword && !invalid.has(normalizedPassword)) return props.Password;
    } else if (typeId === 9801) {
      const normalizedPassword = norm(props.passwordForPhone);
      if (normalizedPassword && !invalid.has(normalizedPassword)) return props.passwordForPhone;
    }
    return "";
  } catch { 
    return ""; 
  }
}

/**
 * Get ticket device information
 */
export function getTicketDeviceInfo(ticket) {
  try {
    const model = ticket?.properties?.["Model"] || "";
    if (model.startsWith("vT")) {
      const data = JSON.parse(model.substring(2));
      return {
        device: data.device || "Other",
        itemsLeft: data.itemsLeft || [],
        estimatedTime: data.estimatedTime || ""
      };
    } else {
      return { device: "Other", itemsLeft: [], estimatedTime: "" };
    }
  } catch { 
    return { device: "Other", itemsLeft: [], estimatedTime: "" };
  }
}

/**
 * Format items left array
 */
export function formatItemsLeft(itemsLeft) {
  if (!Array.isArray(itemsLeft) || itemsLeft.length === 0) return "";
  return "They left: " + itemsLeft.join(", ").toLowerCase();
}

/**
 * Format comment with clickable links
 */
export function formatCommentWithLinks(text) {
  if (!text) return '';
  
  // URL regex pattern to match http/https URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Split text by URLs and create array of text and link elements
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-600 underline"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if user has permission
 */
export function hasPermission(userGroups, permission) {
  return userGroups.some(group => permission.includes(group));
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format
 */
export function isValidPhone(phone) {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/\D/g, ''));
}

/**
 * Generate random ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === "object") {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}
