import { useEffect, useMemo, useState, createContext, useContext } from "react";
import { Amplify } from "aws-amplify";
import { useUserGroups } from "./components/UserGroupsContext";
import { useAlertMethods } from "./components/ui/AlertSystem";
import apiClient from "./api/apiClient";
import awsconfig from "./aws-exports.ts";
import { signOut } from "aws-amplify/auth";
import { useRoute } from "./hooks/useRoute";
import { useHotkeys } from "./hooks/useHotkeys";
import { KeyBindsModal } from "./components/ui/KeyBindsModal";
import { KeyBindsProvider } from "./components/KeyBindsProvider";
import { TopBar } from "./components/TopBar";
import { useKeyBindsContext } from "./hooks/useKeyBindsContext";
import SearchModal from "./components/SearchModal";
import TicketEditor from "./components/TicketEditor";
import TicketView from "./components/TicketView";
import CustomerView from "./components/CustomerView";
import NewCustomer from "./components/NewCustomer";
import { TicketListView } from "./components/TicketList";
import SettingsPage from "./components/SettingsPage";
import { StoreConfigProvider } from "./context/StoreConfigContext";
import type { ApiContextValue } from "./types/components";

/**
 * True Tickets — Full React + Tailwind (Dark Theme) with AWS Cognito Authentication
 *
 * ARCHITECTURE:
 * - AWS Cognito User Pool for authentication with group-based permissions
 * - AWS Lambda function as backend (Rust) backed by DynamoDB:
 *   • Ticket & Customer management
 *   • Financials & Payroll tracking
 *   • User management system (invite, list, edit, remove users)
 * - React frontend with Material Design components and dark theme
 * - Hashless, URL-driven routing
 * - Real-time authentication state management
 * - Modular component architecture with separated concerns
 *
 * COMPONENT STRUCTURE:
 * - App.tsx: Main routing and layout logic
 * - SearchModal.tsx: Global search functionality
 * - TicketEditor.tsx: Ticket creation and editing
 * - TicketView.tsx: Ticket display, comments, and printing
 * - CustomerView.tsx: Customer details and ticket history
 * - SettingsPage.tsx: Application settings, financials, and user management
 * - apiClient.ts: Centralized API client with authentication
 *
 * FEATURES:
 * - Ticket management (list, view, create, edit, status updates)
 * - Customer management (view, create, edit, phone number handling)
 * - Financial tracking (Revenue, Payroll, Purchases)
 * - Employee Hours & Shift management
 * - User management system with role-based access:
 *   • ApplicationAdmin & Owner: Full access including user management & financials
 *   • Manager: Can invite users, limited financial view
 *   • Employee: Standard access (tickets/customers)
 * - PDF ticket generation
 * - Global search (Tickets & Customers)
 * - Keyboard shortcuts (vim-style navigation)
 * - Responsive design with Tailwind CSS
 *
 * SECURITY:
 * - JWT token authentication via AWS Cognito
 * - Group-based permission checking (server-side validation)
 * - CORS protection and proper error handling
 *
 * API ENDPOINTS (High-level):
 * - /tickets/* → Ticket CRUD operations
 * - /customers/* → Customer CRUD operations
 * - /users, /invite-user → User management
 * - /financials/* → Revenue & Payroll data
 * - /config → Store configuration
 */

/*************************
 * Custom hooks and utilities
 *************************/

// Configure Amplify
try {
  if (
    awsconfig.Auth?.Cognito?.userPoolId &&
    awsconfig.Auth?.Cognito?.userPoolClientId
  ) {
    try {
      Amplify.configure(awsconfig);
    } catch (configError) {
      console.error("Amplify configuration failed with error:", configError);
      throw configError;
    }
  }
} catch (error) {
  console.error("Amplify configuration failed:", error);
  if (error instanceof Error) {
    console.error("Error details:", error.message, error.stack);
  }
}

/*************************
 * API Context
 *************************/
const ApiCtx = createContext<ApiContextValue | null>(null);
const useApi = () => {
  const context = useContext(ApiCtx);
  if (!context) throw new Error("useApi must be used within ApiProvider");
  return context;
};
export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [lambdaUrl, setLambdaUrl] = useState(
    import.meta.env.VITE_API_GATEWAY_URL ||
    "https://your-api-gateway-url.amazonaws.com/prod",
  );
  // Sync the global apiClient with the local state
  useEffect(() => {
    if (apiClient.baseUrl !== lambdaUrl) {
      apiClient.baseUrl = lambdaUrl;
    }
  }, [lambdaUrl]);

  const client = useMemo(() => {
    // Expose typed/generic wrappers so callers can request a typed response:
    function get<T = unknown>(path: string): Promise<T> {
      return apiClient.get<T>(path);
    }
    function post<T = unknown>(path: string, body?: unknown): Promise<T> {
      return apiClient.post<T>(path, body);
    }
    function put<T = unknown>(path: string, body?: unknown): Promise<T> {
      return apiClient.put<T>(path, body);
    }
    function del<T = unknown>(path: string): Promise<T> {
      return apiClient.del<T>(path);
    }

    return {
      lambdaUrl,
      setLambdaUrl,
      get,
      post,
      put,
      del,
    };
  }, [lambdaUrl]);
  return <ApiCtx.Provider value={client}>{children}</ApiCtx.Provider>;
}

/*************************
 * Ticket List / Customers
 *************************/

/*************************
 * App
 *************************/
function App() {
  const api = useApi();
  const { refreshUserGroups } = useUserGroups();
  const { path, navigate } = useRoute();
  const {
    warning: _warning,
    dataChanged: _dataChanged,
    info: _info,
    clearDataChangedWarnings,
  } = useAlertMethods();
  const [showSearch, setShowSearch] = useState(false);

  // Force refresh user groups on component mount
  useEffect(() => {
    const refreshGroups = async () => {
      if (refreshUserGroups) {
        await refreshUserGroups();
      }
    };

    // Small delay to ensure auth is ready
    const timeoutId = setTimeout(refreshGroups, 500);
    return () => clearTimeout(timeoutId);
  }, [refreshUserGroups]);

  // Clear data changed warnings when navigating between pages
  useEffect(() => {
    clearDataChangedWarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const route = useMemo(() => {
    const url = new URL(window.location.origin + path);
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    const query = url.searchParams;
    if (pathname === "/newcustomer") return { view: "newcustomer" };
    if (pathname === "/settings") return { view: "settings" };
    if (pathname.startsWith("/$")) {
      const id = pathname.slice(2);
      if (query.has("newticket"))
        return { view: "ticket-editor", customerId: id };
      if (query.has("edit")) return { view: "customer-edit", id };
      return { view: "customer", id };
    }
    if (pathname.startsWith("/&")) {
      const id = pathname.slice(2);
      if (query.has("edit")) return { view: "ticket-editor", ticketId: id };
      return { view: "ticket", id };
    }
    return { view: "home" };
  }, [path]);

  // Get keybinds from context
  const { keybinds } = useKeyBindsContext();

  // Global hotkeys - 's' for search
  const globalHotkeyMap = useMemo(() => ({
    s: () => {
      if (!showSearch) {
        // Small delay to prevent 's' from being typed in the search box
        setTimeout(() => setShowSearch(true), 0);
      }
    },
  }), [showSearch]);

  // Enable global hotkeys when search is not open
  useHotkeys(globalHotkeyMap, showSearch);

  const handleLogout = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <div className="min-h-screen material-surface">
      <TopBar
        onHome={() => navigate("/")}
        onSearchClick={() => setShowSearch(true)}
        onKeyBinds={() => {
          const event = new CustomEvent("openKeybinds");
          window.dispatchEvent(event);
        }}
        onSettings={() => navigate("/settings")}
        onLogout={handleLogout}
      />

      <KeyBindsModal keybinds={keybinds} />

      {route.view === "home" && (
        <TicketListView goTo={navigate} showSearch={showSearch} api={api} />
      )}
      {route.view === "customer" && (
        <CustomerView id={route.id!} goTo={navigate} showSearch={showSearch} />
      )}
      {route.view === "newcustomer" && (
        <NewCustomer
          goTo={navigate}
          showSearch={showSearch}
        />
      )}
      {route.view === "customer-edit" && (
        <NewCustomer
          goTo={navigate}
          customerId={route.id!}
          showSearch={showSearch}
        />
      )}
      {route.view === "ticket" && (
        <TicketView id={route.id!} goTo={navigate} showSearch={showSearch} />
      )}
      {route.view === "ticket-editor" && (
        <TicketEditor
          ticketId={route.ticketId}
          customerId={route.customerId}
          goTo={navigate}
          showSearch={showSearch}
        />
      )}

      {route.view === "settings" && (
        <SettingsPage goTo={navigate} />
      )}

      <SearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        goTo={navigate}
      />
    </div>
  );
}

function AppWithProviders() {
  return (
    <KeyBindsProvider>
      <StoreConfigProvider>
        <App />
      </StoreConfigProvider>
    </KeyBindsProvider>
  );
}

export default AppWithProviders;
