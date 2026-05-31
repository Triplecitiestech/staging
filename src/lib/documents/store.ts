/**
 * Branded documents persistence (Documents hub → Marketing content).
 *
 * Uses the shared raw-pg pool (NOT Prisma — same self-healing pattern as the
 * reporting / SOC / CFO subsystems). `ensureDocumentsTable()` creates the table
 * on demand before any read or write, so there is no separate migration step.
 *
 * A "branded document" is staff-authored marketing content (Markdown body +
 * hero/meta/CTA fields) that renders in the TCT design system under
 * /admin/documents/marketing-content.
 */

import { getPool } from '@/lib/db-pool'
import { SOCIAL_PLATFORMS, type SocialDoc, type SocialDocInput, type SocialPost } from './social-types'

const pool = getPool()

export interface DocMeta {
  k: string
  v: string
}

export interface DocCta {
  heading: string
  sub: string
  primaryLabel: string
  primaryHref: string
}

export type DocStatus = 'draft' | 'published'

export interface MarketingDoc {
  id: number
  slug: string
  title: string
  eyebrow: string
  deck: string
  body: string
  meta: DocMeta[]
  cta: DocCta
  status: DocStatus
  authorEmail: string | null
  createdAt: string
  updatedAt: string
}

/** The editable fields an editor submits (no id/timestamps/author). */
export interface MarketingDocInput {
  title: string
  eyebrow: string
  deck: string
  body: string
  meta: DocMeta[]
  cta: DocCta
  status: DocStatus
}

export const EMPTY_CTA: DocCta = {
  heading: '',
  sub: '',
  primaryLabel: 'Get in touch',
  primaryHref: '/contact',
}

let tableReady = false
export async function ensureDocumentsTable(): Promise<void> {
  if (tableReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branded_documents (
      id           SERIAL PRIMARY KEY,
      slug         TEXT UNIQUE NOT NULL,
      doc_type     TEXT NOT NULL DEFAULT 'marketing',
      title        TEXT NOT NULL,
      eyebrow      TEXT NOT NULL DEFAULT '',
      deck         TEXT NOT NULL DEFAULT '',
      body         TEXT NOT NULL DEFAULT '',
      meta         JSONB NOT NULL DEFAULT '[]'::jsonb,
      cta          JSONB NOT NULL DEFAULT '{}'::jsonb,
      status       TEXT NOT NULL DEFAULT 'draft',
      author_email TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  // Self-healing: type-specific structured payload (e.g. social dump posts).
  await pool.query(
    `ALTER TABLE branded_documents ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb`
  )
  // Self-healing: campaign grouping + asset kind for imported Kaseya campaigns.
  await pool.query(`ALTER TABLE branded_documents ADD COLUMN IF NOT EXISTS campaign TEXT`)
  await pool.query(`ALTER TABLE branded_documents ADD COLUMN IF NOT EXISTS asset_kind TEXT`)
  // Self-healing: cache of AI-generated textless backgrounds for social cards.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branded_doc_images (
      slug       TEXT NOT NULL,
      post_index INT NOT NULL,
      mime       TEXT NOT NULL DEFAULT 'image/png',
      data       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (slug, post_index)
    )
  `)
  tableReady = true
}

/** Cached AI background for one social post (base64). Null if not generated yet. */
export async function getCardBackground(slug: string, postIndex: number): Promise<{ b64: string; mime: string } | null> {
  await ensureDocumentsTable()
  const res = await pool.query<{ data: string; mime: string }>(
    'SELECT data, mime FROM branded_doc_images WHERE slug = $1 AND post_index = $2 LIMIT 1',
    [slug, postIndex]
  )
  return res.rows.length ? { b64: res.rows[0].data, mime: res.rows[0].mime } : null
}

export async function saveCardBackground(slug: string, postIndex: number, b64: string, mime: string): Promise<void> {
  await ensureDocumentsTable()
  await pool.query(
    `INSERT INTO branded_doc_images (slug, post_index, mime, data, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (slug, post_index) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, created_at = NOW()`,
    [slug, postIndex, mime, b64]
  )
}

export async function deleteCardBackground(slug: string, postIndex: number): Promise<void> {
  await ensureDocumentsTable()
  await pool.query('DELETE FROM branded_doc_images WHERE slug = $1 AND post_index = $2', [slug, postIndex])
}

export async function listCardBackgroundIndexes(slug: string): Promise<number[]> {
  await ensureDocumentsTable()
  const res = await pool.query<{ post_index: number }>(
    'SELECT post_index FROM branded_doc_images WHERE slug = $1',
    [slug]
  )
  return res.rows.map((r) => r.post_index)
}

interface DocRow {
  id: number
  slug: string
  title: string
  eyebrow: string
  deck: string
  body: string
  meta: unknown
  cta: unknown
  data?: unknown
  status: string
  author_email: string | null
  created_at: Date | string
  updated_at: Date | string
}

function rowToDoc(r: DocRow): MarketingDoc {
  const meta = Array.isArray(r.meta) ? (r.meta as DocMeta[]) : []
  const cta = { ...EMPTY_CTA, ...(r.cta && typeof r.cta === 'object' ? (r.cta as Partial<DocCta>) : {}) }
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    eyebrow: r.eyebrow,
    deck: r.deck,
    body: r.body,
    meta,
    cta,
    status: r.status === 'published' ? 'published' : 'draft',
    authorEmail: r.author_email,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document'
}

export async function uniqueSlug(base: string, excludeSlug?: string): Promise<string> {
  await ensureDocumentsTable()
  // Route segments that must never be used as a document slug, or they'd
  // shadow the editor pages (/marketing-content/new, .../[slug]/edit).
  const reserved = new Set(['new', 'edit'])
  const root = slugify(base)
  let candidate = root
  let n = 1
  // Loop until the candidate is free (ignoring the row we're updating).
  // Bounded to avoid any pathological spin.
  while (n < 1000) {
    if (!reserved.has(candidate)) {
      const res = await pool.query<{ slug: string }>(
        'SELECT slug FROM branded_documents WHERE slug = $1 LIMIT 1',
        [candidate]
      )
      if (res.rows.length === 0 || res.rows[0].slug === excludeSlug) return candidate
    }
    n += 1
    candidate = `${root}-${n}`
  }
  return `${root}-${Date.now()}`
}

export async function listDocs(): Promise<MarketingDoc[]> {
  await ensureDocumentsTable()
  const res = await pool.query<DocRow>(
    `SELECT * FROM branded_documents WHERE doc_type = 'marketing' ORDER BY updated_at DESC`
  )
  return res.rows.map(rowToDoc)
}

export async function getDocBySlug(slug: string): Promise<MarketingDoc | null> {
  await ensureDocumentsTable()
  const res = await pool.query<DocRow>(
    `SELECT * FROM branded_documents WHERE slug = $1 LIMIT 1`,
    [slug]
  )
  return res.rows.length ? rowToDoc(res.rows[0]) : null
}

export async function createDoc(
  input: MarketingDocInput,
  authorEmail: string | null,
  opts?: { campaign?: string | null; assetKind?: string | null }
): Promise<MarketingDoc> {
  await ensureDocumentsTable()
  const slug = await uniqueSlug(input.title || 'document')
  const res = await pool.query<DocRow>(
    `INSERT INTO branded_documents
       (slug, doc_type, title, eyebrow, deck, body, meta, cta, status, author_email, campaign, asset_kind)
     VALUES ($1, 'marketing', $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
     RETURNING *`,
    [
      slug,
      input.title,
      input.eyebrow,
      input.deck,
      input.body,
      JSON.stringify(input.meta ?? []),
      JSON.stringify(input.cta ?? EMPTY_CTA),
      input.status === 'published' ? 'published' : 'draft',
      authorEmail,
      opts?.campaign ?? null,
      opts?.assetKind ?? 'marketing',
    ]
  )
  return rowToDoc(res.rows[0])
}

export async function updateDoc(
  slug: string,
  input: MarketingDocInput
): Promise<MarketingDoc | null> {
  await ensureDocumentsTable()
  const res = await pool.query<DocRow>(
    `UPDATE branded_documents
       SET title = $2, eyebrow = $3, deck = $4, body = $5,
           meta = $6::jsonb, cta = $7::jsonb, status = $8, updated_at = NOW()
     WHERE slug = $1
     RETURNING *`,
    [
      slug,
      input.title,
      input.eyebrow,
      input.deck,
      input.body,
      JSON.stringify(input.meta ?? []),
      JSON.stringify(input.cta ?? EMPTY_CTA),
      input.status === 'published' ? 'published' : 'draft',
    ]
  )
  return res.rows.length ? rowToDoc(res.rows[0]) : null
}

export async function deleteDoc(slug: string): Promise<boolean> {
  await ensureDocumentsTable()
  const res = await pool.query(`DELETE FROM branded_documents WHERE slug = $1`, [slug])
  return (res.rowCount ?? 0) > 0
}

/**
 * Seed a representative "service spotlight" sample the first time the table is
 * empty, so the hub has a working example to view and edit immediately.
 */
const SAMPLE: MarketingDocInput = {
  title: 'Security that watches while you sleep',
  eyebrow: 'Service Spotlight',
  deck: 'Why Binghamton-area businesses are moving from “we have antivirus” to a fully managed detection-and-response operation — and what that actually changes day to day.',
  meta: [
    { k: 'Format', v: 'Service spotlight' },
    { k: 'Audience', v: 'SMB owners & office managers' },
    { k: 'Read', v: '~3 min' },
  ],
  status: 'published',
  cta: {
    heading: 'Worried something is slipping through?',
    sub: 'Talk to Triple Cities Tech about managed detection and response. We’ll review what’s protecting you today and where the gaps are — no cost, no pressure.',
    primaryLabel: 'Talk to TCT',
    primaryHref: '/contact',
  },
  body: `Most small businesses don't get breached because they ignored security. They get breached because security was **something they bought once** — a box checked years ago — instead of something that runs every hour of every day. The threats kept evolving. The defense didn't.

That gap is exactly what a managed Security Operations Center (SOC) closes.

## What "managed detection and response" really means

Antivirus asks a simple question: *is this file on a list of known-bad things?* Modern attacks walk right past that. They use legitimate tools, stolen passwords, and patient, quiet movement that no signature catches.

A managed SOC watches **behavior** instead of signatures:

- Sign-ins from two countries an hour apart
- A finance workstation suddenly reaching out to a server it has never talked to
- Backups being deleted in the middle of the night

Each of those is a story, not a file — and our analysts read those stories across your whole environment.

## The part that matters: someone is actually on the other end

Tools generate alerts. Alerts without people are just noise that arrives faster. The difference with Triple Cities Tech is that **a real analyst triages every meaningful signal** — confirms whether it's a genuine threat, takes the first containment action, and tells you in plain language what happened and what we did about it.

> You don't get a dashboard full of red squares and a wish of good luck. You get an answer: "We isolated that laptop at 2:14 AM, the account is locked, and nothing else was touched."

## What changes day to day

For your team, almost nothing changes — and that's the point. People keep working. The shift happens underneath:

1. **Threats get caught early**, while they're still one laptop instead of your whole network.
2. **Response happens in minutes**, around the clock.
3. **You get clarity**, not homework — a short, human summary instead of a console you have to learn.

The businesses that sleep best aren't the ones with the most tools. They're the ones who know someone is watching.`,
}

export async function seedSampleIfEmpty(authorEmail: string | null): Promise<void> {
  await ensureDocumentsTable()
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM branded_documents WHERE doc_type = 'marketing'`
  )
  if (res.rows[0] && Number(res.rows[0].count) === 0) {
    await createDoc(SAMPLE, authorEmail)
  }
}

/** Parse + validate an editor payload into a MarketingDocInput. Pure (no DB). */
export function parseDocInput(
  raw: unknown
): { ok: true; value: MarketingDocInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid request body.' }
  const b = raw as Record<string, unknown>

  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (!title) return { ok: false, error: 'Title is required.' }
  if (title.length > 300) return { ok: false, error: 'Title is too long (max 300 characters).' }

  const eyebrow = typeof b.eyebrow === 'string' ? b.eyebrow.trim().slice(0, 120) : ''
  const deck = typeof b.deck === 'string' ? b.deck.trim().slice(0, 2000) : ''
  const body = typeof b.body === 'string' ? b.body : ''
  if (body.length > 200_000) return { ok: false, error: 'Body exceeds the 200,000 character limit.' }

  const metaRaw = Array.isArray(b.meta) ? b.meta : []
  const meta: DocMeta[] = metaRaw
    .slice(0, 12)
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>
      return {
        k: typeof o.k === 'string' ? o.k.trim().slice(0, 60) : '',
        v: typeof o.v === 'string' ? o.v.trim().slice(0, 120) : '',
      }
    })
    .filter((m) => m.k || m.v)

  const ctaRaw = (b.cta ?? {}) as Record<string, unknown>
  const cta: DocCta = {
    heading: typeof ctaRaw.heading === 'string' ? ctaRaw.heading.trim().slice(0, 200) : '',
    sub: typeof ctaRaw.sub === 'string' ? ctaRaw.sub.trim().slice(0, 600) : '',
    primaryLabel:
      typeof ctaRaw.primaryLabel === 'string' && ctaRaw.primaryLabel.trim()
        ? ctaRaw.primaryLabel.trim().slice(0, 60)
        : 'Get in touch',
    primaryHref:
      typeof ctaRaw.primaryHref === 'string' && ctaRaw.primaryHref.trim()
        ? ctaRaw.primaryHref.trim().slice(0, 500)
        : '/contact',
  }

  const status: DocStatus = b.status === 'published' ? 'published' : 'draft'

  return { ok: true, value: { title, eyebrow, deck, body, meta, cta, status } }
}

// ─── Social Content Dumps (doc_type = 'social') ──────────────────────────────

function rowToSocial(r: DocRow): SocialDoc {
  const data = r.data && typeof r.data === 'object' ? (r.data as { posts?: unknown }) : {}
  const posts: SocialPost[] = Array.isArray(data.posts)
    ? (data.posts as unknown[]).map((p) => {
        const o = (p ?? {}) as Record<string, unknown>
        return {
          platform: typeof o.platform === 'string' ? o.platform : 'general',
          body: typeof o.body === 'string' ? o.body : '',
          hashtags: typeof o.hashtags === 'string' ? o.hashtags : '',
          note: typeof o.note === 'string' ? o.note : '',
        }
      })
    : []
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    deck: r.deck,
    posts,
    status: r.status === 'published' ? 'published' : 'draft',
    authorEmail: r.author_email,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export async function listSocialDocs(): Promise<SocialDoc[]> {
  await ensureDocumentsTable()
  const res = await pool.query<DocRow>(
    `SELECT * FROM branded_documents WHERE doc_type = 'social' ORDER BY updated_at DESC`
  )
  return res.rows.map(rowToSocial)
}

export async function getSocialDocBySlug(slug: string): Promise<SocialDoc | null> {
  await ensureDocumentsTable()
  const res = await pool.query<DocRow>(
    `SELECT * FROM branded_documents WHERE slug = $1 AND doc_type = 'social' LIMIT 1`,
    [slug]
  )
  return res.rows.length ? rowToSocial(res.rows[0]) : null
}

export async function createSocialDoc(
  input: SocialDocInput,
  authorEmail: string | null,
  opts?: { campaign?: string | null }
): Promise<SocialDoc> {
  await ensureDocumentsTable()
  const slug = await uniqueSlug(input.title || 'social')
  const res = await pool.query<DocRow>(
    `INSERT INTO branded_documents (slug, doc_type, title, deck, status, author_email, data, campaign, asset_kind)
     VALUES ($1, 'social', $2, $3, $4, $5, $6::jsonb, $7, 'social')
     RETURNING *`,
    [
      slug,
      input.title,
      input.deck,
      input.status === 'published' ? 'published' : 'draft',
      authorEmail,
      JSON.stringify({ posts: input.posts ?? [] }),
      opts?.campaign ?? null,
    ]
  )
  return rowToSocial(res.rows[0])
}

export async function updateSocialDoc(slug: string, input: SocialDocInput): Promise<SocialDoc | null> {
  await ensureDocumentsTable()
  const res = await pool.query<DocRow>(
    `UPDATE branded_documents
       SET title = $2, deck = $3, status = $4, data = $5::jsonb, updated_at = NOW()
     WHERE slug = $1 AND doc_type = 'social'
     RETURNING *`,
    [
      slug,
      input.title,
      input.deck,
      input.status === 'published' ? 'published' : 'draft',
      JSON.stringify({ posts: input.posts ?? [] }),
    ]
  )
  return res.rows.length ? rowToSocial(res.rows[0]) : null
}

export async function deleteSocialDoc(slug: string): Promise<boolean> {
  await ensureDocumentsTable()
  const res = await pool.query(`DELETE FROM branded_documents WHERE slug = $1 AND doc_type = 'social'`, [slug])
  return (res.rowCount ?? 0) > 0
}

/** Parse + validate a social-dump editor payload. Pure (no DB). */
export function parseSocialInput(
  raw: unknown
): { ok: true; value: SocialDocInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid request body.' }
  const b = raw as Record<string, unknown>

  const title = typeof b.title === 'string' ? b.title.trim() : ''
  if (!title) return { ok: false, error: 'Title is required.' }
  if (title.length > 300) return { ok: false, error: 'Title is too long (max 300 characters).' }

  const deck = typeof b.deck === 'string' ? b.deck.trim().slice(0, 2000) : ''

  const validKeys = new Set(SOCIAL_PLATFORMS.map((p) => p.key))
  const postsRaw = Array.isArray(b.posts) ? b.posts : []
  const posts: SocialPost[] = postsRaw
    .slice(0, 100)
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>
      const platform = typeof o.platform === 'string' && validKeys.has(o.platform) ? o.platform : 'general'
      return {
        platform,
        body: typeof o.body === 'string' ? o.body.slice(0, 20_000) : '',
        hashtags: typeof o.hashtags === 'string' ? o.hashtags.trim().slice(0, 1000) : '',
        note: typeof o.note === 'string' ? o.note.trim().slice(0, 500) : '',
      }
    })
    .filter((p) => p.body.trim() || p.hashtags.trim())

  const status: SocialDocInput['status'] = b.status === 'published' ? 'published' : 'draft'

  return { ok: true, value: { title, deck, posts, status } }
}

const SAMPLE_SOCIAL: SocialDocInput = {
  title: 'Secure Boot 2026 — awareness push',
  deck: 'A short multi-platform set raising awareness of the June 2026 Secure Boot certificate deadline. Copy each post out to the platform when ready.',
  status: 'published',
  posts: [
    {
      platform: 'linkedin',
      body: "Heads up, Windows users: Microsoft is retiring the 2011-era Secure Boot certificates starting June 24, 2026. Devices that don't get the 2023 update stop receiving validated boot-security updates.\n\nWe're already getting our managed clients ahead of it — no action needed on your end. Not sure if your fleet is covered? Let's talk.",
      hashtags: '#CyberSecurity #ManagedIT #SecureBoot #SMB',
      note: 'Lead post — pin for the week.',
    },
    {
      platform: 'x',
      body: 'Microsoft is expiring the 2011 Secure Boot certs in June 2026. If your PCs aren’t on the new 2023 certs, boot-security updates stop. We’re handling it for our clients. Are yours covered?',
      hashtags: '#infosec #MSP',
      note: 'Keep under 280 incl. hashtags.',
    },
    {
      platform: 'instagram',
      body: 'Your computer has a security gate that checks everything before Windows even starts. In 2026, the keys to that gate change. We make sure our clients’ devices get the new keys — quietly, before the deadline. 🔐',
      hashtags: '#SmallBusiness #TechSupport #CyberSecurity #BinghamtonNY',
      note: 'Pair with a lock/shield graphic.',
    },
  ],
}

export async function seedSampleSocialIfEmpty(authorEmail: string | null): Promise<void> {
  await ensureDocumentsTable()
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM branded_documents WHERE doc_type = 'social'`
  )
  if (res.rows[0] && Number(res.rows[0].count) === 0) {
    await createSocialDoc(SAMPLE_SOCIAL, authorEmail)
  }
}

// ─── Campaigns (imported Kaseya campaigns, grouped by `campaign` slug) ────────

export interface CampaignAsset {
  slug: string
  title: string
  docType: string
  assetKind: string | null
  status: string
  updatedAt: string
}

export async function getCampaignAssets(campaign: string): Promise<CampaignAsset[]> {
  await ensureDocumentsTable()
  const res = await pool.query<{
    slug: string
    title: string
    doc_type: string
    asset_kind: string | null
    status: string
    updated_at: Date | string
  }>(
    `SELECT slug, title, doc_type, asset_kind, status, updated_at
       FROM branded_documents WHERE campaign = $1
       ORDER BY CASE asset_kind
         WHEN 'email' THEN 1 WHEN 'landing' THEN 2 WHEN 'blog' THEN 3 WHEN 'social' THEN 4 ELSE 5 END,
       updated_at DESC`,
    [campaign]
  )
  return res.rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    docType: r.doc_type,
    assetKind: r.asset_kind,
    status: r.status,
    updatedAt: String(r.updated_at),
  }))
}

export async function listCampaigns(): Promise<{ campaign: string; count: number; updatedAt: string }[]> {
  await ensureDocumentsTable()
  const res = await pool.query<{ campaign: string; count: string; updated_at: Date | string }>(
    `SELECT campaign, COUNT(*)::text AS count, MAX(updated_at) AS updated_at
       FROM branded_documents WHERE campaign IS NOT NULL
       GROUP BY campaign ORDER BY MAX(updated_at) DESC`
  )
  return res.rows.map((r) => ({ campaign: r.campaign, count: Number(r.count), updatedAt: String(r.updated_at) }))
}

/** Human title from a campaign slug, e.g. "disaster-recovery-testing" → "Disaster Recovery Testing". */
export function campaignTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
