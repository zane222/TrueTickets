import React from "react";
import ReactDOM from "react-dom/client";
import App, { ApiProvider } from "./App";
import { AuthWrapper } from "./components/AuthProvider";
import { AlertProvider } from "./components/ui/AlertSystem";
import "./index.css";

// Enhanced fallback mechanism to ensure text colors are always visible
const ensureTextVisibility = () => {
  // Check if CSS variables are working
  const testElement = document.createElement("div");
  testElement.style.color = "var(--md-sys-color-on-surface)";
  testElement.style.background = "var(--md-sys-color-surface)";
  document.body.appendChild(testElement);

  const computedStyle = window.getComputedStyle(testElement);
  const color = computedStyle.color;
  const backgroundColor = computedStyle.backgroundColor;

  // If the color is not what we expect (CSS variable failed), apply fallback
  if (
    color === "rgb(0, 0, 0)" ||
    color === "black" ||
    color === "" ||
    backgroundColor === "rgba(0, 0, 0, 0)" ||
    backgroundColor === "transparent"
  ) {
    console.warn("CSS variables not working properly, applying fallbacks");

    // Apply comprehensive fallback styles
    document.documentElement.style.setProperty(
      "--md-sys-color-on-surface",
      "#ffffff",
    );
    document.documentElement.style.setProperty(
      "--md-sys-color-primary",
      "#1e88ff",
    );
    document.documentElement.style.setProperty(
      "--md-sys-color-on-primary",
      "#ffffff",
    );
    document.documentElement.style.setProperty(
      "--md-sys-color-outline",
      "#8f96a3",
    );
    document.documentElement.style.setProperty(
      "--md-sys-color-surface",
      "#19191b",
    );
    document.documentElement.style.setProperty(
      "--md-sys-color-primary-container",
      "#113b77",
    );
    document.documentElement.style.setProperty(
      "--md-sys-color-on-primary-container",
      "#d6e4ff",
    );

    // Add classes to force proper styling
    document.body.classList.add("force-white-text");
    document.documentElement.classList.add("css-variables-fallback");

    // Force all text elements to be white
    const allTextElements = document.querySelectorAll("*");
    allTextElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (
        htmlEl.style.color === "" ||
        htmlEl.style.color === "rgb(0, 0, 0)" ||
        htmlEl.style.color === "black"
      ) {
        htmlEl.style.color = "#ffffff";
      }
    });
  }

  document.body.removeChild(testElement);
};

// Run the check when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureTextVisibility);
} else {
  ensureTextVisibility();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AlertProvider>
      <AuthWrapper>
        <ApiProvider>
          <App />
        </ApiProvider>
      </AuthWrapper>
    </AlertProvider>
  </React.StrictMode>,
);
