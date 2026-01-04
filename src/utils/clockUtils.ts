import type { ClockLog } from '../types';

export interface Segment {
    start: string;
    end: string;
    isVirtual?: boolean;
}

export interface Shift {
    date: Date;
    employee: string;
    segments: Segment[];
    hours: number;
}

/**
 * Parse time string like "9:30am" or "9:30 am" to decimal hours (0-24)
 */
export const parseTimeStr = (t: string): number => {
    const match = t.match(/(\d+):(\d+)\s*(am|pm)/i);
    if (!match) return 0;
    const [, h, m, period] = match;
    let hours = parseInt(h);
    const minutes = parseInt(m);
    if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
    if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
    return hours + minutes / 60;
};

/**
 * Format a Date to time string like "9:30am"
 */
export const formatTime = (d: Date): string => {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
};

/**
 * Calculate total hours from segments, handling overnight correctly
 */
export const calculateShiftTotal = (segments: Segment[]): number => {
    return segments.reduce((acc, seg) => {
        const start = parseTimeStr(seg.start);
        const end = parseTimeStr(seg.end);
        // Handle overnight: if end < start, add 24 hours
        const duration = end >= start ? end - start : (24 - start) + end;
        return acc + duration;
    }, 0);
};

/**
 * Get date at midnight for comparison (strips time)
 */
const getDateOnly = (d: Date): Date => {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Check if two dates are on the same day
 */
const isSameDay = (d1: Date, d2: Date): boolean => {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
};

interface ProcessClockLogsOptions {
    /** Unix timestamp for period start (for virtual clock-in when first log is clock-out) */
    periodStart?: number | undefined;
    /** If true, creates virtual clock-out at current time for open clock-ins */
    includeVirtualClockOut?: boolean | undefined;
}

/**
 * Process clock logs into shifts, splitting overnight shifts into per-day segments.
 * Handles multi-day shifts (3+ days) correctly.
 * 
 * @param logs - Array of clock logs for a single user, will be sorted by timestamp
 * @param userName - Name of the employee
 * @param options - Processing options
 * @returns Array of Shift objects, one per day worked
 */
export function processClockLogsToShifts(
    logs: ClockLog[],
    userName: string,
    options: ProcessClockLogsOptions = {}
): Shift[] {
    const { periodStart, includeVirtualClockOut = false } = options;
    const shifts: Shift[] = [];

    // Sort logs by timestamp
    const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);

    // Helper to add or update a shift for a specific date
    const addSegmentToShift = (shiftDate: Date, segStart: string, segEnd: string, isVirtual: boolean = false) => {
        const dateOnly = getDateOnly(shiftDate);
        let shift = shifts.find(s => isSameDay(s.date, dateOnly));

        if (!shift) {
            shift = {
                date: dateOnly,
                employee: userName,
                segments: [],
                hours: 0
            };
            shifts.push(shift);
        }

        shift.segments.push({ start: segStart, end: segEnd, isVirtual });
        shift.hours = calculateShiftTotal(shift.segments);
    };

    /**
     * Split a time period across multiple days
     * @param startTs - Start timestamp (Unix seconds)
     * @param endTs - End timestamp (Unix seconds)
     * @param isVirtual - Whether the final segment is virtual (ongoing)
     */
    const splitAcrossDays = (startTs: number, endTs: number, isVirtual: boolean = false) => {
        const startDate = new Date(startTs * 1000);
        const endDate = new Date(endTs * 1000);
        const startDay = getDateOnly(startDate);
        const endDay = getDateOnly(endDate);

        if (isSameDay(startDay, endDay)) {
            // Same day - simple case
            addSegmentToShift(startDate, formatTime(startDate), formatTime(endDate), isVirtual);
        } else {
            // Spans multiple days - iterate through each day
            let currentDay = new Date(startDay);

            while (currentDay.getTime() <= endDay.getTime()) {
                const isFirstDay = isSameDay(currentDay, startDay);
                const isLastDay = isSameDay(currentDay, endDay);

                if (isFirstDay) {
                    // First day: start time to 11:59pm
                    const endOfDay = new Date(currentDay);
                    endOfDay.setHours(23, 59, 0, 0);
                    addSegmentToShift(currentDay, formatTime(startDate), formatTime(endOfDay), false);
                } else if (isLastDay) {
                    // Last day: midnight to end time
                    const midnightStart = new Date(currentDay);
                    midnightStart.setHours(0, 0, 0, 0);
                    addSegmentToShift(currentDay, formatTime(midnightStart), formatTime(endDate), isVirtual);
                } else {
                    // Middle day: full day (12:00am to 11:59pm)
                    const dayStart = new Date(currentDay);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(currentDay);
                    dayEnd.setHours(23, 59, 0, 0);
                    addSegmentToShift(currentDay, formatTime(dayStart), formatTime(dayEnd), false);
                }

                // Move to next day
                currentDay.setDate(currentDay.getDate() + 1);
            }
        }
    };

    let currentStart: number | null = null;

    // Handle virtual clock-in if first log is a clock-out
    if (periodStart !== undefined && sortedLogs.length > 0 && sortedLogs[0].out) {
        currentStart = periodStart;
    }

    // Process each log
    for (const log of sortedLogs) {
        if (!log.out) {
            // Clock In
            if (currentStart === null) {
                currentStart = log.timestamp;
            }
        } else {
            // Clock Out
            if (currentStart !== null) {
                splitAcrossDays(currentStart, log.timestamp, false);
                currentStart = null;
            }
        }
    }

    // Handle currently clocked-in state (virtual clock out at current time)
    if (currentStart !== null && includeVirtualClockOut) {
        const now = Math.floor(Date.now() / 1000);
        splitAcrossDays(currentStart, now, true);
    }

    // Sort shifts by date
    shifts.sort((a, b) => a.date.getTime() - b.date.getTime());

    return shifts;
}

/**
 * Calculate total hours from clock logs for a user.
 * Used by IncomeTab for payroll calculation.
 * 
 * @param logs - Array of clock logs for a single user
 * @param periodStart - Unix timestamp for period start (for virtual clock-in)
 * @param includeVirtualClockOut - If true, includes time from open clock-ins to now
 * @returns Total hours worked
 */
export function calculateTotalHoursFromLogs(
    logs: ClockLog[],
    periodStart?: number,
    includeVirtualClockOut: boolean = false
): number {
    const shifts = processClockLogsToShifts(logs, '', { periodStart, includeVirtualClockOut });
    return shifts.reduce((total, shift) => total + shift.hours, 0);
}
