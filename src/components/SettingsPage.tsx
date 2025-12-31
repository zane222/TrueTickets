import { useState, useEffect } from "react";
import { Clock, DollarSign, Store } from "lucide-react";
import NavigationButton from "./ui/NavigationButton";

interface SettingsPageProps {
    goTo: (path: string) => void;
}

export default function SettingsPage({ goTo }: SettingsPageProps) {
    const [activeTab, setActiveTab] = useState<"config" | "hours" | "income">("config");

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-surface border-r border-[#8f96a3]/20 flex flex-col p-4 gap-3">
                <h2 className="text-xl font-bold text-on-surface px-2 mb-2">Settings</h2>

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

                <div className="flex-1" />

                <NavigationButton
                    onClick={() => goTo("/")}
                    targetUrl={`${window.location.origin}/`}
                    className="md-btn-surface w-full mt-4 justify-center"
                >
                    Back to Home
                </NavigationButton>
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

function ConfigTab() {
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

interface Shift {
    date: Date;
    employee: string;
    segments: { start: string, end: string }[];
    hours: number;
}

function HoursTab() {
    const [periods, setPeriods] = useState<{ label: string, value: string }[]>([]);
    const [selectedPeriod, setSelectedPeriod] = useState<string>("");
    const [payPeriodInfo, setPayPeriodInfo] = useState<{ start: Date, end: Date } | null>(null);
    const [employeeData, setEmployeeData] = useState<Record<string, { shifts: Shift[], total: number }>>({});

    // 1. Generate Periods on Mount
    useEffect(() => {
        const generatedPeriods = generatePayPeriods(12); // Last 6 months approx
        setPeriods(generatedPeriods);
        // Default to the first (current/latest) period
        if (generatedPeriods.length > 0) {
            setSelectedPeriod(generatedPeriods[0].value);
        }
    }, []);

    // 2. Update Data when Selected Period Changes
    useEffect(() => {
        if (!selectedPeriod) return;

        // Parse start date from value (ISO string of start date)
        const start = new Date(selectedPeriod);
        let end: Date;

        const day = start.getDate();
        const year = start.getFullYear();
        const month = start.getMonth();

        if (day === 1) {
            // 1st - 15th
            end = new Date(year, month, 15);
        } else {
            // 16th - End
            end = new Date(year, month + 1, 0);
        }

        // Set time to end of day for 'end'
        end.setHours(23, 59, 59, 999);

        setPayPeriodInfo({ start, end });

        // Generate mock shifts
        const employees = ["John Doe", "Jane Smith"];

        // Helper to parse "9:30 am" or "9:30am" to decimals
        const parseTimeStr = (t: string) => {
            const match = t.match(/(\d+):(\d+)\s*(am|pm)/i);
            if (!match) return 0;
            let [_, h, m, period] = match;
            let hours = parseInt(h);
            const minutes = parseInt(m);
            if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
            if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
            return hours + minutes / 60;
        };

        // Helper to sum segments
        const calculateShiftTotal = (segments: { start: string, end: string }[]) => {
            return segments.reduce((acc, seg) => {
                return acc + (parseTimeStr(seg.end) - parseTimeStr(seg.start));
            }, 0);
        };

        const grouped: Record<string, { shifts: Shift[], total: number }> = {};
        employees.forEach(emp => {
            grouped[emp] = { shifts: [], total: 0 };
        });

        // Generate shifts for the full month (for display context)
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);

        const tempCurrent = new Date(monthStart);
        // Reset tempCurrent time
        tempCurrent.setHours(0, 0, 0, 0);

        while (tempCurrent <= monthEnd) {
            // Skip weekends
            if (tempCurrent.getDay() !== 0 && tempCurrent.getDay() !== 6) { // Mon-Fri
                employees.forEach(emp => {
                    // Randomly skip some days to make it look real
                    if (Math.random() > 0.8) return;

                    // Simulate multi-segment shifts (e.g. lunch break)
                    const segments: { start: string, end: string }[] = [];

                    const hasLunch = Math.random() > 0.3; // 70% chance of taking lunch

                    const fmtTime = (h: number, m: number) => {
                        const ampm = h >= 12 ? 'pm' : 'am';
                        const h12 = h % 12 || 12;
                        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
                    }

                    // Random start minutes to satisfy "9:58am" request context
                    const rMin = () => Math.floor(Math.random() * 60);

                    if (hasLunch) {
                        // Morning
                        const mStartH = 9; const mStartM = rMin();
                        const mEndH = 12; const mEndM = rMin();
                        segments.push({ start: fmtTime(mStartH, mStartM), end: fmtTime(mEndH, mEndM) });

                        // Afternoon
                        const aStartH = 13; const aStartM = rMin();
                        const aEndH = 17; const aEndM = rMin();
                        segments.push({ start: fmtTime(aStartH, aStartM), end: fmtTime(aEndH, aEndM) });
                    } else {
                        // Straight shift
                        const startH = 9; const startM = rMin();
                        const endH = 17; const endM = rMin();
                        segments.push({ start: fmtTime(startH, startM), end: fmtTime(endH, endM) });
                    }

                    const totalHours = calculateShiftTotal(segments);

                    grouped[emp].shifts.push({
                        date: new Date(tempCurrent),
                        employee: emp,
                        segments: segments,
                        hours: totalHours
                    });

                    // Only add to total if in the selected pay period
                    // tempCurrent is 00:00:00. start/end are Pay Period start/end.
                    if (tempCurrent >= start && tempCurrent <= end) {
                        grouped[emp].total += totalHours;
                    }
                });
            }
            tempCurrent.setDate(tempCurrent.getDate() + 1);
        }
        setEmployeeData(grouped);
    }, [selectedPeriod]);

    const generatePayPeriods = (count: number) => {
        const periods: { label: string, value: string }[] = [];
        const today = new Date();

        let currentMonth = today.getMonth();
        let currentYear = today.getFullYear();

        // Determine current half
        let isFirstHalf = today.getDate() <= 15;

        for (let i = 0; i < count; i++) {
            let start: Date, end: Date;

            if (isFirstHalf) {
                // 1st - 15th
                start = new Date(currentYear, currentMonth, 1);
                end = new Date(currentYear, currentMonth, 15);
            } else {
                // 16th - End
                start = new Date(currentYear, currentMonth, 16);
                end = new Date(currentYear, currentMonth + 1, 0);
            }

            const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const label = `${fmt(start)} - ${fmt(end)}, ${start.getFullYear()}`;

            // Value is just the start date ISO, enough to reconstruct
            periods.push({ label, value: start.toISOString() });

            // Move back
            if (isFirstHalf) {
                // Go to previous month's second half
                isFirstHalf = false;
                currentMonth--;
                if (currentMonth < 0) {
                    currentMonth = 11;
                    currentYear--;
                }
            } else {
                // Go to current month's first half
                isFirstHalf = true;
            }
        }
        return periods;
    };

    const renderCalendar = (shifts: Shift[]) => {
        if (!payPeriodInfo) return null;

        const { start, end } = payPeriodInfo;
        const year = start.getFullYear();
        const month = start.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday

        const days: (Date | null)[] = [];

        // Fill padding
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Fill days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }

        return (
            <div className="border border-[#8f96a3]/20 rounded-xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-7 bg-surface-variant/10 border-b border-[#8f96a3]/20">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                        <div key={day} className="py-2 text-center text-xs font-bold text-outline uppercase">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Grid */}
                <div className="grid grid-cols-7 bg-background">
                    {days.map((date, idx) => {
                        if (!date) {
                            return <div key={`pad-${idx}`} className="bg-surface-variant/5 min-h-[100px] border-r border-b border-[#8f96a3]/10"></div>;
                        }

                        // Check if date is in pay period
                        const checkDate = new Date(date).setHours(0, 0, 0, 0);
                        const pStart = new Date(start).setHours(0, 0, 0, 0);
                        const pEnd = new Date(end).setHours(0, 0, 0, 0);

                        const inPeriod = checkDate >= pStart && checkDate <= pEnd;

                        // Find shift
                        const shift = shifts.find(s => s.date.getDate() === date.getDate() && s.date.getMonth() === date.getMonth() && s.date.getFullYear() === date.getFullYear());

                        return (
                            <div
                                key={date.toISOString()}
                                className={`min-h-[100px] border-r border-b p-2 text-sm flex flex-col relative
                                    ${inPeriod
                                        ? 'bg-background hover:bg-surface-variant/5 border-[#8f96a3]/20'
                                        : 'bg-surface-variant/20 text-outline/30 border-[#8f96a3]/10' // Dimmed significantly
                                    }
                                    ${shift && inPeriod ? 'hover:bg-primary/5' : ''}
                                    transition-colors cursor-default
                                `}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`font-medium text-xs ${inPeriod ? 'text-on-surface' : 'text-outline/40'}`}>
                                        {date.getDate()}
                                        {["st", "nd", "rd"][((date.getDate() + 90) % 100 - 10) % 10 - 1] || "th"}
                                    </span>
                                    {shift && (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                            ${inPeriod
                                                ? 'bg-primary/10 text-primary'
                                                : 'bg-surface-variant/40 text-outline/40'
                                            }
                                        `}>
                                            {shift.hours.toFixed(2)}h
                                        </span>
                                    )}
                                </div>

                                {shift && (
                                    <div className="flex-1 flex flex-col justify-end gap-1">
                                        <div className="flex flex-col items-center justify-center w-full mt-2">
                                            {(() => {
                                                const parseTime = (t: string) => {
                                                    // Parse "9:58am" or "9:30 pm"
                                                    const match = t.match(/(\d+):(\d+)\s*(am|pm)/i);
                                                    if (!match) return 0;
                                                    let [_, h, m, period] = match;
                                                    let hours = parseInt(h);
                                                    const minutes = parseInt(m);
                                                    if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                                                    if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
                                                    return hours + minutes / 60;
                                                };

                                                // Fixed scale for visual consistency: 6am to 10pm (16h)
                                                // Adjust if needed, but 16h covers most shifts
                                                const minTime = 6;
                                                const maxTime = 22;
                                                const duration = maxTime - minTime;

                                                const getPos = (t: string) => {
                                                    const val = parseTime(t);
                                                    return Math.max(0, Math.min(100, (val - minTime) / duration * 100));
                                                };

                                                const overallStart = shift.segments[0].start;
                                                const overallEnd = shift.segments[shift.segments.length - 1].end;

                                                const barColor = inPeriod ? "bg-primary" : "bg-white";
                                                const textColor = "text-outline"; // Always high contrast

                                                return (
                                                    <>
                                                        {/* Main Start Label - Centered Top */}
                                                        <div className={`text-xs font-semibold whitespace-nowrap mb-1 ${textColor}`}>
                                                            {overallStart}
                                                        </div>

                                                        {/* Timeline Track */}
                                                        <div className="w-full h-4 relative flex items-center">
                                                            {/* Base Track Line */}
                                                            <div className={`absolute left-0 right-0 h-0.5 ${inPeriod ? 'bg-outline/10' : 'bg-outline/5'}`}></div>

                                                            {/* Segments */}
                                                            {shift.segments.map((seg, i) => {
                                                                const sPos = getPos(seg.start);
                                                                const ePos = getPos(seg.end);
                                                                const width = Math.max(2, ePos - sPos);

                                                                return (
                                                                    <div
                                                                        key={i}
                                                                        className={`absolute h-2 shadow-sm z-10 ${barColor}`} // No rounding
                                                                        style={{ left: `${sPos}%`, width: `${width}%` }}
                                                                    />
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Main End Label - Centered Bottom */}
                                                        <div className={`text-xs font-semibold whitespace-nowrap mt-1 ${textColor}`}>
                                                            {overallEnd}
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-on-surface">Employee Hours</h3>
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-outline">Period:</label>
                    <select
                        className="md-input w-64 bg-surface"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                    >
                        {periods.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {Object.entries(employeeData).map(([name, data]) => (
                <div key={name} className="md-card p-6 gap-4 flex flex-col">
                    <div className="flex justify-between items-center">
                        <h4 className="font-bold text-lg text-on-surface">{name}</h4>
                        <span className="text-sm font-medium text-outline bg-surface-variant/20 px-3 py-1 rounded-full">
                            Total: <span className="text-primary font-bold ml-1">{data.total.toFixed(2)} hrs</span>
                        </span>
                    </div>

                    {renderCalendar(data.shifts)}
                </div>
            ))}
        </div>
    );
}

function IncomeTab() {
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
