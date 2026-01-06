import React from "react";
import ReactDOM from "react-dom/client";
import App, { ApiProvider } from "./App";
import { AuthWrapper } from "./components/AuthProvider";
import { AlertProvider } from "./components/ui/AlertSystem";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("Failed to find the root element");
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AlertProvider>
        <ThemeProvider>
          <AuthWrapper>
            <ApiProvider>
              <App />
            </ApiProvider>
          </AuthWrapper>
        </ThemeProvider>
      </AlertProvider>
    </React.StrictMode>,
  );
}