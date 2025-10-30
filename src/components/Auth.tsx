import React, { useState, useEffect, createContext, useContext } from "react";
import {
  getCurrentUser,
  signIn,
  signOut,
  resetPassword,
} from "aws-amplify/auth";
import { fetchAuthSession } from "aws-amplify/auth";
import { motion } from "framer-motion";
import { Mail, Eye, EyeOff } from "lucide-react";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { InlineMessage, InlineErrorMessage } from "./ui/AlertSystem";

// Create context for user groups
interface UserGroupsContextType {
  userGroups: string[];
  setUserGroups: (groups: string[]) => void;
  refreshUserGroups: () => Promise<string[]>;
  userName: string | null;
}

const UserGroupsContext = createContext<UserGroupsContextType | null>(null);

export const useUserGroups = () => {
  const context = useContext(UserGroupsContext);
  if (!context) {
    throw new Error("useUserGroups must be used within a UserGroupsProvider");
  }
  return context;
};

export function LoginForm({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error"); // 'error', 'success', 'info'
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [showResetCodeForm, setShowResetCodeForm] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] =
    useState(false);

  // Clear reset code when form is first shown
  useEffect(() => {
    if (showResetCodeForm) {
      setResetCode("");
    }
  }, [showResetCodeForm]);

  const resetForm = () => {
    setError("");
    setMessage("");
    setMessageType("error");
    setPassword("");
    setShowResetCodeForm(false);
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    // Reset form state

    // Reset password visibility states
    setShowPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setShowResetNewPassword(false);
    setShowResetConfirmPassword(false);
  };

  const setMessageWithType = (messageText, type = "error") => {
    setMessage(messageText);
    setMessageType(type);
    setError(""); // Clear any existing error
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await signIn({ username: email, password: password });
      onLoginSuccess(user);
    } catch (err) {
      console.error("Login error:", err);

      // Handle specific Cognito errors with user-friendly messages
      if (err.code === "NotAuthorizedException") {
        setError(
          "Invalid email or password. Please check your credentials and try again.",
        );
      } else if (err.code === "UserNotFoundException") {
        setError(
          "No account found with this email address. Please contact an administrator to be invited.",
        );
      } else if (err.code === "UserNotConfirmedException") {
        setError(
          "Your account is not confirmed. Please contact an administrator to resend your invitation.",
        );
      } else if (err.code === "TooManyRequestsException") {
        setError(
          "Too many login attempts. Please wait a few minutes before trying again.",
        );
      } else {
        setError(err.message || "Login failed. Please try again.");
      }

      setMessage("");
    } finally {
      setLoading(false);
    }
  };

  // Note: backend now sets a permanent password during invite creation.
  // No 'set new password' / temporary password flow is required on the frontend.

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotPasswordLoading(true);
    setError("");

    try {
      const result = await resetPassword({ username: forgotPasswordEmail });
      setMessageWithType(
        "Password reset code sent to your email. Please check your inbox.",
        "success",
      );
      setShowResetCodeForm(true);
    } catch (err) {
      console.error("Forgot password error:", err);
      setError(err.message || "Failed to send reset code");
      setMessage("");
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetPasswordLoading(true);
    setError("");

    try {
      // Check if passwords match
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      // Check password strength
      if (newPassword.length < 8) {
        throw new Error("Password must be at least 8 characters long");
      }

      // Import the confirmResetPassword function
      const { confirmResetPassword } = await import("aws-amplify/auth");

      // Confirm the password reset
      const result = await confirmResetPassword({
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
    } catch (err) {
      console.error("Reset password error:", err);

      if (err.code === "CodeMismatchException") {
        setError("Invalid reset code. Please check your email and try again.");
        setMessage("");
      } else if (err.code === "ExpiredCodeException") {
        setError("Reset code has expired. Please request a new one.");
        setMessage("");
      } else if (err.code === "InvalidPasswordException") {
        setError(
          "Password does not meet requirements. Please use a stronger password.",
        );
        setMessage("");
      } else {
        setError(err.message || "Failed to reset password. Please try again.");
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
                  onChange={(e) => setEmail(e.target.value)}
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
                    onChange={(e) => setPassword(e.target.value)}
                    tabIndex={1}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
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
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
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
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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

        {/* Reset Code Form */}
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
                  onChange={(e) => setResetCode(e.target.value)}
                  maxLength={6}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
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
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowResetNewPassword(!showResetNewPassword)
                    }
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
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowResetConfirmPassword(!showResetConfirmPassword)
                    }
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
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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

export function AuthWrapper({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userGroups, setUserGroups] = useState([]);
  const [userName, setUserName] = useState(null);

  useEffect(() => {
    checkAuthState();
  }, []);

  // Watch for user changes and refresh groups
  useEffect(() => {
    if (user) {
      const refreshUserGroups = async () => {
        try {
          // Use cached session instead of forceRefresh to avoid extra Cognito calls
          const session = await fetchAuthSession();
          const idTokenPayload = session.tokens?.idToken?.payload;
          const groups = idTokenPayload?.["cognito:groups"] || [];
          setUserGroups(Array.isArray(groups) ? groups : []);
        } catch (error) {
          console.error("Error refreshing user groups:", error);
        }
      };

      // Small delay to ensure session is ready
      const timeoutId = setTimeout(refreshUserGroups, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [user]);

  const checkAuthState = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      // Get user groups and name for permission checking with retry mechanism
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          // Use cached session to avoid unnecessary Cognito calls
          const session = await fetchAuthSession();
          const idTokenPayload = session.tokens?.idToken?.payload;
          const groups = currentUser.signInDetails?.loginId
            ? idTokenPayload?.["cognito:groups"] || []
            : [];

          // Get user name from custom:given_name or fallback to other attributes
          const name =
            idTokenPayload?.["custom:given_name"] ||
            idTokenPayload?.["given_name"] ||
            idTokenPayload?.["name"] ||
            currentUser?.username ||
            null;

          // If we got groups or this is our last attempt, set them
          if (
            (Array.isArray(groups) && groups.length > 0) ||
            attempts === maxAttempts - 1
          ) {
            setUserGroups(Array.isArray(groups) ? groups : []);
            setUserName(name);
            break;
          }

          // Wait a bit before retrying
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        } catch (error) {
          console.error("Error fetching session in checkAuthState:", error);
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    } catch (error) {
      console.log("No authenticated user:", error);
      setUser(null);
      setUserName(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (user) => {
    setUser(user);

    // Force a fresh session fetch to get user groups and name
    const fetchUserGroups = async () => {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          // Use cached session instead of forceRefresh to avoid extra Cognito calls
          const session = await fetchAuthSession();
          const idTokenPayload = session.tokens?.idToken?.payload;
          const groups = idTokenPayload?.["cognito:groups"] || [];

          // Get user name from custom:given_name or fallback to other attributes
          const name =
            idTokenPayload?.["custom:given_name"] ||
            idTokenPayload?.["given_name"] ||
            idTokenPayload?.["name"] ||
            user?.username ||
            null;

          if (Array.isArray(groups) && groups.length > 0) {
            setUserGroups(Array.isArray(groups) ? groups : []);
            setUserName(name);
            return;
          }

          // Wait and retry if no groups found
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        } catch (error) {
          console.error("Error fetching session:", error);
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        }
      }

      // Set empty groups as fallback
      setUserGroups([]);
      setUserName(null);
    };

    fetchUserGroups();
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setUser(null);
      setUserGroups([]);
      setUserName(null);
    } catch (error) {
      console.error("Logout error:", error);
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

  const refreshUserGroups = async () => {
    if (user) {
      try {
        // Use cached session instead of forceRefresh to avoid extra Cognito calls
        const session = await fetchAuthSession();
        const idTokenPayload = session.tokens?.idToken?.payload;
        const groups =
          (idTokenPayload?.["cognito:groups"] as string[] | undefined) ?? [];

        // Get user name from custom:given_name or fallback to other attributes
        const name =
          idTokenPayload?.["custom:given_name"] ||
          idTokenPayload?.["given_name"] ||
          idTokenPayload?.["name"] ||
          user?.username ||
          null;

        setUserGroups(Array.isArray(groups) ? groups : []);
        setUserName(name);
        return groups;
      } catch (error) {
        console.error("Error manually refreshing user groups:", error);
        return [];
      }
    }
    return [];
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
