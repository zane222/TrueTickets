import { useEffect, useMemo, useState, createContext, useContext } from "react";
import { motion } from "framer-motion";
import { Search, UserPlus, User, LogOut } from "lucide-react";
import { Amplify } from "aws-amplify";
import { useUserGroups } from "./components/UserGroupsContext";
import { useAlertMethods } from "./components/ui/AlertSystem";
import apiClient from "./api/apiClient";
import awsconfig from "./aws-exports";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { useRoute } from "./hooks/useRoute";
import { LoadingSpinnerWithText } from "./components/ui/LoadingSpinner";
import NavigationButton from "./components/ui/NavigationButton";
import SearchModal from "./components/SearchModal";
import TicketEditor from "./components/TicketEditor";
import TicketView from "./components/TicketView";
import CustomerView from "./components/CustomerView";
import NewCustomer from "./components/NewCustomer";
import { TicketListView } from "./components/TicketList";
import type { ApiContextValue } from "./types/components";
import type { CognitoUser } from "./types/api";

/**
 * True Tickets — Full React + Tailwind (Dark Theme) with AWS Cognito Authentication
 *
 * ARCHITECTURE:
 * - AWS Cognito User Pool for authentication with group-based permissions
 * - AWS Lambda function as API Gateway backend with dual functionality:
 *   • RepairShopr API proxy (via /api/* endpoints)
 *   • User management system (invite, list, edit, remove users)
 * - React frontend with Material Design components and dark theme
 * - Hashless, URL-driven routing
 * - Real-time authentication state management
 * - Modular component architecture with separated concerns
 *
 * COMPONENT STRUCTURE:
 * - App.jsx: Main routing and layout logic
 * - SearchModal.jsx: Search functionality
 * - TicketEditor.jsx: Ticket creation and editing
 * - TicketView.jsx: Ticket display and comments
 * - CustomerView.jsx: Customer details and ticket history
 * - NewCustomer.jsx: Customer creation and editing
 * - NavigationButton.jsx: Reusable navigation with middle-click support
 * - apiClient.js: Centralized API client with authentication
 *
 * FEATURES:
 * - Ticket management (list, view, create, edit, status updates)
 * - Customer management (view, create, edit, phone number handling)
 * - User management system with role-based access:
 *   • ApplicationAdmin & Owner: Full user management (view, edit, remove)
 *   • Manager: Can invite users as employees only
 *   • Employee: Standard access, no user management
 * - PDF ticket generation
 * - Search and filtering capabilities
 * - Keyboard shortcuts and hotkeys
 * - Responsive design with Tailwind CSS
 *
 * SECURITY:
 * - JWT token authentication via AWS Cognito
 * - Group-based permission checking (server-side validation)
 * - Secure API key storage in Lambda environment variables
 * - CORS protection and proper error handling
 *
 * API ENDPOINTS:
 * - /api/* → RepairShopr API proxy (authenticated)
 * - /invite-user → User invitation (Manager+)
 * - /users → List all users (Admin/Owner only)
 * - /update-user-group → Update user groups or delete users (Admin/Owner only)
 */

/*************************
 * Custom hooks and utilities
 *************************/

// Ticket list item component that can use hooks

// Configure Amplify
try {
  if (
    awsconfig.Auth.Cognito.userPoolId &&
    awsconfig.Auth.Cognito.userPoolClientId
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
  const client = useMemo(() => {
    // Update the apiClient base URL if needed
    if (apiClient.baseUrl !== lambdaUrl) {
      apiClient.baseUrl = lambdaUrl;
    }

    // Expose typed/generic wrappers so callers can request a typed response:
    const get = <T = unknown,>(path: string): Promise<T> =>
      apiClient.get<T>(path);
    const post = <T = unknown,>(path: string, body?: unknown): Promise<T> =>
      apiClient.post<T>(path, body);
    const put = <T = unknown,>(path: string, body?: unknown): Promise<T> =>
      apiClient.put<T>(path, body);
    const del = <T = unknown,>(path: string): Promise<T> =>
      apiClient.del<T>(path);

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
 * TopBar
 *************************/
function TopBar({
  onHome,
  onSearchClick,
  onNewCustomer,
  showUserMenu,
  setShowUserMenu,
  canInviteUsers,
  canManageUsers,
  onInviteUser,
  onManageUsers,
  onLogout,
  userName,
}: {
  onHome: () => void;
  onSearchClick: () => void;
  onNewCustomer: () => void;
  showUserMenu: boolean;
  setShowUserMenu: (show: boolean) => void;
  canInviteUsers: boolean;
  canManageUsers: boolean;
  onInviteUser: () => void;
  onManageUsers: () => void;
  onLogout: () => void;
  userName: string | null;
}) {
  return (
    <div className="sticky top-0 z-30 w-full material-app-bar backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
        <NavigationButton
          onClick={onHome}
          targetUrl={`${window.location.origin}/`}
          className="text-base sm:text-xl font-bold tracking-wide flex-1 text-left cursor-pointer truncate min-w-0"
          tabIndex={-1}
        >
          <span className="hidden sm:inline">
            True Tickets - Computer and Cellphone Inc
          </span>
          <span className="sm:hidden">True Tickets</span>
        </NavigationButton>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <NavigationButton
            onClick={onSearchClick}
            targetUrl={`${window.location.origin}/`}
            title="Search"
            className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
            tabIndex={-1}
          >
            <Search className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
          </NavigationButton>
          <NavigationButton
            onClick={onNewCustomer}
            targetUrl={`${window.location.origin}/newcustomer`}
            title="New Customer"
            className="md-btn-primary elev-2 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
            tabIndex={-1}
          >
            <UserPlus className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
          </NavigationButton>

          {/* User menu dropdown */}
          <div className="relative">
            <motion.button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
              whileTap={{ scale: 0.95 }}
              tabIndex={-1}
            >
              <User className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
            </motion.button>

            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 mt-2 w-48 md-card py-1 z-50"
              >
                {/* User info header */}
                <div className="px-4 py-2 border-b border-outline/20">
                  <div className="text-sm font-medium text-on-surface">
                    {userName || "User"}
                  </div>
                  <div className="text-xs text-outline">Signed in</div>
                </div>

                {canInviteUsers && (
                  <motion.button
                    onClick={onInviteUser}
                    className="flex items-center w-full px-4 py-2 text-md rounded-md transition-colors duration-10 text-on-surface"
                    whileHover={{
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <UserPlus className="w-4 h-4 mr-3" />
                    Add User
                  </motion.button>
                )}
                {canManageUsers && (
                  <motion.button
                    onClick={onManageUsers}
                    className="flex items-center w-full px-4 py-2 text-md rounded-md transition-colors duration-100 text-on-surface"
                    whileHover={{
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <User className="w-4 h-4 mr-3" />
                    Manage Users
                  </motion.button>
                )}
                <motion.button
                  onClick={onLogout}
                  className="flex items-center w-full px-4 py-2 text-md rounded-md transition-colors duration-200 text-on-surface"
                  whileHover={{
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sign Out
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/*************************
 * Ticket List / Customers
 *************************/

/*************************
 * App
 *************************/
export default function App() {
  const api = useApi();
  const { userGroups = [], refreshUserGroups, userName } = useUserGroups();
  const { path, navigate } = useRoute();
  const {
    success,
    error,
    warning: _warning,
    dataChanged: _dataChanged,
    info: _info,
    clearDataChangedWarnings,
  } = useAlertMethods();
  const [showSearch, setShowSearch] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

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
  const [showInviteUser, setShowInviteUser] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserEdit, setShowUserEdit] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Group name mapping for user-friendly display
  const getGroupDisplayName = (groupName) => {
    const groupMap = {
      "TrueTickets-Cacell-Employee": "Employee",
      "TrueTickets-Cacell-Manager": "Manager",
      "TrueTickets-Cacell-Owner": "Owner",
      "TrueTickets-Cacell-ApplicationAdmin": "Website Administrator",
    };
    return groupMap[groupName] || groupName;
  };

  const getGroupDisplayNames = (groups) => {
    if (!groups || groups.length === 0) return "Invited, will be employee";
    return groups.map(getGroupDisplayName).join(", ");
  };

  // Get current user information
  useEffect(() => {
    let isMounted = true;
    const getCurrentUserInfo = async () => {
      try {
        const user = await getCurrentUser();
        if (!isMounted) return;
        setCurrentUser(user);
      } catch (err) {
        console.error("Error getting current user:", err);
      }
    };
    getCurrentUserInfo();
    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for search events from child components
  useEffect(() => {
    const handleOpenSearch = () => setShowSearch(true);
    window.addEventListener("openSearch", handleOpenSearch);
    return () => window.removeEventListener("openSearch", handleOpenSearch);
  }, []);

  // User management functions
  const handleInviteUser = async (e) => {
    e.preventDefault();
    setInviteLoading(true);

    try {
      console.log("Inviting user with apiClient:", inviteEmail);

      const api = apiClient;
      const result = await api.post("/invite-user", {
        email: inviteEmail,
        firstName: inviteFirstName,
      });

      console.log("Invite user result:", result);
      success(
        "User Added",
        `User ${inviteEmail} has been added successfully. They can now log in with their email address by clicking forgot password.`,
      );
      setInviteEmail("");
      setInviteFirstName("");
      setShowInviteUser(false);
    } catch (err) {
      console.error("Invite user error:", err);
      // Default message
      let errorMessage = "Failed to add user. Please try again.";

      // If the API client attached a parsed body, prefer that message
      if (err && err.body) {
        // Common shaped responses: { error: '...', message: '...' }
        errorMessage =
          err.body.error || err.body.message || JSON.stringify(err.body);
        // If backend provided more details or required actions, append them for clarity
        if (err.body.details) {
          errorMessage += `\n\nDetails: ${err.body.details}`;
        }
      } else if (err && err.message) {
        // Fallback to error.message checks
        if (err.message.includes("already exists")) {
          errorMessage = "A user with this email already exists.";
        } else if (err.message.includes("Insufficient permissions")) {
          errorMessage = "You do not have permission to invite users.";
        } else if (err.message.includes("Invalid email")) {
          errorMessage = "Invalid email address. Please check the format.";
        } else if (err.message.includes("Too many requests")) {
          errorMessage = "Too many requests. Please try again later.";
        } else {
          errorMessage = err.message;
        }
      }

      // Use app alert system to show errors (persistent)
      error("Add User Failed", errorMessage, { persistent: true });
    } finally {
      setInviteLoading(false);
    }
  };

  const loadUsers = async (retryCount = 0) => {
    setUsersLoading(true);
    try {
      console.log("Loading users with apiClient, attempt:", retryCount + 1);

      const api = apiClient;
      const result = await api.get<{ users: CognitoUser[] }>("/users");

      console.log("Users loaded:", result);

      // Ensure we have a valid users array
      if (result && Array.isArray(result?.users)) {
        setUsers(result.users);
      } else {
        console.warn("Invalid users response:", result);
        setUsers([]);
      }
    } catch (err) {
      console.error("Error loading users:", err);

      // Retry logic for network errors
      if (
        retryCount < 2 &&
        (err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError") ||
          err.message.includes("500") ||
          err.message.includes("502") ||
          err.message.includes("503"))
      ) {
        console.log("Retrying user load in 1 second...");
        setTimeout(() => loadUsers(retryCount + 1), 1000);
        return;
      }

      error("Load Users Failed", "Failed to load users. Please try again.");
      setUsers([]); // Clear users on error
    } finally {
      setUsersLoading(false);
    }
  };

  const updateUserGroup = async (username, newGroup) => {
    try {
      console.log("Updating user group with apiClient:", username, newGroup);

      // If deleting user, show confirmation dialog
      if (newGroup === "delete") {
        const user = users.find((u) => u.username === username);
        const displayName =
          user?.given_name || user?.email || user?.username || username;
        if (
          !confirm(
            `Are you sure you want to delete user ${displayName}? This action cannot be undone.`,
          )
        ) {
          return;
        }
      }

      const api = apiClient;
      const result = (await api.post("/update-user-group", {
        username,
        group: newGroup,
      })) as { message: string; body?: string };

      console.log("User group updated:", result);

      if (newGroup === "delete") {
        const message =
          result?.message || result?.body || "User deleted successfully";
        success("User Deleted", message);
      } else {
        success("User Updated", `User group updated successfully`);
      }

      loadUsers(); // Refresh the user list
      setShowUserEdit(false);
      setSelectedUser(null);
    } catch (err) {
      console.error("Error updating user group:", err);
      if (newGroup === "delete") {
        error("Delete Failed", "Failed to delete user. Please try again.");
      } else {
        error(
          "Update Failed",
          "Failed to update user group. Please try again.",
        );
      }
    }
  };

  // User permission checks
  const canInviteUsers =
    userGroups.includes("TrueTickets-Cacell-ApplicationAdmin") ||
    userGroups.includes("TrueTickets-Cacell-Owner") ||
    userGroups.includes("TrueTickets-Cacell-Manager");

  const canManageUsers =
    userGroups.includes("TrueTickets-Cacell-ApplicationAdmin") ||
    userGroups.includes("TrueTickets-Cacell-Owner");

  // User management handlers
  const handleInviteUserClick = () => setShowInviteUser(true);
  const handleManageUsersClick = () => {
    setShowUserManagement(true);
    loadUsers();
  };
  const handleLogout = async () => {
    try {
      await signOut();
      // Force a page reload to ensure clean logout state
      window.location.reload();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const route = useMemo(() => {
    const url = new URL(window.location.origin + path);
    const pathname = url.pathname;
    const query = url.searchParams;
    if (pathname === "/newcustomer") return { view: "newcustomer" };
    if (pathname.startsWith("/$")) {
      const id = parseInt(pathname.slice(2), 10);
      if (query.has("newticket"))
        return { view: "ticket-editor", customerId: id };
      if (query.has("edit")) return { view: "customer-edit", id };
      return { view: "customer", id };
    }
    if (pathname.startsWith("/&")) {
      const id = parseInt(pathname.slice(2), 10);
      if (query.has("edit")) return { view: "ticket-editor", ticketId: id };
      return { view: "ticket", id };
    }
    return { view: "home" };
  }, [path]);

  return (
    <ApiProvider>
      <div className="min-h-screen material-surface">
        <TopBar
          onHome={() => navigate("/")}
          onSearchClick={() => setShowSearch(true)}
          onNewCustomer={() => navigate("/newcustomer")}
          showUserMenu={showUserMenu}
          setShowUserMenu={setShowUserMenu}
          canInviteUsers={canInviteUsers}
          canManageUsers={canManageUsers}
          onInviteUser={handleInviteUserClick}
          onManageUsers={handleManageUsersClick}
          onLogout={handleLogout}
          userName={userName}
        />

        {route.view === "home" && (
          <TicketListView goTo={navigate} showSearch={showSearch} api={api} />
        )}
        {route.view === "customer" && (
          <CustomerView id={route.id} goTo={navigate} showSearch={showSearch} />
        )}
        {route.view === "newcustomer" && (
          <NewCustomer
            goTo={navigate}
            showSearch={showSearch}
            customerId={undefined}
          />
        )}
        {route.view === "customer-edit" && (
          <NewCustomer
            goTo={navigate}
            customerId={route.id}
            showSearch={showSearch}
          />
        )}
        {route.view === "ticket" && (
          <TicketView id={route.id} goTo={navigate} showSearch={showSearch} />
        )}
        {route.view === "ticket-editor" && (
          <TicketEditor
            ticketId={route.ticketId}
            customerId={route.customerId}
            goTo={navigate}
            showSearch={showSearch}
          />
        )}

        <SearchModal
          open={showSearch}
          onClose={() => setShowSearch(false)}
          goTo={navigate}
        />

        {/* User Management Modals */}
        {showInviteUser && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="md-card p-6 w-full max-w-md"
            >
              <h3 className="text-lg font-medium mb-4 text-primary">
                Add User
              </h3>
              <form onSubmit={handleInviteUser}>
                <div className="mb-4">
                  <label
                    htmlFor="inviteFirstName"
                    className="block text-md font-medium mb-2 text-on-surface"
                  >
                    First Name
                  </label>
                  <input
                    id="inviteFirstName"
                    type="text"
                    required
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    className="md-input"
                    placeholder="Enter first name"
                  />
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="inviteEmail"
                    className="block text-md font-medium mb-2 text-on-surface"
                  >
                    Email Address
                  </label>
                  <input
                    id="inviteEmail"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="md-input"
                    placeholder="Enter email address"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowInviteUser(false)}
                    className="md-btn-surface elev-1"
                  >
                    Cancel
                  </button>
                  <motion.button
                    type="submit"
                    disabled={inviteLoading}
                    className="md-btn-primary elev-1"
                    whileTap={{ scale: 0.95 }}
                  >
                    {inviteLoading ? "Adding..." : "Add User"}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showUserManagement && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="md-card p-6 w-full max-w-4xl h-[85vh] sm:h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-primary">
                  User Management
                </h3>
                <button
                  onClick={() => setShowUserManagement(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinnerWithText text="Loading users..." size="md" />
                </div>
              ) : (
                <div className="space-y-4 flex-1 overflow-y-auto">
                  {users.map((user) => (
                    <div
                      key={user.username}
                      className="md-row-box p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {user.given_name || user.email || user.username}
                        </div>
                        {user.email && (
                          <div className="text-sm text-gray-400">
                            {user.email}
                          </div>
                        )}
                        <div className="text-md text-gray-500">
                          {getGroupDisplayNames(user.groups)}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowUserEdit(true);
                          }}
                          disabled={currentUser?.username === user.username}
                          className={`md-btn-surface text-md px-3 py-1 ${
                            currentUser?.username === user.username
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser({ ...user, groups: ["delete"] });
                            setShowUserEdit(true);
                          }}
                          disabled={currentUser?.username === user.username}
                          className={`md-btn-surface text-md px-3 py-1 ${
                            currentUser?.username === user.username
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                          style={{
                            backgroundColor:
                              currentUser?.username === user.username
                                ? "var(--md-sys-color-surface-variant)"
                                : "var(--md-sys-color-error)",
                            color:
                              currentUser?.username === user.username
                                ? "var(--md-sys-color-on-surface-variant)"
                                : "var(--md-sys-color-on-error)",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No users found
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showUserEdit && selectedUser && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="md-card p-6 w-full max-w-md"
            >
              <h3 className="text-lg font-medium mb-4 text-primary">
                Edit User:{" "}
                {selectedUser.given_name ||
                  selectedUser.email ||
                  selectedUser.username}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-md font-medium mb-2 text-on-surface">
                    User Group
                  </label>
                  <select
                    className="md-input"
                    value={
                      selectedUser.groups?.[0] || "TrueTickets-Cacell-Employee"
                    }
                    onChange={(e) => {
                      setSelectedUser({
                        ...selectedUser,
                        groups: [e.target.value],
                      });
                    }}
                  >
                    <option value="TrueTickets-Cacell-Employee">
                      {getGroupDisplayName("TrueTickets-Cacell-Employee")}
                    </option>
                    <option value="TrueTickets-Cacell-Manager">
                      {getGroupDisplayName("TrueTickets-Cacell-Manager")}
                    </option>
                    <option value="TrueTickets-Cacell-Owner">
                      {getGroupDisplayName("TrueTickets-Cacell-Owner")}
                    </option>
                    <option value="TrueTickets-Cacell-ApplicationAdmin">
                      {getGroupDisplayName(
                        "TrueTickets-Cacell-ApplicationAdmin",
                      )}
                    </option>
                    <option value="delete">Delete User</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowUserEdit(false);
                      setSelectedUser(null);
                    }}
                    className="md-btn-surface elev-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      updateUserGroup(
                        selectedUser.username,
                        selectedUser.groups[0],
                      )
                    }
                    className={`elev-1 ${
                      selectedUser.groups[0] === "delete"
                        ? "md-btn-error"
                        : "md-btn-primary"
                    }`}
                  >
                    {selectedUser.groups[0] === "delete"
                      ? "Delete User"
                      : "Update Group"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </ApiProvider>
  );
}
