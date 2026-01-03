import { useEffect, useState, useCallback } from "react";
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
    wage_cents: number;
}

interface SelectedUser extends UserWithGroups {
    groups: string[];
}

export default function ManageUsersTab() {
    const [users, setUsers] = useState<UserWithGroups[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
    const [wageInput, setWageInput] = useState<string>("");
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

    const loadUsers = useCallback(async (retryCount = 0) => {
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
    }, [error]);

    // Load users on mount
    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const updateUserGroup = async (username: string, newGroup: string, newWage?: number) => {
        try {
            // Find user to get given_name
            const user = users.find((u) => u.username === username);
            const displayName =
                user?.given_name || user?.email || user?.username || username;

            // If deleting user, show confirmation dialog
            if (newGroup === "delete") {
                if (
                    !confirm(
                        `Are you sure you want to delete user ${displayName}? This action cannot be undone.`
                    )
                ) {
                    return;
                }
            }

            // Update wage if provided and not deleting
            if (newWage !== undefined && newGroup !== "delete") {
                const wagePayload = {
                    username: username, // For reference if needed
                    given_name: user?.given_name || displayName, // Use given_name as primary key
                    wage_cents: Math.round(newWage * 100)
                };
                await apiClient.post("/update-user-wage", wagePayload);
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
                    "User updated successfully"
                );
            }

            loadUsers();
            setShowUserEdit(false);
            setSelectedUser(null);
        } catch (err) {
            console.error("Error updating user:", err);
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
                <div className="md-card overflow-hidden">
                    {/* Header */}
                    <div className="hidden sm:grid grid-cols-12 text-sm tracking-wider px-5 py-3 text-on-surface border-b border-white/5 bg-surface-variant/20">
                        <div className="col-span-4 font-semibold">User</div>
                        <div className="col-span-4 font-semibold">Email</div>
                        <div className="col-span-3 font-semibold">Role</div>
                        <div className="col-span-1 font-semibold text-right"></div>
                    </div>

                    <div className="divide-y divide-white/5">
                        {users.map((user) => (
                            <div
                                key={user.username}
                                className="group hover:bg-surface-variant/10 transition-colors duration-150"
                            >
                                <div className="hidden sm:grid grid-cols-12 items-center px-5 py-3">
                                    <div className="col-span-4 font-medium text-on-surface truncate pr-2">
                                        {user.given_name || user.username}
                                    </div>
                                    <div className="col-span-4 text-outline truncate pr-2">
                                        {user.email}
                                    </div>
                                    <div className="col-span-3 text-outline truncate">
                                        {getGroupDisplayNames(user.groups)}
                                    </div>
                                    <div className="col-span-1 flex justify-end">
                                        <button
                                            onClick={() => {
                                                setSelectedUser(user as SelectedUser);
                                                setWageInput((user.wage_cents ? user.wage_cents / 100 : 0).toString());
                                                setShowUserEdit(true);
                                            }}
                                            className="md-btn-surface text-sm px-4 py-1.5 shadow-sm transition-all"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                </div>

                                {/* Mobile View */}
                                <div className="sm:hidden p-4 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div className="font-medium text-on-surface">
                                            {user.given_name || user.username}
                                        </div>
                                        <div className="text-sm text-outline">
                                            {getGroupDisplayNames(user.groups)}
                                        </div>
                                    </div>
                                    {user.email && (
                                        <div className="text-sm text-outline truncate">{user.email}</div>
                                    )}
                                    <div className="flex justify-end pt-2 border-t border-white/5">
                                        <button
                                            onClick={() => {
                                                setSelectedUser(user as SelectedUser);
                                                setWageInput((user.wage_cents ? user.wage_cents / 100 : 0).toString());
                                                setShowUserEdit(true);
                                            }}
                                            className="md-btn-primary text-sm px-4 py-1.5 w-full"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {users.length === 0 && (
                            <div className="text-center py-12 text-outline">
                                No users found
                            </div>
                        )}
                    </div>
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
                            {selectedUser.groups[0] === "delete" ? "Delete User" : "Edit User"}
                        </h3>

                        <div className="space-y-6">
                            <div>
                                <div className="mb-4 p-4 rounded-lg bg-surface-variant/30 border border-white/10">
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
                                                className={`md-input w-full ${currentUser?.username === selectedUser.username ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                value={selectedUser.groups?.[0] || USER_GROUP_IDS.EMPLOYEE}
                                                onChange={(e) => {
                                                    setSelectedUser({
                                                        ...selectedUser,
                                                        groups: [e.target.value],
                                                    });
                                                }}
                                                disabled={currentUser?.username === selectedUser.username}
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
                                                    className="md-input w-full !pl-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="20.00"
                                                    value={wageInput}
                                                    onChange={(e) => setWageInput(e.target.value)}
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

                            <div className="flex items-center justify-between pt-4 mt-2">
                                {currentUser?.username !== selectedUser.username && selectedUser.groups[0] !== "delete" ? (
                                    <button
                                        onClick={() => setSelectedUser({ ...selectedUser, groups: ["delete"] })}
                                        className="bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)] px-4 py-2 rounded-full text-sm font-medium hover:brightness-110 transition-all shadow-sm"
                                    >
                                        Delete User
                                    </button>
                                ) : (
                                    <div></div> /* Spacer */
                                )}
                                <div className="flex gap-3">
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
                                                selectedUser.groups[0] || "",
                                                wageInput ? parseFloat(wageInput) : 0
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
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
