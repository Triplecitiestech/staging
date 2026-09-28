/**
 * SOC delivery — the ONLY place the analyzer writes to Autotask or emails anyone.
 *
 * Three things live here, all behind injectable boundaries so the Wilmar replay
 * runs with nothing reaching the network:
 *
 *   1. SocWriter — the side-effect boundary. `liveWriter()` writes to Autotask
 *      as the SOC's API user (the "TCT Customer Portal" resource that has always
 *      posted SOC notes). `recordingWriter()` performs every read against a seed
 *      or a live read-only source and RECORDS every write instead of making it.
 *
 *   2. SocAssessmentStore — one record per (Autotask ticket, RocketCyber
 *      incident). It is what makes the analyzer idempotent:
 *        - an automatic trigger (ingest callout, cron) for a key already assessed
 *          or in progress does NOTHING — so an Autotask "Round-Trip … timed out"
 *          retry can never re-run the analysis (seven notes on T20260927.0006),
 *        - a manual re-run edits the stored note in place,
 *        - a second ticket for the same device + file + detection time (the
 *          absorbed twin) is recorded as a twin and gets no assessment and no
 *          customer message of its own,
 *        - the customer is emailed at most once per incident.
 *
 *   3. deliverAssessment() — writes/edits the assessment note, then (when the
 *      classification warrants it and SOC_AUTO_CUSTOMER_NOTIFY is on) posts the
 *      customer update through the connector's shared note+email core
 *      (src/lib/customer-mail.ts → deliverCustomerNoteWithEmail), setting the
 *      ticket contact first when the ticket has none, and records exactly what
 *      was sent in an internal note.
 */

import { getPool } from '@/lib/db-pool'
import {
  customerMailReadiness,
  deliverCustomerNoteWithEmail,
  isSendableEmailAddress,
  sendCustomerUpdateEmail,
  type CustomerMailSendResult,
  type CustomerNoteAuditContext,
  type CustomerNoteDeps,
  type CustomerNoteOutcome,
} from '@/lib/customer-mail'
import { automationSwitchState, type AutomationSwitchState } from '@/lib/connector/kill-switches'
import type { CompanySecurityProfile } from './evidence'
import type { SocClassification } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Writer
// ─────────────────────────────────────────────────────────────────────────────

export interface SocTicketSnapshot {
  id: number
  ticketNumber: string | null
  title: string | null
  companyID: number | null
  contactID: number | null
}

export interface SocContactSnapshot {
  id: number
  companyID: number | null
  firstName: string | null
  lastName: string | null
  isActive: unknown
  emailAddress: string | null
}

export interface SocNoteSnapshot {
  id: number
  ticketID: number
  title: string | null
  description: string | null
}

export interface SocReads {
  getTicket(ticketId: number): Promise<SocTicketSnapshot | null>
  getContact(contactId: number): Promise<SocContactSnapshot | null>
  /** Returns null ONLY when the note genuinely does not exist; throws on lookup failure. */
  getNote(noteId: number): Promise<SocNoteSnapshot | null>
  /** Most recent "SOC Analyst Assessment" note on a ticket (adopted by pre-idempotency tickets). */
  findLatestAssessmentNote(ticketId: number): Promise<SocNoteSnapshot | null>
}

export type WriterCall =
  | { op: 'createInternalNote'; ticketId: number; title: string; body: string }
  | { op: 'updateNote'; ticketId: number; noteId: number; body: string }
  | { op: 'setTicketContact'; ticketId: number; contactId: number }
  | { op: 'createCustomerNote'; ticketId: number; title: string; body: string; publish: number }
  | { op: 'sendEmail'; to: string; subject: string; text: string }

export interface SocWriter extends SocReads {
  mode: 'live' | 'recording'
  createInternalNote(ticketId: number, title: string, body: string): Promise<{ noteId: number | null }>
  updateNote(ticketId: number, noteId: number, body: string): Promise<void>
  setTicketContact(ticketId: number, contactId: number): Promise<void>
  /** Dependencies for the shared customer note + email core. */
  customerNoteDeps(auditNoteBody: (ctx: CustomerNoteAuditContext) => string): CustomerNoteDeps
}

export const ASSESSMENT_NOTE_TITLE = 'SOC Analyst Assessment'

function toNoteSnapshot(n: { id: number; ticketID: number; title?: string | null; description?: string | null } | null): SocNoteSnapshot | null {
  return n ? { id: n.id, ticketID: n.ticketID, title: n.title ?? null, description: n.description ?? null } : null
}

/** Live reads through the SOC's Autotask client. */
export async function liveReads(): Promise<SocReads> {
  const { AutotaskClient } = await import('@/lib/autotask')
  const client = new AutotaskClient()
  return {
    async getTicket(ticketId) {
      const t = await client.getTicket(ticketId)
      if (!t) return null
      const r = t as unknown as Record<string, unknown>
      return {
        id: Number(r.id),
        ticketNumber: (r.ticketNumber as string) ?? null,
        title: (r.title as string) ?? null,
        companyID: r.companyID == null ? null : Number(r.companyID),
        contactID: r.contactID == null ? null : Number(r.contactID),
      }
    },
    async getContact(contactId) {
      const c = await client.getContactById(contactId)
      if (!c) return null
      return {
        id: c.id,
        companyID: c.companyID ?? null,
        firstName: c.firstName ?? null,
        lastName: c.lastName ?? null,
        isActive: c.isActive,
        emailAddress: c.emailAddress ?? null,
      }
    },
    async getNote(noteId) {
      return toNoteSnapshot(await client.getTicketNoteByNoteId(noteId))
    },
    async findLatestAssessmentNote(ticketId) {
      const notes = await client.getTicketNotes(ticketId)
      const soc = notes
        .filter((n) => (n.title || '').trim() === ASSESSMENT_NOTE_TITLE)
        .sort((a, b) => b.id - a.id)
      return toNoteSnapshot(soc[0] ?? null)
    },
  }
}

/** Writes to Autotask as the SOC's API user. */
export async function liveWriter(): Promise<SocWriter> {
  const { AutotaskClient } = await import('@/lib/autotask')
  const client = new AutotaskClient()
  const reads = await liveReads()
  const createNote = async (ticketId: number, note: { title: string; description: string; publish: number }) => {
    const created = await client.createTicketNote(ticketId, { title: note.title, description: note.description, noteType: 1, publish: note.publish })
    return { itemId: created?.id || undefined }
  }
  return {
    mode: 'live',
    ...reads,
    async createInternalNote(ticketId, title, body) {
      const r = await createNote(ticketId, { title, description: body, publish: 2 })
      return { noteId: r.itemId ?? null }
    },
    async updateNote(ticketId, noteId, body) {
      await client.updateTicketNote(ticketId, noteId, { description: body })
    },
    async setTicketContact(ticketId, contactId) {
      await client.patchTicket(ticketId, { contactID: contactId })
    },
    customerNoteDeps(auditNoteBody) {
      return {
        readiness: customerMailReadiness,
        getTicket: (id) => reads.getTicket(id),
        getContact: (id) => reads.getContact(id),
        createNote,
        sendEmail: sendCustomerUpdateEmail,
        auditNoteBody,
      }
    },
  }
}

export interface RecordingSeed {
  tickets?: SocTicketSnapshot[]
  contacts?: SocContactSnapshot[]
  notes?: SocNoteSnapshot[]
}

export interface RecordingWriter extends SocWriter {
  calls: WriterCall[]
  sends: Array<{ to: string; subject: string; text: string }>
}

/**
 * Performs reads against `reads` (a live read-only source) or a seed, and
 * RECORDS every write. Recorded writes are applied to its own in-memory view,
 * so a second run in the same process sees the note it "created" and the
 * contact it "set" — which is what lets the replay prove a re-run edits in
 * place and never sends twice.
 */
export function recordingWriter(opts: {
  seed?: RecordingSeed
  reads?: SocReads
  /** Defaults to the REAL readiness, so a dry run reports what production would do. */
  readiness?: CustomerNoteDeps['readiness']
  sender?: string
  /** acceptedAt stamped on recorded sends (deterministic in tests). */
  acceptedAt?: string
}): RecordingWriter {
  const tickets = new Map<number, SocTicketSnapshot>((opts.seed?.tickets ?? []).map((t) => [t.id, { ...t }]))
  const contacts = new Map<number, SocContactSnapshot>((opts.seed?.contacts ?? []).map((c) => [c.id, { ...c }]))
  const notes = new Map<number, SocNoteSnapshot>((opts.seed?.notes ?? []).map((n) => [n.id, { ...n }]))
  let nextNoteId = 900_000_001
  const calls: WriterCall[] = []
  const sends: RecordingWriter['sends'] = []
  const sender = opts.sender ?? 'support@triplecitiestech.com'

  const getTicket = async (id: number) => tickets.get(id) ?? (opts.reads ? await opts.reads.getTicket(id) : null)
  const getContact = async (id: number) => contacts.get(id) ?? (opts.reads ? await opts.reads.getContact(id) : null)
  const createNote = async (ticketId: number, note: { title: string; description: string; publish: number }) => {
    const id = nextNoteId++
    calls.push({ op: 'createCustomerNote', ticketId, title: note.title, body: note.description, publish: note.publish })
    notes.set(id, { id, ticketID: ticketId, title: note.title, description: note.description })
    return { itemId: id }
  }
  const sendEmail: typeof sendCustomerUpdateEmail = async ({ to, email }) => {
    calls.push({ op: 'sendEmail', to, subject: email.subject, text: email.text })
    sends.push({ to, subject: email.subject, text: email.text })
    const result: CustomerMailSendResult = { status: 'accepted', httpStatus: 202, sender, to, acceptedAt: opts.acceptedAt ?? new Date().toISOString(), subject: email.subject }
    return result
  }

  return {
    mode: 'recording',
    calls,
    sends,
    getTicket,
    getContact,
    async getNote(noteId) {
      return notes.get(noteId) ?? (opts.reads ? await opts.reads.getNote(noteId) : null)
    },
    async findLatestAssessmentNote(ticketId) {
      const local = Array.from(notes.values())
        .filter((n) => n.ticketID === ticketId && n.title === ASSESSMENT_NOTE_TITLE)
        .sort((a, b) => b.id - a.id)[0]
      return local ?? (opts.reads ? await opts.reads.findLatestAssessmentNote(ticketId) : null)
    },
    async createInternalNote(ticketId, title, body) {
      const id = nextNoteId++
      calls.push({ op: 'createInternalNote', ticketId, title, body })
      notes.set(id, { id, ticketID: ticketId, title, description: body })
      return { noteId: id }
    },
    async updateNote(ticketId, noteId, body) {
      calls.push({ op: 'updateNote', ticketId, noteId, body })
      const n = notes.get(noteId)
      notes.set(noteId, { id: noteId, ticketID: n?.ticketID ?? ticketId, title: n?.title ?? ASSESSMENT_NOTE_TITLE, description: body })
    },
    async setTicketContact(ticketId, contactId) {
      calls.push({ op: 'setTicketContact', ticketId, contactId })
      const t = (await getTicket(ticketId)) ?? { id: ticketId, ticketNumber: null, title: null, companyID: null, contactID: null }
      tickets.set(ticketId, { ...t, contactID: contactId })
    },
    customerNoteDeps(auditNoteBody) {
      return {
        readiness: opts.readiness ?? customerMailReadiness,
        getTicket,
        getContact,
        createNote,
        sendEmail,
        auditNoteBody,
      }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assessment record store (idempotency)
// ─────────────────────────────────────────────────────────────────────────────

export type RecordStatus = 'claimed' | 'complete' | 'twin' | 'failed'
export type NotifyState = 'sent' | 'refused' | 'suppressed' | 'not_applicable' | 'send_failed'

export interface AssessmentRecord {
  autotaskTicketId: string
  rcIncidentId: string
  companyId: string | null
  twinKey: string | null
  twinOfTicketId: string | null
  status: RecordStatus
  claimedAt: string
  completedAt: string | null
  incidentId: string | null
  assessmentNoteId: number | null
  classification: string | null
  confidence: number | null
  customerNotifyState: NotifyState | null
  customerNotifiedAt: string | null
  customerNotifyReason: string | null
  notifiedClassification: string | null
  flaggedClassification: string | null
}

export interface ClaimRequest {
  ticketId: string
  rcIncidentId: string
  companyId: string | null
  twinKey: string | null
  /** Manual re-run: re-assess even when complete. */
  force: boolean
  now: Date
}

export type ClaimResult =
  | { claimed: true; record: AssessmentRecord }
  | { claimed: false; reason: 'already_assessed' | 'in_progress' | 'twin'; record: AssessmentRecord }

export interface SocAssessmentStore {
  claim(req: ClaimRequest): Promise<ClaimResult>
  /** Record a ticket as covered by another ticket's assessment. Never overwrites a primary. */
  markTwin(args: { ticketId: string; rcIncidentId: string; companyId: string | null; twinOfTicketId: string; now: Date }): Promise<void>
  get(ticketId: string, rcIncidentId: string): Promise<AssessmentRecord | null>
  /** Every record for a ticket (a twin's primary is looked up by ticket alone). */
  findByTicket(ticketId: string): Promise<AssessmentRecord[]>
  update(ticketId: string, rcIncidentId: string, patch: Partial<AssessmentRecord>): Promise<void>
}

/** Claims older than this are treated as abandoned (the run crashed or timed out). */
export const STALE_CLAIM_MINUTES = 10

function blankRecord(req: { ticketId: string; rcIncidentId: string; companyId: string | null; twinKey: string | null }, now: Date): AssessmentRecord {
  return {
    autotaskTicketId: req.ticketId, rcIncidentId: req.rcIncidentId, companyId: req.companyId, twinKey: req.twinKey,
    twinOfTicketId: null, status: 'claimed', claimedAt: now.toISOString(), completedAt: null, incidentId: null,
    assessmentNoteId: null, classification: null, confidence: null, customerNotifyState: null, customerNotifiedAt: null,
    customerNotifyReason: null, notifiedClassification: null, flaggedClassification: null,
  }
}

/**
 * The claim decision, shared by both stores so they cannot disagree. Given the
 * existing record (or null), may this request take the claim?
 */
export function claimDecision(existing: AssessmentRecord | null, req: ClaimRequest): 'take' | 'already_assessed' | 'in_progress' | 'twin' {
  if (!existing) return 'take'
  if (existing.status === 'twin') return req.force ? 'take' : 'twin'
  if (existing.status === 'failed') return 'take'
  if (existing.status === 'claimed') {
    const age = req.now.getTime() - Date.parse(existing.claimedAt)
    return age > STALE_CLAIM_MINUTES * 60_000 ? 'take' : 'in_progress'
  }
  return req.force ? 'take' : 'already_assessed'
}

const recKey = (t: string, r: string) => `${t}::${r}`

/** In-memory store — tests, and the dry run (seeded from pg reads, never written back). */
export function memoryStore(seed: AssessmentRecord[] = []): SocAssessmentStore & { records: Map<string, AssessmentRecord> } {
  const records = new Map<string, AssessmentRecord>(seed.map((r) => [recKey(r.autotaskTicketId, r.rcIncidentId), { ...r }]))
  const primaryByTwin = (twinKey: string | null, exclude: string) =>
    twinKey ? Array.from(records.values()).find((r) => r.twinKey === twinKey && !r.twinOfTicketId && r.autotaskTicketId !== exclude && r.status !== 'failed') ?? null : null
  return {
    records,
    async claim(req) {
      const k = recKey(req.ticketId, req.rcIncidentId)
      const existing = records.get(k) ?? null
      if (!existing) {
        const primary = primaryByTwin(req.twinKey, req.ticketId)
        if (primary) {
          const twin = { ...blankRecord(req, req.now), status: 'twin' as const, twinOfTicketId: primary.autotaskTicketId }
          records.set(k, twin)
          return { claimed: false, reason: 'twin', record: twin }
        }
      }
      const d = claimDecision(existing, req)
      if (d !== 'take') return { claimed: false, reason: d, record: existing! }
      const rec: AssessmentRecord = existing
        ? { ...existing, status: 'claimed', claimedAt: req.now.toISOString() }
        : blankRecord(req, req.now)
      records.set(k, rec)
      return { claimed: true, record: { ...rec } }
    },
    async markTwin({ ticketId, rcIncidentId, companyId, twinOfTicketId, now }) {
      const k = recKey(ticketId, rcIncidentId)
      const existing = records.get(k)
      if (existing && existing.status !== 'twin') return
      records.set(k, { ...blankRecord({ ticketId, rcIncidentId, companyId, twinKey: null }, now), status: 'twin', twinOfTicketId })
    },
    async get(ticketId, rcIncidentId) {
      const r = records.get(recKey(ticketId, rcIncidentId))
      return r ? { ...r } : null
    },
    async findByTicket(ticketId) {
      return Array.from(records.values()).filter((r) => r.autotaskTicketId === ticketId).map((r) => ({ ...r }))
    },
    async update(ticketId, rcIncidentId, patch) {
      const k = recKey(ticketId, rcIncidentId)
      const r = records.get(k)
      if (r) records.set(k, { ...r, ...patch })
    },
  }
}

/**
 * A store whose writes go nowhere — the production dry run must not change
 * state. It always lets the run proceed (the run writes nothing), seeded with
 * the real record so the preview shows what a live run would edit or skip.
 */
export function readOnlyStore(inner: SocAssessmentStore): SocAssessmentStore & { liveDecision: Map<string, string> } {
  const mem = memoryStore()
  const liveDecision = new Map<string, string>()
  return {
    liveDecision,
    async claim(req) {
      const existing = await inner.get(req.ticketId, req.rcIncidentId)
      liveDecision.set(recKey(req.ticketId, req.rcIncidentId), claimDecision(existing, req))
      const rec = existing ? { ...existing } : blankRecord(req, req.now)
      mem.records.set(recKey(req.ticketId, req.rcIncidentId), rec)
      return { claimed: true, record: { ...rec } }
    },
    async markTwin() { /* dry run: no writes */ },
    async get(t, r) { return (await mem.get(t, r)) ?? inner.get(t, r) },
    async findByTicket(t) { return inner.findByTicket(t) },
    async update(t, r, p) { await mem.update(t, r, p) },
  }
}

// ── Postgres store (raw pg, lazily created — same pattern as domotz_site_settings) ──

let tableReady: Promise<void> | null = null

export const SOC_ASSESSMENT_TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS soc_assessment_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "autotaskTicketId" TEXT NOT NULL,
    "rcIncidentId" TEXT NOT NULL,
    "companyId" TEXT,
    "twinKey" TEXT,
    "twinOfTicketId" TEXT,
    status TEXT NOT NULL DEFAULT 'claimed',
    "claimedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "completedAt" TIMESTAMPTZ,
    "incidentId" TEXT,
    "assessmentNoteId" BIGINT,
    classification TEXT,
    confidence DOUBLE PRECISION,
    "customerNotifyState" TEXT,
    "customerNotifiedAt" TIMESTAMPTZ,
    "customerNotifyReason" TEXT,
    "notifiedClassification" TEXT,
    "flaggedClassification" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_soc_assess_key ON soc_assessment_records ("autotaskTicketId", "rcIncidentId")`,
  // One PRIMARY per twin key: the second ticket for the same device + file +
  // detection time loses this race and is recorded as a twin — atomically,
  // even when both Autotask callouts arrive in the same second.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_soc_assess_twin_primary ON soc_assessment_records ("twinKey") WHERE "twinKey" IS NOT NULL AND "twinOfTicketId" IS NULL`,
]

export async function ensureSocAssessmentTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      const client = await getPool().connect()
      try {
        for (const sql of SOC_ASSESSMENT_TABLE_SQL) await client.query(sql)
      } finally {
        client.release()
      }
    })().catch((e) => { tableReady = null; throw e })
  }
  return tableReady
}

interface PgRow {
  autotaskTicketId: string; rcIncidentId: string; companyId: string | null; twinKey: string | null; twinOfTicketId: string | null
  status: RecordStatus; claimedAt: Date; completedAt: Date | null; incidentId: string | null; assessmentNoteId: string | number | null
  classification: string | null; confidence: number | null; customerNotifyState: NotifyState | null; customerNotifiedAt: Date | null
  customerNotifyReason: string | null; notifiedClassification: string | null; flaggedClassification: string | null
}

function fromRow(r: PgRow): AssessmentRecord {
  return {
    autotaskTicketId: r.autotaskTicketId, rcIncidentId: r.rcIncidentId, companyId: r.companyId, twinKey: r.twinKey,
    twinOfTicketId: r.twinOfTicketId, status: r.status, claimedAt: new Date(r.claimedAt).toISOString(),
    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null, incidentId: r.incidentId,
    assessmentNoteId: r.assessmentNoteId == null ? null : Number(r.assessmentNoteId),
    classification: r.classification, confidence: r.confidence, customerNotifyState: r.customerNotifyState,
    customerNotifiedAt: r.customerNotifiedAt ? new Date(r.customerNotifiedAt).toISOString() : null,
    customerNotifyReason: r.customerNotifyReason, notifiedClassification: r.notifiedClassification,
    flaggedClassification: r.flaggedClassification,
  }
}

const UPDATABLE: Array<keyof AssessmentRecord> = [
  'status', 'completedAt', 'incidentId', 'assessmentNoteId', 'classification', 'confidence', 'customerNotifyState',
  'customerNotifiedAt', 'customerNotifyReason', 'notifiedClassification', 'flaggedClassification', 'twinOfTicketId',
]

export function pgStore(opts: { readOnly?: boolean } = {}): SocAssessmentStore {
  const q = async <T = PgRow>(sql: string, params: unknown[]): Promise<T[]> => {
    // A read-only store (dry run) never creates the table; a missing table is
    // simply "no record yet".
    if (!opts.readOnly) await ensureSocAssessmentTable()
    else if (!/^\s*SELECT/i.test(sql)) throw new Error('read-only SOC assessment store refused a write')
    const client = await getPool().connect()
    try {
      return (await client.query(sql, params)).rows as T[]
    } catch (e) {
      if (opts.readOnly && (e as { code?: string }).code === '42P01') return []
      throw e
    } finally {
      client.release()
    }
  }
  const get = async (t: string, r: string) => {
    const rows = await q(`SELECT * FROM soc_assessment_records WHERE "autotaskTicketId" = $1 AND "rcIncidentId" = $2`, [t, r])
    return rows[0] ? fromRow(rows[0]) : null
  }
  return {
    get,
    async findByTicket(ticketId) {
      const rows = await q(`SELECT * FROM soc_assessment_records WHERE "autotaskTicketId" = $1 ORDER BY "createdAt" ASC`, [ticketId])
      return rows.map(fromRow)
    },
    async claim(req) {
      const existing = await get(req.ticketId, req.rcIncidentId)
      if (!existing) {
        try {
          const rows = await q(
            `INSERT INTO soc_assessment_records ("autotaskTicketId","rcIncidentId","companyId","twinKey",status,"claimedAt")
             VALUES ($1,$2,$3,$4,'claimed',$5)
             ON CONFLICT ("autotaskTicketId","rcIncidentId") DO NOTHING
             RETURNING *`,
            [req.ticketId, req.rcIncidentId, req.companyId, req.twinKey, req.now],
          )
          if (rows[0]) return { claimed: true, record: fromRow(rows[0]) }
        } catch (e) {
          // 23505 on idx_soc_assess_twin_primary: another ticket already holds
          // this device + file + detection time. This ticket is its twin.
          if ((e as { code?: string }).code !== '23505') throw e
          const primary = await q(
            `SELECT * FROM soc_assessment_records WHERE "twinKey" = $1 AND "twinOfTicketId" IS NULL LIMIT 1`,
            [req.twinKey],
          )
          const twinOf = primary[0]?.autotaskTicketId ?? null
          const rows = await q(
            `INSERT INTO soc_assessment_records ("autotaskTicketId","rcIncidentId","companyId",status,"twinOfTicketId","claimedAt")
             VALUES ($1,$2,$3,'twin',$4,$5)
             ON CONFLICT ("autotaskTicketId","rcIncidentId") DO NOTHING RETURNING *`,
            [req.ticketId, req.rcIncidentId, req.companyId, twinOf, req.now],
          )
          const rec = rows[0] ? fromRow(rows[0]) : await get(req.ticketId, req.rcIncidentId)
          return { claimed: false, reason: 'twin', record: rec! }
        }
        // Lost an insert race on the same key — fall through with what is there now.
      }
      const current = existing ?? (await get(req.ticketId, req.rcIncidentId))
      const d = claimDecision(current, req)
      if (d !== 'take') return { claimed: false, reason: d, record: current! }
      // Conditional take: only succeeds if nobody else took it since we read.
      const rows = await q(
        `UPDATE soc_assessment_records SET status = 'claimed', "claimedAt" = $3, "updatedAt" = now()
         WHERE "autotaskTicketId" = $1 AND "rcIncidentId" = $2 AND status = $4 AND "claimedAt" = $5
         RETURNING *`,
        [req.ticketId, req.rcIncidentId, req.now, current!.status, current!.claimedAt],
      )
      if (!rows[0]) return { claimed: false, reason: 'in_progress', record: current! }
      return { claimed: true, record: fromRow(rows[0]) }
    },
    async markTwin({ ticketId, rcIncidentId, companyId, twinOfTicketId, now }) {
      await q(
        `INSERT INTO soc_assessment_records ("autotaskTicketId","rcIncidentId","companyId",status,"twinOfTicketId","claimedAt")
         VALUES ($1,$2,$3,'twin',$4,$5)
         ON CONFLICT ("autotaskTicketId","rcIncidentId") DO NOTHING`,
        [ticketId, rcIncidentId, companyId, twinOfTicketId, now],
      )
    },
    async update(ticketId, rcIncidentId, patch) {
      const sets: string[] = []
      const params: unknown[] = [ticketId, rcIncidentId]
      for (const k of UPDATABLE) {
        if (patch[k] === undefined) continue
        params.push(patch[k])
        sets.push(`"${k}" = $${params.length}`)
      }
      if (!sets.length) return
      await q(
        `UPDATE soc_assessment_records SET ${sets.join(', ')}, "updatedAt" = now() WHERE "autotaskTicketId" = $1 AND "rcIncidentId" = $2`,
        params,
      )
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Twin key — derived from the ticket's own detection record, so it is known
// BEFORE any enrichment runs (the claim has to happen first)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * company | device | artifact (hash, else path) | detection minute. Two tickets
 * with the same key are the same detection reported twice (T20260927.0005 and
 * .0006: two signatures, one file, one device, one detection time). Null when
 * any part is missing — twin detection is then simply not applied.
 */
export function twinKeyFromText(companyKey: string | null, text: string): string | null {
  if (!companyKey) return null
  const device = text.match(/\bDevice:\s*([A-Za-z0-9][A-Za-z0-9._-]{1,62})/)?.[1]?.toLowerCase() ?? null
  const hash = text.match(/\b(?:SHA1|SHA256|MD5):\s*([0-9a-f]{32,64})/i)?.[1]?.toLowerCase() ?? null
  const path = text.match(/File Path:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || null
  const epoch = text.match(/Detection Time:\s*(\d{9,13})/i)?.[1] ?? null
  const iso = text.match(/Platform Time:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/i)?.[1] ?? null
  const minute = epoch
    ? new Date((epoch.length > 10 ? parseInt(epoch, 10) : parseInt(epoch, 10) * 1000)).toISOString().slice(0, 16)
    : iso
  const artifact = hash ?? path
  if (!device || !artifact || !minute) return null
  return `${companyKey}|${device}|${artifact}|${minute}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer notify — plan (read-only), then execute
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFY_CLASSES: SocClassification[] = ['suspicious_review', 'confirmed_malicious']

export interface NotifyPlanInput {
  classification: SocClassification
  record: AssessmentRecord
  ticketId: number
  profile: CompanySecurityProfile
  /** soc_config.dry_run — the SOC's own "no Autotask writes" mode. */
  socDryRun: boolean
  ticketResolved: boolean
  switchState?: AutomationSwitchState
}

export type NotifyPlan =
  | { action: 'send'; recipient: { contactId: number; firstName: string | null; name: string | null; setContactFirst: boolean; basis: string }; statusLine: string }
  | { action: 'explain'; reason: string; statusLine: string }
  | { action: 'none'; reason: string; statusLine: string }
  | { action: 'flag_reclassification'; reason: string; statusLine: string }

/** Is this contact usable as a security-update recipient for this ticket? */
function contactProblem(c: SocContactSnapshot | null, ticketCompanyId: number | null): string | null {
  if (!c) return 'the contact record was not found'
  if (!c.isActive) return 'the contact is inactive'
  if (!isSendableEmailAddress(c.emailAddress)) return 'the contact has no usable email address'
  if (ticketCompanyId != null && c.companyID != null && c.companyID !== ticketCompanyId) return 'the contact belongs to a different company'
  return null
}

export async function planCustomerNotify(input: NotifyPlanInput, reads: SocReads): Promise<NotifyPlan> {
  const sw = input.switchState ?? automationSwitchState('soc_auto_customer_notify')
  const rec = input.record

  if (rec.customerNotifyState === 'sent') {
    if (rec.notifiedClassification && rec.notifiedClassification !== input.classification && rec.flaggedClassification !== input.classification) {
      const reason = `The customer was already emailed at ${rec.customerNotifiedAt} when this was "${rec.notifiedClassification}"; it is now "${input.classification}".`
      return { action: 'flag_reclassification', reason, statusLine: `Already sent once (${rec.customerNotifiedAt}). Not re-sent. ${reason} Flagged for a technician.` }
    }
    return { action: 'none', reason: 'already sent for this incident', statusLine: `Already sent once for this incident (${rec.customerNotifiedAt}). Re-runs never email the customer again.` }
  }
  if (rec.status === 'twin') {
    return { action: 'none', reason: 'twin ticket', statusLine: 'Covered by the twin ticket\'s assessment — no separate message.' }
  }
  if (!NOTIFY_CLASSES.includes(input.classification)) {
    return { action: 'none', reason: `classification ${input.classification}`, statusLine: `Not sent — the classification (${input.classification.replace(/_/g, ' ')}) does not call for a customer update.` }
  }
  if (!sw.enabled) {
    const why = sw.source === 'unrecognized_value' ? `${sw.envVar} has an unrecognised value ("${sw.rawValue}"), which is treated as off` : `${sw.envVar} is off`
    return { action: 'none', reason: 'kill switch off', statusLine: `Not sent automatically — ${why}. The message below is ready for a technician to send.` }
  }
  if (input.socDryRun) {
    return { action: 'none', reason: 'soc dry run', statusLine: 'Not sent — the SOC agent is in dry-run mode (no Autotask writes). The message below is what would be sent.' }
  }
  if (input.ticketResolved) {
    return { action: 'none', reason: 'ticket resolved', statusLine: 'Not sent — the ticket is already resolved.' }
  }

  const ticket = await reads.getTicket(input.ticketId)
  if (!ticket) return { action: 'explain', reason: 'The ticket could not be read back from Autotask, so no recipient could be resolved.', statusLine: 'NOT SENT — the ticket could not be read back.' }

  const p = input.profile
  const configured = p.coManaged ? p.itLeadContactId : p.securityContactId
  const configuredWhat = p.coManaged ? 'the co-managed IT lead' : 'the company\'s configured security contact'

  if (ticket.contactID) {
    // A co-managed security handoff goes to the IT lead. If the ticket names
    // somebody else, emailing them a remediation checklist meant for IT would
    // be wrong, and silently replacing the contact is a decision for a person.
    if (p.coManaged && p.itLeadContactId && ticket.contactID !== p.itLeadContactId) {
      const reason = `The ticket's contact (${ticket.contactID}) is not the co-managed IT lead (${p.itLeadContactId}); the handoff is written for the IT lead, so it was not sent to someone else and the contact was not changed.`
      return { action: 'explain', reason, statusLine: `NOT SENT — ${reason}` }
    }
    const c = await reads.getContact(ticket.contactID)
    const problem = contactProblem(c, ticket.companyID)
    if (problem) {
      const reason = `The ticket's contact ${ticket.contactID} cannot receive it: ${problem}.`
      return { action: 'explain', reason, statusLine: `NOT SENT — ${reason}` }
    }
    const name = [c!.firstName, c!.lastName].filter(Boolean).join(' ') || null
    return {
      action: 'send',
      recipient: { contactId: c!.id, firstName: c!.firstName, name, setContactFirst: false, basis: 'the ticket\'s own contact' },
      statusLine: `Sent automatically to ${name ?? `contact ${c!.id}`} (the ticket contact) — see the "Customer emailed" note for the exact text and time.`,
    }
  }

  if (!configured) {
    const reason = `The ticket has no contact and no ${p.coManaged ? 'co-managed IT lead' : 'security contact'} is configured for this company (SOC_COMPANY_OVERRIDES in src/lib/soc/evidence.ts), so there is nobody to send it to.`
    return { action: 'explain', reason, statusLine: `NOT SENT — ${reason}` }
  }
  const c = await reads.getContact(configured)
  const problem = contactProblem(c, ticket.companyID)
  if (problem) {
    const reason = `The ticket has no contact and ${configuredWhat} (contact ${configured}) cannot receive it: ${problem}.`
    return { action: 'explain', reason, statusLine: `NOT SENT — ${reason}` }
  }
  const name = [c!.firstName, c!.lastName].filter(Boolean).join(' ') || null
  return {
    action: 'send',
    recipient: { contactId: c!.id, firstName: c!.firstName, name, setContactFirst: true, basis: configuredWhat },
    statusLine: `Sent automatically to ${name ?? `contact ${c!.id}`} (${configuredWhat}; set as the ticket contact first) — see the "Customer emailed" note for the exact text and time.`,
  }
}

export interface NotifyExecution {
  state: NotifyState
  reason: string
  sentAt: string | null
  outcome: CustomerNoteOutcome | null
  notes: string[]
}

export const CUSTOMER_UPDATE_TITLE = 'Security Alert Update'

/** The internal record of a send: recipient, time, and the exact text. */
export function socAuditNoteBody(ctx: CustomerNoteAuditContext): string {
  return [
    'SOC automatic customer update — sent.',
    `Recipient: ${ctx.contactName ?? 'ticket contact'} <${ctx.to}>`,
    `Sent from: ${ctx.sent.sender}`,
    `Accepted by Microsoft 365 at: ${ctx.sent.acceptedAt} (HTTP ${ctx.sent.httpStatus}; accepted, not a delivery receipt)`,
    `Customer-visible note: ${ctx.noteId}`,
    `Subject: ${ctx.sent.subject}`,
    '',
    'Exact text sent:',
    '---',
    ctx.message,
    '---',
  ].join('\n')
}

export async function executeCustomerNotify(args: {
  plan: NotifyPlan
  writer: SocWriter
  ticketId: number
  message: string
  classification: SocClassification
  record: AssessmentRecord
  now: Date
}): Promise<NotifyExecution> {
  const { plan, writer, ticketId, message } = args
  const notes: string[] = []

  if (plan.action === 'none') {
    return { state: plan.reason === 'already sent for this incident' ? 'sent' : plan.reason === 'kill switch off' || plan.reason === 'soc dry run' ? 'suppressed' : 'not_applicable', reason: plan.reason, sentAt: args.record.customerNotifiedAt, outcome: null, notes }
  }

  if (plan.action === 'flag_reclassification') {
    await writer.createInternalNote(ticketId, 'SOC — Classification changed after customer update', [
      'The SOC re-assessment changed the classification after the customer was already emailed.',
      plan.reason,
      'No second email was sent (the SOC emails a customer at most once per incident). A technician should decide whether the customer needs a correction or follow-up.',
    ].join('\n'))
    notes.push('reclassification flagged')
    return { state: 'sent', reason: plan.reason, sentAt: args.record.customerNotifiedAt, outcome: null, notes }
  }

  const explain = async (reason: string) => {
    // One explanation per distinct reason — a re-run hitting the same wall does
    // not stack another copy of the same note.
    if (args.record.customerNotifyState === 'refused' && args.record.customerNotifyReason === reason) return
    await writer.createInternalNote(ticketId, 'SOC — Customer update NOT sent', [
      'The SOC assessment called for a customer update, but it was NOT sent automatically.',
      `Why: ${reason}`,
      '',
      'Message that would have been sent (a technician can send it as-is):',
      '---',
      message,
      '---',
    ].join('\n'))
    notes.push('explanation posted')
  }

  if (plan.action === 'explain') {
    await explain(plan.reason)
    return { state: 'refused', reason: plan.reason, sentAt: null, outcome: null, notes }
  }

  // Readiness BEFORE touching the ticket: never change who Autotask emails for
  // a message that cannot be sent anyway.
  const deps = writer.customerNoteDeps(socAuditNoteBody)
  const ready = deps.readiness()
  if (!ready.ready) {
    const reason = `The customer email path is not available: ${ready.failure.message}`
    await explain(reason)
    return { state: 'refused', reason, sentAt: null, outcome: null, notes }
  }

  if (plan.recipient.setContactFirst) {
    try {
      await writer.setTicketContact(ticketId, plan.recipient.contactId)
      const after = await writer.getTicket(ticketId)
      if (after?.contactID !== plan.recipient.contactId) throw new Error(`read-back shows contact ${after?.contactID ?? 'none'}`)
      notes.push(`ticket contact set to ${plan.recipient.contactId}`)
    } catch (e) {
      const reason = `Setting the ticket contact to ${plan.recipient.contactId} did not stick (${e instanceof Error ? e.message : String(e)}).`
      await explain(reason)
      return { state: 'refused', reason, sentAt: null, outcome: null, notes }
    }
  }

  const outcome = await deliverCustomerNoteWithEmail(deps, { ticketId, message, title: CUSTOMER_UPDATE_TITLE })
  if (outcome.ok) {
    return { state: 'sent', reason: 'sent', sentAt: outcome.sent.acceptedAt, outcome, notes }
  }
  if (outcome.stage === 'readiness' || outcome.stage === 'precheck') {
    const reason = outcome.stage === 'readiness' ? outcome.failure.message : `pre-send check failed: ${outcome.reason.replace(/_/g, ' ')}`
    await explain(reason)
    return { state: 'refused', reason, sentAt: null, outcome, notes }
  }
  // The note may exist and the email may or may not have gone out: never retry
  // (Graph sendMail is not idempotent). Record it as a send failure so no re-run
  // tries again, and tell a technician.
  const reason = outcome.stage === 'note'
    ? 'Autotask returned no id for the customer-visible note, so the email was not sent.'
    : `The customer-visible note ${outcome.noteId} was posted but the email failed: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`
  await writer.createInternalNote(ticketId, 'SOC — Customer update FAILED', `${reason}\nDo not re-run expecting a resend — the SOC will not retry a send. Contact the customer directly.`)
  return { state: 'send_failed', reason, sentAt: null, outcome, notes }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assessment note — create once, then edit in place
// ─────────────────────────────────────────────────────────────────────────────

export interface NoteWriteResult {
  noteId: number | null
  action: 'created' | 'updated' | 'adopted_and_updated' | 'failed'
  error?: string
}

export async function writeAssessmentNote(writer: SocWriter, args: { ticketId: number; record: AssessmentRecord; body: string }): Promise<NoteWriteResult> {
  try {
    let noteId = args.record.assessmentNoteId
    let adopted = false
    if (!noteId) {
      // Tickets assessed before idempotency existed already carry SOC notes;
      // adopt the newest rather than adding another.
      const legacy = await writer.findLatestAssessmentNote(args.ticketId)
      if (legacy) { noteId = legacy.id; adopted = true }
    }
    if (noteId) {
      const note = await writer.getNote(noteId)
      if (note) {
        // Autotask absorb/merge MOVES notes between tickets (ids unchanged), so
        // edit it on whichever ticket it lives on now.
        await writer.updateNote(note.ticketID, noteId, args.body)
        return { noteId, action: adopted ? 'adopted_and_updated' : 'updated' }
      }
    }
    const created = await writer.createInternalNote(args.ticketId, ASSESSMENT_NOTE_TITLE, args.body)
    return { noteId: created.noteId, action: 'created' }
  } catch (e) {
    return { noteId: args.record.assessmentNoteId, action: 'failed', error: e instanceof Error ? e.message : String(e) }
  }
}
