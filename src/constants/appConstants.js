// Status constants
export const STATUSES = [
  "Diagnosing",
  "Finding Price",
  "Approval Needed",
  "Waiting for Parts",
  "Waiting (Other)",
  "In Progress",
  "Ready",
  "Resolved",
];

export const DEVICES = ["Phone", "Tablet", "Watch", "Console", "Laptop", "Desktop", "All in one", "Other"];

export const ITEMS_LEFT = ["Charger", "Case", "Controller", "Bag", "Other"];

// Status mapping
export const STATUS_MAP = {
  "New": "Diagnosing",
  "Scheduled": "Finding Price",
  "Call Customer": "Approval Needed",
  "Waiting for Parts": "Waiting for Parts",
  "Waiting on Customer": "Waiting (Other)",
  "In Progress": "In Progress",
  "Customer Reply": "Ready",
  "Ready!": "Ready",
  "Resolved": "Resolved",
};

// Status conversion functions
export const convertStatus = (status) => {
  if (!status) return "";
  return STATUS_MAP[status] || status;
};

export const convertStatusToOriginal = (displayStatus) => {
  if (!displayStatus) return "";
  // Find the original status that maps to this display status
  for (const [original, display] of Object.entries(STATUS_MAP)) {
    if (display === displayStatus) {
      return original;
    }
  }
  return displayStatus; // Return as-is if no mapping found
};

// User roles and permissions
export const USER_ROLES = {
  APPLICATION_ADMIN: 'ApplicationAdmin',
  OWNER: 'Owner',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee'
};

export const PERMISSIONS = {
  MANAGE_USERS: [USER_ROLES.APPLICATION_ADMIN, USER_ROLES.OWNER],
  INVITE_USERS: [USER_ROLES.APPLICATION_ADMIN, USER_ROLES.OWNER, USER_ROLES.MANAGER],
  EDIT_USERS: [USER_ROLES.APPLICATION_ADMIN, USER_ROLES.OWNER],
  REMOVE_USERS: [USER_ROLES.APPLICATION_ADMIN, USER_ROLES.OWNER]
};

// API endpoints
export const API_ENDPOINTS = {
  TICKETS: '/api/tickets',
  CUSTOMERS: '/api/customers',
  USERS: '/users',
  INVITE_USER: '/invite-user',
  UPDATE_USER_GROUP: '/update-user-group'
};

// UI constants
export const UI_CONSTANTS = {
  DEBOUNCE_DELAY: 300,
  POLLING_INTERVAL: 30000,
  MAX_SEARCH_RESULTS: 50,
  MOBILE_BREAKPOINT: 640
};
