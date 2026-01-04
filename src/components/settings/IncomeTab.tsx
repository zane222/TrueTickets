import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2, X, ChevronDown } from "lucide-react";
import { getUnixTime, startOfMonth, endOfMonth } from 'date-fns';
import { useApi } from "../../hooks/useApi";
import { useAlertMethods } from "../ui/AlertSystem";
import { calculateTotalHoursFromLogs } from "../../utils/clockUtils";

import NavigationButton from "../ui/NavigationButton";

import type { Ticket, ClockLog } from "../../types/api";

interface PayrollItem {
    name: string;
    wage_cents: number;
    hours: number;
}

interface PurchaseItem {
    name: string;
    amount_cents: number;
}

interface FinancialData {
    tickets: Ticket[];
    employees_payroll: PayrollItem[];
    purchases: PurchaseItem[];
}

interface IncomeTabProps {
    goTo: (path: string) => void;
}

export default function IncomeTab({ goTo }: IncomeTabProps) {
    const api = useApi();
    const { error: showError } = useAlertMethods();
    const [viewMonth, setViewMonth] = useState(() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    });

    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'still typing' | 'saving' | '' | 'error'>('');
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [data, setData] = useState<FinancialData | null>(null);
    const [localPurchases, setLocalPurchases] = useState<PurchaseItem[]>([]);
    const [activeTab, setActiveTab] = useState<'revenue' | 'payroll' | 'purchases'>('revenue');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // endpoint expects 1-based month (1-12) for purchases/payroll
            const year = viewMonth.getFullYear();
            const month = viewMonth.getMonth() + 1;

            // Calculate exact local month boundaries for improved revenue accuracy
            const startTimestamp = getUnixTime(startOfMonth(viewMonth));
            const endTimestamp = getUnixTime(endOfMonth(viewMonth));

            const [purchasesData, tickets, clockData] = await Promise.all([
                api.get<{ purchases: PurchaseItem[] }>(
                    `/purchases?year=${year}&month=${month}`
                ),
                api.get<Ticket[]>(
                    `/all_tickets_for_this_month_with_payments?start=${startTimestamp}&end=${endTimestamp}`
                ),
                api.get<{ clock_logs: ClockLog[], wages: { name: string, wage_cents: number }[] }>(
                    `/clock-logs?start=${startTimestamp}&end=${endTimestamp}`
                )
            ]);

            // Calculate payroll client-side to include virtual clock-outs
            const logs = clockData.clock_logs || [];
            const wagesData = clockData.wages || [];

            // Create a wage map for quick lookup
            const wageMap: Record<string, number> = {};
            wagesData.forEach(w => {
                wageMap[w.name] = w.wage_cents;
            });

            const logsByUser: Record<string, ClockLog[]> = {};
            logs.forEach(log => {
                if (!logsByUser[log.user]) logsByUser[log.user] = [];
                logsByUser[log.user].push(log);
            });

            // Calculate payroll for each user who has logs using the shared utility
            const calculatedPayroll: PayrollItem[] = Object.keys(logsByUser).map(userName => {
                const userLogs = logsByUser[userName];
                const totalHours = calculateTotalHoursFromLogs(userLogs, startTimestamp, true);

                return {
                    name: userName,
                    wage_cents: wageMap[userName] || 0,
                    hours: Number(totalHours.toFixed(2))
                };
            }).filter(p => p.hours > 0);

            setData({
                employees_payroll: calculatedPayroll,
                purchases: (purchasesData.purchases || []),
                tickets: tickets
            });
            setLocalPurchases((purchasesData.purchases || []));
        } catch (err: unknown) {
            console.error(err);
            showError("Fetch Failed", "Could not load financial data.");
        } finally {
            setLoading(false);
        }
    }, [api, viewMonth, showError]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const stats = useMemo(() => {
        if (!data) return { revenue: 0, payroll: 0, purchases: 0, net: 0 };

        const revenueCents = data.tickets.reduce((acc, ticket) => {
            const ticketTotalCents = ticket.total_paid_cents ?? (ticket.line_items?.reduce((sum, item) => sum + item.price_cents, 0) || 0);
            return acc + ticketTotalCents;
        }, 0);

        const payrollCents = data.employees_payroll.reduce((acc, item) => acc + ((item.wage_cents || 0) * (item.hours || 0)), 0);
        // Use localPurchases for calculation to reflect edits immediately in summary
        const purchasesCents = localPurchases.reduce((acc, item) => acc + (item.amount_cents || 0), 0);

        const revenue = revenueCents / 100;
        const payroll = payrollCents / 100;
        const purchases = purchasesCents / 100;
        const net = revenue - payroll - purchases;

        return { revenue, payroll, purchases, net };
    }, [data, localPurchases]);

    const handleMonthChange = (direction: -1 | 1) => {
        const newDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + direction, 1);
        setViewMonth(newDate);
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    const savePurchases = async (items: PurchaseItem[]) => {
        setSaveStatus('saving');
        try {
            const year = viewMonth.getFullYear();
            const month = viewMonth.getMonth() + 1;

            await api.put(`/purchases?year=${year}&month=${month}`, {
                purchases: items
            });

            setSaveStatus('saved');
            // Reset to empty status after 2 seconds
            setTimeout(() => {
                if (saveTimeoutRef.current === null) { // Only if no new save is pending
                    setSaveStatus(prev => prev === 'saved' ? '' : prev);
                }
            }, 2000);
        } catch (err) {
            console.error(err);
            setSaveStatus('error');
            showError("Save Failed", "Could not save purchases.");
        }
    };

    const triggerAutoSave = (newItems: PurchaseItem[]) => {
        setSaveStatus('still typing');
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            savePurchases(newItems);
            saveTimeoutRef.current = null;
        }, 500); // 500ms debounce
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
                    {/* Summary Cards (Tabs) */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <button
                            onClick={() => setActiveTab('revenue')}
                            className={`md-card relative p-5 space-y-2 border-l-4 text-left transition-all ${activeTab === 'revenue' ? 'border-primary bg-primary/10' : 'border-primary hover:bg-surface-variant/10'}`}
                        >
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Revenue</p>
                            <p className="text-2xl font-bold text-on-surface">${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            {activeTab === 'revenue' && (
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-outline drop-shadow-sm">
                                    <ChevronDown size={32} strokeWidth={3} />
                                </div>
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab('payroll')}
                            className={`md-card relative p-5 space-y-2 border-l-4 text-left transition-all ${activeTab === 'payroll' ? 'border-error bg-error/10' : 'border-error hover:bg-surface-variant/10'}`}
                        >
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Payroll</p>
                            <p className="text-2xl font-bold text-on-surface">${stats.payroll.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            {activeTab === 'payroll' && (
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-outline drop-shadow-sm">
                                    <ChevronDown size={32} strokeWidth={3} />
                                </div>
                            )}
                        </button>

                        <button
                            onClick={() => setActiveTab('purchases')}
                            className={`md-card relative p-5 space-y-2 border-l-4 text-left transition-all ${activeTab === 'purchases' ? 'border-secondary bg-secondary/10' : 'border-secondary hover:bg-surface-variant/10'}`}
                        >
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Purchases</p>
                            <p className="text-2xl font-bold text-on-surface">${stats.purchases.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            {activeTab === 'purchases' && (
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-outline drop-shadow-sm">
                                    <ChevronDown size={32} strokeWidth={3} />
                                </div>
                            )}
                        </button>

                        <div className="p-5 space-y-2">
                            <p className="text-xs font-bold text-outline uppercase tracking-wider">Net Profit</p>
                            <p className={`text-2xl font-bold ${stats.net >= 0 ? 'text-green-500' : 'text-error'}`}>
                                ${stats.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="lg:col-span-3 min-h-[400px]">
                        {activeTab === 'revenue' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h4 className="text-sm font-semibold text-outline uppercase tracking-wider">Revenue Breakdown</h4>
                                    <span className="text-sm font-medium text-outline">{data?.tickets.length} tickets</span>
                                </div>

                                <div className="md-card overflow-hidden min-h-[400px]">
                                    {data?.tickets.length === 0 ? (
                                        <div className="p-12 text-center">
                                            <p className="text-outline italic">No revenue from tickets this month.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col">
                                            {/* Desktop Header */}
                                            <div className="hidden sm:grid grid-cols-12 text-sm tracking-wider px-5 py-3 text-on-surface">
                                                <div className="col-span-1 font-semibold">Number</div>
                                                <div className="col-span-4 font-semibold">Subject</div>
                                                <div className="col-span-2 font-semibold">Payment date</div>
                                                <div className="col-span-3 font-semibold">Customer</div>
                                                <div className="col-span-2 font-semibold text-right">Amount</div>
                                            </div>

                                            {/* Tickets Grid */}
                                            <div className="flex flex-col">
                                                {[...(data?.tickets || [])].sort((a, b) => (b.paid_at ?? 0) - (a.paid_at ?? 0)).map(ticket => {
                                                    const totalCents = ticket.total_paid_cents ?? (ticket.line_items?.reduce((sum, item) => sum + item.price_cents, 0) || 0);
                                                    const total = totalCents / 100;
                                                    const displayDate = ticket.paid_at ?? ticket.created_at;
                                                    const dateStr = new Date(displayDate * 1000).toLocaleDateString(undefined, {
                                                        month: 'short',
                                                        day: 'numeric'
                                                    });
                                                    const targetUrl = `${window.location.origin}/&${ticket.ticket_number}`;

                                                    return (
                                                        <div key={ticket.ticket_number} data-row>
                                                            <NavigationButton
                                                                onClick={() => goTo(`/&${ticket.ticket_number}`)}
                                                                targetUrl={targetUrl}
                                                                className="md-row-box w-full text-left transition-all duration-150 group"
                                                            >
                                                                {/* Desktop Layout */}
                                                                <div className="hidden sm:grid grid-cols-12 px-4 py-3 items-center">
                                                                    <div className="col-span-1 truncate">#{ticket.ticket_number}</div>
                                                                    <div className="col-span-4 truncate">{ticket.subject}</div>
                                                                    <div className="col-span-2 truncate">{dateStr}</div>
                                                                    <div className="col-span-3 truncate text-on-surface">{ticket.customer?.full_name || "Customer"}</div>
                                                                    <div className="col-span-2 text-right font-bold text-on-surface">
                                                                        ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </div>
                                                                </div>

                                                                {/* Mobile Layout */}
                                                                <div className="sm:hidden px-4 py-3 space-y-2">
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="text-md font-medium truncate flex-1 min-w-0">#{ticket.ticket_number}</div>
                                                                        <div className="text-md truncate ml-2 text-outline">{dateStr}</div>
                                                                    </div>
                                                                    <div className="text-md truncate text-on-surface">{ticket.subject}</div>
                                                                    <div className="flex justify-end pt-1">
                                                                        <div className="font-bold text-on-surface">
                                                                            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </NavigationButton>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'payroll' && (
                            <div className="md-card p-6 min-h-[400px] space-y-4">
                                <h4 className="text-xl font-bold text-on-surface">Payroll Breakdown</h4>
                                {data?.employees_payroll.length === 0 ? (
                                    <p className="text-outline italic">No payroll data for this month.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-outline/20">
                                                    <th className="py-2 text-sm font-semibold text-outline">Employee</th>
                                                    <th className="py-2 text-sm font-semibold text-outline text-right">Wage</th>
                                                    <th className="py-2 text-sm font-semibold text-outline text-right">Hours</th>
                                                    <th className="py-2 text-sm font-semibold text-outline text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data?.employees_payroll.map((item, idx) => {
                                                    return (
                                                        <tr key={idx} className="border-b border-outline/10 last:border-0 hover:bg-surface-variant/5">
                                                            <td className="py-3 pr-4 font-medium text-on-surface">{item.name}</td>
                                                            <td className="py-3 text-right text-on-surface">${(item.wage_cents / 100).toFixed(2)}/hr</td>
                                                            <td className="py-3 text-right text-on-surface">{item.hours?.toFixed(2) ?? '0.00'} hrs</td>
                                                            <td className="py-3 text-right font-medium text-on-surface">${((item.wage_cents * item.hours) / 100).toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'purchases' && (
                            <div className="md-card p-6 min-h-[400px] space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <h4 className="text-xl font-bold text-on-surface">This month's purchases</h4>
                                        {/* Status Indicator */}
                                        <div className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                                            {saveStatus === 'still typing' && <span className="text-outline">Still Typing...</span>}
                                            {saveStatus === 'saving' && (
                                                <span className="flex items-center gap-1 text-outline">
                                                    <Loader2 size={14} className="animate-spin" />
                                                    Saving...
                                                </span>
                                            )}
                                            {saveStatus === 'saved' && <span className="text-green-500">Saved</span>}
                                            {saveStatus === 'error' && <span className="text-error">Error Saving</span>}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newItems: PurchaseItem[] = [...localPurchases, { name: "", amount_cents: 0 }];
                                            setLocalPurchases(newItems);
                                        }}
                                        className="md-btn-surface elev-1 text-sm py-1.5 px-3 w-fit"
                                    >
                                        + Add Purchase
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {localPurchases.map((item, index) => (
                                        <div key={index} className="flex gap-3 items-center">
                                            <input
                                                type="text"
                                                placeholder="Purchase Name"
                                                value={item.name}
                                                onChange={(e) => {
                                                    const next = [...localPurchases];
                                                    next[index] = { ...next[index], name: e.target.value };
                                                    setLocalPurchases(next);
                                                    setSaveStatus('still typing');
                                                }}
                                                onBlur={() => triggerAutoSave(localPurchases)}
                                                className="md-input flex-grow"
                                            />
                                            <div className="relative w-32">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-outline">$</span>
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={item.amount_cents ? (item.amount_cents / 100).toString() : ""}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        const next = [...localPurchases];
                                                        next[index] = { ...next[index], amount_cents: Math.round(val * 100) };
                                                        setLocalPurchases(next);
                                                        setSaveStatus('still typing');
                                                    }}
                                                    onBlur={() => triggerAutoSave(localPurchases)}
                                                    className="md-input w-full pl-6 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const itemToDelete = localPurchases[index];
                                                    const newItems = localPurchases.filter((_, i) => i !== index);
                                                    setLocalPurchases(newItems);
                                                    const isEmpty = !itemToDelete.name && !itemToDelete.amount_cents;
                                                    if (!isEmpty) {
                                                        triggerAutoSave(newItems);
                                                    }
                                                }}
                                                className="p-2 text-outline hover:text-error transition-colors"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))}

                                    {localPurchases.length === 0 && (
                                        <div className="text-center py-6 text-outline text-sm italic">
                                            No purchases recorded for this month.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
