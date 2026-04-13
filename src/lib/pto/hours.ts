/**
 * Hours calculation helpers for PTO requests.
 *
 * Business rules (v1):
 * - Monday–Friday are business days; Saturday/Sunday default to 0 hours.
 * - Default full-day hours = 8 (configurable via PTO_DEFAULT_DAILY_HOURS env).
 * - Partial days are stored as a map { 'YYYY-MM-DD': hours } on the request.
 */

export function getDefaultDailyHours(): number {
  const raw = process.env.PTO_DEFAULT_DAILY_HOURS
  const n = raw ? Number.parseFloat(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 8
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Invalid date: ${s}`)
  return new Date(Date.UTC(y, m - 1, d))
}

/** List YYYY-MM-DD dates in range (inclusive). */
export function eachDate(startYmd: string, endYmd: string): string[] {
  const start = parseYmd(startYmd)
  const end = parseYmd(endYmd)
  if (end.getTime() < start.getTime()) throw new Error('endDate must be on or after startDate')
  const out: string[] = []
  const cur = new Date(start)
  while (cur.getTime() <= end.getTime()) {
    out.push(ymd(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

/** Returns true if date is a weekday (Mon–Fri) in UTC. */
export function isBusinessDay(dateYmd: string): boolean {
  const dow = parseYmd(dateYmd).getUTCDay()
  return dow >= 1 && dow <= 5
}

/**
 * Compute total hours for a request.
 * hoursPerDay (if provided) overrides per-day; missing entries default to
 * full-day hours on business days, 0 on weekends.
 */
export function computeTotalHours(
  startYmd: string,
  endYmd: string,
  hoursPerDay?: Record<string, number> | null
): number {
  const perDay = hoursPerDay ?? {}
  const daily = getDefaultDailyHours()
  let total = 0
  for (const d of eachDate(startYmd, endYmd)) {
    if (d in perDay) {
      const n = Number(perDay[d])
      total += Number.isFinite(n) && n >= 0 ? n : 0
    } else {
      total += isBusinessDay(d) ? daily : 0
    }
  }
  return Math.round(total * 100) / 100
}

/** Validate hoursPerDay shape + ranges */
export function validateHoursPerDay(
  startYmd: string,
  endYmd: string,
  hoursPerDay: unknown
): Record<string, number> {
  if (!hoursPerDay || typeof hoursPerDay !== 'object') return {}
  const obj = hoursPerDay as Record<string, unknown>
  const validDates = new Set(eachDate(startYmd, endYmd))
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (!validDates.has(k)) continue
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 24) continue
    out[k] = Math.round(n * 100) / 100
  }
  return out
}
