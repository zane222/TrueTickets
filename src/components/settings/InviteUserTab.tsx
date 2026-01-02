import React, { useState } from "react";
import { useAlertMethods } from "../ui/AlertSystem";
import apiClient from "../../api/apiClient";
import { USER_MANAGEMENT_ERRORS, USER_MANAGEMENT_SUCCESS } from "../../constants/authConstants";
import type { PostInviteUser } from "../../types/api";
import { Loader2 } from "lucide-react";

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
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-on-surface mb-6">Invite User</h3>

            <div className="md-card p-6 grid gap-6">
                <div className="bg-[#172554] p-4 rounded-lg text-sm text-white">
                    <p className="font-bold mb-1">How new users sign in:</p>
                    <p>
                        After adding a user, they must go to the login page and click Forgot Password.
                        Once they enter the confirmation code they get from their email and set a new password, they will be able to sign in.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="grid gap-6">
                    <div className="grid gap-2">
                        <label
                            htmlFor="inviteFirstName"
                            className="text-sm font-medium text-outline"
                        >
                            First Name
                        </label>
                        <input
                            id="inviteFirstName"
                            type="text"
                            required
                            value={firstName}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (/^[a-zA-Z0-9 ]*$/.test(val)) {
                                    setFirstName(val);
                                }
                            }}
                            className="md-input w-full max-w-md"
                            placeholder="Enter first name"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label
                            htmlFor="inviteEmail"
                            className="text-sm font-medium text-outline"
                        >
                            Email Address
                        </label>
                        <input
                            id="inviteEmail"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="md-input w-full max-w-md"
                            placeholder="Enter email address"
                        />
                    </div>
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="md-btn-primary px-8 flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {loading ? "Adding..." : "Add User"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
