/**
 * Business hours calculation utility.
 *
 * Computes elapsed time in business-hour minutes between two timestamps,
 * excluding weekends and non-business hours.
 *
 * Default business hours: Monday-Friday, 8:00 AM - 5:00 PM (Eastern Time).
 * This matches the Autotask "TCT – Fully Managed IT Services" SLA timeframe
 * which specifies "Business Hours (Main Office)".
 */

/** Business hours configuration */
export interface BusinessHoursConfig {
  /** Start hour (0-23), default 8 (8 AM) */
  startHour: number;
  /** End hour (0-23), default 17 (5 PM) */
  endHour: number;
  /** Working days (0=Sunday, 6=Saturday), default [1,2,3,4,5] (Mon-Fri) */
  workDays: number[];
  /** IANA timezone for business hours, default 'America/New_York' */
  timezone: string;
}

const DEFAULT_CONFIG: BusinessHoursConfig = {
  startHour: 8,
  endHour: 17,
  workDays: [1, 2, 3, 4, 5], // Monday through Friday
  timezone: 'America/New_York',
};

/**
 * Calculate elapsed business-hour minutes between two timestamps.
 *
 * Algorithm:
 * 1. Clamp start/end to business hours boundaries
 * 2. Walk day-by-day, accumulating only business-hour minutes
 * 3. Skip non-working days entirely
 *
 * Returns wall-clock minutes if business hours calculation would produce
 * unreasonable results (e.g., both timestamps outside business hours on same day).
 */
export function computeBusinessMinutes(
  start: Date,
  end: Date,
  config: BusinessHoursConfig = DEFAULT_CONFIG,
): number {
  if (end <= start) return 0;

  const { startHour, endHour, workDays } = config;
  const minutesPerDay = (endHour - startHour) * 60;

  // Convert to timezone-aware date parts
  const startLocal = toLocalTime(start, config.timezone);
  const endLocal = toLocalTime(end, config.timezone);

  // Same calendar day — simple case
  if (isSameDay(startLocal, endLocal)) {
    if (!isWorkDay(startLocal, workDays)) return 0;
    const dayStart = clampToBusinessHours(startLocal, startHour, endHour);
    const dayEnd = clampToBusinessHours(endLocal, startHour, endHour);
    if (dayEnd <= dayStart) return 0;
    return (dayEnd - dayStart) / (1000 * 60);
  }

  let totalMinutes = 0;

  // First (partial) day
  if (isWorkDay(startLocal, workDays)) {
    const dayEndTime = setHour(startLocal, endHour);
    const clampedStart = clampToBusinessHours(startLocal, startHour, endHour);
    if (dayEndTime > clampedStart) {
      totalMinutes += (dayEndTime - clampedStart) / (1000 * 60);
    }
  }

  // Full days in between
  const nextDay = new Date(startLocal);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);

  const lastDayStart = new Date(endLocal);
  lastDayStart.setHours(0, 0, 0, 0);

  const current = new Date(nextDay);
  // Safety: limit to 365 days to prevent infinite loops on bad data
  let iterations = 0;
  while (current < lastDayStart && iterations < 365) {
    if (isWorkDay(current, workDays)) {
      totalMinutes += minutesPerDay;
    }
    current.setDate(current.getDate() + 1);
    iterations++;
  }

  // Last (partial) day
  if (isWorkDay(endLocal, workDays)) {
    const dayStartTime = setHour(endLocal, startHour);
    const clampedEnd = clampToBusinessHours(endLocal, startHour, endHour);
    if (clampedEnd > dayStartTime) {
      totalMinutes += (clampedEnd - dayStartTime) / (1000 * 60);
    }
  }

  return Math.max(0, totalMinutes);
}

/**
 * Convert a UTC Date to a local Date object in the specified timezone.
 * Uses Intl.DateTimeFormat for timezone conversion.
 */
function toLocalTime(date: Date, timezone: string): Date {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: timezone,
  };

  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);

  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/** Check if date falls on a working day */
function isWorkDay(date: Date, workDays: number[]): boolean {
  return workDays.includes(date.getDay());
}

/** Check if two dates are the same calendar day */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/**
 * Clamp a timestamp to business hours boundaries.
 * If before start, returns start of business. If after end, returns end of business.
 * Returns milliseconds since epoch for the clamped time.
 */
function clampToBusinessHours(date: Date, startHour: number, endHour: number): number {
  const dayStart = setHour(date, startHour);
  const dayEnd = setHour(date, endHour);
  const time = date.getTime();

  if (time < dayStart) return dayStart;
  if (time > dayEnd) return dayEnd;
  return time;
}

/** Get timestamp for a specific hour on the same calendar day */
function setHour(date: Date, hour: number): number {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}
