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

    const [payPeriodInfo, setPayPeriodInfo] = useState<{ start: Date, end: Date } | null>(null);
    const [employeeData, setEmployeeData] = useState<Record<string, { shifts: Shift[], total: number }>>({});

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

    // 1. Generate Periods on Mount
    const [viewMonth, setViewMonth] = useState(() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    });
    const [viewPeriod, setViewPeriod] = useState<'first' | 'second'>(() => new Date().getDate() <= 15 ? 'first' : 'second');

    const handleUpdateShift = (employeeName: string, date: Date, newSegments: { start: string, end: string }[]) => {
        setEmployeeData(prev => {
            const newData = { ...prev };
            const empData = { ...newData[employeeName] };

            // Find the specific shift index
            const shiftIdx = empData.shifts.findIndex(s =>
                s.date.getDate() === date.getDate() &&
                s.date.getMonth() === date.getMonth() &&
                s.date.getFullYear() === date.getFullYear()
            );

            const newTotalHours = calculateShiftTotal(newSegments);

            if (shiftIdx >= 0) {
                // Update existing shift
                if (newSegments.length === 0) {
                    // Remove shift if no segments? Or just keep empty? User said "remove a time clock period".
                    // If all segments removed, maybe remove shift? Let's keep it empty for now or remove.
                    // Let's remove the shift if segments are empty to be clean, or just set segments empty.
                    empData.shifts[shiftIdx] = {
                        ...empData.shifts[shiftIdx],
                        segments: newSegments,
                        hours: 0
                    };
                } else {
                    empData.shifts[shiftIdx] = {
                        ...empData.shifts[shiftIdx],
                        segments: newSegments,
                        hours: newTotalHours
                    };
                }
            } else {
                // Create new shift (if we support adding to empty days later)
                // For now, only editing existing
            }

            // Recalculate Period Total
            // We need to re-sum all shifts that fall within the current payPeriodInfo
            if (payPeriodInfo) {
                let periodTotal = 0;
                empData.shifts.forEach(s => {
                    // Normalize dates to compare only day, month, year
                    const shiftDate = new Date(s.date.getFullYear(), s.date.getMonth(), s.date.getDate());
                    const periodStartDate = new Date(payPeriodInfo.start.getFullYear(), payPeriodInfo.start.getMonth(), payPeriodInfo.start.getDate());
                    const periodEndDate = new Date(payPeriodInfo.end.getFullYear(), payPeriodInfo.end.getMonth(), payPeriodInfo.end.getDate());

                    if (shiftDate >= periodStartDate && shiftDate <= periodEndDate) {
                        periodTotal += calculateShiftTotal(s.segments);
                    }
                });
                empData.total = periodTotal;
            }

            newData[employeeName] = empData;
            return newData;
        });
    };

    // 2. Update Data when View Month/Period Changes
    useEffect(() => {
        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();

        let start: Date, end: Date;

        if (viewPeriod === 'first') {
            // 1st - 15th
            start = new Date(year, month, 1);
            end = new Date(year, month, 15);
        } else {
            // 16th - End
            start = new Date(year, month, 16);
            end = new Date(year, month + 1, 0);
        }

        // Set time to end of day for 'end'
        end.setHours(23, 59, 59, 999);

        setPayPeriodInfo({ start, end });

        // Generate mock shifts
        const employees = ["John Doe", "Jane Smith"];

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


        const carryOver: Record<string, { start: string, end: string }[]> = {};
        // Initialize carryOver for each employee
        employees.forEach(emp => { carryOver[emp] = []; });

        while (tempCurrent <= monthEnd) {
            // Skip weekends, but still process carry-overs
            const isWeekend = tempCurrent.getDay() === 0 || tempCurrent.getDay() === 6;

            employees.forEach(emp => {
                const segments: { start: string, end: string }[] = [];

                // 1. Check Carry Over from previous day
                if (carryOver[emp].length > 0) {
                    segments.push(...carryOver[emp]);
                    carryOver[emp] = []; // Clear
                }

                // 2. Determine if we generate NEW shifts today
                // Skip new shifts on weekends, or randomly (80% chance of NO new shift if no carry over? original logic was 20% work)
                // Adjusted logic: If it's a weekend, we don't start NEW shifts.
                // If it's a weekday, we *might* start a shift.
                let generateNew = !isWeekend;
                if (generateNew && Math.random() > 0.8) generateNew = false; // 20% chance of work on weekday

                if (generateNew) {
                    // Helper
                    const fmtTime = (h: number, m: number) => {
                        const ampm = h >= 12 ? 'pm' : 'am';
                        const h12 = h % 12 || 12;
                        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
                    }
                    const rMin = () => Math.floor(Math.random() * 60);

                    // Decide Type: Normal, Lunch, or Overnight
                    const randType = Math.random();

                    if (randType > 0.85) {
                        // Overnight Shift (15% chance when working)
                        // e.g. 5pm - 2am
                        const startH = 17 + Math.floor(Math.random() * 5); // 5pm to 9pm start
                        const duration = 6 + Math.floor(Math.random() * 4); // 6-10 hours work

                        // Split it logic
                        // End of Day 1: 11:59pm
                        const p1Start = fmtTime(startH, rMin());
                        const p1End = "11:59pm";

                        // Day 2: 12:00am - Remainder
                        // Calculate remainder time.
                        // Simple mock: just pick a random end time AM next day (e.g. 2am, 3am)
                        const endH = (startH + duration) % 24;
                        const p2End = fmtTime(endH, rMin());

                        segments.push({ start: p1Start, end: p1End });
                        carryOver[emp].push({ start: "12:00am", end: p2End });

                    } else if (randType > 0.5) {
                        // Split Shift / Lunch
                        // Morning
                        segments.push({ start: fmtTime(9, rMin()), end: fmtTime(12, rMin()) });
                        // Afternoon
                        segments.push({ start: fmtTime(13, rMin()), end: fmtTime(17, rMin()) });

                    } else {
                        // Straight Shift
                        segments.push({ start: fmtTime(9, rMin()), end: fmtTime(17, rMin()) });
                    }
                }

                // Save if we have any segments (either carry over or new)
                if (segments.length > 0) {
                    const totalHours = calculateShiftTotal(segments);
                    grouped[emp].shifts.push({
                        date: new Date(tempCurrent),
                        employee: emp,
                        segments: segments,
                        hours: totalHours
                    });

                    // Only add to total if in the selected pay period
                    if (tempCurrent >= start && tempCurrent <= end) {
                        grouped[emp].total += totalHours;
                    }
                }
            });
            tempCurrent.setDate(tempCurrent.getDate() + 1);
        }
        setEmployeeData(grouped);
    }, [viewMonth, viewPeriod]);


    const renderCalendar = (shifts: Shift[], employeeName: string) => {
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
            <div className="border border-[#8f96a3]/20 rounded-xl">
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
                                className={`min-h-[100px] border-r border-b p-2 text-sm flex flex-col relative group transition-all duration-200
                                    ${inPeriod
                                        ? 'bg-background hover:bg-surface-variant/5 border-[#8f96a3]/20'
                                        : 'bg-surface-variant/20 text-outline/30 border-[#8f96a3]/10' // Dimmed significantly
                                    }
                                    ${shift && inPeriod ? 'hover:bg-primary/5 hover:ring-2 hover:ring-primary hover:ring-inset hover:z-50' : ''}
                                    cursor-default
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

                                {shift && shift.segments.length > 0 && (
                                    <>
                                        {/* Hover Popup */}
                                        {inPeriod && (
                                            <div className="hidden group-hover:block absolute bottom-full left-16 translate-y-3 w-[320px] z-[60]">
                                                <div className="md-card shadow-2xl p-4 overflow-visible relative">
                                                    <div className="overflow-hidden">
                                                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#8f96a3]/20">
                                                            <span className="text-xs font-bold text-outline uppercase tracking-wider">Edit Shift</span>
                                                            <span className="text-xs text-outline opacity-70">{shift.hours.toFixed(2)}h Total</span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {shift.segments.map((seg, segIdx) => {
                                                                const duration = parseTimeStr(seg.end) - parseTimeStr(seg.start);
                                                                return (
                                                                    <div key={segIdx} className="flex items-center gap-2 group/item">
                                                                        <div className="flex-1 flex gap-2">
                                                                            <input
                                                                                type="text"
                                                                                className="md-input w-full text-xs py-1 px-2 h-8 text-center"
                                                                                value={seg.start}
                                                                                onChange={(e) => {
                                                                                    const newSegs = [...shift.segments];
                                                                                    newSegs[segIdx] = { ...newSegs[segIdx], start: e.target.value };
                                                                                    handleUpdateShift(employeeName, date, newSegs);
                                                                                }}
                                                                            />
                                                                            <div className="flex items-center text-outline">-</div>
                                                                            <input
                                                                                type="text"
                                                                                className="md-input w-full text-xs py-1 px-2 h-8 text-center"
                                                                                value={seg.end}
                                                                                onChange={(e) => {
                                                                                    const newSegs = [...shift.segments];
                                                                                    newSegs[segIdx] = { ...newSegs[segIdx], end: e.target.value };
                                                                                    handleUpdateShift(employeeName, date, newSegs);
                                                                                }}
                                                                            />
                                                                        </div>

                                                                        <span className="text-xs text-outline w-10 text-right font-mono tabular-nums">{duration.toFixed(2)}h</span>

                                                                        <button
                                                                            className="h-8 w-8 flex items-center justify-center rounded text-outline/50 hover:text-error hover:bg-error/10 transition-colors"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation(); // Prevent bubble
                                                                                const newSegs = shift.segments.filter((_, i) => i !== segIdx);
                                                                                handleUpdateShift(employeeName, date, newSegs);
                                                                            }}
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                            <button
                                                                className="w-full py-2 mt-2 text-xs font-semibold md-btn-primary flex items-center justify-center gap-1 opacity-90 hover:opacity-100"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const lastSeg = shift.segments[shift.segments.length - 1];
                                                                    const newStart = lastSeg ? lastSeg.end : "9:00am";
                                                                    const newSegs = [...shift.segments, { start: newStart, end: newStart }];
                                                                    handleUpdateShift(employeeName, date, newSegs);
                                                                }}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                                                Add Interval
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex-1 flex flex-col justify-end gap-1">
                                            <div className="flex flex-col items-center justify-center w-full mt-2">
                                                {(() => {
                                                    // Fixed scale for visual consistency: 6am to 10pm (16h)
                                                    // Adjust if needed, but 16h covers most shifts
                                                    const minTime = 6;
                                                    const maxTime = 22;
                                                    const duration = maxTime - minTime;

                                                    const getPos = (t: string) => {
                                                        const val = parseTimeStr(t);
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
                                    </>
                                )}
                            </div >
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
                    <div className="flex items-center gap-4 bg-surface md-card p-1 rounded-lg border-[#8f96a3]/20">
                        {/* Month Navigation */}
                        <div className="flex items-center gap-2 pl-2">
                            <button
                                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                                className="p-1 rounded-full hover:bg-surface-variant/20 text-outline transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            </button>
                            <span className="text-sm font-bold text-on-surface min-w-[120px] text-center select-none">
                                {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </span>
                            <button
                                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                                className="p-1 rounded-full hover:bg-surface-variant/20 text-outline transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-6 bg-outline/10"></div>

                        {/* Period Toggle */}
                        <div className="flex bg-surface-variant/10 rounded p-0.5">
                            <button
                                onClick={() => setViewPeriod('first')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewPeriod === 'first'
                                    ? 'bg-background shadow text-primary'
                                    : 'text-outline/60 hover:text-outline'
                                    }`}
                            >
                                1st - 15th
                            </button>
                            <button
                                onClick={() => setViewPeriod('second')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewPeriod === 'second'
                                    ? 'bg-background shadow text-primary'
                                    : 'text-outline/60 hover:text-outline'
                                    }`}
                            >
                                16th - End
                            </button>
                        </div>
                    </div>
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

                    {renderCalendar(data.shifts, name)}
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
