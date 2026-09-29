import { describe, it, expect, vi } from 'vitest'

const queries = vi.hoisted(() => [] as string[])
vi.mock('@/lib/db-pool', () => ({
  getPool: () => ({ connect: async () => ({ query: async (sql: string) => { queries.push(sql); return { rows: [] } }, release: () => {} }) }),
}))

import {
  claimDecision,
  memoryStore,
  pgStore,
  planCustomerNotify,
  recordingWriter,
  twinKeyFromText,
  writeAssessmentNote,
  isTechnicalContact,
  matchContactsToDeviceUser,
  normalizeUserToken,
  type AssessmentRecord,
  type SocContactSnapshot,
  type SocReads,
} from './delivery'
import { resolveCompanyProfile } from './evidence'
import fixture from './__fixtures__/wilmar-t20260927.json'

const NOW = new Date('2026-09-28T04:52:00.000Z')
function rec(over: Partial<AssessmentRecord> = {}): AssessmentRecord {
  return {
    autotaskTicketId: '1', rcIncidentId: '9', companyId: null, twinKey: null, twinOfTicketId: null, status: 'complete',
    claimedAt: '2026-09-28T04:00:00.000Z', completedAt: '2026-09-28T04:01:00.000Z', incidentId: null, assessmentNoteId: null,
    classification: null, confidence: null, customerNotifyState: null, customerNotifiedAt: null, customerNotifyReason: null,
    notifiedClassification: null, flaggedClassification: null, ...over,
  }
}
const req = (force = false) => ({ ticketId: '1', rcIncidentId: '9', companyId: null, twinKey: null, force, now: NOW })

describe('item 1 — claim decision', () => {
  it('automatic triggers never re-run an assessed or in-progress incident; a manual run re-assesses', () => {
    expect(claimDecision(null, req())).toBe('take')
    expect(claimDecision(rec(), req())).toBe('already_assessed')
    expect(claimDecision(rec(), req(true))).toBe('take')
    expect(claimDecision(rec({ status: 'claimed', claimedAt: '2026-09-28T04:50:00.000Z' }), req())).toBe('in_progress')
    expect(claimDecision(rec({ status: 'claimed', claimedAt: '2026-09-28T04:30:00.000Z' }), req())).toBe('take') // stale claim
    expect(claimDecision(rec({ status: 'failed' }), req())).toBe('take')
    expect(claimDecision(rec({ status: 'twin' }), req())).toBe('twin')
  })
})

describe('twin key', () => {
  const t = fixture.localTickets
  it('the Wilmar twins (two signatures, one file, one device, one detection time) share a key', () => {
    const a = twinKeyFromText('450', `${t[0].title}\n${t[0].description}`)
    const b = twinKeyFromText('450', `${t[1].title}\n${t[1].description}`)
    expect(a).toBe('450|wil0170|fe8dfb62c0b782ee8f36934a810c676ed78958a6|2026-09-27T10:06')
    expect(b).toBe(a)
  })
  it('missing device, artifact or time → no twin key (never a guess)', () => {
    expect(twinKeyFromText('450', 'Device: WIL0170 | 1.2.3.4')).toBeNull()
    expect(twinKeyFromText(null, t[0].description)).toBeNull()
  })
  it('the store makes the second claimant a twin atomically', async () => {
    const s = memoryStore()
    const k = 'k|dev|hash|min'
    const first = await s.claim({ ticketId: 'A', rcIncidentId: '1', companyId: null, twinKey: k, force: false, now: NOW })
    const second = await s.claim({ ticketId: 'B', rcIncidentId: '2', companyId: null, twinKey: k, force: false, now: NOW })
    expect(first.claimed).toBe(true)
    expect(second).toMatchObject({ claimed: false, reason: 'twin' })
    expect((await s.get('B', '2'))?.twinOfTicketId).toBe('A')
  })
})

const profile = resolveCompanyProfile({ autotaskCompanyId: '420', companyName: 'EZ Red', isEnabledForComanaged: false, activeContractNames: [] })
type C = SocContactSnapshot
const NEIL: C = { id: 30683673, companyID: 420, firstName: 'Neil', lastName: 'Cantral', isActive: 1, emailAddress: 'neil@ezred.example.invalid', customerContactRole: 'Yes', receivesEmailNotifications: true }
const EMILY: C = { id: 30683593, companyID: 420, firstName: 'Emily', lastName: 'Armstrong', isActive: 1, emailAddress: 'EmilyArmstrong@ezred.example.invalid', customerContactRole: null, receivesEmailNotifications: true }
const KASIE: C = { id: 30683523, companyID: 420, firstName: 'Kasie', lastName: 'Schmitz', isActive: 1, emailAddress: 'KasieSchmitz@ezred.example.invalid', customerContactRole: null, receivesEmailNotifications: true }
function reads(contacts: C[], ticketContact: number | null = null): SocReads {
  return {
    getTicket: async () => ({ id: 36075, ticketNumber: 'T20260925.0023', title: 't', companyID: 420, contactID: ticketContact }),
    getContact: async (id) => contacts.find((c) => c.id === id) ?? null,
    listCompanyContacts: async () => contacts,
    getNote: async () => null,
    findLatestAssessmentNote: async () => null,
  }
}
const plan = (r: SocReads, o: Partial<Parameters<typeof planCustomerNotify>[0]> = {}) => planCustomerNotify({
  classification: 'suspicious_review', record: rec({ status: 'claimed' }), ticketId: 36075, profile, socDryRun: false, ticketResolved: false,
  switchState: { key: 'soc_auto_customer_notify', envVar: 'SOC_AUTO_CUSTOMER_NOTIFY', enabled: true, source: 'default' },
  deviceLastUser: 'AzureAD\\EmilyArmstrong', ...o,
}, r)

describe('item 8 — who receives it: case A / B / C', () => {
  it('the live T20260925.0023 case: ticket contact Emily, Neil marked Technical → Neil, contact changed first, IT voice', async () => {
    const p = await plan(reads([NEIL, EMILY, KASIE], EMILY.id))
    expect(p.action).toBe('send')
    if (p.action === 'send') expect(p.recipient).toMatchObject({ contactId: NEIL.id, routeCase: 'A', audience: 'it_contact', setContactFirst: true })
  })
  it('the Technical marker is read from the API value "Yes" (and "Technical"), not from Primary Contact or the co-managed flag', async () => {
    expect(isTechnicalContact(NEIL)).toBe(true)
    expect(isTechnicalContact({ ...NEIL, customerContactRole: 'Technical' })).toBe(true)
    expect(isTechnicalContact({ ...NEIL, customerContactRole: 'Primary' })).toBe(false)
    expect(isTechnicalContact({ ...NEIL, customerContactRole: 'No' })).toBe(false) // "No" is the Purchasing option
  })
  it('two Technical contacts → case C, nothing to the customer', async () => {
    expect((await plan(reads([NEIL, { ...KASIE, customerContactRole: 'Yes' }, EMILY]))).action).toBe('explain')
  })
  it('no Technical contact → case B: the last signed-in user when they match exactly one contact, end-user voice', async () => {
    const p = await plan(reads([EMILY, KASIE], null))
    expect(p.action).toBe('send')
    if (p.action === 'send') expect(p.recipient).toMatchObject({ contactId: EMILY.id, routeCase: 'B', audience: 'end_user', setContactFirst: true })
  })
  it('the RMM user matches on email local part or first+last name, never partially', () => {
    expect(normalizeUserToken('AzureAD\\EmilyArmstrong')).toBe('emilyarmstrong')
    expect(matchContactsToDeviceUser('AzureAD\\EmilyArmstrong', [EMILY, KASIE]).map((c) => c.id)).toEqual([EMILY.id])
    expect(matchContactsToDeviceUser('EZRED\\Emily', [EMILY])).toEqual([])
  })
  it('case C: no Technical contact and no / no-match / ambiguous last user → explain, never a guess', async () => {
    expect((await plan(reads([EMILY, KASIE]), { deviceLastUser: null })).action).toBe('explain')
    expect((await plan(reads([EMILY, KASIE]), { deviceLastUser: 'AzureAD\\SomeoneElse' })).action).toBe('explain')
    const twin = { ...KASIE, id: 1, firstName: 'Emily', lastName: 'Armstrong', emailAddress: 'e2@ezred.example.invalid' }
    expect((await plan(reads([EMILY, twin]))).action).toBe('explain')
  })
  it('a Technical contact who cannot receive email (inactive, no address, notifications off) → case C', async () => {
    for (const bad of [{ isActive: 0 }, { emailAddress: null }, { receivesEmailNotifications: false }]) {
      expect((await plan(reads([{ ...NEIL, ...bad }, EMILY]))).action).toBe('explain')
    }
  })
  it('benign / insufficient, kill switch off, SOC dry run, resolved ticket → nothing sent', async () => {
    for (const c of ['likely_false_positive', 'confirmed_false_positive', 'insufficient_data'] as const) {
      expect((await plan(reads([NEIL]), { classification: c })).action).toBe('none')
    }
    expect((await plan(reads([NEIL]), { switchState: { key: 'soc_auto_customer_notify', envVar: 'SOC_AUTO_CUSTOMER_NOTIFY', enabled: false, source: 'env' } })).action).toBe('none')
    expect((await plan(reads([NEIL]), { socDryRun: true })).action).toBe('none')
    expect((await plan(reads([NEIL]), { ticketResolved: true })).action).toBe('none')
  })
  it('already sent → never again; a changed classification is flagged once', async () => {
    expect((await plan(reads([NEIL]), { record: rec({ customerNotifyState: 'sent', notifiedClassification: 'suspicious_review', customerNotifiedAt: 'x' }) })).action).toBe('none')
    expect((await plan(reads([NEIL]), { classification: 'confirmed_malicious', record: rec({ customerNotifyState: 'sent', notifiedClassification: 'suspicious_review', customerNotifiedAt: 'x' }) })).action).toBe('flag_reclassification')
    expect((await plan(reads([NEIL]), { classification: 'confirmed_malicious', record: rec({ customerNotifyState: 'sent', notifiedClassification: 'suspicious_review', flaggedClassification: 'confirmed_malicious', customerNotifiedAt: 'x' }) })).action).toBe('none')
  })
})

describe('the assessment note is edited in place', () => {
  it('adopts the newest pre-existing SOC note instead of adding another', async () => {
    const w = recordingWriter({ seed: { notes: [{ id: 29899627, ticketID: 36101, title: 'SOC Analyst Assessment', description: 'old' }] } })
    const r = await writeAssessmentNote(w, { ticketId: 36101, record: rec(), body: 'new' })
    expect(r).toEqual({ noteId: 29899627, action: 'adopted_and_updated' })
    expect(w.calls).toEqual([{ op: 'updateNote', ticketId: 36101, noteId: 29899627, body: 'new' }])
  })
  it('edits the note on whichever ticket it lives on now (Autotask absorb moves notes)', async () => {
    const w = recordingWriter({ seed: { notes: [{ id: 5, ticketID: 36101, title: 'SOC Analyst Assessment', description: 'old' }] } })
    await writeAssessmentNote(w, { ticketId: 36100, record: rec({ assessmentNoteId: 5 }), body: 'new' })
    expect(w.calls).toEqual([{ op: 'updateNote', ticketId: 36101, noteId: 5, body: 'new' }])
  })
  it('a failed lookup never falls back to creating a second note', async () => {
    const w = recordingWriter({})
    w.getNote = async () => { throw new Error('Autotask 503') }
    const r = await writeAssessmentNote(w, { ticketId: 1, record: rec({ assessmentNoteId: 7 }), body: 'b' })
    expect(r.action).toBe('failed')
    expect(w.calls).toEqual([])
  })
})

describe('the dry-run store never writes', () => {
  it('pgStore({ readOnly: true }) refuses any non-SELECT and never creates its table', async () => {
    queries.length = 0
    const s = pgStore({ readOnly: true })
    await s.get('1', '9')
    await expect(s.update('1', '9', { status: 'complete' })).rejects.toThrow(/read-only/)
    expect(queries.every((q) => /^\s*SELECT/i.test(q))).toBe(true)
  })
})
