import { useState, useMemo } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useAlertMethods } from "../ui/AlertSystem";

interface IncomeItem {
    id: string;
    name: string;
    amount: string;
}

export default function IncomeTab() {
    const { info } = useAlertMethods();
    const [viewMonth, setViewMonth] = useState(() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    });

    const [items, setItems] = useState<IncomeItem[]>([
        { id: '1', name: 'ebay', amount: '6456' },
        { id: '2', name: 'amazon', amount: '1789' },
    ]);

    const [saving, setSaving] = useState(false);

    // Mock data for payroll and income based on month
    const monthlyStats = useMemo(() => {
        // Deterministic mock data based on month
        const seed = viewMonth.getMonth() + viewMonth.getFullYear();
        return {
            income: 15000 + (seed % 10) * 1000,
            payroll: 5000 + (seed % 5) * 500
        };
    }, [viewMonth]);

    const businessExpensesTotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }, [items]);

    const netProfit = monthlyStats.income - monthlyStats.payroll - businessExpensesTotal;

    const handleMonthChange = (direction: -1 | 1) => {
        const newDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + direction, 1);
        setViewMonth(newDate);
        // In a real app, you'd fetch data here. 
        // For now, we'll just slightly randomize the items to simulate data change
        if (newDate.getMonth() % 2 === 0) {
            setItems([
                { id: '1', name: 'ebay', amount: '5200' },
                { id: '2', name: 'amazon', amount: '1450' },
                { id: '3', name: 'supplies', amount: '300' },
            ]);
        } else {
            setItems([
                { id: '1', name: 'ebay', amount: '6456' },
                { id: '2', name: 'amazon', amount: '1789' },
            ]);
        }
    };

    const updateItem = (id: string, field: keyof IncomeItem, value: string) => {
        setItems(prev => prev.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const addItem = () => {
        setItems([...items, {
            id: crypto.randomUUID(),
            name: "",
            amount: ""
        }]);
    };

    const removeItem = (id: string) => {
        setItems(items.filter(item => item.id !== id));
    };

    const handleSave = async () => {
        setSaving(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800));
        setSaving(false);
        info("Saved", "Expense list has been updated successfully.");
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-2xl font-bold text-on-surface">Income & Expenses</h3>

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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md-card p-5 space-y-2 border-l-4 border-primary">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider">Income</p>
                    <p className="text-2xl font-bold text-on-surface">${monthlyStats.income.toLocaleString()}</p>
                </div>

                <div className="md-card p-5 space-y-2 border-l-4 border-error">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider">Payroll</p>
                    <p className="text-2xl font-bold text-on-surface">${monthlyStats.payroll.toLocaleString()}</p>
                </div>

                <div className="md-card p-5 space-y-2 border-l-4 border-secondary">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider">Purchases</p>
                    <p className="text-2xl font-bold text-on-surface">${businessExpensesTotal.toLocaleString()}</p>
                </div>

                <div className="md-card p-5 space-y-2 border-l-4 border-green-500">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider">Net Profit</p>
                    <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-500' : 'text-error'}`}>
                        ${netProfit.toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Income & Expense List */}
            <div className="md-card p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <label className="text-xl font-bold text-on-surface">This month's purchases</label>
                </div>

                <div className="space-y-3">
                    {items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                            <input
                                className="md-input flex-1 text-md sm:text-base py-3 sm:py-2"
                                value={item.name}
                                onChange={e => updateItem(item.id, 'name', e.target.value)}
                                placeholder="Item name (e.g. ebay)"
                            />
                            <div className="relative w-full md:w-48">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline font-medium">$</span>
                                <input
                                    className="md-input w-full pl-12 text-md sm:text-base py-3 sm:py-2"
                                    value={item.amount}
                                    onChange={e => updateItem(item.id, 'amount', e.target.value)}
                                    placeholder="0.00"
                                    inputMode="decimal"
                                />
                            </div>
                            <button
                                onClick={() => removeItem(item.id)}
                                className="p-2 text-outline hover:text-error transition-colors md-btn-surface rounded-lg shrink-0"
                                title="Remove item"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                        <button
                            type="button"
                            className="md-btn-surface elev-1 text-md py-2 px-4 flex items-center gap-2 w-full sm:w-auto justify-center"
                            onClick={addItem}
                        >
                            <Plus className="w-4 h-4" />
                            Add expense
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="md-btn-primary elev-1 px-8 py-2 flex items-center gap-2 w-full sm:w-auto justify-center disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin text-on-primary" />
                            ) : null}
                            Save Expenses
                        </button>
                    </div>

                    {items.length === 0 && (
                        <div className="text-center py-6 text-outline text-sm">
                            No expenses added for this month yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
