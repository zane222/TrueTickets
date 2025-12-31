

export default function ConfigTab() {
    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-on-surface mb-6">Store Configuration</h3>

            <div className="grid gap-6 md-card p-6">
                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Tax Percentage (%)</label>
                    <input
                        type="number"
                        defaultValue={8.25}
                        className="md-input w-full max-w-xs"
                        placeholder="8.25"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Street Address</label>
                    <input
                        type="text"
                        defaultValue="123 Repair Lane"
                        className="md-input w-full"
                        placeholder="Street Address"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">City</label>
                        <input
                            type="text"
                            defaultValue="Tech City"
                            className="md-input w-full"
                            placeholder="City"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">State</label>
                        <input
                            type="text"
                            defaultValue="TX"
                            className="md-input w-full"
                            placeholder="State"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-sm font-medium text-outline">Zip Code</label>
                        <input
                            type="text"
                            defaultValue="75000"
                            className="md-input w-full"
                            placeholder="Zip Code"
                        />
                    </div>
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Phone Number</label>
                    <input
                        type="tel"
                        defaultValue="(555) 123-4567"
                        className="md-input w-full max-w-xs"
                        placeholder="(555) 000-0000"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-medium text-outline">Email Address</label>
                    <input
                        type="email"
                        defaultValue="support@truetickets.com"
                        className="md-input w-full max-w-xs"
                        placeholder="email@example.com"
                    />
                </div>

                <div className="pt-4">
                    <button className="md-btn-primary px-8">Save Changes</button>
                </div>
            </div>
        </div>
    );
}
