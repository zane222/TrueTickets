import { useState } from 'react';

interface Shift {
    date: Date;
    employee: string;
    segments: { start: string, end: string }[];
    hours: number;
}

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

export default function HoursTab() {

    // Helper to generate mock shifts
    const generateMockShifts = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const employees = ["John Doe", "Jane Smith"];
        const newShifts: Record<string, Shift[]> = {};

        employees.forEach(emp => { newShifts[emp] = []; });

        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);

        const tempCurrent = new Date(monthStart);
        tempCurrent.setHours(0, 0, 0, 0);

        const carryOver: Record<string, { start: string, end: string }[]> = {};
        employees.forEach(emp => { carryOver[emp] = []; });

        while (tempCurrent <= monthEnd) {
            const isWeekend = tempCurrent.getDay() === 0 || tempCurrent.getDay() === 6;

            employees.forEach(emp => {
                const segments: { start: string, end: string }[] = [];

                if (carryOver[emp].length > 0) {
                    segments.push(...carryOver[emp]);
                    carryOver[emp] = [];
                }

                let generateNew = !isWeekend;
                if (generateNew && Math.random() > 0.8) generateNew = false;

                if (generateNew) {
                    const fmtTime = (h: number, m: number) => {
                        const ampm = h >= 12 ? 'pm' : 'am';
                        const h12 = h % 12 || 12;
                        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
                    }
                    const rMin = () => Math.floor(Math.random() * 60);
                    const randType = Math.random();

                    if (randType > 0.85) {
                        const startH = 17 + Math.floor(Math.random() * 5);
                        const duration = 6 + Math.floor(Math.random() * 4);
                        const p1Start = fmtTime(startH, rMin());
                        const p1End = "11:59pm";
                        const endH = (startH + duration) % 24;
                        const p2End = fmtTime(endH, rMin());
                        segments.push({ start: p1Start, end: p1End });
                        carryOver[emp].push({ start: "12:00am", end: p2End });
                    } else if (randType > 0.5) {
                        segments.push({ start: fmtTime(9, rMin()), end: fmtTime(12, rMin()) });
                        segments.push({ start: fmtTime(13, rMin()), end: fmtTime(17, rMin()) });
                    } else {
                        segments.push({ start: fmtTime(9, rMin()), end: fmtTime(17, rMin()) });
                    }
                }

                if (segments.length > 0) {
                    const totalHours = calculateShiftTotal(segments);
                    newShifts[emp].push({
                        date: new Date(tempCurrent),
                        employee: emp,
                        segments: segments,
                        hours: totalHours
                    });
                }
            });
            tempCurrent.setDate(tempCurrent.getDate() + 1);
        }
        return newShifts;
    };

    // 1. Generate Periods on Mount
    const [viewMonth, setViewMonth] = useState(() => {
        const d = new Date();
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
    });

    // Initialize shifts based on initial viewMonth
    const [employeeShifts, setEmployeeShifts] = useState<Record<string, Shift[]>>(() => generateMockShifts(viewMonth));

    const [viewPeriod, setViewPeriod] = useState<'first' | 'second'>(() => new Date().getDate() <= 15 ? 'first' : 'second');
    const [currentEmployeeIndex, setCurrentEmployeeIndex] = useState(0);

    const handleUpdateShift = (employeeName: string, date: Date, newSegments: { start: string, end: string }[]) => {
        setEmployeeShifts(prev => {
            const newShifts = { ...prev };
            const empShifts = [...newShifts[employeeName]];
            const shiftIdx = empShifts.findIndex(s =>
                s.date.getDate() === date.getDate() &&
                s.date.getMonth() === date.getMonth() &&
                s.date.getFullYear() === date.getFullYear()
            );
            const newTotalHours = calculateShiftTotal(newSegments);
            if (shiftIdx >= 0) {
                empShifts[shiftIdx] = { ...empShifts[shiftIdx], segments: newSegments, hours: newTotalHours };
            }
            newShifts[employeeName] = empShifts;
            return newShifts;
        });
    };

    const handleMonthChange = (direction: -1 | 1) => {
        const newDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + direction, 1);
        setViewMonth(newDate);
        setEmployeeShifts(generateMockShifts(newDate));
    };

    // 3. Derived State: Pay Period & Totals (Recalculated on render when viewPeriod or employeeShifts change)
    // We can do this directly in render body since it's cheap
    const payPeriodStart = viewPeriod === 'first'
        ? new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
        : new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 16);

    const payPeriodEnd = viewPeriod === 'first'
        ? new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 15)
        : new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);

    payPeriodStart.setHours(0, 0, 0, 0);
    payPeriodEnd.setHours(23, 59, 59, 999);

    const employeeDisplayData = Object.entries(employeeShifts).reduce((acc, [emp, shifts]) => {
        let total = 0;
        shifts.forEach(s => {
            const shiftDate = new Date(s.date); // Copy
            shiftDate.setHours(0, 0, 0, 0);
            if (shiftDate >= payPeriodStart && shiftDate <= payPeriodEnd) {
                total += s.hours;
            }
        });
        acc[emp] = { shifts, total };
        return acc;
    }, {} as Record<string, { shifts: Shift[], total: number }>);


    const renderCalendar = (shifts: Shift[], employeeName: string) => {
        const start = payPeriodStart;
        const end = payPeriodEnd;
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
                                        <div className={`text-xs font-bold rounded-md
                                            ${inPeriod
                                                ? 'bg-primary/10 text-primary'
                                                : 'bg-surface-variant/40 text-outline/40' // Keep dimmed style for out-of-period
                                            }
                                        `}>
                                            {shift.hours.toFixed(2)}h
                                        </div>
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

                                                                        <span className="text-xs text-outline w-10 text-right tabular-nums">{duration.toFixed(2)}h</span>

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
                                                                <span className="text-outline/60 ml-1 font-normal">In </span>
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
                                                                <span className="text-outline/60 ml-1 font-normal">Out </span>
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
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-on-surface mb-6">Employee Hours</h3>

            {/* Header Controls */}
            <div className="flex justify-between items-center mb-6">
                {/* Left: Employee Navigation */}
                <div className="flex items-center gap-4 bg-surface md-card p-1 rounded-lg border-[#8f96a3]/20">
                    <button
                        onClick={() => setCurrentEmployeeIndex(prev => prev > 0 ? prev - 1 : prev)}
                        className={`p-1 rounded-full transition-colors ${currentEmployeeIndex === 0
                            ? 'opacity-0 pointer-events-none'
                            : 'hover:bg-surface-variant/20 text-outline'
                            }`}
                        disabled={currentEmployeeIndex === 0}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </button>
                    <span className="text-sm font-bold text-on-surface min-w-[120px] text-center select-none">
                        {Object.keys(employeeDisplayData)[currentEmployeeIndex]}
                    </span>
                    <button
                        onClick={() => setCurrentEmployeeIndex(prev => prev < Object.keys(employeeDisplayData).length - 1 ? prev + 1 : prev)}
                        className={`p-1 rounded-full transition-colors ${currentEmployeeIndex === Object.keys(employeeDisplayData).length - 1
                            ? 'opacity-0 pointer-events-none'
                            : 'hover:bg-surface-variant/20 text-outline'
                            }`}
                        disabled={currentEmployeeIndex === Object.keys(employeeDisplayData).length - 1}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    </button>
                </div>

                {/* Right: Date Controls */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-4 bg-surface md-card p-1 rounded-lg border-[#8f96a3]/20">
                        {/* Month Navigation */}
                        <div className="flex items-center gap-2 pl-2">
                            <button
                                onClick={() => handleMonthChange(-1)}
                                className="p-1 rounded-full hover:bg-surface-variant/20 text-outline transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            </button>
                            <span className="text-sm font-bold text-on-surface min-w-[120px] text-center select-none">
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
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-6 bg-outline/10"></div>

                        {/* Period Toggle */}
                        <div className="flex bg-surface-variant/20 rounded p-0.5">
                            <button
                                onClick={() => setViewPeriod('first')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewPeriod === 'first'
                                    ? 'bg-surface shadow text-on-surface font-bold'
                                    : 'text-outline hover:text-outline/80'
                                    }`}
                            >
                                1st - 15th
                            </button>
                            <button
                                onClick={() => setViewPeriod('second')}
                                className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewPeriod === 'second'
                                    ? 'bg-surface shadow text-on-surface font-bold'
                                    : 'text-outline hover:text-outline/80'
                                    }`}
                            >
                                16th - End
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {(() => {
                const employees = Object.keys(employeeDisplayData);
                const currentEmpName = employees[currentEmployeeIndex];
                const currentData = employeeDisplayData[currentEmpName];

                if (!currentEmpName || !currentData) return <div>No employee data</div>;

                return (
                    <div key={currentEmpName} className="md-card p-6 gap-4 flex flex-col">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-lg text-on-surface">Hours Overview</h4>
                            <div className="flex gap-4">
                                <span className="text-sm font-medium text-outline bg-surface-variant/20 px-3 py-1 rounded-full">
                                    Total: <span className="text-primary font-bold ml-1">{currentData.total.toFixed(2)} hrs</span>
                                </span>
                                <span className="text-sm font-medium text-outline bg-surface-variant/20 px-3 py-1 rounded-full">
                                    Est. Payroll: <span className="text-green-500 font-bold ml-1">${(currentData.total * 20).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </span>
                            </div>
                        </div>

                        {renderCalendar(currentData.shifts, currentEmpName)}
                    </div>
                );
            })()}
        </div>
    );
}
