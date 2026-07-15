/**
 * IT Glue document search index (Tier 1 of the SOP/triage retrieval design).
 *
 * Problem this solves: IT Glue's document API can only filter by folder, not by
 * content, and paging a 350-doc library live on every query is slow. This module
 * keeps a raw-pg cache of each document's NAME + stripped-to-text CONTENT and
 * serves Postgres full-text search over it. Retrieval flow is index-for-DISCOVERY
 * then live read-through for the actual document (see the connector tools), so a
 * slightly stale index never produces a stale answer.
 *
 * Raw-pg + lazy CREATE TABLE IF NOT EXISTS, mirroring domotz_site_settings — no
 * Prisma, no migration route. Content lives in our own Postgres (same trust
 * boundary as the reporting tables); passwords are never touched (the /passwords
 * resource is never called).
 *
 * Tier 2 (semantic / pgvector embeddings) layers onto this same table later.
 */

import { getPool } from '@/lib/db-pool'
import { ItGlueClient, type ItGlueDocument } from '@/lib/it-glue'
import { htmlToText } from 'html-to-text'

/** TCT's own IT Glue org (internal SOP library). Overridable via env. */
export const TCT_ORG_ID = process.env.IT_GLUE_TCT_ORG_ID || '6942365'

function client(): ItGlueClient {
  return new ItGlueClient({ apiKey: process.env.IT_GLUE_CONNECTOR_API_KEY || process.env.IT_GLUE_API_KEY })
}

let ensured = false
async function ensureTable(): Promise<void> {
  if (ensured) return
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS itglue_doc_index (
      document_id        TEXT PRIMARY KEY,
      organization_id    TEXT NOT NULL,
      name               TEXT NOT NULL,
      folder_id          TEXT,
      url                TEXT,
      content_text       TEXT,
      it_glue_updated_at TIMESTAMPTZ,
      synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      search_tsv         tsvector
    )
  `)
  // Additive: track IT Glue's native archived flag so search can exclude/ tag
  // archived docs. Existing rows are backfilled on the next sync (bulk update
  // in syncOrgDocuments); until then a NULL archived is treated as "not archived".
  await pool.query(`ALTER TABLE itglue_doc_index ADD COLUMN IF NOT EXISTS archived BOOLEAN`)
  await pool.query(`CREATE INDEX IF NOT EXISTS itglue_doc_index_org ON itglue_doc_index (organization_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS itglue_doc_index_tsv ON itglue_doc_index USING GIN (search_tsv)`)
  ensured = true
}

/** Strip document-section HTML down to searchable plain text. */
function stripHtml(html: string): string {
  if (!html) return ''
  const text = htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  })
  return text.replace(/\s+/g, ' ').trim()
}

const MAX_CONTENT_CHARS = 200_000

/** Concatenate a document's section bodies into one stripped-text blob. */
async function fetchDocContent(c: ItGlueClient, documentId: string): Promise<string> {
  const sections = await c.getDocumentSections(documentId)
  const text = sections
    .map((s) => stripHtml(s.attributes.content ?? ''))
    .filter(Boolean)
    .join('\n\n')
  return text.length > MAX_CONTENT_CHARS ? text.slice(0, MAX_CONTENT_CHARS) : text
}

export interface SyncResult {
  organizationId: string
  totalDocs: number
  indexed: number
  remaining: number
  errors: string[]
}

/**
 * Incrementally (re)index an org's documents. Only docs new or changed since
 * the last sync are re-fetched, capped at `maxDocs` per call so a single run
 * stays under the serverless time limit; the rest are picked up on the next
 * run (stalest-first). Section fetches run at bounded concurrency to respect
 * IT Glue's 3000-requests / 5-min limit.
 */
export async function syncOrgDocuments(
  orgId: string,
  opts?: { maxDocs?: number; concurrency?: number }
): Promise<SyncResult> {
  await ensureTable()
  const c = client()
  const maxDocs = opts?.maxDocs ?? 120
  const concurrency = Math.max(1, opts?.concurrency ?? 5)
  const errors: string[] = []

  const docs = await c.getAllDocuments(orgId)

  const pool = getPool()

  // Keep the archived flag fresh for ALL known docs each run (cheap; no content
  // re-fetch), so previously-indexed rows are backfilled even when unchanged.
  if (docs.length > 0) {
    await pool.query(
      `UPDATE itglue_doc_index AS t SET archived = v.archived
         FROM (SELECT unnest($1::text[]) AS document_id, unnest($2::boolean[]) AS archived) AS v
        WHERE t.document_id = v.document_id AND t.organization_id = $3`,
      [docs.map((d) => d.id), docs.map((d) => !!d.attributes.archived), orgId]
    )
  }

  const { rows: existing } = await pool.query<{ document_id: string; it_glue_updated_at: string | null }>(
    `SELECT document_id, it_glue_updated_at FROM itglue_doc_index WHERE organization_id = $1`,
    [orgId]
  )
  const seen = new Map(existing.map((r) => [r.document_id, r.it_glue_updated_at]))

  const changed = (d: ItGlueDocument): boolean => {
    const prior = seen.get(d.id)
    if (prior === undefined) return true // not indexed yet
    const remote = d.attributes['updated-at']
    if (!remote || !prior) return true
    return new Date(remote).getTime() > new Date(prior).getTime()
  }

  const toIndex = docs.filter(changed)
  const batch = toIndex.slice(0, maxDocs)

  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency)
    await Promise.all(
      slice.map(async (d) => {
        try {
          const content = await fetchDocContent(c, d.id)
          await pool.query(
            `INSERT INTO itglue_doc_index
               (document_id, organization_id, name, folder_id, url, content_text, it_glue_updated_at, archived, synced_at, search_tsv)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(),
               setweight(to_tsvector('english', $3), 'A') || setweight(to_tsvector('english', COALESCE($6,'')), 'B'))
             ON CONFLICT (document_id) DO UPDATE SET
               organization_id    = EXCLUDED.organization_id,
               name               = EXCLUDED.name,
               folder_id          = EXCLUDED.folder_id,
               url                = EXCLUDED.url,
               content_text       = EXCLUDED.content_text,
               it_glue_updated_at = EXCLUDED.it_glue_updated_at,
               archived           = EXCLUDED.archived,
               synced_at          = NOW(),
               search_tsv         = EXCLUDED.search_tsv`,
            [
              d.id,
              orgId,
              d.attributes.name ?? '',
              d.attributes['document-folder-id'] != null ? String(d.attributes['document-folder-id']) : null,
              d.attributes['resource-url'] ?? null,
              content || null,
              d.attributes['updated-at'] ?? null,
              !!d.attributes.archived,
            ]
          )
        } catch (err) {
          errors.push(`doc ${d.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    )
  }

  return {
    organizationId: orgId,
    totalDocs: docs.length,
    indexed: batch.length - errors.length,
    remaining: Math.max(0, toIndex.length - batch.length),
    errors,
  }
}

/** Sync the TCT SOP org plus any org already present in the index. */
export async function syncIndexedOrgs(opts?: { maxDocsPerOrg?: number }): Promise<SyncResult[]> {
  await ensureTable()
  const pool = getPool()
  const { rows } = await pool.query<{ organization_id: string }>(
    `SELECT DISTINCT organization_id FROM itglue_doc_index`
  )
  const orgIds = Array.from(new Set([TCT_ORG_ID, ...rows.map((r) => r.organization_id)]))
  const results: SyncResult[] = []
  for (const orgId of orgIds) {
    results.push(await syncOrgDocuments(orgId, { maxDocs: opts?.maxDocsPerOrg ?? 120 }))
  }
  return results
}

export interface IndexedDocMatch {
  id: string
  name: string
  documentFolderId: string | null
  url: string | null
  updatedAt: string | null
  /** IT Glue's native archived flag (unknown/not-yet-synced rows report false). */
  archived: boolean
  rank?: number
}

/**
 * Full-text search an org's indexed documents (name weighted above content).
 * Returns matches, or NULL when the org has no rows yet (so the caller can fall
 * back to a live name-search). An empty array means "indexed, but no match".
 *
 * Archived docs are EXCLUDED by default (`archived IS NOT TRUE`, so a NULL/
 * not-yet-backfilled flag is treated as live). Pass includeArchived to include
 * them; callers tag archived hits so a tech never edits a stale SOP unaware.
 */
export async function searchDocIndex(
  orgId: string,
  query: string,
  opts?: { limit?: number; includeArchived?: boolean }
): Promise<IndexedDocMatch[] | null> {
  await ensureTable()
  const pool = getPool()
  const limit = opts?.limit ?? 25
  const archivedClause = opts?.includeArchived ? '' : 'AND (archived IS NOT TRUE)'

  const { rows: probe } = await pool.query(
    `SELECT 1 FROM itglue_doc_index WHERE organization_id = $1 LIMIT 1`,
    [orgId]
  )
  if (probe.length === 0) return null // org not indexed — caller falls back to live

  const q = query.trim()
  if (!q) {
    const { rows } = await pool.query(
      `SELECT document_id, name, folder_id, url, it_glue_updated_at, archived
         FROM itglue_doc_index WHERE organization_id = $1 ${archivedClause} ORDER BY name LIMIT $2`,
      [orgId, limit]
    )
    return rows.map(mapRow)
  }

  const { rows } = await pool.query(
    `SELECT document_id, name, folder_id, url, it_glue_updated_at, archived,
            ts_rank(search_tsv, plainto_tsquery('english', $2)) AS rank
       FROM itglue_doc_index
      WHERE organization_id = $1 AND search_tsv @@ plainto_tsquery('english', $2) ${archivedClause}
      ORDER BY rank DESC, name LIMIT $3`,
    [orgId, q, limit]
  )
  return rows.map(mapRow)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): IndexedDocMatch {
  return {
    id: r.document_id,
    name: r.name,
    documentFolderId: r.folder_id ?? null,
    url: r.url ?? null,
    updatedAt: r.it_glue_updated_at ? new Date(r.it_glue_updated_at).toISOString() : null,
    archived: r.archived === true,
    rank: typeof r.rank === 'number' ? r.rank : undefined,
  }
}

/** Index coverage for an org (for warm/verify). */
export async function getIndexStatus(orgId?: string): Promise<{ organizationId: string; count: number; lastSyncedAt: string | null }[]> {
  await ensureTable()
  const pool = getPool()
  const where = orgId ? `WHERE organization_id = $1` : ''
  const params = orgId ? [orgId] : []
  const { rows } = await pool.query(
    `SELECT organization_id, COUNT(*)::int AS count, MAX(synced_at) AS last_synced_at
       FROM itglue_doc_index ${where} GROUP BY organization_id ORDER BY organization_id`,
    params
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => ({
    organizationId: r.organization_id,
    count: r.count,
    lastSyncedAt: r.last_synced_at ? new Date(r.last_synced_at).toISOString() : null,
  }))
}
