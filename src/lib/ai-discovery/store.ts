/**
 * Persistence for AI discovery assessments (staff-filled during discovery calls).
 *
 * Uses the shared raw-pg pool (NOT Prisma) with a self-healing table — same
 * pattern as the reporting / SOC / CFO subsystems. ensureDiscoveryTable() runs
 * before every read/write, so there is no separate migration step and the
 * "prisma migrate deploy doesn't run on this DB" trap does not apply.
 */

import { randomUUID } from 'crypto'
import { getPool } from '@/lib/db-pool'
import { withDbRetry } from '@/lib/resilience'
import type { AigpaReport } from './report'

const pool = getPool()

export interface DiscoveryAssessment {
  id: string
  companyId: string | null
  companyName: string
  createdBy: string | null
  status: 'draft' | 'complete'
  answers: Record<string, string>
  platformRecommendation: string | null
  notes: string | null
  report: AigpaReport | null
  reportGeneratedAt: string | null
  shareToken: string | null
  intake: Record<string, string> | null
  intakeToken: string | null
  intakeSubmittedAt: string | null
  createdAt: string
  updatedAt: string
}

export type DiscoveryAssessmentSummary = Pick<
  DiscoveryAssessment,
  'id' | 'companyName' | 'status' | 'platformRecommendation' | 'updatedAt'
> & { hasReport: boolean }

let tableReady = false
async function ensureDiscoveryTable(): Promise<void> {
  if (tableReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_discovery_assessments (
      id                      TEXT PRIMARY KEY,
      company_id              TEXT,
      company_name            TEXT NOT NULL,
      created_by              TEXT,
      status                  TEXT NOT NULL DEFAULT 'draft',
      answers                 JSONB NOT NULL DEFAULT '{}'::jsonb,
      platform_recommendation TEXT,
      notes                   TEXT,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  // Self-healing columns added after the initial table shipped.
  await pool.query(`ALTER TABLE ai_discovery_assessments ADD COLUMN IF NOT EXISTS report JSONB`)
  await pool.query(`ALTER TABLE ai_discovery_assessments ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ`)
  await pool.query(`ALTER TABLE ai_discovery_assessments ADD COLUMN IF NOT EXISTS share_token TEXT`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_discovery_share_token ON ai_discovery_assessments(share_token)`)
  await pool.query(`ALTER TABLE ai_discovery_assessments ADD COLUMN IF NOT EXISTS intake JSONB`)
  await pool.query(`ALTER TABLE ai_discovery_assessments ADD COLUMN IF NOT EXISTS intake_token TEXT`)
  await pool.query(`ALTER TABLE ai_discovery_assessments ADD COLUMN IF NOT EXISTS intake_submitted_at TIMESTAMPTZ`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_discovery_intake_token ON ai_discovery_assessments(intake_token)`)
  tableReady = true
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToAssessment(r: any): DiscoveryAssessment {
  return {
    id: r.id,
    companyId: r.company_id ?? null,
    companyName: r.company_name,
    createdBy: r.created_by ?? null,
    status: r.status,
    answers: r.answers ?? {},
    platformRecommendation: r.platform_recommendation ?? null,
    notes: r.notes ?? null,
    report: r.report ?? null,
    reportGeneratedAt: r.report_generated_at
      ? (typeof r.report_generated_at === 'string' ? r.report_generated_at : r.report_generated_at.toISOString?.() ?? null)
      : null,
    shareToken: r.share_token ?? null,
    intake: r.intake ?? null,
    intakeToken: r.intake_token ?? null,
    intakeSubmittedAt: r.intake_submitted_at
      ? (typeof r.intake_submitted_at === 'string' ? r.intake_submitted_at : r.intake_submitted_at.toISOString?.() ?? null)
      : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : r.created_at?.toISOString?.() ?? '',
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at?.toISOString?.() ?? '',
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listAssessments(): Promise<DiscoveryAssessmentSummary[]> {
  return withDbRetry(async () => {
  await ensureDiscoveryTable()
  const res = await pool.query(
    `SELECT id, company_name, status, platform_recommendation, updated_at,
            (report IS NOT NULL) AS has_report
       FROM ai_discovery_assessments
      ORDER BY updated_at DESC
      LIMIT 200`
  )
  return res.rows.map((r) => ({
    id: r.id,
    companyName: r.company_name,
    status: r.status,
    platformRecommendation: r.platform_recommendation ?? null,
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at?.toISOString?.() ?? '',
    hasReport: r.has_report ?? false,
  }))
  }, 'ai-discovery list')
}

export async function saveReport(id: string, report: AigpaReport): Promise<void> {
  await ensureDiscoveryTable()
  await pool.query(
    `UPDATE ai_discovery_assessments
        SET report = $2::jsonb, report_generated_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [id, JSON.stringify(report)]
  )
}

/** Enable a public share link — idempotent (reuses an existing token). */
export async function setShareToken(id: string): Promise<string | null> {
  await ensureDiscoveryTable()
  const existing = await pool.query<{ share_token: string | null }>(
    'SELECT share_token FROM ai_discovery_assessments WHERE id = $1 LIMIT 1',
    [id]
  )
  if (existing.rows.length === 0) return null
  if (existing.rows[0].share_token) return existing.rows[0].share_token
  const token = `${randomUUID()}${randomUUID().replace(/-/g, '')}`
  await pool.query(
    `UPDATE ai_discovery_assessments SET share_token = $2, updated_at = NOW() WHERE id = $1`,
    [id, token]
  )
  return token
}

/** Revoke the public share link. */
export async function clearShareToken(id: string): Promise<void> {
  await ensureDiscoveryTable()
  await pool.query(
    `UPDATE ai_discovery_assessments SET share_token = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  )
}

/** Public lookup by share token (only used by the unauthenticated share page). */
export async function getAssessmentByShareToken(token: string): Promise<DiscoveryAssessment | null> {
  await ensureDiscoveryTable()
  if (!token) return null
  const res = await pool.query('SELECT * FROM ai_discovery_assessments WHERE share_token = $1 LIMIT 1', [token])
  return res.rows.length ? rowToAssessment(res.rows[0]) : null
}

/** Enable a client-intake link — idempotent (reuses an existing token). */
export async function setIntakeToken(id: string): Promise<string | null> {
  await ensureDiscoveryTable()
  const existing = await pool.query<{ intake_token: string | null }>(
    'SELECT intake_token FROM ai_discovery_assessments WHERE id = $1 LIMIT 1',
    [id]
  )
  if (existing.rows.length === 0) return null
  if (existing.rows[0].intake_token) return existing.rows[0].intake_token
  const token = `${randomUUID()}${randomUUID().replace(/-/g, '')}`
  await pool.query('UPDATE ai_discovery_assessments SET intake_token = $2, updated_at = NOW() WHERE id = $1', [id, token])
  return token
}

export async function clearIntakeToken(id: string): Promise<void> {
  await ensureDiscoveryTable()
  await pool.query('UPDATE ai_discovery_assessments SET intake_token = NULL, updated_at = NOW() WHERE id = $1', [id])
}

/** Public: fetch the company name for an intake token (to title the form). */
export async function getIntakeContext(token: string): Promise<{ companyName: string } | null> {
  await ensureDiscoveryTable()
  if (!token) return null
  const res = await pool.query<{ company_name: string }>(
    'SELECT company_name FROM ai_discovery_assessments WHERE intake_token = $1 LIMIT 1',
    [token]
  )
  return res.rows.length ? { companyName: res.rows[0].company_name } : null
}

/** Public: save a submitted intake against its token. Returns false if invalid. */
export async function saveIntake(token: string, data: Record<string, string>): Promise<boolean> {
  await ensureDiscoveryTable()
  if (!token) return false
  const res = await pool.query(
    `UPDATE ai_discovery_assessments
        SET intake = $2::jsonb, intake_submitted_at = NOW(), updated_at = NOW()
      WHERE intake_token = $1`,
    [token, JSON.stringify(data)]
  )
  return (res.rowCount ?? 0) > 0
}

export async function getAssessment(id: string): Promise<DiscoveryAssessment | null> {
  return withDbRetry(async () => {
    await ensureDiscoveryTable()
    const res = await pool.query('SELECT * FROM ai_discovery_assessments WHERE id = $1 LIMIT 1', [id])
    return res.rows.length ? rowToAssessment(res.rows[0]) : null
  }, 'ai-discovery get')
}

export interface UpsertInput {
  id?: string | null
  companyId?: string | null
  companyName: string
  createdBy?: string | null
  status?: 'draft' | 'complete'
  answers?: Record<string, string>
  platformRecommendation?: string | null
  notes?: string | null
}

export async function upsertAssessment(input: UpsertInput): Promise<DiscoveryAssessment> {
  const id = input.id || randomUUID()
  return withDbRetry(async () => {
  await ensureDiscoveryTable()
  const res = await pool.query(
    `INSERT INTO ai_discovery_assessments
       (id, company_id, company_name, created_by, status, answers, platform_recommendation, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       company_id = EXCLUDED.company_id,
       company_name = EXCLUDED.company_name,
       status = EXCLUDED.status,
       answers = EXCLUDED.answers,
       platform_recommendation = EXCLUDED.platform_recommendation,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      input.companyId ?? null,
      input.companyName,
      input.createdBy ?? null,
      input.status ?? 'draft',
      JSON.stringify(input.answers ?? {}),
      input.platformRecommendation ?? null,
      input.notes ?? null,
    ]
  )
  return rowToAssessment(res.rows[0])
  }, 'ai-discovery upsert')
}
