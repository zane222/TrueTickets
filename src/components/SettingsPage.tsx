import { useState, useEffect } from "react";
import { Clock, DollarSign, Store, ArrowLeft, UserPlus, Users, LogOut } from "lucide-react";
import NavigationButton from "./ui/NavigationButton";
import ConfigTab from "./settings/ConfigTab";
import HoursTab from "./settings/HoursTab";
import IncomeTab from "./settings/IncomeTab";
import InviteUserTab from "./settings/InviteUserTab";
import ManageUsersTab from "./settings/ManageUsersTab";
import { useUserGroups } from "./UserGroupsContext";
import {
    CAN_INVITE_USERS_GROUPS,
    CAN_MANAGE_USERS_GROUPS,
    CAN_VIEW_HOURS_GROUPS,
    CAN_VIEW_INCOME_GROUPS,
    CAN_ACCESS_CONFIG_GROUPS
} from "../constants/authConstants";
import { signOut } from "aws-amplify/auth";

interface SettingsPageProps {
    goTo: (path: string) => void;
}

type TabType = "config" | "hours" | "income" | "invite" | "manage" | "none";

export default function SettingsPage({ goTo }: SettingsPageProps) {
    const { userGroups = [] } = useUserGroups();

    const canInvite = userGroups.some(g => CAN_INVITE_USERS_GROUPS.includes(g));
    const canManage = userGroups.some(g => CAN_MANAGE_USERS_GROUPS.includes(g));
    const canAccessConfig = userGroups.some(g => CAN_ACCESS_CONFIG_GROUPS.includes(g));
    const canViewHours = userGroups.some(g => CAN_VIEW_HOURS_GROUPS.includes(g));
    const canViewIncome = userGroups.some(g => CAN_VIEW_INCOME_GROUPS.includes(g));

    const [activeTab, setActiveTabRaw] = useState<TabType>(() => {
        const hash = window.location.hash.replace("#", "");
        if (hash === "config" && canAccessConfig) return "config";
        if (hash === "hours" && canViewHours) return "hours";
        if (hash === "income" && canViewIncome) return "income";
        if (hash === "invite" && canInvite) return "invite";
        if (hash === "manage" && canManage) return "manage";

        // Default based on priority
        if (canAccessConfig) return "config";
        if (canViewHours) return "hours";
        if (canInvite) return "invite";
        return "none";
    });

    const setActiveTab = (tab: TabType) => {
        setActiveTabRaw(tab);
        window.location.hash = tab;
    };

    const handleLogout = async () => {
        try {
            await signOut();
            window.location.reload();
        } catch (err) {
            console.error("Logout error:", err);
        }
    };

    // Listen for hash changes (back/forward button support)
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace("#", "");
            if (hash === "config" && canAccessConfig) setActiveTabRaw("config");
            else if (hash === "hours" && canViewHours) setActiveTabRaw("hours");
            else if (hash === "income" && canViewIncome) setActiveTabRaw("income");
            else if (hash === "invite" && canInvite) setActiveTabRaw("invite");
            else if (hash === "manage" && canManage) setActiveTabRaw("manage");
            else {
                // Fallback if current tab becomes invalid
                if (canAccessConfig) setActiveTabRaw("config");
                else if (canViewHours) setActiveTabRaw("hours");
                else if (canInvite) setActiveTabRaw("invite");
                else setActiveTabRaw("none");
            }
        };

        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, [canInvite, canManage, canAccessConfig, canViewHours, canViewIncome]);

    return (
        <div className="flex h-[calc(100vh-80px)] overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-surface border-r border-[#8f96a3]/20 flex flex-col p-4 gap-3">
                <NavigationButton
                    onClick={() => goTo("/")}
                    targetUrl={`${window.location.origin}/`}
                    className="flex items-center gap-2 px-2 mb-2 text-xl font-bold text-on-surface hover:text-primary transition-colors group w-fit"
                >
                    <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
                    Settings
                </NavigationButton>

                {canAccessConfig && (
                    <button
                        onClick={() => setActiveTab("config")}
                        className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "config"
                            ? "md-btn-primary elev-2"
                            : "md-btn-surface hover:bg-surface-variant/50"
                            }`}
                    >
                        <Store className="w-5 h-5 mr-3" />
                        Store Configuration
                    </button>
                )}

                {canViewHours && (
                    <button
                        onClick={() => setActiveTab("hours")}
                        className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "hours"
                            ? "md-btn-primary elev-2"
                            : "md-btn-surface hover:bg-surface-variant/50"
                            }`}
                    >
                        <Clock className="w-5 h-5 mr-3" />
                        Employee Hours
                    </button>
                )}

                {canViewIncome && (
                    <button
                        onClick={() => setActiveTab("income")}
                        className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "income"
                            ? "md-btn-primary elev-2"
                            : "md-btn-surface hover:bg-surface-variant/50"
                            }`}
                    >
                        <DollarSign className="w-5 h-5 mr-3" />
                        Income & Payroll
                    </button>
                )}

                {canInvite && (
                    <button
                        onClick={() => setActiveTab("invite")}
                        className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "invite"
                            ? "md-btn-primary elev-2"
                            : "md-btn-surface hover:bg-surface-variant/50"
                            }`}
                    >
                        <UserPlus className="w-5 h-5 mr-3" />
                        Invite User
                    </button>
                )}

                {canManage && (
                    <button
                        onClick={() => setActiveTab("manage")}
                        className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "manage"
                            ? "md-btn-primary elev-2"
                            : "md-btn-surface hover:bg-surface-variant/50"
                            }`}
                    >
                        <Users className="w-5 h-5 mr-3" />
                        Manage Users
                    </button>
                )}

                <div className="mt-auto pt-4 border-t border-outline/20">
                    <button
                        onClick={handleLogout}
                        className="flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium text-error hover:bg-error/10 transition-all duration-200"
                    >
                        <LogOut className="w-5 h-5 mr-3" />
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto bg-background p-8">
                <div className="max-w-4xl mx-auto">
                    {activeTab === "config" && canAccessConfig && <ConfigTab />}
                    {activeTab === "hours" && canViewHours && <HoursTab />}
                    {activeTab === "income" && canViewIncome && <IncomeTab />}
                    {activeTab === "invite" && canInvite && <InviteUserTab />}
                    {activeTab === "manage" && canManage && <ManageUsersTab />}
                    {activeTab === "none" && (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                            <h2 className="text-2xl font-bold text-on-surface mb-2">Settings</h2>
                            <p className="text-outline">Use the sidebar to sign out or navigate.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
