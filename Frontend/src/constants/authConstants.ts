// User group identifiers (Cognito group names)
export const USER_GROUP_IDS = {
  EMPLOYEE: "TrueTickets-Cacell-Employee",
  MANAGER: "TrueTickets-Cacell-Manager",
  OWNER: "TrueTickets-Cacell-Owner",
  APPLICATION_ADMIN: "TrueTickets-Cacell-ApplicationAdmin",
};

// User group display names
export const USER_GROUP_DISPLAY_NAMES: Record<string, string> = {
  [USER_GROUP_IDS.EMPLOYEE]: "Employee",
  [USER_GROUP_IDS.MANAGER]: "Manager",
  [USER_GROUP_IDS.OWNER]: "Owner",
  [USER_GROUP_IDS.APPLICATION_ADMIN]: "Website Administrator",
};

// Helper function to get display name for a user group
export const getGroupDisplayName = (groupName: string): string => {
  return USER_GROUP_DISPLAY_NAMES[groupName] || groupName;
};

// Helper function to get display names for multiple groups
export const getGroupDisplayNames = (groups: string[] | undefined): string => {
  if (!groups || groups.length === 0) return "Invited, will be employee";
  return groups.map(getGroupDisplayName).join(", ");
};

// User permission checks - which groups can perform which actions
export const CAN_INVITE_USERS_GROUPS = [
  USER_GROUP_IDS.APPLICATION_ADMIN,
  USER_GROUP_IDS.OWNER,
  USER_GROUP_IDS.MANAGER,
];

export const CAN_MANAGE_USERS_GROUPS = [
  USER_GROUP_IDS.APPLICATION_ADMIN,
  USER_GROUP_IDS.OWNER,
];

export const CAN_VIEW_HOURS_GROUPS = [
  USER_GROUP_IDS.APPLICATION_ADMIN,
  USER_GROUP_IDS.OWNER,
  USER_GROUP_IDS.MANAGER,
];

export const CAN_VIEW_INCOME_GROUPS = [
  USER_GROUP_IDS.APPLICATION_ADMIN,
  USER_GROUP_IDS.OWNER,
];

export const CAN_ACCESS_CONFIG_GROUPS = [
  USER_GROUP_IDS.APPLICATION_ADMIN,
  USER_GROUP_IDS.OWNER,
];

export const CAN_ACCESS_SETTINGS_GROUPS = [
  USER_GROUP_IDS.APPLICATION_ADMIN,
  USER_GROUP_IDS.OWNER,
  USER_GROUP_IDS.MANAGER,
  USER_GROUP_IDS.EMPLOYEE,
];

// Error messages for user management
export const USER_MANAGEMENT_ERRORS = {
  ADD_USER_FAILED: "Failed to add user. Please try again.",
  USER_EXISTS: "A user with this email already exists.",
  INSUFFICIENT_PERMISSIONS: "You do not have permission to invite users.",
  INVALID_EMAIL: "Invalid email address. Please check the format.",
  TOO_MANY_REQUESTS: "Too many requests. Please try again later.",
  LOAD_USERS_FAILED: "Failed to load users. Please try again.",
  UPDATE_FAILED: "Failed to update user group. Please try again.",
  DELETE_FAILED: "Failed to delete user. Please try again.",
};

// Success messages for user management
export const USER_MANAGEMENT_SUCCESS = {
  USER_ADDED: "User Added",
  USER_UPDATED: "User Updated",
  USER_DELETED: "User Deleted",
};