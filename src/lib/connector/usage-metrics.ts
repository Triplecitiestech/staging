// src/lib/connector/usage-metrics.ts
//
// Shared types + pure formatting for the connector usage dashboard
// (/admin/connector/usage and its API route). Kept out of both so the
// zero-row/zero-divisor behaviour is unit-testable: a fresh install has no rows
// at all, and the dashboard must render "—" rather than "NaN%".

import type { CallOutcome, ErrorClass, RefusalKind } from './telemetry'

// ---------------------------------------------------------------------------
// Time window
// ---------------------------------------------------------------------------

export type UsageWindowKey = '24h' | '7d' | '30d'

export const USAGE_WINDOWS: ReadonlyArray<{ key: UsageWindowKey; label: string; hours: number }> = [
  { key: '24h', label: 'Last 24 hours', hours: 24 },
  { key: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { key: '30d', label: 'Last 30 days', hours: 24 * 30 },
]

const DEFAULT_WINDOW: UsageWindowKey = '7d'

/** Anything unrecognised (including null) falls back to 7d rather than erroring. */
export function parseUsageWindow(input: string | null | undefined): UsageWindowKey {
  const match = USAGE_WINDOWS.find((w) => w.key === input)
  return match ? match.key : DEFAULT_WINDOW
}

export function usageWindowHours(key: UsageWindowKey): number {
  return USAGE_WINDOWS.find((w) => w.key === key)?.hours ?? 24 * 7
}

export function usageWindowLabel(key: UsageWindowKey): string {
  return USAGE_WINDOWS.find((w) => w.key === key)?.label ?? key
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface UsageSummary {
  calls: number
  reads: number
  writes: number
  successes: number
  refusals: number
  failures: number
  actors: number
  tools: number
  totalBytes: number
  avgDurationMs: number
}

export interface ActorUsage {
  actor: string
  calls: number
  reads: number
  writes: number
  refusals: number
  failures: number
  vendors: string[]
  topTools: Array<{ toolName: string; calls: number }>
  lastCallAt: string | null
}

/** One write call, itemised. This is the security view. */
export interface WriteCall {
  id: string
  calledAt: string | null
  actor: string
  toolName: string
  vendor: string
  risk: string
  staged: boolean
  outcome: CallOutcome
  errorClass: ErrorClass | null
  refusalKind: RefusalKind | null
  durationMs: number
  responseBytes: number
}

export interface FailureGroup {
  errorClass: ErrorClass
  calls: number
  lastAt: string | null
  tools: Array<{ toolName: string; calls: number }>
}

export interface RefusalGroup {
  toolName: string
  vendor: string
  calls: number
  lastAt: string | null
  approvalRequired: number
  killSwitch: number
  notConfigured: number
  actors: number
}

export interface ResponseWeight {
  toolName: string
  vendor: string
  calls: number
  medianBytes: number
  p95Bytes: number
  maxBytes: number
  totalBytes: number
}

export interface StagedWriteCounts {
  /** Actionable right now, regardless of age. */
  pendingApproval: number
  approved: number
  /** Terminal states, counted inside the selected window. */
  executed: number
  rejected: number
  drifted: number
  failed: number
  cancelled: number
  expired: number
}

export interface ConnectorUsagePayload {
  window: UsageWindowKey
  since: string
  generatedAt: string
  /** True until an operator POSTs /api/migrations/run on a new deploy. */
  telemetryTableMissing: boolean
  stagedWritesTableMissing: boolean
  summary: UsageSummary
  byActor: ActorUsage[]
  /**
   * Most recent write calls, newest first. Capped for payload size — compare
   * with `summary.writes` (the exact count) to know whether it is truncated.
   */
  writes: WriteCall[]
  failures: FailureGroup[]
  refusals: RefusalGroup[]
  responseWeight: ResponseWeight[]
  stagedWrites: StagedWriteCounts
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const ERROR_CLASS_LABELS: Record<ErrorClass, string> = {
  auth: 'Authentication / permission',
  rate_limit: 'Rate limited',
  vendor_unavailable: 'Vendor unavailable',
  bad_input: 'Bad input',
  other: 'Other',
}

export const REFUSAL_KIND_LABELS: Record<RefusalKind, string> = {
  approval_required: 'Needs human approval',
  kill_switch: 'Kill switch off',
  not_configured: 'Vendor not configured',
}

export const UNATTRIBUTED_ACTOR = '(unattributed)'

// ---------------------------------------------------------------------------
// Formatting — every one of these is safe on an empty data set
// ---------------------------------------------------------------------------

/**
 * Share of a total, or null when there is no total. Callers render null as "—";
 * a zero denominator must never become NaN% on screen.
 */
export function share(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null
  return (part / total) * 100
}

export function formatShare(part: number, total: number, digits = 0): string {
  const value = share(part, total)
  if (value === null) return '—'
  return `${value.toFixed(digits)}%`
}

/**
 * Bytes, labelled as bytes. Deliberately NOT converted to tokens or dollars:
 * the connector makes zero Anthropic API calls, so response size is a
 * context-weight proxy only.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString()
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

/** Local date+time, or "—" for a missing timestamp (never "Invalid Date"). */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}
