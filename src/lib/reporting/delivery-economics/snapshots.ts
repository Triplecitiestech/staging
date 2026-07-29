// src/lib/reporting/delivery-economics/snapshots.ts
//
// Weekly snapshot store for the Delivery Economics report — raw pg, matching
// every other reporting table (never Prisma; see CLAUDE.md).
//
// WHY SNAPSHOTS: a single reading of this report is nearly useless. The finding
// that mattered most in the first derivation was a TREND — internal-work share
// fell from 66% to 25% over six months — which no point-in-time figure shows.
// Each run appends a row, so history accumulates and nothing is ever
// overwritten. The full report JSON is kept, not just headline numbers, so a
// future question can be asked of past data without re-pulling Autotask (which
// may no longer even hold the same entries).
//
// New table = POST /api/migrations/run once after deploy.

import { getPool } from '@/lib/db-pool'
import type { DeliveryEconomicsReport } from './types'

const UNDEFINED_TABLE = '42P01'

export interface SnapshotRow {
  id: string
  capturedAt: string
  windowFrom: string
  windowTo: string
  /** Headline figures, denormalised so the history list needs no JSON parsing. */
  customerHoursPerMonth: number | null
  internalHoursPerMonth: number | null
  idleHoursPerMonth: number | null
  internalSharePct: number | null
  timeEntries: number | null
  /** Managed recurring revenue at contracted rates — null on pre-model rows. */
  managedRevenuePerMonth: number | null
  capturedBy: string | null
}

export interface SnapshotDetail extends SnapshotRow {
  report: DeliveryEconomicsReport
}

export interface SnapshotReadResult<T> {
  value: T
  /** True when the table has not been migrated yet — surfaced, never silent. */
  tableMissing: boolean
}

const LIST_COLUMNS = `id, captured_at, window_from, window_to,
  customer_hours_per_month, internal_hours_per_month, idle_hours_per_month,
  internal_share_pct, time_entries, managed_revenue_per_month, captured_by`

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRow(r: any): SnapshotRow {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    id: String(r.id),
    capturedAt: String(r.captured_at),
    windowFrom: String(r.window_from).slice(0, 10),
    windowTo: String(r.window_to).slice(0, 10),
    customerHoursPerMonth: num(r.customer_hours_per_month),
    internalHoursPerMonth: num(r.internal_hours_per_month),
    idleHoursPerMonth: num(r.idle_hours_per_month),
    internalSharePct: num(r.internal_share_pct),
    timeEntries: num(r.time_entries),
    managedRevenuePerMonth: num(r.managed_revenue_per_month),
    capturedBy: r.captured_by ?? null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Latest internal share across the window's months — the trend headline. */
function latestInternalShare(report: DeliveryEconomicsReport): number | null {
  const m = report.monthly
  return m.length ? m[m.length - 1].internalSharePct : null
}

export async function saveSnapshot(
  report: DeliveryEconomicsReport,
  capturedBy: string
): Promise<{ saved: boolean; tableMissing: boolean }> {
  try {
    const pool = getPool()
    await pool.query(
      `INSERT INTO delivery_economics_snapshots
         (captured_at, window_from, window_to, customer_hours_per_month,
          internal_hours_per_month, idle_hours_per_month, internal_share_pct,
          time_entries, managed_revenue_per_month, captured_by, report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        report.generatedAt,
        report.window.from,
        report.window.to,
        report.capacity.customerHoursPerMonth,
        report.capacity.internalHoursPerMonth,
        report.capacity.idleHoursPerMonth,
        latestInternalShare(report),
        report.timeEntriesAnalysed,
        report.managedRevenuePerMonth ?? null,
        capturedBy,
        JSON.stringify(report),
      ]
    )
    return { saved: true, tableMissing: false }
  } catch (error) {
    const err = error as Error & { code?: string }
    if (err.code === UNDEFINED_TABLE) return { saved: false, tableMissing: true }
    throw error
  }
}

export async function listSnapshots(limit = 52): Promise<SnapshotReadResult<SnapshotRow[]>> {
  try {
    const pool = getPool()
    const { rows } = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM delivery_economics_snapshots
        ORDER BY captured_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    )
    return { value: rows.map(toRow), tableMissing: false }
  } catch (error) {
    const err = error as Error & { code?: string }
    if (err.code === UNDEFINED_TABLE) return { value: [], tableMissing: true }
    throw error
  }
}

/** One snapshot with its full report. Omit id for the most recent. */
export async function getSnapshot(id?: string): Promise<SnapshotReadResult<SnapshotDetail | null>> {
  try {
    const pool = getPool()
    const { rows } = id
      ? await pool.query(`SELECT ${LIST_COLUMNS}, report FROM delivery_economics_snapshots WHERE id = $1`, [id])
      : await pool.query(
          `SELECT ${LIST_COLUMNS}, report FROM delivery_economics_snapshots ORDER BY captured_at DESC LIMIT 1`
        )
    if (!rows[0]) return { value: null, tableMissing: false }
    return { value: { ...toRow(rows[0]), report: rows[0].report as DeliveryEconomicsReport }, tableMissing: false }
  } catch (error) {
    const err = error as Error & { code?: string }
    if (err.code === UNDEFINED_TABLE) return { value: null, tableMissing: true }
    throw error
  }
}
