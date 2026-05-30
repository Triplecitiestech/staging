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
  tableReady = true
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

async function uniqueSlug(base: string, excludeSlug?: string): Promise<string> {
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
  authorEmail: string | null
): Promise<MarketingDoc> {
  await ensureDocumentsTable()
  const slug = await uniqueSlug(input.title || 'document')
  const res = await pool.query<DocRow>(
    `INSERT INTO branded_documents
       (slug, doc_type, title, eyebrow, deck, body, meta, cta, status, author_email)
     VALUES ($1, 'marketing', $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
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
