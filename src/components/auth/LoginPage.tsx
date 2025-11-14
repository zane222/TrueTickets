import React, { useState } from "react";
import { signIn } from "aws-amplify/auth";
import { motion } from "framer-motion";
import { Mail, Eye, EyeOff } from "lucide-react";
import { InlineErrorMessage } from "../ui/AlertSystem";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import type { AmplifyAuthUser } from "../../types";

interface LoginPageProps {
  onLoginSuccess: (user: AmplifyAuthUser) => void;
}

function parseAuthError(err: unknown): { code?: string; message: string } {
  if (err && typeof err === "object") {
    const maybe = err as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "string" ? maybe.code : undefined;
    const message =
      typeof maybe.message === "string" ? maybe.message : String(err);
    return { code, message };
  }
  return { message: String(err) };
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

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
      })) as unknown as AmplifyAuthUser;
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
    } finally {
      setLoading(false);
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
        ) : (
          <ForgotPasswordPage onBackToLogin={() => setShowForgotPassword(false)} />
        )}
      </div>
    </div>
  );
}