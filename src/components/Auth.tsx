import React, { useEffect, useState } from "react";
import {
  getCurrentUser,
  signIn,
  signOut,
  resetPassword,
  fetchAuthSession,
  confirmResetPassword,
} from "aws-amplify/auth";
import { motion } from "framer-motion";
import { Mail, Eye, EyeOff } from "lucide-react";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { InlineMessage, InlineErrorMessage } from "./ui/AlertSystem";
import type { AlertType } from "./ui/alertTypes";
import { UserGroupsContext } from "./UserGroupsContext";

import type { AmplifyAuthUser, IdTokenPayload } from "../types";

type AuthUser = AmplifyAuthUser;

/**
 * Helper: parse unknown thrown error into normalized { code, message }.
 * Use `unknown` in catch clauses and call this to read values safely.
 */
function parseAuthError(err: unknown): { code?: string; message: string } {
  if (err && typeof err === "object") {
    // Some Amplify errors expose `.code` and `.message`
    const maybe = err as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "string" ? maybe.code : undefined;
    const message =
      typeof maybe.message === "string" ? maybe.message : String(err);
    return { code, message };
  }
  // Fallback
  return { message: String(err) };
}

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
 * Login form component
 */
export function LoginForm({
  onLoginSuccess,
}: {
  onLoginSuccess: (user: AuthUser) => void;
}) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<AlertType>("error");
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>("");
  const [forgotPasswordLoading, setForgotPasswordLoading] =
    useState<boolean>(false);
  const [showResetCodeForm, setShowResetCodeForm] = useState<boolean>(false);
  const [resetCode, setResetCode] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [resetPasswordLoading, setResetPasswordLoading] =
    useState<boolean>(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [_showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [_showConfirmPassword, setShowConfirmPassword] =
    useState<boolean>(false);
  const [showResetNewPassword, setShowResetNewPassword] =
    useState<boolean>(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] =
    useState<boolean>(false);

  useEffect(() => {
    if (showResetCodeForm) {
      setResetCode("");
    }
  }, [showResetCodeForm]);

  const _resetForm = (): void => {
    setError("");
    setMessage("");
    setMessageType("error");
    setPassword("");
    setShowResetCodeForm(false);
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setShowResetNewPassword(false);
    setShowResetConfirmPassword(false);
  };

  const setMessageWithType = (
    messageText: string,
    type: AlertType = "error",
  ): void => {
    setMessage(messageText);
    setMessageType(type);
    setError("");
  };

  const handlePasswordLogin = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = (await signIn({
        username: email,
        password: password,
      })) as unknown as AuthUser;
      onLoginSuccess(user);
    } catch (err: unknown) {
      const parsed = parseAuthError(err);
      console.error("Login error:", parsed);
      if (parsed.code === "NotAuthorizedException") {
        setError(
          "Invalid email or password. Please check your credentials and try again.",
        );
      } else if (parsed.code === "UserNotFoundException") {
        setError(
          "No account found with this email address. Please contact an administrator to be invited.",
        );
      } else if (parsed.code === "UserNotConfirmedException") {
        setError(
          "Your account is not confirmed. Please contact an administrator to resend your invitation.",
        );
      } else if (parsed.code === "TooManyRequestsException") {
        setError(
          "Too many login attempts. Please wait a few minutes before trying again.",
        );
      } else {
        setError(parsed.message || "Login failed. Please try again.");
      }
      setMessage("");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setError("");

    try {
      await resetPassword({ username: forgotPasswordEmail });
      setMessageWithType(
        "Password reset code sent to your email. Please check your inbox.",
        "success",
      );
      setShowResetCodeForm(true);
    } catch (err: unknown) {
      const parsed = parseAuthError(err);
      console.error("Forgot password error:", parsed);
      setError(parsed.message || "Failed to send reset code");
      setMessage("");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleResetPassword = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    setResetPasswordLoading(true);
    setError("");

    try {
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters long");
      }

      await confirmResetPassword({
        username: forgotPasswordEmail,
        confirmationCode: resetCode,
        newPassword: newPassword,
      });

      setMessageWithType(
        "Password reset successful! You can now sign in with your new password.",
        "success",
      );
      setShowResetCodeForm(false);
      setShowForgotPassword(false);
    } catch (err: unknown) {
      const parsed = parseAuthError(err);
      console.error("Reset password error:", parsed);

      if (parsed.code === "CodeMismatchException") {
        setError("Invalid reset code. Please check your email and try again.");
        setMessage("");
      } else if (parsed.code === "ExpiredCodeException") {
        setError("Reset code has expired. Please request a new one.");
        setMessage("");
      } else if (parsed.code === "InvalidPasswordException") {
        setError(
          "Password does not meet requirements. Please use a stronger password.",
        );
        setMessage("");
      } else {
        setError(
          parsed.message || "Failed to reset password. Please try again.",
        );
        setMessage("");
      }
    } finally {
      setResetPasswordLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center material-surface py-6 sm:py-12 px-3 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div>
          <h2 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl font-extrabold text-primary">
            Sign in to True Tickets
          </h2>
          <p className="mt-2 text-center text-md text-outline">
            Enter your credentials to sign in
          </p>
        </div>

        {!showForgotPassword ? (
          <div className="md-card p-4 sm:p-8">
            <form
              className="space-y-4 sm:space-y-6"
              onSubmit={handlePasswordLogin}
            >
              <div>
                <label
                  htmlFor="email"
                  className="block text-md font-medium mb-2 text-on-surface"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="md-input text-md sm:text-base py-3 sm:py-2"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEmail(e.target.value)
                  }
                  tabIndex={1}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-md font-medium mb-2 text-on-surface"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    className="md-input text-md sm:text-base py-3 sm:py-2 pr-10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPassword(e.target.value)
                    }
                    tabIndex={1}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && <InlineErrorMessage message={error} />}
              {message && (
                <InlineMessage message={message} type={messageType} />
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-md flex items-center gap-1 text-primary"
                  tabIndex={-1}
                >
                  <Mail className="w-4 h-4" />
                  Forgot password or just got invited?
                </button>
              </div>

              <div>
                <motion.button
                  type="submit"
                  disabled={loading}
                  className="md-btn-primary w-full flex justify-center py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                  whileTap={{ scale: 0.98 }}
                  tabIndex={0}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Signing in...
                    </div>
                  ) : (
                    "Sign in"
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        ) : !showResetCodeForm ? (
          <div className="md-card p-4 sm:p-8">
            <form
              className="space-y-4 sm:space-y-6"
              onSubmit={handleForgotPassword}
            >
              <div>
                <label
                  htmlFor="forgotPasswordEmail"
                  className="block text-md font-medium mb-2 text-on-surface"
                >
                  Email Address
                </label>
                <input
                  id="forgotPasswordEmail"
                  name="forgotPasswordEmail"
                  type="email"
                  required
                  className="md-input text-md sm:text-base py-3 sm:py-2"
                  placeholder="Enter your email address"
                  value={forgotPasswordEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForgotPasswordEmail(e.target.value)
                  }
                />
              </div>

              {error && <InlineErrorMessage message={error} />}
              {message && (
                <InlineMessage message={message} type={messageType} />
              )}

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:space-x-3">
                <motion.button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="md-btn-surface flex-1 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                  whileTap={{ scale: 0.98 }}
                >
                  Back to Login
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={forgotPasswordLoading}
                  className="md-btn-primary flex-1 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                  whileTap={{ scale: 0.98 }}
                >
                  {forgotPasswordLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Sending...
                    </div>
                  ) : (
                    "Send Reset Code"
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        ) : null}

        {showResetCodeForm && (
          <div key="reset-code-form" className="md-card p-4 sm:p-8">
            <div className="text-center mb-4 sm:mb-6">
              <h3 className="text-lg font-semibold text-primary">
                Enter Reset Code
              </h3>
              <p className="text-md mt-2 text-outline">
                We sent a 6-digit code to {forgotPasswordEmail}
              </p>
            </div>

            <form
              className="space-y-4 sm:space-y-6"
              onSubmit={handleResetPassword}
            >
              <div>
                <label
                  htmlFor="resetCode"
                  className="block text-md font-medium mb-2 text-on-surface"
                >
                  Reset Code
                </label>
                <input
                  id="resetCode"
                  name="resetCode"
                  type="text"
                  required
                  className="md-input text-md sm:text-base py-3 sm:py-2"
                  placeholder="Enter 6-digit code"
                  value={resetCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setResetCode(e.target.value)
                  }
                  maxLength={6}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-md font-medium mb-2 text-on-surface"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    name="newPassword"
                    type={showResetNewPassword ? "text" : "password"}
                    required
                    className="md-input text-md sm:text-base py-3 sm:py-2 pr-10"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewPassword(e.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetNewPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-primary transition-colors"
                  >
                    {showResetNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-md font-medium mb-2 text-on-surface"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showResetConfirmPassword ? "text" : "password"}
                    required
                    className="md-input text-md sm:text-base py-3 sm:py-2 pr-10"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setConfirmPassword(e.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-primary transition-colors"
                  >
                    {showResetConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && <InlineErrorMessage message={error} />}
              {message && (
                <InlineMessage message={message} type={messageType} />
              )}

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:space-x-3">
                <motion.button
                  type="button"
                  onClick={() => {
                    setShowResetCodeForm(false);
                    setShowForgotPassword(false);
                  }}
                  className="md-btn-surface flex-1 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={resetPasswordLoading}
                  className="md-btn-primary flex-1 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                  whileTap={{ scale: 0.98 }}
                >
                  {resetPasswordLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Resetting...
                    </div>
                  ) : (
                    "Reset Password"
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
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

  const _handleLogout = async (): Promise<void> => {
    try {
      await signOut();
      setUser(null);
      setUserGroups([]);
      setUserName(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center material-surface">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!user) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
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
