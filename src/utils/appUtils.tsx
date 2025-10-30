/**
 * Utility functions for the True Tickets application
 *
 * This file contains helpers used across components. Several callers pass
 * in strongly-typed ticket objects (`SmallTicket` / `LargeTicket`) which
 * are not indexable by default. To remain type-safe while still accepting
 * those objects, export functions accept those ticket types or a generic
 * record and perform internal guarded accesses.
 */

import type { SmallTicket, LargeTicket } from "../types/api";

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
 *
 * Accepts either SmallTicket/LargeTicket or a generic record. Uses guarded
 * property access so TypeScript remains happy and runtime behavior is the same.
 */
export function getTicketPassword(
  ticket: SmallTicket | LargeTicket | Record<string, unknown>,
): string {
  try {
    // Normalize to a record for safe indexed access
    const t = ticket as Record<string, unknown>;
    // Check ticket_fields[0].ticket_type_id first, fallback to main ticket_type_id
    // Safely handle possibly-typed ticket_fields without using `any`.
    let typeId: number | undefined;
    const maybeFields = t["ticket_fields"];
    if (Array.isArray(maybeFields) && maybeFields.length > 0) {
      const first = maybeFields[0] as Record<string, unknown>;
      if (typeof first["ticket_type_id"] === "number") {
        typeId = first["ticket_type_id"] as number;
      }
    }
    if (typeId === undefined && typeof t["ticket_type_id"] === "number") {
      typeId = t["ticket_type_id"] as number;
    }
    const props = (t["properties"] || {}) as Record<string, unknown>;
    const invalid = new Set(["n", "na", "n/a", "none"]);
    const norm = (str: unknown): string =>
      typeof str === "string" ? str.toLowerCase().trim() : "";

    if (typeId === 9818 || typeId === 9836) {
      const normalizedPassword = norm(props["Password"]);
      if (normalizedPassword && !invalid.has(normalizedPassword)) {
        const pw = props["Password"];
        return typeof pw === "string" ? pw : "";
      }
    } else if (typeId === 9801) {
      const normalizedPassword = norm(props["passwordForPhone"]);
      if (normalizedPassword && !invalid.has(normalizedPassword)) {
        const pw = props["passwordForPhone"];
        return typeof pw === "string" ? pw : "";
      }
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
 *
 * Accepts typed ticket objects or a generic record and safely parses the
 * internal `Model` vT JSON when present.
 */
export function getTicketDeviceInfo(
  ticket: SmallTicket | LargeTicket | Record<string, unknown>,
): {
  device: string;
  itemsLeft: string[];
  estimatedTime: string;
} {
  try {
    const t = ticket as Record<string, unknown>;
    const props = (t?.properties || {}) as Record<string, unknown>;
    const model =
      typeof props["Model"] === "string" ? (props["Model"] as string) : "";
    if (model && model.startsWith("vT")) {
      const data = JSON.parse(model.substring(2)) as Record<string, unknown>;
      const device = typeof data.device === "string" ? data.device : "Other";

      // If device is "Other" or not found, try to detect from subject
      if (device === "Other" || !device) {
        const detectedDevice = getDeviceTypeFromSubject(
          typeof t?.subject === "string" ? (t.subject as string) : "",
        );
        return {
          device: detectedDevice || "Other",
          itemsLeft: Array.isArray(data.itemsLeft)
            ? (data.itemsLeft as string[])
            : [],
          estimatedTime:
            typeof data.estimatedTime === "string"
              ? (data.estimatedTime as string)
              : "",
        };
      }

      return {
        device: device,
        itemsLeft: Array.isArray(data.itemsLeft)
          ? (data.itemsLeft as string[])
          : [],
        estimatedTime:
          typeof data.estimatedTime === "string"
            ? (data.estimatedTime as string)
            : "",
      };
    } else {
      // No vT JSON found, try to detect from subject
      const detectedDevice = getDeviceTypeFromSubject(
        typeof t?.subject === "string" ? (t.subject as string) : "",
      );
      return {
        device: detectedDevice || "Other",
        itemsLeft: [],
        estimatedTime: "",
      };
    }
  } catch {
    // Fallback: try to detect from subject even if JSON parsing fails
    const detectedDevice = getDeviceTypeFromSubject(
      typeof (ticket as Record<string, unknown>)?.subject === "string"
        ? ((ticket as Record<string, unknown>).subject as string)
        : "",
    );
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
