/**
 * Form-link helpers shared by the Thread automation webhook
 * (/api/integrations/thread/webhook) and the form-links API
 * (/api/forms/links). Single source for company resolution and tokenized
 * link creation so the two routes can't drift.
 *
 * Company resolution order (docs/plans/QUESTION_ENGINE_ARCHITECTURE.md §5):
 *   1. autotaskCompanyId  — companies."autotaskCompanyId" (unique index).
 *                           Thread sends this as meta_data.company_id on
 *                           every Automation URL payload.
 *   2. companySlug        — companies.slug exact match
 *   3. companyName        — companies."displayName" exact (case-insensitive),
 *                           then the lowered name tried as a slug
 *   4. email domain       — active company_contacts with a matching email
 *                           domain (same approach as /api/portal/auth/discover)
 *   5. fuzzy displayName  — ILIKE, ONLY when no exact identifier
 *                           (autotaskCompanyId/companySlug) was supplied
 *
 * Steps 4–5 refuse ambiguous matches: if two different companies match,
 * resolution fails rather than guessing. Callers translate a null result
 * into 404 { error: 'not_configured' }.
 */

import { randomBytes } from 'crypto'
import type { PoolClient } from 'pg'

// Minimal query surface so tests can stub the client without a real pool.
export type Queryable = Pick<PoolClient, 'query'>

export interface FormCompanyRef {
  id: string
  slug: string
  displayName: string
}

export interface CompanyIdentifiers {
  autotaskCompanyId?: string | number | null
  companySlug?: string | null
  companyName?: string | null
  email?: string | null
  emailDomain?: string | null
}

const COMPANY_COLS = `id, slug, "displayName"`

async function one(
  client: Queryable,
  sql: string,
  params: unknown[]
): Promise<FormCompanyRef | null> {
  const res = await client.query<FormCompanyRef>(sql, params)
  return res.rows[0] ?? null
}

/**
 * Run a lookup that must be unambiguous: exactly one distinct company may
 * match, otherwise resolution fails (returns null) instead of guessing.
 */
async function oneUnambiguous(
  client: Queryable,
  sql: string,
  params: unknown[]
): Promise<FormCompanyRef | null> {
  const res = await client.query<FormCompanyRef>(sql, params)
  const distinctIds = new Set(res.rows.map((r) => r.id))
  return distinctIds.size === 1 ? res.rows[0] : null
}

export async function resolveFormCompany(
  client: Queryable,
  ids: CompanyIdentifiers
): Promise<FormCompanyRef | null> {
  const autotaskCompanyId =
    ids.autotaskCompanyId !== null && ids.autotaskCompanyId !== undefined
      ? String(ids.autotaskCompanyId).trim()
      : ''
  const slug = ids.companySlug?.toLowerCase().trim() ?? ''
  const name = ids.companyName?.trim() ?? ''
  const emailDomain =
    ids.emailDomain?.toLowerCase().trim() ??
    (ids.email?.includes('@') ? ids.email.split('@')[1]!.toLowerCase().trim() : '')

  // 1. Autotask company ID — the deterministic primary key.
  if (autotaskCompanyId) {
    const match = await one(
      client,
      `SELECT ${COMPANY_COLS} FROM companies WHERE "autotaskCompanyId" = $1 LIMIT 1`,
      [autotaskCompanyId]
    )
    if (match) return match
  }

  // 2. Exact slug.
  if (slug) {
    const match = await one(
      client,
      `SELECT ${COMPANY_COLS} FROM companies WHERE slug = $1 LIMIT 1`,
      [slug]
    )
    if (match) return match
  }

  // 3. Exact display name (case-insensitive), then the name tried as a slug.
  if (name) {
    const match =
      (await one(
        client,
        `SELECT ${COMPANY_COLS} FROM companies WHERE LOWER("displayName") = $1 LIMIT 1`,
        [name.toLowerCase()]
      )) ??
      (await one(
        client,
        `SELECT ${COMPANY_COLS} FROM companies WHERE slug = $1 LIMIT 1`,
        [name.toLowerCase()]
      ))
    if (match) return match
  }

  // 4. Email domain via active contacts (mirrors /api/portal/auth/discover,
  //    minus its M365 requirement — token links don't need SSO). Ambiguous
  //    domains (two companies sharing contacts on one domain) do not resolve.
  if (emailDomain) {
    const match = await oneUnambiguous(
      client,
      `SELECT DISTINCT c.id, c.slug, c."displayName"
       FROM companies c
       JOIN company_contacts cc ON cc."companyId" = c.id
       WHERE LOWER(cc.email) LIKE $1
         AND cc."isActive" = true
       LIMIT 2`,
      ['%@' + emailDomain]
    )
    if (match) return match
  }

  // 5. Fuzzy display name — LAST resort, and never when the caller supplied
  //    an exact identifier that simply didn't match (a wrong exact ID must
  //    surface as not_configured, not silently resolve to a lookalike).
  const exactIdentifierSupplied = Boolean(autotaskCompanyId || slug)
  if (name && !exactIdentifierSupplied) {
    const match = await oneUnambiguous(
      client,
      `SELECT ${COMPANY_COLS} FROM companies WHERE LOWER("displayName") LIKE $1 LIMIT 2`,
      [`%${name.toLowerCase()}%`]
    )
    if (match) return match
  }

  return null
}

// ---------------------------------------------------------------------------
// Link creation
// ---------------------------------------------------------------------------

/**
 * Idempotent column backfill for live databases whose form_links table was
 * created before request_id/source_meta existed. CREATE TABLE IF NOT EXISTS
 * never adds columns, so writers ensure them here (same pattern as the
 * hr_requests ALTERs in /api/hr/submit). Canonical DDL lives in
 * /api/migrations/question-engine.
 */
export async function ensureFormLinkColumns(client: Queryable): Promise<void> {
  await client
    .query(`ALTER TABLE form_links ADD COLUMN IF NOT EXISTS request_id UUID`)
    .catch(() => {})
  await client
    .query(`ALTER TABLE form_links ADD COLUMN IF NOT EXISTS source_meta JSONB`)
    .catch(() => {})
}

export interface CreateFormLinkOptions {
  companyId: string
  type: 'onboarding' | 'offboarding'
  baseUrl: string
  preFill?: Record<string, unknown> | null
  expiresInMinutes?: number
  source?: string
  createdBy?: string
  /**
   * Origin metadata stored on the link (form_links.source_meta). For Thread
   * this is the Automation URL meta_data — ticket_id in particular is the
   * Thread chat-ticket ID, the future join key for merging that chat ticket
   * with the Autotask ticket created on submission.
   */
  sourceMeta?: Record<string, unknown> | null
}

export interface CreatedFormLink {
  url: string
  token: string
  expiresAt: string
}

export async function createFormLink(
  client: Queryable,
  opts: CreateFormLinkOptions
): Promise<CreatedFormLink> {
  const {
    companyId,
    type,
    baseUrl,
    preFill = null,
    expiresInMinutes = 1440,
    source = 'manual',
    createdBy = 'admin',
    sourceMeta = null,
  } = opts

  await ensureFormLinkColumns(client)

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)

  await client.query(
    `INSERT INTO form_links (company_id, type, token, pre_fill, source, expires_at, created_by, source_meta)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)`,
    [
      companyId,
      type,
      token,
      preFill && Object.keys(preFill).length > 0 ? JSON.stringify(preFill) : null,
      source,
      expiresAt.toISOString(),
      createdBy,
      sourceMeta && Object.keys(sourceMeta).length > 0 ? JSON.stringify(sourceMeta) : null,
    ]
  )

  return {
    url: `${baseUrl.replace(/\/$/, '')}/form/${token}`,
    token,
    expiresAt: expiresAt.toISOString(),
  }
}
