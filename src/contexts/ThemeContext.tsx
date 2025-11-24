import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  const applyTheme = React.useCallback((themeToApply: Theme) => {
    const root = document.documentElement;

    if (themeToApply === "light") {
      root.classList.remove("dark");
      root.classList.add("light");

      // Light theme CSS variables
      root.style.setProperty("--md-sys-color-primary", "#1565c0");
      root.style.setProperty("--md-sys-color-on-primary", "#ffffff");
      root.style.setProperty("--md-sys-color-primary-container", "#c7e0ff");
      root.style.setProperty("--md-sys-color-on-primary-container", "#0d3d95");

      root.style.setProperty("--md-sys-color-secondary", "#6b7280");
      root.style.setProperty("--md-sys-color-on-secondary", "#ffffff");
      root.style.setProperty("--md-sys-color-secondary-container", "#d5dce6");
      root.style.setProperty("--md-sys-color-on-secondary-container", "#354961");

      root.style.setProperty("--md-sys-color-surface", "#f8f9fc");
      root.style.setProperty("--md-sys-color-on-surface", "#1e1e22");
      root.style.setProperty("--md-sys-color-surface-variant", "#e8eef8");
      root.style.setProperty("--md-sys-color-outline", "#6f7690");

      root.style.setProperty("--md-sys-color-error", "#b3261e");
      root.style.setProperty("--md-sys-color-on-error", "#ffffff");

      document.body.style.background = "#f8f9fc";
      document.body.style.color = "#1e1e22";
    } else {
      root.classList.remove("light");
      root.classList.add("dark");

      // Dark theme CSS variables
      root.style.setProperty("--md-sys-color-primary", "#61a8ff");
      root.style.setProperty("--md-sys-color-on-primary", "#19191b");
      root.style.setProperty("--md-sys-color-primary-container", "#113b77");
      root.style.setProperty("--md-sys-color-on-primary-container", "#19191b");

      root.style.setProperty("--md-sys-color-secondary", "#b8c0cc");
      root.style.setProperty("--md-sys-color-on-secondary", "#1a222c");
      root.style.setProperty("--md-sys-color-secondary-container", "#2a323d");
      root.style.setProperty("--md-sys-color-on-secondary-container", "#dbe2ea");

      root.style.setProperty("--md-sys-color-surface", "#0e1117");
      root.style.setProperty("--md-sys-color-on-surface", "#e5e8ee");
      root.style.setProperty("--md-sys-color-surface-variant", "#3a404a");
      root.style.setProperty("--md-sys-color-outline", "#8f96a3");

      root.style.setProperty("--md-sys-color-error", "#b3261e");
      root.style.setProperty("--md-sys-color-on-error", "#ffffff");

      document.body.style.background = "#19191b";
      document.body.style.color = "#e5e8ee";
    }
  }, []);

  // Initialize theme from system preference
  useEffect(() => {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const systemTheme = prefersDark ? "dark" : "light";
    setThemeState(systemTheme);
    applyTheme(systemTheme);

    setMounted(true);
  }, [applyTheme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? "dark" : "light";
      setThemeState(newTheme);
      applyTheme(newTheme);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [applyTheme]);

  // Prevent hydration mismatch
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};