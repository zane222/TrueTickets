import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAlertMethods } from "../ui/AlertSystem";

interface Ticket {
    ticket_number: number;
    status: string;
    subject: string;
    [key: string]: any;
}

interface RevenueItem {
    ticket: Ticket;
    amount: number;
}

interface PayrollItem {
    name: string;
    amount: number;
}

interface PurchaseItem {
    name: string;
    amount: number;
}

interface FinancialData {
    all_revinue: RevenueItem[];
    employees_payroll: PayrollItem[];
    purchases: PurchaseItem[];
}

export default function IncomeTab() {
    const api = useApi();
    const { error: showError } = useAlertMethods();
    const [viewMonth, setViewMonth] = useState(() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    });

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<FinancialData | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            // endpoint expects 1-based month (1-12)
            const year = viewMonth.getFullYear();
            const month = viewMonth.getMonth() + 1;
            const response = await api.get<FinancialData>(
                `/get_revenue_payroll_and_purchases?year=${year}&month=${month}`
            );
            setData(response);
        } catch (err: any) {
            console.error(err);
            showError("Fetch Failed", "Could not load financial data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [viewMonth]);

    const stats = useMemo(() => {
        if (!data) return { revenue: 0, payroll: 0, purchases: 0, net: 0 };

        const revenue = data.all_revinue.reduce((acc, item) => acc + item.amount, 0);
        const payroll = data.employees_payroll.reduce((acc, item) => acc + item.amount, 0);
        const purchases = data.purchases.reduce((acc, item) => acc + item.amount, 0);
        const net = revenue - payroll - purchases;

        return { revenue, payroll, purchases, net };
    }, [data]);

    const handleMonthChange = (direction: -1 | 1) => {
        const newDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + direction, 1);
        setViewMonth(newDate);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-2xl font-bold text-on-surface">Revenue & Expenses</h3>

                {/* Month Picker */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-4 bg-surface md-card p-1 rounded-lg border-[#8f96a3]/20">
                        <button
                            onClick={() => handleMonthChange(-1)}
                            className="p-1 rounded-full hover:bg-surface-variant/20 text-outline transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="text-sm font-bold text-on-surface min-w-[140px] text-center select-none">
                            {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <button
                            onClick={() => handleMonthChange(1)}
                            className={`p-1 rounded-full transition-colors ${viewMonth.getTime() >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
                                ? 'opacity-0 pointer-events-none'
                                : 'hover:bg-surface-variant/20 text-outline'
                                }`}
                            disabled={viewMonth.getTime() >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()}
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="mt-2 text-outline">Loading financials...</p>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md-card p-5 space-y-2 border-l-4 border-primary">
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Revenue</p>
                            <p className="text-2xl font-bold text-on-surface">${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>

                        <div className="md-card p-5 space-y-2 border-l-4 border-error">
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Payroll</p>
                            <p className="text-2xl font-bold text-on-surface">${stats.payroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>

                        <div className="md-card p-5 space-y-2 border-l-4 border-secondary">
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Purchases</p>
                            <p className="text-2xl font-bold text-on-surface">${stats.purchases.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>

                        <div className="md-card p-5 space-y-2 border-l-4 border-green-500">
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Net Profit</p>
                            <p className={`text-2xl font-bold ${stats.net >= 0 ? 'text-green-500' : 'text-error'}`}>
                                ${stats.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    {/* Expenses List */}
                    <div className="md-card p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <label className="text-xl font-bold text-on-surface">This month's purchases</label>
                        </div>

                        <div className="space-y-3">
                            {(data?.purchases || []).map((item, index) => (
                                <div key={index} className="flex items-center gap-3 p-3 bg-surface-variant/20 rounded-lg">
                                    <div className="flex-1 font-medium text-on-surface">{item.name}</div>
                                    <div className="font-bold text-on-surface">${item.amount.toFixed(2)}</div>
                                </div>
                            ))}

                            {(data?.purchases || []).length === 0 && (
                                <div className="text-center py-6 text-outline text-sm">
                                    No purchases recorded for this month.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
