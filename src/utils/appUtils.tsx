// Utility functions for the True Tickets application

/**
 * Class name utility function
 */
export function cx(...xs: unknown[]): string {
  return xs.filter(Boolean).join(" ");
}

/**
 * Format date string to locale string
 */
export function fmtDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString(undefined, {
      year: "numeric",
      month: "numeric", // "Sep"
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
export function fmtTime(timeString: string): string {
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
export function fmtDateAndTime(dateTimeString: string): string {
  try {
    return fmtDate(dateTimeString) + " | " + fmtTime(dateTimeString);
  } catch {
    return dateTimeString;
  }
}

/**
 * Format phone number
 */
export function formatPhone(phoneNumber: string = ""): string {
  const digits = phoneNumber.replace(/\D/g, ""); // remove anything not a digit
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phoneNumber;
}

/**
 * Get ticket password from ticket object
 */
export function getTicketPassword(ticket: Record<string, any>): string {
  try {
    // Check ticket_fields[0].ticket_type_id first, fallback to main ticket_type_id
    const typeId =
      ticket?.ticket_fields?.[0]?.ticket_type_id || ticket?.ticket_type_id;
    const props = ticket?.properties || {};
    const invalid = new Set(["n", "na", "n/a", "none"]);
    const norm = (str: unknown): string =>
      typeof str === "string" ? str.toLowerCase().trim() : "";

    if (typeId === 9818 || typeId === 9836) {
      const normalizedPassword = norm(props.Password);
      if (normalizedPassword && !invalid.has(normalizedPassword))
        return props.Password;
    } else if (typeId === 9801) {
      const normalizedPassword = norm(props.passwordForPhone);
      if (normalizedPassword && !invalid.has(normalizedPassword))
        return props.passwordForPhone;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Get device type from subject text based on keywords
 */
function getDeviceTypeFromSubject(subjectText: string): string | null {
  if (!subjectText) return null;

  const text = subjectText.toLowerCase();

  // Phone keywords
  if (
    text.includes("iphone ") ||
    text.includes("iph ") ||
    text.includes("ip ") ||
    text.includes("galaxy ") ||
    text.includes("pixel ") ||
    text.includes("oneplus ") ||
    text.includes("samsung ") ||
    text.includes("huawei ") ||
    text.includes("phone ") ||
    text.includes("moto ")
  ) {
    return "Phone";
  }

  // Tablet keywords
  if (
    text.includes("ipad ") ||
    text.includes("tablet ") ||
    text.includes("kindle ") ||
    text.includes("tab ")
  ) {
    return "Tablet";
  }

  // Laptop keywords
  if (
    text.includes("laptop ") ||
    text.includes("macbook ") ||
    text.includes("thinkpad ") ||
    text.includes("elitebook ") ||
    text.includes("chromebook ") ||
    text.includes("inspiron ") ||
    text.includes("predator ") ||
    text.includes("latitude ") ||
    text.includes("ltop ")
  ) {
    return "Laptop";
  }

  // Desktop keywords
  if (
    text.includes("desktop ") ||
    text.includes("pc ") ||
    text.includes("tower ") ||
    text.includes("omen ")
  ) {
    return "Desktop";
  }

  // Watch keywords
  if (text.includes("watch ") || text.includes("smartwatch ")) {
    return "Watch";
  }

  // Console keywords
  if (
    text.includes("playstation ") ||
    text.includes("xbox ") ||
    text.includes("nintendo ") ||
    text.includes("switch ") ||
    text.includes("ps6 ") ||
    text.includes("ps5 ") ||
    text.includes("ps4 ") ||
    text.includes("console ") ||
    text.includes("controller ")
  ) {
    return "Console";
  }

  // All in one keywords
  if (
    text.includes("all in one ") ||
    text.includes("all-in-one ") ||
    text.includes("imac ") ||
    text.includes("aio ")
  ) {
    return "All in one";
  }

  return null; // No match found
}

/**
 * Get ticket device information
 */
export function getTicketDeviceInfo(ticket: Record<string, any>): {
  device: string;
  itemsLeft: string[];
  estimatedTime: string;
} {
  try {
    const model = ticket?.properties?.["Model"] || "";
    if (model.startsWith("vT")) {
      const data = JSON.parse(model.substring(2));
      const device = data.device || "Other";

      // If device is "Other" or not found, try to detect from subject
      if (device === "Other" || !device) {
        const detectedDevice = getDeviceTypeFromSubject(ticket?.subject || "");
        return {
          device: detectedDevice || "Other",
          itemsLeft: data.itemsLeft || [],
          estimatedTime: data.estimatedTime || "",
        };
      }

      return {
        device: device,
        itemsLeft: data.itemsLeft || [],
        estimatedTime: data.estimatedTime || "",
      };
    } else {
      // No vT JSON found, try to detect from subject
      const detectedDevice = getDeviceTypeFromSubject(ticket?.subject || "");
      return {
        device: detectedDevice || "Other",
        itemsLeft: [],
        estimatedTime: "",
      };
    }
  } catch {
    // Fallback: try to detect from subject even if JSON parsing fails
    const detectedDevice = getDeviceTypeFromSubject(ticket?.subject || "");
    return {
      device: detectedDevice || "Other",
      itemsLeft: [],
      estimatedTime: "",
    };
  }
}

/**
 * Format items left array
 */
export function formatItemsLeft(itemsLeft: string[]): string {
  if (!Array.isArray(itemsLeft) || itemsLeft.length === 0) return "";
  return "They left: " + itemsLeft.join(", ").toLowerCase();
}

/**
 * Format comment with clickable links
 */
export function formatCommentWithLinks(
  text: string,
): (string | React.ReactElement)[] {
  if (!text) return [];

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
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | undefined;
  return function executedFunction(...args: Parameters<T>) {
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
export function hasPermission(
  userGroups: string[],
  permission: string[],
): boolean {
  return userGroups.some((group) => permission.includes(group));
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/\D/g, ""));
}

/**
 * Generate random ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (obj instanceof Array) return obj.map((item) => deepClone(item)) as T;
  if (typeof obj === "object") {
    const clonedObj: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = deepClone((obj as Record<string, unknown>)[key]);
      }
    }
    return clonedObj as T;
  }
  return obj;
}
