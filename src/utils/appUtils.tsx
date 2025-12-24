/**
 * Utility functions for the True Tickets application
 *
 * This file contains helpers used across components. Several callers pass
 * in strongly-typed ticket objects (`SmallTicket` / `LargeTicket`) which
 * are not indexable by default. To remain type-safe while still accepting
 * those objects, export functions accept those ticket types or a generic
 * record and perform internal guarded accesses.
 */

import type { Ticket } from "../types/api";

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
  ticket: Ticket | Record<string, unknown>,
): string {
  try {
    const t = ticket as Record<string, unknown>;
    if (typeof t["password"] === "string") {
      const pw = t["password"] as string;
      const invalid = new Set(["n", "na", "n/a", "none"]);
      if (pw && !invalid.has(pw.toLowerCase().trim())) {
        return pw;
      }
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Get device type from subject text based on keywords
 * Checks one word at a time and returns on first match using a hashmap
 */
export function getDeviceTypeFromSubject(subjectText: string): string | null {
  if (!subjectText) return null;

  // Hashmap of keywords to device types
  const keywordMap: Record<string, string> = {
    // Phone keywords
    iphone: "Phone",
    iph: "Phone",
    ip: "Phone",
    galaxy: "Phone",
    pixel: "Phone",
    oneplus: "Phone",
    samsung: "Phone",
    huawei: "Phone",
    phone: "Phone",
    moto: "Phone",
    // Tablet keywords
    ipad: "Tablet",
    tablet: "Tablet",
    kindle: "Tablet",
    tab: "Tablet",
    // Laptop keywords
    laptop: "Laptop",
    macbook: "Laptop",
    thinkpad: "Laptop",
    elitebook: "Laptop",
    chromebook: "Laptop",
    inspiron: "Laptop",
    predator: "Laptop",
    latitude: "Laptop",
    ltop: "Laptop",
    // Desktop keywords
    desktop: "Desktop",
    dtop: "Desktop",
    pc: "Desktop",
    tower: "Desktop",
    omen: "Desktop",
    // Watch keywords
    watch: "Watch",
    smartwatch: "Watch",
    // Console keywords
    playstation: "Console",
    xbox: "Console",
    nintendo: "Console",
    switch: "Console",
    ps6: "Console",
    ps5: "Console",
    ps4: "Console",
    console: "Console",
    controller: "Console",
  };

  // Split into words and check each one
  const words = subjectText.toLowerCase().split(/\s+/);

  for (const word of words) {
    if (word in keywordMap) {
      return keywordMap[word];
    }
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
  ticket: Ticket | Record<string, unknown>,
): {
  device: string;
  itemsLeft: string[];
  estimatedTime: string;
} {
  try {
    const t = ticket as Record<string, unknown>;
    let device = "Other";
    let itemsLeft: string[] = [];
    let estimatedTime = "";

    // Use top-level estimated_time if available
    if (typeof t["estimated_time"] === "string" && t["estimated_time"]) {
      estimatedTime = t["estimated_time"] as string;
    }

    // Detection fallback for device
    const detectedDevice = getDeviceTypeFromSubject(
      typeof t?.subject === "string" ? (t.subject as string) : "",
    );
    device = detectedDevice || "Other";

    return {
      device,
      itemsLeft,
      estimatedTime,
    };
  } catch {
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
          className="text-link underline"
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

/**
 * Compress image file if it exceeds size limit
 */
export async function compressImage(
  file: File,
  maxWidth = 2048,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}
