import React from "react";

type SpinnerSize = "sm" | "md" | "lg" | "xl";

/**
 * LoadingSpinner component for displaying loading states
 */
export function LoadingSpinner({
  size = "md",
  className = "",
}: {
  size?: SpinnerSize;
  className?: string;
}) {
  const sizeClasses: Record<SpinnerSize, string> = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  };

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <div
        className="absolute inset-0 rounded-full border-4"
        style={{ borderColor: "var(--md-sys-color-surface-variant)" }}
      ></div>
      <div
        className="absolute inset-0 rounded-full border-4 border-transparent border-t-4 animate-spin"
        style={{ borderTopColor: "var(--md-sys-color-primary)" }}
      ></div>
    </div>
  );
}

/**
 * LoadingSpinner with text
 */
export function LoadingSpinnerWithText({
  text = "Loading...",
  size = "md",
  className = "",
}: {
  text?: string;
  size?: SpinnerSize;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center mt-18 ${className}`}>
      <LoadingSpinner size={size} className="mr-2" />
      <span
        className="text-md"
        style={{ color: "var(--md-sys-color-on-surface)" }}
      >
        {text}
      </span>
    </div>
  );
}
