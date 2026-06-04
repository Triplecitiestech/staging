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
  createdAt: string
  updatedAt: string
}

export type DiscoveryAssessmentSummary = Pick<
  DiscoveryAssessment,
  'id' | 'companyName' | 'status' | 'platformRecommendation' | 'updatedAt'
>

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
    createdAt: typeof r.created_at === 'string' ? r.created_at : r.created_at?.toISOString?.() ?? '',
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at?.toISOString?.() ?? '',
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listAssessments(): Promise<DiscoveryAssessmentSummary[]> {
  await ensureDiscoveryTable()
  const res = await pool.query(
    `SELECT id, company_name, status, platform_recommendation, updated_at
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
  }))
}

export async function getAssessment(id: string): Promise<DiscoveryAssessment | null> {
  await ensureDiscoveryTable()
  const res = await pool.query('SELECT * FROM ai_discovery_assessments WHERE id = $1 LIMIT 1', [id])
  return res.rows.length ? rowToAssessment(res.rows[0]) : null
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
  await ensureDiscoveryTable()
  const id = input.id || randomUUID()
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
}
