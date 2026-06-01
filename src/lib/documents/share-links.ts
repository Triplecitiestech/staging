/**
 * Public share links for static documents (e.g. the Secure Boot playbook).
 *
 * Same self-healing raw-pg pattern as src/lib/documents/store.ts — the table is
 * created on demand, so there is no separate migration step. A share link is an
 * unguessable, high-entropy token that maps to a document slug. The public route
 * at /documents/<slug> renders the document ONLY when given a valid, non-revoked
 * token via ?key=. The admin keeps at most one active link per slug and can
 * revoke it at any time (the row is kept for audit; the URL simply stops working).
 *
 * This deliberately does NOT touch the auth gate on the admin route — it is a
 * parallel, opt-in capability link, not an authentication bypass.
 */
import crypto from 'crypto'
import { getPool } from '@/lib/db-pool'

const pool = getPool()

export interface DocumentShareLink {
  slug: string
  token: string
  createdAt: string
  createdBy: string | null
}

let tableReady = false
export async function ensureShareLinksTable(): Promise<void> {
  if (tableReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_share_links (
      id          SERIAL PRIMARY KEY,
      slug        TEXT NOT NULL,
      token       TEXT UNIQUE NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by  TEXT,
      revoked_at  TIMESTAMPTZ
    )
  `)
  // Fast lookup of the single active token per slug (revoked rows are retained).
  await pool.query(
    `CREATE INDEX IF NOT EXISTS document_share_links_slug_active_idx
       ON document_share_links (slug) WHERE revoked_at IS NULL`
  )
  tableReady = true
}

interface ShareRow {
  slug: string
  token: string
  created_at: Date | string
  created_by: string | null
}

function rowToLink(r: ShareRow): DocumentShareLink {
  return {
    slug: r.slug,
    token: r.token,
    createdAt: String(r.created_at),
    createdBy: r.created_by,
  }
}

/** The current active (non-revoked) link for a slug, or null. */
export async function getActiveShareLink(slug: string): Promise<DocumentShareLink | null> {
  await ensureShareLinksTable()
  const res = await pool.query<ShareRow>(
    `SELECT slug, token, created_at, created_by
       FROM document_share_links
      WHERE slug = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [slug]
  )
  return res.rows.length ? rowToLink(res.rows[0]) : null
}

/**
 * Mint a fresh share link for a slug. Any previously active link for the same
 * slug is revoked first, so there is always at most one live URL per document.
 */
export async function createShareLink(
  slug: string,
  createdBy: string | null
): Promise<DocumentShareLink> {
  await ensureShareLinksTable()
  await pool.query(
    `UPDATE document_share_links SET revoked_at = NOW() WHERE slug = $1 AND revoked_at IS NULL`,
    [slug]
  )
  // 24 bytes → 48 hex chars. Hex (not base64url) on purpose: the value can never
  // contain a substring the security middleware treats as a suspicious query
  // param (union/select/script/form/...), so the share URL can't be 400'd.
  const token = crypto.randomBytes(24).toString('hex')
  const res = await pool.query<ShareRow>(
    `INSERT INTO document_share_links (slug, token, created_by)
     VALUES ($1, $2, $3)
     RETURNING slug, token, created_at, created_by`,
    [slug, token, createdBy]
  )
  return rowToLink(res.rows[0])
}

/** Revoke the active link for a slug. Returns true if one was revoked. */
export async function revokeShareLink(slug: string): Promise<boolean> {
  await ensureShareLinksTable()
  const res = await pool.query(
    `UPDATE document_share_links SET revoked_at = NOW() WHERE slug = $1 AND revoked_at IS NULL`,
    [slug]
  )
  return (res.rowCount ?? 0) > 0
}

/**
 * Resolve a token to its document slug, or null if it is unknown / revoked /
 * malformed. Used by the public route to gate rendering.
 */
export async function resolveShareToken(token: string): Promise<string | null> {
  // Cheap shape check first — tokens are 48 hex chars. Reject anything else
  // without touching the DB (defends against probing and odd input).
  if (!token || !/^[a-f0-9]{32,128}$/.test(token)) return null
  await ensureShareLinksTable()
  const res = await pool.query<{ slug: string }>(
    `SELECT slug FROM document_share_links WHERE token = $1 AND revoked_at IS NULL LIMIT 1`,
    [token]
  )
  return res.rows.length ? res.rows[0].slug : null
}
