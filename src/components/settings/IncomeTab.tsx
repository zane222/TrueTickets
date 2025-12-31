

export default function IncomeTab() {
    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-on-surface mb-6">Income & Payroll</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Last Month */}
                <div className="md-card p-6 space-y-4 border-l-4 border-primary">
                    <h4 className="text-lg font-bold text-outline uppercase tracking-wider">Last Month</h4>

                    <div>
                        <p className="text-sm text-outline mb-1">Total Revenue</p>
                        <p className="text-3xl font-bold text-on-surface">$24,500.00</p>
                    </div>

                    <div className="pt-4 border-t border-[#8f96a3]/20">
                        <p className="text-sm text-outline mb-1">Paid to Employees</p>
                        <p className="text-2xl font-bold text-error">$8,200.00</p>
                    </div>
                </div>

                {/* Month to Date */}
                <div className="md-card p-6 space-y-4 border-l-4 border-secondary">
                    <h4 className="text-lg font-bold text-outline uppercase tracking-wider">Month to Date</h4>

                    <div>
                        <p className="text-sm text-outline mb-1">Total Revenue</p>
                        <p className="text-3xl font-bold text-on-surface">$12,350.00</p>
                    </div>

                    <div className="pt-4 border-t border-[#8f96a3]/20">
                        <p className="text-sm text-outline mb-1">Paid to Employees</p>
                        <p className="text-2xl font-bold text-error">$4,100.00</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
