// src/lib/field/store.ts
//
// All database access for the contractor portal. Raw pg via the shared
// getPool() (same convention as HR / CFO / connector tables — these are not
// Prisma models). Contractors never reach the database; every function here is
// called from server code only.
//
// Nothing in this module receives or returns a plaintext login code or session
// token: callers hash first (src/lib/field/tokens.ts) and pass the digest.

import { getPool } from '@/lib/db-pool'

/**
 * Minimal query surface — what this module needs from a pg Pool/Client, so
 * tests can pass an in-memory stand-in. A real `Pool` satisfies it.
 */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

export type FieldActorType = 'staff' | 'contractor' | 'system'

export interface FieldContractor {
  id: string
  name: string
  email: string
  phone: string | null
  active: boolean
  createdBy: string
  createdAt: Date
  deactivatedAt: Date | null
}

export interface FieldLoginCode {
  id: string
  contractorId: string
  codeHash: string
  codeCiphertext: string | null
  expiresAt: Date
  consumedAt: Date | null
  attempts: number
  createdAt: Date
}

export interface FieldSessionRow {
  id: string
  contractorId: string
  expiresAt: Date
  lastSeenAt: Date
  contractorActive: boolean
  contractorName: string
  contractorEmail: string
}

/** One row of the staff admin table: contractor + last login + open code. */
export interface FieldContractorAdminRow extends FieldContractor {
  lastLoginAt: Date | null
  openCode: { id: string; codeCiphertext: string | null; expiresAt: Date; attempts: number } | null
  /**
   * Outcome of the most recent code email for this contractor, read from
   * field_audit_log. Without this the admin page could not answer "did the
   * email actually go out?" and the only way to find out was to ask the
   * contractor — which is how a silently dropped send went unnoticed.
   * null means no code has ever been requested.
   */
  lastDelivery: { result: string; at: Date } | null
}

/** Postgres undefined_table — POST /api/migrations/run has not been run yet. */
export function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code === '42P01') return true
  const message = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist/i.test(message)
}

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505'
}

function mapContractor(row: Record<string, unknown>): FieldContractor {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: (row.phone as string | null) ?? null,
    active: Boolean(row.active),
    createdBy: String(row.created_by),
    createdAt: row.created_at as Date,
    deactivatedAt: (row.deactivated_at as Date | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Contractors
// ---------------------------------------------------------------------------

export async function findActiveContractorByEmail(
  email: string,
  db: Queryable = getPool(),
): Promise<FieldContractor | null> {
  const { rows } = await db.query(
    `SELECT id, name, email, phone, active, created_by, created_at, deactivated_at
       FROM field_contractors
      WHERE lower(email) = lower($1) AND active = TRUE
      LIMIT 1`,
    [email],
  )
  return rows[0] ? mapContractor(rows[0]) : null
}

export async function getContractorById(
  id: string,
  db: Queryable = getPool(),
): Promise<FieldContractor | null> {
  const { rows } = await db.query(
    `SELECT id, name, email, phone, active, created_by, created_at, deactivated_at
       FROM field_contractors WHERE id = $1 LIMIT 1`,
    [id],
  )
  return rows[0] ? mapContractor(rows[0]) : null
}

export async function createContractor(
  input: { name: string; email: string; phone: string | null; createdBy: string },
  db: Queryable = getPool(),
): Promise<FieldContractor> {
  const { rows } = await db.query(
    `INSERT INTO field_contractors (name, email, phone, created_by)
     VALUES ($1, lower($2), $3, $4)
     RETURNING id, name, email, phone, active, created_by, created_at, deactivated_at`,
    [input.name, input.email, input.phone, input.createdBy],
  )
  return mapContractor(rows[0])
}

/**
 * Activate / deactivate. Deactivating deletes every session immediately so the
 * contractor's next request redirects to login; their open codes are also
 * closed so a code already texted to them stops working.
 */
export async function setContractorActive(
  id: string,
  active: boolean,
  db: Queryable = getPool(),
): Promise<FieldContractor | null> {
  const { rows } = await db.query(
    active
      ? `UPDATE field_contractors SET active = TRUE, deactivated_at = NULL WHERE id = $1
         RETURNING id, name, email, phone, active, created_by, created_at, deactivated_at`
      : `UPDATE field_contractors SET active = FALSE, deactivated_at = NOW() WHERE id = $1
         RETURNING id, name, email, phone, active, created_by, created_at, deactivated_at`,
    [id],
  )
  if (!rows[0]) return null
  if (!active) {
    await db.query(`DELETE FROM field_sessions WHERE contractor_id = $1`, [id])
    await db.query(
      `UPDATE field_login_codes SET consumed_at = NOW() WHERE contractor_id = $1 AND consumed_at IS NULL`,
      [id],
    )
  }
  return mapContractor(rows[0])
}

/** Admin table: every contractor, newest first, with last login + open code. */
export async function listContractorsForAdmin(
  db: Queryable = getPool(),
): Promise<FieldContractorAdminRow[]> {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.email, c.phone, c.active, c.created_by, c.created_at, c.deactivated_at,
            (SELECT MAX(s.created_at) FROM field_sessions s WHERE s.contractor_id = c.id) AS last_login_at,
            oc.id AS code_id, oc.code_ciphertext, oc.expires_at AS code_expires_at, oc.attempts AS code_attempts,
            ld.result AS delivery_result, ld.created_at AS delivery_at
       FROM field_contractors c
       LEFT JOIN LATERAL (
            SELECT meta->>'result' AS result, created_at
              FROM field_audit_log
             WHERE event IN ('code_email_sent', 'code_email_failed')
               AND meta->>'contractorId' = c.id
             ORDER BY created_at DESC
             LIMIT 1
       ) ld ON TRUE
       LEFT JOIN LATERAL (
            SELECT id, code_ciphertext, expires_at, attempts
              FROM field_login_codes
             WHERE contractor_id = c.id AND consumed_at IS NULL AND expires_at > NOW()
             ORDER BY created_at DESC
             LIMIT 1
       ) oc ON TRUE
      ORDER BY c.active DESC, c.created_at DESC`,
  )
  return rows.map((row) => ({
    ...mapContractor(row),
    lastLoginAt: (row.last_login_at as Date | null) ?? null,
    lastDelivery: row.delivery_at
      ? { result: String(row.delivery_result ?? 'unknown'), at: row.delivery_at as Date }
      : null,
    openCode: row.code_id
      ? {
          id: String(row.code_id),
          codeCiphertext: (row.code_ciphertext as string | null) ?? null,
          expiresAt: row.code_expires_at as Date,
          attempts: Number(row.code_attempts),
        }
      : null,
  }))
}

// ---------------------------------------------------------------------------
// Login codes
// ---------------------------------------------------------------------------

/**
 * Store a new code. Any still-open code for the contractor is closed first so
 * there is exactly one live code per contractor (the one the admin page shows
 * and the one verification checks).
 */
export async function issueLoginCode(
  input: { contractorId: string; codeHash: string; codeCiphertext: string | null; expiresAt: Date },
  db: Queryable = getPool(),
): Promise<FieldLoginCode> {
  await db.query(
    `UPDATE field_login_codes SET consumed_at = NOW() WHERE contractor_id = $1 AND consumed_at IS NULL`,
    [input.contractorId],
  )
  const { rows } = await db.query(
    `INSERT INTO field_login_codes (contractor_id, code_hash, code_ciphertext, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, contractor_id, code_hash, code_ciphertext, expires_at, consumed_at, attempts, created_at`,
    [input.contractorId, input.codeHash, input.codeCiphertext, input.expiresAt],
  )
  return mapCode(rows[0])
}

function mapCode(row: Record<string, unknown>): FieldLoginCode {
  return {
    id: String(row.id),
    contractorId: String(row.contractor_id),
    codeHash: String(row.code_hash),
    codeCiphertext: (row.code_ciphertext as string | null) ?? null,
    expiresAt: row.expires_at as Date,
    consumedAt: (row.consumed_at as Date | null) ?? null,
    attempts: Number(row.attempts),
    createdAt: row.created_at as Date,
  }
}

/** The contractor's newest unconsumed code, expired or not (caller decides). */
export async function getOpenLoginCode(
  contractorId: string,
  db: Queryable = getPool(),
): Promise<FieldLoginCode | null> {
  const { rows } = await db.query(
    `SELECT id, contractor_id, code_hash, code_ciphertext, expires_at, consumed_at, attempts, created_at
       FROM field_login_codes
      WHERE contractor_id = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [contractorId],
  )
  return rows[0] ? mapCode(rows[0]) : null
}

/** Increment the failed-attempt counter and return the new value. */
export async function recordFailedCodeAttempt(
  codeId: string,
  db: Queryable = getPool(),
): Promise<number> {
  const { rows } = await db.query(
    `UPDATE field_login_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
    [codeId],
  )
  return rows[0] ? Number(rows[0].attempts) : 0
}

export async function consumeLoginCode(codeId: string, db: Queryable = getPool()): Promise<void> {
  await db.query(`UPDATE field_login_codes SET consumed_at = NOW() WHERE id = $1`, [codeId])
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(
  input: { contractorId: string; tokenHash: string; expiresAt: Date; userAgent: string | null; ip: string | null },
  db: Queryable = getPool(),
): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO field_sessions (contractor_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.contractorId, input.tokenHash, input.expiresAt, input.userAgent, input.ip],
  )
  return String(rows[0].id)
}

/** Session + owning contractor, by token digest. Expiry/active are returned, not filtered. */
export async function findSessionByTokenHash(
  tokenHash: string,
  db: Queryable = getPool(),
): Promise<FieldSessionRow | null> {
  const { rows } = await db.query(
    `SELECT s.id, s.contractor_id, s.expires_at, s.last_seen_at,
            c.active AS contractor_active, c.name AS contractor_name, c.email AS contractor_email
       FROM field_sessions s
       JOIN field_contractors c ON c.id = s.contractor_id
      WHERE s.token_hash = $1
      LIMIT 1`,
    [tokenHash],
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: String(row.id),
    contractorId: String(row.contractor_id),
    expiresAt: row.expires_at as Date,
    lastSeenAt: row.last_seen_at as Date,
    contractorActive: Boolean(row.contractor_active),
    contractorName: String(row.contractor_name),
    contractorEmail: String(row.contractor_email),
  }
}

export async function touchSession(sessionId: string, db: Queryable = getPool()): Promise<void> {
  await db.query(`UPDATE field_sessions SET last_seen_at = NOW() WHERE id = $1`, [sessionId])
}

export async function deleteSessionByTokenHash(
  tokenHash: string,
  db: Queryable = getPool(),
): Promise<{ contractorId: string } | null> {
  const { rows } = await db.query(
    `DELETE FROM field_sessions WHERE token_hash = $1 RETURNING contractor_id`,
    [tokenHash],
  )
  return rows[0] ? { contractorId: String(rows[0].contractor_id) } : null
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type FieldAuditEvent =
  | 'contractor_invited'
  | 'contractor_deactivated'
  | 'contractor_reactivated'
  | 'code_requested'
  | 'code_issued'
  | 'code_email_sent'
  | 'code_email_failed'
  | 'code_request_rate_limited'
  | 'login_success'
  | 'login_failure'
  | 'lockout'
  | 'logout'
  | 'playbook_viewed'

export async function writeAudit(
  entry: { actorType: FieldActorType; actorId: string | null; event: FieldAuditEvent; meta?: Record<string, unknown> },
  db: Queryable = getPool(),
): Promise<void> {
  await db.query(
    `INSERT INTO field_audit_log (actor_type, actor_id, event, meta) VALUES ($1, $2, $3, $4::jsonb)`,
    [entry.actorType, entry.actorId, entry.event, JSON.stringify(entry.meta ?? {})],
  )
}

/** Code requests from one IP inside the window — the per-IP rate-limit input. */
export async function countCodeRequestsFromIp(
  ip: string,
  windowMinutes: number,
  db: Queryable = getPool(),
): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM field_audit_log
      WHERE event = 'code_requested'
        AND meta->>'ip' = $1
        AND created_at > NOW() - ($2::int * INTERVAL '1 minute')`,
    [ip, windowMinutes],
  )
  return rows[0] ? Number(rows[0].n) : 0
}
