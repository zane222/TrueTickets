import { useState, useEffect } from "react";
import { useStoreConfig } from "../../context/StoreConfigContext";
import { formatPhoneLive } from "../../utils/formatUtils";
import { useAlertMethods } from "../ui/AlertSystem";
import { Loader2 } from "lucide-react";

export default function ConfigTab() {
    const { config, loading, updateConfig } = useStoreConfig();
    const { info, error: alertError } = useAlertMethods();
    const [saving, setSaving] = useState(false);

    const [localConfig, setLocalConfig] = useState(config);

    const isFormValid =
        localConfig.store_name.trim() !== "" &&
        localConfig.address.trim() !== "" &&
        localConfig.city.trim() !== "" &&
        localConfig.state.trim() !== "" &&
        localConfig.zip.trim() !== "" &&
        localConfig.phone.trim() !== "" &&
        localConfig.email.trim() !== "" &&
        localConfig.disclaimer.trim() !== "";

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    const handleSave = async () => {
        if (!isFormValid) {
            alertError("Missing Information", "Please fill in all configuration fields before saving.");
            return;
        }
        setSaving(true);
        try {
            await updateConfig(localConfig);
            info("Settings Saved", "Store configuration has been updated successfully.");
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            alertError("Save Failed", errorMessage || "Could not save settings.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-on-surface mb-6">Store Configuration</h3>

            <div className="grid gap-6 md-card p-6">
                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Store Name</label>
                    <input
                        type="text"
                        value={localConfig.store_name}
                        onChange={(e) => setLocalConfig({ ...localConfig, store_name: e.target.value })}
                        className="md-input w-full max-w-md"
                        placeholder="Store Name"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Tax Percentage (%)</label>
                    <input
                        type="number"
                        step="0.01"
                        value={localConfig.tax_rate}
                        onChange={(e) => setLocalConfig({ ...localConfig, tax_rate: parseFloat(e.target.value) || 0 })}
                        className="md-input w-full max-w-xs"
                        placeholder="8.25"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Street Address</label>
                    <input
                        type="text"
                        value={localConfig.address}
                        onChange={(e) => setLocalConfig({ ...localConfig, address: e.target.value })}
                        className="md-input w-full"
                        placeholder="Street Address"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">City</label>
                        <input
                            type="text"
                            value={localConfig.city}
                            onChange={(e) => setLocalConfig({ ...localConfig, city: e.target.value })}
                            className="md-input w-full"
                            placeholder="City"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">State</label>
                        <input
                            type="text"
                            value={localConfig.state}
                            onChange={(e) => setLocalConfig({ ...localConfig, state: e.target.value })}
                            className="md-input w-full"
                            placeholder="State"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">Zip Code</label>
                        <input
                            type="text"
                            value={localConfig.zip}
                            onChange={(e) => setLocalConfig({ ...localConfig, zip: e.target.value })}
                            className="md-input w-full"
                            placeholder="Zip Code"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">Phone Number</label>
                        <input
                            type="tel"
                            value={localConfig.phone}
                            onChange={(e) => setLocalConfig({ ...localConfig, phone: formatPhoneLive(e.target.value) })}
                            className="md-input w-full"
                            placeholder="555-000-0000"
                        />
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">Email Address</label>
                        <input
                            type="email"
                            value={localConfig.email}
                            onChange={(e) => setLocalConfig({ ...localConfig, email: e.target.value })}
                            className="md-input w-full"
                            placeholder="email@example.com"
                        />
                    </div>
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Receipt Disclaimer</label>
                    <input
                        type="text"
                        value={localConfig.disclaimer}
                        onChange={(e) => setLocalConfig({ ...localConfig, disclaimer: e.target.value })}
                        className="md-input w-full"
                        placeholder="Warranty information..."
                    />
                </div>

                <div className="pt-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="md-btn-primary px-8 flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

