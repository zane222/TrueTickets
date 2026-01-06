import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import type { StoreConfig } from "../types/api";

interface StoreConfigContextValue {
    config: StoreConfig;
    loading: boolean;
    error: string | null;
    refreshConfig: () => Promise<void>;
    updateConfig: (update: Partial<StoreConfig>) => Promise<void>;
}

const StoreConfigContext = createContext<StoreConfigContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useStoreConfig = () => {
    const context = useContext(StoreConfigContext);
    if (!context) throw new Error("useStoreConfig must be used within StoreConfigProvider");
    return context;
};

const DEFAULT_CONFIG: StoreConfig = {
    store_name: "",
    tax_rate: 0,
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    email: "",
    disclaimer: ""
};

export const StoreConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const api = useApi();
    const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshConfig = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get<{ config: StoreConfig | null }>("/store_config");
            if (data && data.config) {
                setConfig(data.config);
            } else {
                setConfig(DEFAULT_CONFIG);
            }
            setError(null);
        } catch (err: unknown) {
            console.error("Failed to fetch store config:", err);
            setError((err instanceof Error ? err.message : String(err)) || "Failed to fetch store config");
        } finally {
            setLoading(false);
        }
    }, [api]);

    const updateConfig = async (update: Partial<StoreConfig>) => {
        try {
            await api.put("/store_config", update);
            setConfig(prev => ({ ...prev, ...update }));
        } catch (err: unknown) {
            console.error("Failed to update store config:", err);
            throw err;
        }
    };

    useEffect(() => {
        refreshConfig();
    }, [refreshConfig]);

    return (
        <StoreConfigContext.Provider value={{ config, loading, error, refreshConfig, updateConfig }}>
            {children}
        </StoreConfigContext.Provider>
    );
};
