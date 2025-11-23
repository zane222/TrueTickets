import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getCurrentUser } from "aws-amplify/auth";
import apiClient from "../../api/apiClient";
import { LoadingSpinnerWithText } from "./LoadingSpinner";
import { useAlertMethods } from "./AlertSystem";
import {
  USER_GROUP_IDS,
  getGroupDisplayName,
  getGroupDisplayNames,
  USER_MANAGEMENT_ERRORS,
  USER_MANAGEMENT_SUCCESS,
} from "../../constants/authConstants";
import type { AmplifyAuthUser } from "../../types";
import type { CognitoUser } from "../../types/api";

interface ManageUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserWithGroups extends CognitoUser {
  groups?: string[];
}

interface SelectedUser extends UserWithGroups {
  groups: string[];
}

export function ManageUsersModal({
  isOpen,
  onClose,
}: ManageUsersModalProps) {
  const [users, setUsers] = useState<UserWithGroups[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [showUserEdit, setShowUserEdit] = useState(false);
  const [currentUser, setCurrentUser] = useState<AmplifyAuthUser | null>(null);
  const { success, error } = useAlertMethods();

  // Get current user on mount
  useEffect(() => {
    let isMounted = true;
    const fetchCurrentUser = async () => {
      try {
        const user = await getCurrentUser();
        if (isMounted) {
          setCurrentUser(user);
        }
      } catch (err) {
        console.error("Error getting current user:", err);
      }
    };
    fetchCurrentUser();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load users when modal opens
  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async (retryCount = 0) => {
    setUsersLoading(true);
    try {
      const result = await apiClient.get<{ users: UserWithGroups[] }>("/users");

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
        err &&
        typeof err === "object" &&
        "message" in err
      ) {
        const errMsg = (err as Record<string, unknown>).message as string;
        if (
          errMsg.includes("Failed to fetch") ||
          errMsg.includes("NetworkError") ||
          errMsg.includes("500") ||
          errMsg.includes("502") ||
          errMsg.includes("503")
        ) {
          console.log("Retrying user load in 1 second...");
          setTimeout(() => loadUsers(retryCount + 1), 1000);
          return;
        }
      }

      error("Load Users Failed", USER_MANAGEMENT_ERRORS.LOAD_USERS_FAILED);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  const updateUserGroup = async (username: string, newGroup: string) => {
    try {
      // If deleting user, show confirmation dialog
      if (newGroup === "delete") {
        const user = users.find((u) => u.username === username);
        const displayName =
          user?.given_name || user?.email || user?.username || username;
        if (
          !confirm(
            `Are you sure you want to delete user ${displayName}? This action cannot be undone.`
          )
        ) {
          return;
        }
      }

      const result = (await apiClient.post("/update-user-group", {
        username,
        group: newGroup,
      })) as { message: string; body?: string };

      if (newGroup === "delete") {
        const message =
          result?.message || result?.body || "User deleted successfully";
        success(USER_MANAGEMENT_SUCCESS.USER_DELETED, message);
      } else {
        success(
          USER_MANAGEMENT_SUCCESS.USER_UPDATED,
          "User group updated successfully"
        );
      }

      loadUsers();
      setShowUserEdit(false);
      setSelectedUser(null);
    } catch (err) {
      console.error("Error updating user group:", err);
      if (newGroup === "delete") {
        error("Delete Failed", USER_MANAGEMENT_ERRORS.DELETE_FAILED);
      } else {
        error("Update Failed", USER_MANAGEMENT_ERRORS.UPDATE_FAILED);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="md-card p-6 w-full max-w-4xl h-[85vh] sm:h-[80vh] overflow-hidden flex flex-col"
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-primary">
              User Management
            </h3>
            <button
              onClick={onClose}
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
                      <div className="text-sm text-gray-400">{user.email}</div>
                    )}
                    <div className="text-md text-gray-500">
                      {getGroupDisplayNames(user.groups)}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setSelectedUser(user as SelectedUser);
                        setShowUserEdit(true);
                      }}
                      disabled={currentUser?.username === user.username}
                      className={`md-btn-surface text-md px-3 py-1 ${currentUser?.username === user.username
                          ? "opacity-50 cursor-not-allowed"
                          : ""
                        }`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setSelectedUser({
                          ...user,
                          groups: ["delete"],
                        } as SelectedUser);
                        setShowUserEdit(true);
                      }}
                      disabled={currentUser?.username === user.username}
                      className={`md-btn-surface text-md px-3 py-1 ${currentUser?.username === user.username
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

      {showUserEdit && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
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
                  value={selectedUser.groups?.[0] || USER_GROUP_IDS.EMPLOYEE}
                  onChange={(e) => {
                    setSelectedUser({
                      ...selectedUser,
                      groups: [e.target.value],
                    });
                  }}
                >
                  <option value={USER_GROUP_IDS.EMPLOYEE}>
                    {getGroupDisplayName(USER_GROUP_IDS.EMPLOYEE)}
                  </option>
                  <option value={USER_GROUP_IDS.MANAGER}>
                    {getGroupDisplayName(USER_GROUP_IDS.MANAGER)}
                  </option>
                  <option value={USER_GROUP_IDS.OWNER}>
                    {getGroupDisplayName(USER_GROUP_IDS.OWNER)}
                  </option>
                  <option value={USER_GROUP_IDS.APPLICATION_ADMIN}>
                    {getGroupDisplayName(USER_GROUP_IDS.APPLICATION_ADMIN)}
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
                      selectedUser.groups[0]
                    )
                  }
                  className={`elev-1 ${selectedUser.groups[0] === "delete"
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
    </>
  );
}