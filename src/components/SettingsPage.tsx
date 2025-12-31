import { useState, useEffect } from "react";
import { Clock, DollarSign, Store, ArrowLeft } from "lucide-react";
import NavigationButton from "./ui/NavigationButton";
import ConfigTab from "./settings/ConfigTab";
import HoursTab from "./settings/HoursTab";
import IncomeTab from "./settings/IncomeTab";

interface SettingsPageProps {
    goTo: (path: string) => void;
}

export default function SettingsPage({ goTo }: SettingsPageProps) {
    const [activeTab, setActiveTabRaw] = useState<"config" | "hours" | "income">(() => {
        const hash = window.location.hash.replace("#", "");
        if (hash === "hours") return "hours";
        if (hash === "income") return "income";
        return "config";
    });

    const setActiveTab = (tab: "config" | "hours" | "income") => {
        setActiveTabRaw(tab);
        window.location.hash = tab;
    };

    // Listen for hash changes (back/forward button support)
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.replace("#", "");
            if (hash === "hours") setActiveTabRaw("hours");
            else if (hash === "income") setActiveTabRaw("income");
            else setActiveTabRaw("config");
        };

        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, []);

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

                <button
                    onClick={() => setActiveTab("config")}
                    className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "config"
                        ? "md-btn-primary elev-2"
                        : "md-btn-surface hover:bg-surface-variant/50"
                        }`}
                >
                    <Store className="w-5 h-5 mr-3" />
                    Store Config
                </button>

                <button
                    onClick={() => setActiveTab("hours")}
                    className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "hours"
                        ? "md-btn-primary elev-2"
                        : "md-btn-surface hover:bg-surface-variant/50"
                        }`}
                >
                    <Clock className="w-5 h-5 mr-3" />
                    View Hours
                </button>

                <button
                    onClick={() => setActiveTab("income")}
                    className={`flex items-center w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "income"
                        ? "md-btn-primary elev-2"
                        : "md-btn-surface hover:bg-surface-variant/50"
                        }`}
                >
                    <DollarSign className="w-5 h-5 mr-3" />
                    View Income
                </button>


            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto bg-background p-8">
                <div className="max-w-4xl mx-auto">
                    {activeTab === "config" && <ConfigTab />}
                    {activeTab === "hours" && <HoursTab />}
                    {activeTab === "income" && <IncomeTab />}
                </div>
            </div>
        </div>
    );
}
