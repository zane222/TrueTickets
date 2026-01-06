import React, { useEffect, useState } from "react";
import { resetPassword, confirmResetPassword } from "aws-amplify/auth";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { InlineMessage, InlineErrorMessage } from "../ui/AlertSystem";
import type { AlertType } from "../ui/alertTypes";

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

function parseAuthError(err: unknown): { code?: string; message: string } {
  if (err && typeof err === "object") {
    const maybe = err as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "string" ? maybe.code : undefined;
    const message =
      typeof maybe.message === "string" ? maybe.message : String(err);
    return { ...(code ? { code } : {}), message };
  }
  return { message: String(err) };
}

export function ForgotPasswordPage({ onBackToLogin }: ForgotPasswordPageProps) {
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>("");
  const [forgotPasswordLoading, setForgotPasswordLoading] =
    useState<boolean>(false);
  const [showResetCodeForm, setShowResetCodeForm] = useState<boolean>(false);
  const [resetCode, setResetCode] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [resetPasswordLoading, setResetPasswordLoading] =
    useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<AlertType>("error");
  const [showResetNewPassword, setShowResetNewPassword] =
    useState<boolean>(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] =
    useState<boolean>(false);

  useEffect(() => {
    if (showResetCodeForm) {
      setResetCode("");
    }
  }, [showResetCodeForm]);

  const setMessageWithType = (
    messageText: string,
    type: AlertType = "error",
  ): void => {
    setMessage(messageText);
    setMessageType(type);
    setError("");
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
      onBackToLogin();
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
    <>
      {!showResetCodeForm ? (
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
                onClick={onBackToLogin}
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
                  onBackToLogin();
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
    </>
  );
}