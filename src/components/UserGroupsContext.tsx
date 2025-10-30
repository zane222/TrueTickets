import React, { createContext, useContext } from "react";

/**
 * Context for storing user groups and related helpers.
 * This file contains only the context and a hook to access it so it can be
 * imported from other files (e.g. `Auth.tsx`) without exporting components
 * from the same module.
 */

export interface UserGroupsContextType {
  userGroups: string[];
  setUserGroups: (groups: string[]) => void;
  /**
   * Refresh user groups (should return the latest groups).
   * Implementations provided by the consumer (e.g. AuthWrapper) may fetch
   * from an auth/session API and return the resolved groups.
   */
  refreshUserGroups: () => Promise<string[]>;
  userName: string | null;
}

export const UserGroupsContext = createContext<UserGroupsContextType | null>(
  null,
);

/**
 * Hook to consume the user groups context.
 * Throws a helpful error when used outside of a provider.
 */
export const useUserGroups = (): UserGroupsContextType => {
  const context = useContext(UserGroupsContext);
  if (!context) {
    throw new Error("useUserGroups must be used within a UserGroupsProvider");
  }
  return context;
};
