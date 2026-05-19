/**
 * CEO dashboard data builder.
 *
 * Surfaces what the CEO needs to track without the noise of every individual
 * request: reactive-OT ratios, sick-day usage patterns, open flags, late
 * submissions, and short-notice PTO. Pulls from the existing PTO + OT tables
 * directly — no separate aggregation table.
 *
 * Note on the "Sick day usage vs Gusto balance" widget: Gusto API integration
 * isn't wired up, so the data is whatever HR has entered manually
 * (paid_or_unpaid + gusto_logged_at on each notification-flow PTO). The
 * dashboard's accuracy depends on HR keeping those entries current. When
 * Gusto API access is wired up later, the widget gains real-time
 * reconciliation for free.
 */

import { prisma } from '@/lib/prisma'

export interface ReactiveOtRatioRow {
  employeeStaffId: string
  employeeName: string
  totalOtHours: number
  reactiveOtHours: number
  reactiveRatioPct: number   // 0-100
  flagged: boolean           // true if >50% reactive for 2 months running
}

export interface SickDayUsageRow {
  employeeStaffId: string
  employeeName: string
  sickDaysLast90: number     // distinct days off labeled SICK / FAMILY_EMERGENCY / SAME_DAY_MEDICAL
  hoursLast90: number
  in30DayPatternAlert: boolean  // >3 sick days in any 30-day window
}

export interface FlaggedItem {
  kind: 'PTO' | 'OT'
  id: string
  employeeName: string
  flagReason: string
  flaggedAt: string
  url: string
}

export interface LateSubmissionRow {
  id: string
  employeeName: string
  workDate: string
  actualHours: number
  reactiveReason: string | null
  lateReason: string | null
  submittedAt: string
}

export interface ShortNoticeRow {
  id: string
  employeeName: string
  startDate: string
  endDate: string
  kind: string
  overrideReason: string | null
  submittedAt: string
  status: string
}

export interface TrendsData {
  generatedAt: string
  windowDays: number
  reactiveOtRatios: ReactiveOtRatioRow[]
  sickDayUsage: SickDayUsageRow[]
  openFlags: FlaggedItem[]
  lateSubmissions: LateSubmissionRow[]
  shortNoticePto: ShortNoticeRow[]
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export async function buildTrendsData(opts: { windowDays?: number } = {}): Promise<TrendsData> {
  const windowDays = opts.windowDays ?? 90
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // ---- Reactive OT ratio (current month + previous month) -----------------
  const currentMonthStart = startOfMonth(now)
  const previousMonthStart = startOfMonth(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  )

  // Pull OT for the last 60 days (covers two months); aggregate per employee
  // and bucket by month for the 2-month-flag check.
  const otRows = await prisma.overtimeRequest.findMany({
    where: {
      createdAt: { gte: previousMonthStart },
      status: { in: ['APPROVED', 'RECORDED', 'FLAGGED_FOR_REVIEW'] },
    },
    select: {
      employeeStaffId: true,
      employeeName: true,
      flowType: true,
      estimatedHours: true,
      actualHoursWorked: true,
      createdAt: true,
    },
  })

  // Aggregate this-month-only for the headline ratio
  const ratioByStaff = new Map<string, ReactiveOtRatioRow>()
  // Track per-employee monthly buckets to detect "two months running"
  const monthlyByStaff = new Map<
    string,
    { currentReactive: number; currentTotal: number; previousReactive: number; previousTotal: number; name: string }
  >()

  for (const r of otRows) {
    const hours = Number(r.actualHoursWorked ?? r.estimatedHours)
    const isReactive = r.flowType === 'NOTIFICATION'
    const inCurrentMonth = r.createdAt >= currentMonthStart
    const inPreviousMonth = r.createdAt >= previousMonthStart && r.createdAt < currentMonthStart

    const bucket = monthlyByStaff.get(r.employeeStaffId) ?? {
      currentReactive: 0,
      currentTotal: 0,
      previousReactive: 0,
      previousTotal: 0,
      name: r.employeeName,
    }
    if (inCurrentMonth) {
      bucket.currentTotal += hours
      if (isReactive) bucket.currentReactive += hours
    } else if (inPreviousMonth) {
      bucket.previousTotal += hours
      if (isReactive) bucket.previousReactive += hours
    }
    monthlyByStaff.set(r.employeeStaffId, bucket)
  }

  for (const [staffId, b] of Array.from(monthlyByStaff.entries())) {
    const ratio = b.currentTotal > 0 ? (b.currentReactive / b.currentTotal) * 100 : 0
    const prevRatio = b.previousTotal > 0 ? (b.previousReactive / b.previousTotal) * 100 : 0
    const flagged = ratio > 50 && prevRatio > 50
    ratioByStaff.set(staffId, {
      employeeStaffId: staffId,
      employeeName: b.name,
      totalOtHours: Math.round(b.currentTotal * 100) / 100,
      reactiveOtHours: Math.round(b.currentReactive * 100) / 100,
      reactiveRatioPct: Math.round(ratio),
      flagged,
    })
  }

  const reactiveOtRatios = Array.from(ratioByStaff.values())
    .filter((r) => r.totalOtHours > 0)
    .sort((a, b) => b.reactiveRatioPct - a.reactiveRatioPct)

  // ---- Sick day usage (last 90 days) ------------------------------------
  const sickRows = await prisma.timeOffRequest.findMany({
    where: {
      flowType: 'NOTIFICATION',
      kind: { in: ['SICK', 'FAMILY_EMERGENCY', 'SAME_DAY_MEDICAL'] },
      startDate: { gte: ninetyDaysAgo },
      status: { notIn: ['CANCELLED'] },
    },
    select: {
      employeeStaffId: true,
      employeeName: true,
      startDate: true,
      endDate: true,
      totalHours: true,
    },
    orderBy: { startDate: 'asc' },
  })

  const sickByStaff = new Map<
    string,
    { name: string; days: number; hours: number; dateMs: number[] }
  >()
  for (const r of sickRows) {
    const days = daysBetween(r.startDate, r.endDate)
    const bucket = sickByStaff.get(r.employeeStaffId) ?? {
      name: r.employeeName,
      days: 0,
      hours: 0,
      dateMs: [],
    }
    bucket.days += days
    bucket.hours += Number(r.totalHours)
    for (let i = 0; i < days; i++) {
      bucket.dateMs.push(r.startDate.getTime() + i * 24 * 60 * 60 * 1000)
    }
    sickByStaff.set(r.employeeStaffId, bucket)
  }
  const sickDayUsage: SickDayUsageRow[] = Array.from(sickByStaff.entries())
    .map(([staffId, b]) => {
      // Pattern alert: any 30-day rolling window with >3 sick days
      const sorted = [...b.dateMs].sort((a, b) => a - b)
      let alert = false
      for (let i = 0; i < sorted.length; i++) {
        const windowEnd = sorted[i] + 30 * 24 * 60 * 60 * 1000
        let count = 0
        for (let j = i; j < sorted.length && sorted[j] <= windowEnd; j++) count++
        if (count > 3) {
          alert = true
          break
        }
      }
      return {
        employeeStaffId: staffId,
        employeeName: b.name,
        sickDaysLast90: b.days,
        hoursLast90: Math.round(b.hours * 100) / 100,
        in30DayPatternAlert: alert,
      }
    })
    .sort((a, b) => b.sickDaysLast90 - a.sickDaysLast90)

  // ---- Open flagged items (PTO + OT) ------------------------------------
  const flaggedPto = await prisma.timeOffRequest.findMany({
    where: { flagForCeoReview: true, ceoAcknowledgedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      employeeName: true,
      flagReason: true,
      updatedAt: true,
    },
  })
  const flaggedOt = await prisma.overtimeRequest.findMany({
    where: { flagForCeoReview: true, ceoAcknowledgedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      employeeName: true,
      flagReason: true,
      updatedAt: true,
    },
  })
  const openFlags: FlaggedItem[] = [
    ...flaggedPto.map((p) => ({
      kind: 'PTO' as const,
      id: p.id,
      employeeName: p.employeeName,
      flagReason: p.flagReason ?? '(no reason given)',
      flaggedAt: p.updatedAt.toISOString(),
      url: `/admin/pto/${p.id}`,
    })),
    ...flaggedOt.map((o) => ({
      kind: 'OT' as const,
      id: o.id,
      employeeName: o.employeeName,
      flagReason: o.flagReason ?? '(no reason given)',
      flaggedAt: o.updatedAt.toISOString(),
      url: `/admin/overtime/${o.id}`,
    })),
  ].sort((a, b) => (b.flaggedAt > a.flaggedAt ? 1 : -1))

  // ---- Late submissions (reactive OT, last 30 days) ---------------------
  const lateRows = await prisma.overtimeRequest.findMany({
    where: {
      lateSubmission: true,
      createdAt: { gte: thirtyDaysAgo },
      status: { notIn: ['CANCELLED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      employeeName: true,
      workDate: true,
      actualHoursWorked: true,
      estimatedHours: true,
      reactiveReason: true,
      lateReason: true,
      createdAt: true,
    },
  })
  const lateSubmissions: LateSubmissionRow[] = lateRows.map((r) => ({
    id: r.id,
    employeeName: r.employeeName,
    workDate: ymd(r.workDate),
    actualHours: Number(r.actualHoursWorked ?? r.estimatedHours),
    reactiveReason: r.reactiveReason,
    lateReason: r.lateReason,
    submittedAt: r.createdAt.toISOString(),
  }))

  // ---- Short-notice PTO (approval flow, last 30 days) -------------------
  const shortRows = await prisma.timeOffRequest.findMany({
    where: {
      flowType: 'APPROVAL',
      overrideShortNotice: true,
      createdAt: { gte: thirtyDaysAgo },
      status: { notIn: ['CANCELLED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      employeeName: true,
      startDate: true,
      endDate: true,
      kind: true,
      overrideReason: true,
      createdAt: true,
      status: true,
    },
  })
  const shortNoticePto: ShortNoticeRow[] = shortRows.map((r) => ({
    id: r.id,
    employeeName: r.employeeName,
    startDate: ymd(r.startDate),
    endDate: ymd(r.endDate),
    kind: r.kind,
    overrideReason: r.overrideReason,
    submittedAt: r.createdAt.toISOString(),
    status: r.status,
  }))

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    reactiveOtRatios,
    sickDayUsage,
    openFlags,
    lateSubmissions,
    shortNoticePto,
  }
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1)
}
