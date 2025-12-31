import React, { useState } from "react";
import { useAlertMethods } from "../ui/AlertSystem";
import apiClient from "../../api/apiClient";
import { USER_MANAGEMENT_ERRORS, USER_MANAGEMENT_SUCCESS } from "../../constants/authConstants";
import type { PostInviteUser } from "../../types/api";
import { motion } from "framer-motion";

export default function InviteUserTab() {
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [loading, setLoading] = useState(false);
    const { success, error } = useAlertMethods();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload: PostInviteUser = {
                email,
                firstName,
            };
            await apiClient.post("/invite-user", payload);

            success(
                USER_MANAGEMENT_SUCCESS.USER_ADDED,
                `User ${email} has been added successfully. They can now log in with their email address by clicking forgot password.`,
            );

            setEmail("");
            setFirstName("");
        } catch (err: unknown) {
            console.error("Invite user error:", err);

            let errorMessage = USER_MANAGEMENT_ERRORS.ADD_USER_FAILED;

            if (err && typeof err === "object") {
                const errObj = err as Record<string, unknown>;
                if (errObj.body && typeof errObj.body === "object") {
                    const body = errObj.body as Record<string, unknown>;
                    errorMessage =
                        (body.error as string) || (body.message as string) || JSON.stringify(body);
                    if (body.details) {
                        errorMessage += `\n\nDetails: ${body.details}`;
                    }
                } else if (errObj.message && typeof errObj.message === "string") {
                    const msg = errObj.message;
                    if (msg.includes("already exists")) {
                        errorMessage = USER_MANAGEMENT_ERRORS.USER_EXISTS;
                    } else if (msg.includes("Insufficient permissions")) {
                        errorMessage = USER_MANAGEMENT_ERRORS.INSUFFICIENT_PERMISSIONS;
                    } else if (msg.includes("Invalid email")) {
                        errorMessage = USER_MANAGEMENT_ERRORS.INVALID_EMAIL;
                    } else if (msg.includes("Too many requests")) {
                        errorMessage = USER_MANAGEMENT_ERRORS.TOO_MANY_REQUESTS;
                    } else {
                        errorMessage = msg;
                    }
                }
            }

            error("Add User Failed", errorMessage, { persistent: true });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="md-card p-6 w-full max-w-md mx-auto">
            <h3 className="text-lg font-medium mb-4 text-primary">Add User</h3>
            <form onSubmit={handleSubmit}>
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
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
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
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="md-input"
                        placeholder="Enter email address"
                    />
                </div>
                <div className="flex justify-end space-x-3">
                    <motion.button
                        type="submit"
                        disabled={loading}
                        className="md-btn-primary elev-1"
                        whileTap={{ scale: 0.95 }}
                    >
                        {loading ? "Adding..." : "Add User"}
                    </motion.button>
                </div>
            </form>
        </div>
    );
}
