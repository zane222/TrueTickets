import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getCurrentUser } from "aws-amplify/auth";
import apiClient from "../../api/apiClient";
import { LoadingSpinnerWithText } from "../ui/LoadingSpinner";
import { useAlertMethods } from "../ui/AlertSystem";
import {
    USER_GROUP_IDS,
    getGroupDisplayName,
    getGroupDisplayNames,
    USER_MANAGEMENT_ERRORS,
    USER_MANAGEMENT_SUCCESS,
} from "../../constants/authConstants";
import type { AmplifyAuthUser } from "../../types";
import type { CognitoUser, PostUpdateUserGroup } from "../../types/api";

interface UserWithGroups extends CognitoUser {
}

interface SelectedUser extends UserWithGroups {
    groups: string[];
}

export default function ManageUsersTab() {
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

    // Load users on mount
    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async (retryCount = 0) => {
        setUsersLoading(true);
        try {
            const result = await apiClient.get<UserWithGroups[]>("/users");
            if (Array.isArray(result)) {
                setUsers(result);
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

            const payload: PostUpdateUserGroup = {
                username,
                group: newGroup,
            };
            const result = (await apiClient.post("/update-user-group", payload)) as { message: string; body?: string };

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

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-on-surface mb-6">Manage Users</h3>

            {usersLoading ? (
                <div className="flex justify-center p-12">
                    <LoadingSpinnerWithText text="Loading users..." size="md" />
                </div>
            ) : (
                <div className="grid gap-4">
                    {users.map((user) => (
                        <div
                            key={user.username}
                            className="md-row-box p-4 flex items-center justify-between"
                        >
                            <div className="flex-1">
                                <div className="text-lg font-medium text-on-surface">
                                    {user.given_name || user.email || user.username}
                                </div>
                                {user.email && (
                                    <div className="text-sm text-outline">{user.email}</div>
                                )}
                                <div className="text-md text-outline">
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
                        <div className="text-center py-12 md-card text-outline">
                            No users found
                        </div>
                    )}
                </div>
            )}

            {showUserEdit && selectedUser && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="md-card p-8 w-full max-w-md shadow-2xl"
                    >
                        <h3 className="text-xl font-bold mb-6 text-on-surface">
                            {selectedUser.groups[0] === "delete" ? "Delete User" : "Edit Permissions"}
                        </h3>

                        <div className="space-y-6">
                            <div>
                                <div className="mb-4 p-4 rounded-lg bg-surface-variant/30 border border-outline/10">
                                    <div className="text-sm font-medium text-outline mb-1">User</div>
                                    <div className="text-lg font-medium text-on-surface">
                                        {selectedUser.given_name || selectedUser.email || selectedUser.username}
                                    </div>
                                    {selectedUser.email && (
                                        <div className="text-sm text-outline">{selectedUser.email}</div>
                                    )}
                                </div>

                                {selectedUser.groups[0] !== "delete" ? (
                                    <>
                                        <div className="grid gap-2">
                                            <label className="text-sm font-medium text-outline">
                                                Role / Permission Group
                                            </label>
                                            <select
                                                className="md-input w-full"
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
                                            </select>
                                        </div>

                                        <div className="grid gap-2 pt-2">
                                            <label className="text-sm font-medium text-outline">
                                                Hourly Wage ($)
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline font-medium">$</span>
                                                <input
                                                    type="number"
                                                    className="md-input w-full pl-12"
                                                    placeholder="20.00"
                                                    defaultValue="20.00"
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-on-surface">
                                        Are you sure you want to remove this user? This will revoke all their access immediately.
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setShowUserEdit(false);
                                        setSelectedUser(null);
                                    }}
                                    className="md-btn-surface px-6"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() =>
                                        updateUserGroup(
                                            selectedUser.username || "",
                                            selectedUser.groups[0] || ""
                                        )
                                    }
                                    className={`px-6 ${selectedUser.groups[0] === "delete"
                                        ? "md-btn-error"
                                        : "md-btn-primary"
                                        }`}
                                >
                                    {selectedUser.groups[0] === "delete"
                                        ? "Remove User"
                                        : "Save Changes"}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
