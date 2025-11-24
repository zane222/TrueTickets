import React, { useEffect, useState } from "react";
import {
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { UserGroupsContext } from "./UserGroupsContext";
import { LoginPage } from "./auth/LoginPage";

import type { AmplifyAuthUser, IdTokenPayload } from "../types";

type AuthUser = AmplifyAuthUser;

/**
 * Helper: Safely extract the id token payload from the session object returned by `fetchAuthSession`.
 * We treat the session as unknown and only return a plain object if it looks right.
 */
function getIdTokenPayload(session: unknown): IdTokenPayload | undefined {
  if (!session || typeof session !== "object") return undefined;
  const s = session as Record<string, unknown>;
  const tokens = s["tokens"];
  if (!tokens || typeof tokens !== "object") return undefined;
  const t = tokens as Record<string, unknown>;
  const idToken = t["idToken"];
  if (!idToken || typeof idToken !== "object") return undefined;
  const id = idToken as Record<string, unknown>;
  const payload = id["payload"];
  if (!payload || typeof payload !== "object") return undefined;
  return payload as IdTokenPayload;
}

/**
 * Helper: Ensure a value is a string[]; otherwise return []
 */
function parseGroups(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  // Filter only string entries to be safe
  const strings = value.filter((v) => typeof v === "string") as string[];
  return strings;
}

/**
 * AuthWrapper: manages auth state and provides user groups via context
 */
export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [userGroups, setUserGroups] = useState<string[]>([]);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    void checkAuthState();
  }, []);

  useEffect(() => {
    if (!user) return;
    const refreshUserGroups = async (): Promise<void> => {
      try {
        const session = await fetchAuthSession();
        const payload = getIdTokenPayload(session);
        const groups = parseGroups(payload?.["cognito:groups"]);
        setUserGroups(groups);
      } catch (error) {
        console.error("Error refreshing user groups:", error);
      }
    };

    const timeoutId = setTimeout(() => {
      void refreshUserGroups();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [user]);

  const checkAuthState = async (): Promise<void> => {
    try {
      const currentUser =
        (await getCurrentUser()) as unknown as AuthUser | null;
      setUser(currentUser);

      // Retry loop to fetch groups and name (mirrors previous behavior)
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const session = await fetchAuthSession();
          const payload = getIdTokenPayload(session);
          const groups =
            currentUser?.signInDetails?.loginId != null
              ? parseGroups(payload?.["cognito:groups"])
              : [];

          const name =
            (payload?.["custom:given_name"] as string | undefined) ??
            (payload?.["given_name"] as string | undefined) ??
            (payload?.["name"] as string | undefined) ??
            currentUser?.username ??
            null;

          if (
            (Array.isArray(groups) && groups.length > 0) ||
            attempts === maxAttempts - 1
          ) {
            setUserGroups(groups);
            setUserName(name);
            break;
          }

          // wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        } catch (err) {
          console.error("Error fetching session in checkAuthState:", err);
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    } catch (err) {
      console.log("No authenticated user:", err);
      setUser(null);
      setUserName(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (userArg: AuthUser): Promise<void> => {
    setUser(userArg);

    const fetchUserGroups = async (): Promise<void> => {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const session = await fetchAuthSession();
          const payload = getIdTokenPayload(session);
          const groups = parseGroups(payload?.["cognito:groups"]);
          const name =
            (payload?.["custom:given_name"] as string | undefined) ??
            (payload?.["given_name"] as string | undefined) ??
            (payload?.["name"] as string | undefined) ??
            userArg?.username ??
            null;

          if (Array.isArray(groups) && groups.length > 0) {
            setUserGroups(groups);
            setUserName(name);
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        } catch (err) {
          console.error("Error fetching session:", err);
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        }
      }

      setUserGroups([]);
      setUserName(null);
    };

    void fetchUserGroups();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center material-surface">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const refreshUserGroups = async (): Promise<string[]> => {
    if (!user) return [];
    try {
      const session = await fetchAuthSession();
      const payload = getIdTokenPayload(session);
      const groups = parseGroups(payload?.["cognito:groups"]);
      const name =
        (payload?.["custom:given_name"] as string | undefined) ??
        (payload?.["given_name"] as string | undefined) ??
        (payload?.["name"] as string | undefined) ??
        user?.username ??
        null;

      setUserGroups(groups);
      setUserName(name);
      return groups;
    } catch (err) {
      console.error("Error manually refreshing user groups:", err);
      return [];
    }
  };

  return (
    <UserGroupsContext.Provider
      value={{ userGroups, setUserGroups, refreshUserGroups, userName }}
    >
      <div className="min-h-screen material-surface">
        {/* Main content */}
        <div className="flex-1">{children}</div>
      </div>
    </UserGroupsContext.Provider>
  );
}