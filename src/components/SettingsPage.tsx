import { useState, useEffect } from "react";
import { Clock, DollarSign, Store, ArrowLeft, UserPlus, Users, LogOut, Timer } from "lucide-react";
import apiClient from "../api/apiClient";
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
import { signOut, fetchUserAttributes, getCurrentUser } from "aws-amplify/auth";

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

        // Default to "config" on desktop (md breakpoint is 768px)
        if (window.innerWidth >= 768 && canAccessConfig) {
            return "config";
        }

        // Default to none (shows sidebar on mobile)
        return "none";
    });

    const setActiveTab = (tab: TabType) => {
        setActiveTabRaw(tab);
        window.location.hash = tab;
    };

    const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const attrs = await fetchUserAttributes();
                const user = await getCurrentUser();

                // Safely extract attributes
                const unknownAttrs = attrs as Record<string, unknown>;
                const getString = (key: string) => typeof unknownAttrs[key] === 'string' ? unknownAttrs[key] as string : undefined;

                const name = getString('name') || getString('custom:given_name') || getString('given_name') || user.username || "User";
                const email = getString('email') || "";

                setUserInfo({ name, email });
            } catch (e) {
                console.error("Failed to load user info", e);
            }
        };
        loadUser();
        loadUser();
    }, []);

    const [isClockedIn, setIsClockedIn] = useState(false);
    const [loadingClock, setLoadingClock] = useState(true);
    const [clockError, setClockError] = useState(false);

    useEffect(() => {
        const fetchClockStatus = async () => {
            try {
                const res = await apiClient.get<{ clocked_in: boolean }>('/am_i_clocked_in');
                setIsClockedIn(res.clocked_in);
                setClockError(false);
            } catch (err) {
                console.error("Failed to fetch clock status", err);
                setClockError(true);
            } finally {
                setLoadingClock(false);
            }
        };
        fetchClockStatus();
    }, []);

    const handleClockToggle = async () => {
        setLoadingClock(true);
        setClockError(false);
        try {
            const res = await apiClient.post<{ clocked_in: boolean }>('/clock_in', {});
            setIsClockedIn(res.clocked_in);
        } catch (err) {
            console.error("Failed to toggle clock", err);
            setClockError(true);
        } finally {
            setLoadingClock(false);
        }
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
                if (canAccessConfig) setActiveTabRaw("none");
                else if (canViewHours) setActiveTabRaw("none");
                else if (canInvite) setActiveTabRaw("none");
                else setActiveTabRaw("none");
            }
        };

        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, [canInvite, canManage, canAccessConfig, canViewHours, canViewIncome]);

    return (
        <div className="flex h-[calc(100vh-80px)] overflow-hidden">
            {/* Sidebar */}
            <div className={`w-full md:w-64 bg-surface border-r border-[#8f96a3]/20 flex-col p-4 gap-3 ${activeTab !== 'none' ? 'hidden md:flex' : 'flex'}`}>
                <NavigationButton
                    onClick={() => goTo("/")}
                    targetUrl={`${window.location.origin}/`}
                    className="flex items-center gap-3 mb-6 px-2 text-xl font-bold text-on-surface hover:text-primary transition-colors group w-fit"
                >
                    <div className="p-2 rounded-lg md-btn-surface elev-1 group-hover:border-primary/50 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </div>
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
                        Income & Expenses
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
                    {userInfo && (
                        <div className="px-1 mb-4">
                            <div className="text-sm font-bold text-on-surface">{userInfo.name}</div>
                            <div className="text-xs text-outline truncate" title={userInfo.email}>{userInfo.email}</div>
                        </div>
                    )}

                    <button
                        onClick={handleClockToggle}
                        disabled={loadingClock}
                        className={`w-full flex items-center justify-center px-4 py-3 mb-4 text-sm font-medium rounded-xl transition-all duration-200 ${loadingClock
                            ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                            : clockError
                                ? "bg-red-500/10 text-red-500 border border-red-500/50"
                                : isClockedIn
                                    ? "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
                                    : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                            }`}
                    >
                        <Timer className="w-5 h-5 mr-3" />
                        {loadingClock ? "Loading..." : (clockError ? "Error" : (isClockedIn ? "Clock Out" : "Clock In"))}
                    </button>
                    <button
                        onClick={handleLogout}
                        className="md-btn-surface w-full flex items-center justify-center px-4 py-3 text-sm font-medium text-white hover:bg-white/5 transition-all duration-200"
                    >
                        <LogOut className="w-5 h-5 mr-3" />
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className={`flex-1 overflow-auto bg-background p-4 md:p-8 ${activeTab === 'none' ? 'hidden md:block' : 'block'}`}>
                {activeTab !== 'none' && (
                    <button
                        onClick={() => setActiveTab('none')}
                        className="md:hidden flex items-center gap-2 mb-6 text-on-surface hover:text-primary transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span className="font-bold">Back to Menu</span>
                    </button>
                )}
                <div className="max-w-4xl mx-auto h-full">
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
