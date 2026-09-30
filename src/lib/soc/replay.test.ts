/**
 * OFFLINE REPLAY of the Wilmar SOC incident — Autotask T20260927.0006 (36101)
 * and its absorbed twin T20260927.0005 (36100), 2026-09-27/28.
 *
 * Runs the REAL pipeline (runTriagePipeline → enrichment → evidence →
 * classification → delivery) against payloads captured read-only on
 * 2026-09-28 (src/lib/soc/__fixtures__/wilmar-t20260927.json — its
 * _provenance block says exactly what was captured and what was reconstructed).
 *
 * NOTHING CAN LEAVE THIS PROCESS:
 *   - global fetch is replaced by a router that serves fixture GETs and records
 *     a VIOLATION for any other method or any unrouted URL (every test asserts
 *     zero violations);
 *   - the Autotask client is a fake whose write methods record a violation;
 *   - Autotask writes and the customer email go through recordingWriter();
 *   - every vendor base URL is on the reserved .invalid TLD;
 *   - the IT lead's address in the fixture is an .invalid placeholder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fixtureJson from './__fixtures__/wilmar-t20260927.json'

const F = fixtureJson as unknown as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const violations = vi.hoisted(() => [] as string[])
const llmScript = vi.hoisted(() => ({ outputs: [] as string[] }))

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'fixture'
  process.env.ROCKETCYBER_API_TOKEN = 'fixture'
  process.env.ROCKETCYBER_API_URL = 'https://rocketcyber.fixture.invalid/v3'
  process.env.DATTO_RMM_API_URL = 'https://rmm.fixture.invalid'
  process.env.DATTO_RMM_API_KEY = 'fixture'
  process.env.DATTO_RMM_API_SECRET = 'fixture'
  process.env.DATTO_EDR_API_TOKEN = 'fixture'
  process.env.DATTO_EDR_API_URL = 'https://edr.fixture.invalid/api'
  process.env.DNSFILTER_API_TOKEN = 'fixture'
  process.env.DNSFILTER_API_URL = 'https://dnsfilter.fixture.invalid/v1'
  delete process.env.SOC_AUTO_CUSTOMER_NOTIFY
  delete process.env.CONNECTOR_CUSTOMER_EMAIL_ENABLED
  delete process.env.CUSTOMER_MAIL_TENANT_ID
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(async () => []),
    $executeRawUnsafe: vi.fn(async (sql: string) => { violations.push(`prisma write attempted: ${String(sql).slice(0, 60)}`); return 0 }),
  },
}))
vi.mock('@/lib/db-pool', () => ({
  getPool: () => ({ connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) }),
}))
vi.mock('@/lib/graph', () => ({ getTenantCredentials: async () => null }))
vi.mock('@/lib/api-usage-tracker', () => ({ trackAnthropicCall: (_op: string, _m: string, fn: () => unknown) => fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: llmScript.outputs.shift() ?? '{"executiveSummary":"","customerImpact":""}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: 'end_turn',
      }),
    }
  },
}))
vi.mock('@/lib/datto-rmm', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/datto-rmm')>()
  // The real client — its request path, mapping and paging all run — minus the
  // OAuth token POST, which the guard would (correctly) refuse.
  ;(mod.DattoRmmClient.prototype as unknown as { getAccessToken: () => Promise<string> }).getAccessToken = async () => 'fixture-token'
  return mod
})
vi.mock('@/lib/saas-alerts', () => ({
  SaasAlertsClient: class {
    isConfigured() { return true }
    missingCredentials() { return [] }
    async getCustomers() { return { customers: F.saasAlerts.customers } }
    async getEvents() { return { events: F.saasAlerts.events } }
  },
}))
vi.mock('@/lib/autotask', () => {
  const at = () => F.autotask
  class AutotaskClient {
    async getCompanyById(id: number) { return id === 450 ? at().company : id === 451 ? { ...at().company, id: 451, companyName: 'Replay Co-Managed Without IT Lead' } : null }
    async listContracts({ companyId }: { companyId?: number }) { return companyId === 450 ? at().contracts : [] }
    async getProjectsByCompany(id: number) { return id === 450 ? at().projects : [] }
    async getCompanyTickets(id: number) { return id === 450 ? at().openTickets : [] }
    async getTicket(id: number) { return at().liveTickets.find((t: { id: number }) => t.id === id) ?? null }
    async getContactById(id: number) { return at().contacts.find((c: { id: number }) => c.id === id) ?? null }
    async getTicketNoteByNoteId() { return null }
    async getTicketNotes() { return [] }
    async createTicketNote() { violations.push('AutotaskClient.createTicketNote'); throw new Error('network write blocked') }
    async updateTicketNote() { violations.push('AutotaskClient.updateTicketNote'); throw new Error('network write blocked') }
    async patchTicket() { violations.push('AutotaskClient.patchTicket'); throw new Error('network write blocked') }
  }
  return {
    AutotaskClient,
    getAutotaskTicketUrl: (id: string) => `https://ww14.autotask.net/Mvc/ServiceDesk/TicketDetail.mvc?TicketId=${id}`,
  }
})

// ── The network guard ──────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function route(url: string): unknown {
  const u = new URL(url)
  const p = u.pathname
  if (u.host === 'rocketcyber.fixture.invalid') {
    if (p === '/v3/incidents') {
      const inc = F.rocketcyber.incidents[u.searchParams.get('id') ?? '']
      return { data: inc ? [inc] : [] }
    }
    const ev = p.match(/^\/v3\/incidents\/(\d+)\/events$/)
    if (ev) return { data: F.rocketcyber.accountEvents }
    const one = p.match(/^\/v3\/incidents\/(\d+)$/)
    if (one) return F.rocketcyber.incidents[one[1]] ?? {}
    if (p === '/v3/events') return { data: F.rocketcyber.accountEvents }
  }
  if (u.host === 'rmm.fixture.invalid') {
    if (p === '/api/v2/account/sites') return { sites: F.dattoRmm.sites, pageDetails: {} }
    const dev = p.match(/^\/api\/v2\/site\/([^/]+)\/devices$/)
    if (dev) return { devices: F.dattoRmm.siteDevices[dev[1]] ?? [], pageDetails: {} }
    const al = p.match(/^\/api\/v2\/site\/([^/]+)\/alerts\/(open|resolved)$/)
    if (al) return { alerts: F.dattoRmm.siteAlerts[al[1]]?.[al[2]] ?? [], pageDetails: { nextPageUrl: null } }
    if (/^\/api\/v2\/device\/[^/]+\/software$/.test(p)) return { software: [] }
  }
  if (u.host === 'edr.fixture.invalid') {
    if (p === '/api/Organizations') return F.dattoEdr.organizations
    if (p === '/api/Alerts') return F.dattoEdr.alerts
  }
  if (u.host === 'dnsfilter.fixture.invalid') {
    if (p === '/v1/organizations') return F.dnsFilter.organizations
    if (p === '/v1/traffic_reports/query_logs') return F.dnsFilter.queryLogs
  }
  return undefined
}
const guardedFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'GET') {
    violations.push(`network ${method} ${url}`)
    throw new Error(`replay guard: ${method} ${url} blocked`)
  }
  const body = route(url)
  if (body === undefined) {
    violations.push(`unrouted GET ${url}`)
    throw new Error(`replay guard: unrouted GET ${url}`)
  }
  return json(body)
})

import { runTriagePipeline } from './engine'
import { prisma } from '@/lib/prisma'
import { memoryStore, recordingWriter, type SocAssessmentStore } from './delivery'
import { lintCustomerMessage } from './evidence'
import { buildCapabilityReport } from '@/lib/connector/capability-registry'
import type { SecurityTicket, SocConfig, TriageResult } from './types'

const CONFIG: SocConfig = {
  agent_enabled: true,
  dry_run: false,
  correlation_window_minutes: 15,
  confidence_auto_close: 0.9,
  confidence_flag_review: 0.7,
  confidence_floor: 0.5,
  max_ai_calls_per_run: 100,
  screening_model: 'screening-model',
  deep_analysis_model: 'narrative-model',
  internal_site_ids: [],
  auto_post_internal_note: true,
  confidence_uncorroborated_cap: 0.5,
  recurring_pattern_threshold: 3,
}
const NOW = new Date(F.now)
const IT_LEAD = 30683760
const AUTOTASK_NOTIFIED_AT = '2026-09-28T04:52:30.000Z'

/** The adversarial LLM: what the incident's 92% run actually claimed. */
const BAD_SCREENING = '{"alertSource":"rocketcyber","category":"malware","extractedIps":["4.39.23.157"],"isFalsePositive":false,"confidence":0.92,"reasoning":"x","needsDeepAnalysis":true,"recommendedAction":"escalate","relatedTicketNumbers":[]}'
const BAD_NARRATIVE_A = JSON.stringify({
  executiveSummary: 'Microsoft Defender detected Trojan:Win32/NSteal.SA on WIL0170. Corroborated by Datto RMM and DNSFilter. The raw events show active adversary lateral movement to WIL0225 and WIL0178. Confidence is 92%.',
  customerImpact: 'Do not use any company accounts until further notice.',
})
const BAD_NARRATIVE_B = JSON.stringify({
  executiveSummary: 'Incident #13135961 (NTask.SD) on an unknown device. Attacker moved laterally. Confidence 50%.',
  customerImpact: 'Multiple devices have been compromised.',
})

function tickets(...ids: string[]): SecurityTicket[] {
  return ids.map((id) => ({ ...F.localTickets.find((t: SecurityTicket) => t.autotaskTicketId === id) }))
}
function seededWriter(opts: { autotaskNotifies?: { at: string } | false } = {}) {
  return recordingWriter({
    seed: { tickets: F.autotask.liveTickets, contacts: F.autotask.contacts },
    autotaskNotifies: opts.autotaskNotifies === undefined ? { at: AUTOTASK_NOTIFIED_AT } : opts.autotaskNotifies,
  })
}
async function replay(ids: string[], rt: { writer?: ReturnType<typeof seededWriter>; store?: SocAssessmentStore; trigger?: 'ingest' | 'manual' | 'cron'; narrative?: string } = {}) {
  llmScript.outputs.push(BAD_SCREENING, rt.narrative ?? BAD_NARRATIVE_A)
  const writer = rt.writer ?? seededWriter()
  const store = rt.store ?? memoryStore()
  const run = await runTriagePipeline(tickets(...ids), CONFIG, [], { trigger: rt.trigger ?? 'ingest', writer, store, persist: false, llm: 'on', now: () => NOW })
  return { run, writer, store, result: run.results[0] as TriageResult | undefined }
}

beforeEach(() => {
  violations.length = 0
  llmScript.outputs.length = 0
  vi.stubGlobal('fetch', guardedFetch)
  delete process.env.SOC_AUTO_CUSTOMER_NOTIFY
})
afterEach(() => {
  expect(violations, `A real network or database write was attempted during the replay: ${violations.join(' | ')}`).toEqual([])
  vi.unstubAllGlobals()
})

describe('Wilmar replay — T20260927.0006 as it stands now (36100 absorbed)', () => {
  it('anchors to ONE incident id and ONE threat name, from the RocketCyber record', async () => {
    const { result } = await replay(['36101'])
    expect(result).toBeDefined()
    expect(result!.enrichment?.primary?.incidentId).toBe('13135962')
    expect(result!.enrichment?.primary?.threatName).toBe('Trojan:Win32/NSteal.SA')
    expect(result!.enrichment?.primary?.recordSource).toBe('RocketCyber')
    // The twin's incident and threat never replace this one's.
    expect(result!.ticketNote).toMatch(/RocketCyber incident 13135962 on ticket T20260927\.0006\s+\|\s+Threat: Trojan:Win32\/NSteal\.SA/)
    expect(result!.ticketNote).not.toMatch(/incident 13135961/)
    // The other account events stay out of "the alert".
    const alertEvents = result!.enrichment!.events!.filter((e) => e.disposition === 'alert')
    expect(alertEvents).toHaveLength(1)
    expect(alertEvents[0].deviceHostname).toBe('WIL0170')
  })

  it('never puts other machines\' RocketCyber events in the note — only this device, or this client\'s devices inside the change window', async () => {
    const { result } = await replay(['36101'])
    const events = result!.enrichment!.events!
    const hosts = new Set(events.map((e) => e.deviceHostname))
    // Not one of this client's managed devices, whatever the time.
    expect(hosts.has('ER-014')).toBe(false)
    expect(hosts.has('LUKE-T-')).toBe(false)
    // One of this client's devices, but weeks outside the change window.
    expect(events.some((e) => e.sourceRecordId === 'a1b2c3d4-0000-4000-8000-000000000170')).toBe(false)
    const note = result!.ticketNote
    expect(note).not.toMatch(/ER-014|LUKE-T-/)
    expect(note).not.toMatch(/a1b2c3d4-0000-4000-8000-000000000170/)
  })

  it('labels 4.39.23.157 as the Wilmar - Washington office connection, and 192.168.0.136 as internal', async () => {
    const { result } = await replay(['36101'])
    const ips = result!.enrichment!.ipClassifications!
    const office = ips.find((i) => i.ip === '4.39.23.157')!
    expect(office.class).toBe('client_office')
    expect(office.label).toMatch(/^client office connection \(Wilmar - Washington/)
    expect(office.reputationLookupApplies).toBe(false)
    const internal = ips.find((i) => i.ip === '192.168.0.136')!
    expect(internal.class).toBe('internal')
    expect(internal.label).toMatch(/RFC1918/)
    expect(result!.ticketNote).toMatch(/4\.39\.23\.157: client office connection \(Wilmar - Washington/)
  })

  it('geolocation uses the PUBLIC office address, never the device\'s 192.168.x LAN address (T20260924.0023)', async () => {
    const { result } = await replay(['36101'])
    const geo = result!.enrichment!.signals!.geo
    expect(geo.alertIp).not.toBe('192.168.0.136')
    if (geo.alertIp) expect(geo.alertIp).not.toMatch(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/)
  })

  it('other devices\' detections outside a TCT change window are ONE summary line, not itemised events', async () => {
    const { result } = await replay(['36101'])
    const events = result!.enrichment!.events!
    const windows = result!.enrichment!.changeWindows ?? []
    const inAWindow = (iso: string | null) => !!iso && windows.some((w) => iso >= w.startUtc && iso <= w.endUtc)
    for (const e of events) {
      if (e.disposition === 'alert' || (e.deviceHostname ?? '').toUpperCase() === 'WIL0170') continue
      if (e.source !== 'RocketCyber') continue
      expect(inAWindow(e.timestampUtc)).toBe(true)
    }
  })

  it('finds both TCT change windows and excludes events inside them from corroboration', async () => {
    const { result } = await replay(['36101'])
    const windows = result!.enrichment!.changeWindows!
    const install = windows.find((w) => w.kind === 'agent_install')!
    expect(install).toBeDefined()
    expect(install.siteName).toBe('Wilmar - Washington')
    expect(install.startUtc <= '2026-09-26T19:37:00.000Z').toBe(true)
    expect(install.endUtc >= '2026-09-26T19:52:00.000Z').toBe(true)
    expect(install.deviceCount).toBeGreaterThanOrEqual(30)
    expect(install.label).toMatch(/^coincides with TCT-initiated change \(Wilmar - Washington: security-agent install\/self-heal alerts across \d+ devices/)

    const scan = windows.find((w) => w.kind === 'resource_spike')!
    expect(scan).toBeDefined()
    expect(scan.startUtc.startsWith('2026-09-28T04:22')).toBe(true)
    expect(scan.endUtc >= '2026-09-28T04:55:00.000Z').toBe(true)
    expect(scan.deviceCount).toBeGreaterThanOrEqual(15)

    // The WIL0225 lsass event at 04:46:51 sits inside the scan window. It has no
    // record id (the capture could not provide one), so it is a data gap — and
    // it still carries the change-window label. Nothing inside a window counts.
    const events = result!.enrichment!.events!
    const wil0225 = events.find((e) => e.deviceHostname === 'WIL0225')!
    expect(wil0225.disposition).toBe('data_gap')
    expect(wil0225.reason).toMatch(/coincides with TCT-initiated change/)
    // WIL0170's own Datto RMM CPU alert inside the scan window is a TCT change.
    const inWindow = events.filter((e) => e.disposition === 'tct_change')
    expect(inWindow.length).toBeGreaterThan(0)
    for (const e of inWindow) expect(e.changeWindow?.label).toMatch(/coincides with TCT-initiated change/)
    expect(events.filter((e) => e.disposition === 'corroboration')).toEqual([])
  })

  it('never says "Corroborated by Datto RMM / DNSFilter" — device existence and 0 blocks are context', async () => {
    const { result } = await replay(['36101'])
    const corr = result!.enrichment!.signals!.corroboration
    expect(corr.sourcesUsed).toEqual([])
    expect(corr.corroboratingTelemetry).toBe(false)
    expect(corr.contextSources).toContain('Datto RMM')
    const note = result!.ticketNote
    expect(note).not.toMatch(/Corroborated by/i)
    expect(note).toMatch(/CORROBORATION[^\n]*\n- None\./)
    expect(note).toMatch(/DNSFilter: 0 blocked queries/)
    // The adversarial AI narrative ("Corroborated by…", "lateral movement", "92%") was dropped.
    expect(note).not.toMatch(/lateral/i)
    expect(note).not.toMatch(/92%/)
    expect(note).toMatch(/AI sentence\(s\) removed/)
  })

  it('shows a visibility map with the sources that were not connected', async () => {
    const { result } = await replay(['36101'])
    const vis = Object.fromEntries(result!.enrichment!.visibility!.map((v) => [v.source, v.state]))
    expect(vis).toEqual({
      'RocketCyber': 'connected',
      'Datto RMM': 'connected',
      'Datto EDR': 'unverified_mapping',
      'DNSFilter': 'unverified_mapping',
      'SaaS Alerts': 'unverified_mapping',
      'M365': 'not_connected',
    })
    expect(result!.ticketNote).toMatch(/VISIBILITY FOR THIS CLIENT[^\n]*\n(- .*\n)*- M365 tenant: not connected for this client — unknown/)
  })

  it('classifies in code: Suspicious, 50%, high risk — the LLM\'s 92% has no effect', async () => {
    const { result } = await replay(['36101'])
    expect(result!.assessment!.classification).toBe('suspicious_review')
    expect(result!.confidence).toBe(0.5)
    expect(result!.assessment!.riskLevel).toBe('high')
  })

  it('routes to the Technical contact (case A) with a containment summary and an ordered handoff — no lockdown language', async () => {
    const { result, writer } = await replay(['36101'])
    const msg = result!.assessment!.customerMessageDraft!
    // Body only: Autotask's template adds the greeting and signature.
    expect(msg.startsWith('Microsoft Defender flagged')).toBe(true)
    expect(msg).not.toMatch(/Triple Cities Tech\s*$/)
    // What happened states Defender's own action; "what we have done" is TCT's only.
    expect(msg).toMatch(/Microsoft Defender flagged a file on the computer WIL0170 as malicious \(Defender's name for it is Trojan:Win32\/NSteal\.SA\) on Sun, Sep 27, 2026, 3:06 AM PDT and reported it as quarantined\./)
    expect(msg).toMatch(/What we have done so far:\n- Reviewed the alert and the computer's recent activity in our monitoring\.\n- We have not disconnected WIL0170 or changed any accounts; those steps are below\./)
    expect(result!.ticketNote).toMatch(/CUSTOMER UPDATE: Posted as a customer-visible note at 2026-09-28T04:52:00\.000Z for Pat \(case A — the company contact marked Customer Contact = Technical; set as the ticket contact first\)\. Autotask emailed the ticket contact\./)
    // A malware detection is not an identity change (RocketCyber's remediation boilerplate says "password reset").
    expect(result!.enrichment!.signals!.identityChange).toBe(false)
    expect(result!.ticketNote).not.toMatch(/Identity\/MFA change/)
    expect(result!.ticketNote).not.toMatch(/GFI Archiver/)
    expect(msg).toMatch(/What we recommend, in this order:\n1\. /)
    expect(msg).toMatch(/\n2\. Keep WIL0170 off the network/)
    expect(msg).toMatch(/set up again, or reply here and we will secure it for you/)
    expect(msg).not.toMatch(/autotask\.net/)
    expect(lintCustomerMessage(msg, { lockdownPermitted: false })).toEqual([])
    expect(msg).not.toMatch(/do not use any company accounts/i)
    // It went to the IT lead: contact set first (the ticket had none), then ONE
    // customer-visible note — Autotask's workflow rule is what emails it.
    expect(writer.calls.filter((c) => c.op === 'setTicketContact')).toEqual([{ op: 'setTicketContact', ticketId: 36101, contactId: IT_LEAD }])
    expect(writer.customerNotes).toHaveLength(1)
    expect(writer.customerNotes[0].body).toBe(msg)
    expect(writer.calls.find((c) => c.op === 'createCustomerNote')).toMatchObject({ publish: 1 })
    // The order matters: the contact must be set BEFORE the note, or Autotask's rule has nobody to email.
    const ops = writer.calls.map((c) => c.op)
    expect(ops.indexOf('setTicketContact')).toBeLessThan(ops.indexOf('createCustomerNote'))
  })

  it('the SOC never sends email itself — its only customer-facing write is the Autotask note', async () => {
    const { writer } = await replay(['36101'])
    const allowed = new Set(['createInternalNote', 'updateNote', 'setTicketContact', 'createCustomerNote'])
    for (const c of writer.calls) expect(allowed.has(c.op)).toBe(true)
  })

  it('records the update in an internal note: contact, note, what Autotask did, and the exact text', async () => {
    const { writer, result } = await replay(['36101'])
    const audit = writer.calls.find((c) => c.op === 'createInternalNote' && c.title === 'SOC — Customer emailed by Autotask')
    expect(audit).toBeDefined()
    const body = (audit as { body: string }).body
    expect(body).toMatch(/Recipient \(ticket contact\): Pat \(Autotask contact 30683760\)/)
    expect(body).toMatch(/Why this person: case A — the company contact marked Customer Contact = Technical/)
    expect(body).toMatch(/Customer-visible note: \d+ \(the exact text sent\)/)
    expect(body).toMatch(/Autotask notification: Autotask recorded a customer notification at 2026-09-28T04:52:30\.000Z/)
    // The note is referenced by id, not repeated.
    expect(body).not.toContain(result!.assessment!.customerMessageDraft!)
  })

  it('when Autotask records no notification, the note says so — it never claims the contact was emailed', async () => {
    const writer = seededWriter({ autotaskNotifies: false })
    const { result } = await replay(['36101'], { writer })
    expect(writer.customerNotes).toHaveLength(1)
    const audit = writer.calls.find((c) => c.op === 'createInternalNote' && c.title === 'SOC — Customer update posted (email not confirmed)')
    expect(audit).toBeDefined()
    const body = (audit as { body: string }).body
    expect(body).toMatch(/email to the contact was NOT confirmed/)
    expect(body).toMatch(/"not seen yet", not "not sent"/)
    expect(body).not.toMatch(/Autotask emailed/)
    expect(result!.ticketNote).toMatch(/Autotask's email was NOT confirmed/)
    // …and a re-run never posts it a second time.
    expect(writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC — Customer emailed by Autotask')).toHaveLength(0)
  })
})

describe('Determinism', () => {
  it('two replays with DIFFERENT LLM output give identical classification, confidence and message text', async () => {
    const a = await replay(['36101'], { narrative: BAD_NARRATIVE_A })
    const b = await replay(['36101'], { narrative: BAD_NARRATIVE_B })
    expect(b.result!.assessment!.classification).toBe(a.result!.assessment!.classification)
    expect(b.result!.confidence).toBe(a.result!.confidence)
    expect(b.result!.assessment!.customerMessageDraft).toBe(a.result!.assessment!.customerMessageDraft)
    expect(b.writer.customerNotes[0].body).toBe(a.writer.customerNotes[0].body)
  })
})

describe('Idempotency — one assessment, one email per incident', () => {
  it('first run: exactly one assessment note and one stubbed send', async () => {
    const { writer } = await replay(['36101'])
    expect(writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC Analyst Assessment')).toHaveLength(1)
    expect(writer.customerNotes).toHaveLength(1)
  })

  it('an ingest retry (the "Round-Trip … timed out" callout) does nothing at all', async () => {
    const writer = seededWriter()
    const store = memoryStore()
    await replay(['36101'], { writer, store })
    const callsAfterFirst = writer.calls.length
    const second = await replay(['36101'], { writer, store, trigger: 'ingest' })
    expect(second.run.results).toHaveLength(0)
    expect(second.run.ticketDetails[0].status).toBe('skipped')
    expect(second.run.ticketDetails[0].reason).toMatch(/Already assessed/)
    expect(writer.calls.length).toBe(callsAfterFirst)
    expect(writer.customerNotes).toHaveLength(1)
  })

  it('a manual re-run EDITS the note in place and sends nothing more', async () => {
    const writer = seededWriter()
    const store = memoryStore()
    const first = await replay(['36101'], { writer, store })
    const noteId = first.result!.delivery!.noteId
    await replay(['36101'], { writer, store, trigger: 'manual' })
    expect(writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC Analyst Assessment')).toHaveLength(1)
    const edits = writer.calls.filter((c) => c.op === 'updateNote')
    expect(edits).toHaveLength(1)
    expect((edits[0] as { noteId: number }).noteId).toBe(noteId)
    expect(writer.customerNotes).toHaveLength(1)
  })

  it('a later run that changes the classification flags a technician instead of emailing again', async () => {
    const writer = seededWriter()
    const store = memoryStore()
    await replay(['36101'], { writer, store })
    const rec = (await store.findByTicket('36101'))[0]
    await store.update('36101', rec.rcIncidentId, { notifiedClassification: 'confirmed_malicious' })
    await replay(['36101'], { writer, store, trigger: 'manual' })
    expect(writer.customerNotes).toHaveLength(1)
    const flags = writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC — Classification changed after customer update')
    expect(flags).toHaveLength(1)
    // …and only once for that classification.
    await replay(['36101'], { writer, store, trigger: 'manual' })
    expect(writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC — Classification changed after customer update')).toHaveLength(1)
  })

  it('the twin race (both tickets open, ingested separately) yields ONE assessment and ONE email', async () => {
    const writer = seededWriter()
    const store = memoryStore()
    const both = tickets('36100', '36101').map((t) => ({ ...t, status: 1, statusLabel: 'New' }))
    for (const t of both) {
      llmScript.outputs.push(BAD_SCREENING, BAD_NARRATIVE_A)
      await runTriagePipeline([t], CONFIG, [], { trigger: 'ingest', writer, store, persist: false, llm: 'on', now: () => NOW })
    }
    expect(writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC Analyst Assessment')).toHaveLength(1)
    expect(writer.customerNotes).toHaveLength(1)
    const twin = (await store.findByTicket('36101'))[0]
    expect(twin.status).toBe('twin')
    expect(twin.twinOfTicketId).toBe('36100')
  })

  it('the twin pair in one batch is grouped: one assessment on the primary, the other recorded as a twin', async () => {
    const writer = seededWriter()
    const store = memoryStore()
    const both = tickets('36100', '36101').map((t) => ({ ...t, status: 1, statusLabel: 'New' }))
    llmScript.outputs.push(BAD_SCREENING, BAD_NARRATIVE_A)
    const run = await runTriagePipeline(both, CONFIG, [], { trigger: 'cron', writer, store, persist: false, llm: 'on', now: () => NOW })
    expect(run.results).toHaveLength(1)
    expect(writer.customerNotes).toHaveLength(1)
    expect((await store.findByTicket('36101'))[0].status).toBe('twin')
    expect(run.results[0].ticketNote).toMatch(/Twin tickets[^\n]*T20260927\.0006 \(incident 13135962, Trojan:Win32\/NSteal\.SA\)/)
  })
})

describe('Deploy safety — tickets analysed before idempotency records existed', () => {
  it('an automatic trigger on T20260927.0006 (legacy analysis row, no record) does nothing — no note, no email', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ one: 1 }] as never)
    const writer = seededWriter()
    const run = await runTriagePipeline(tickets('36101'), CONFIG, [], { trigger: 'ingest', writer, store: memoryStore(), persist: true, llm: 'on', now: () => NOW })
    expect(run.results).toHaveLength(0)
    expect(run.ticketDetails[0].reason).toMatch(/Already assessed before idempotency records existed/)
    expect(writer.calls).toEqual([])
    expect(llmScript.outputs).toEqual([])
  })
})

describe('No recipient, no send', () => {
  it('case C — no Technical contact and no last signed-in user: zero sends, ONE explanation note', async () => {
    const writer = recordingWriter({
      seed: { tickets: [{ id: 36101, ticketNumber: 'T20260927.0006', title: 'x', companyID: 451, contactID: null }], contacts: [] },
    })
    const t = { ...tickets('36101')[0], autotaskCompanyId: '451', companyName: 'Replay Co-Managed Without IT Lead' }
    llmScript.outputs.push(BAD_SCREENING, BAD_NARRATIVE_A)
    const run = await runTriagePipeline([t], CONFIG, [], { trigger: 'ingest', writer, store: memoryStore(), persist: false, llm: 'on', now: () => NOW })
    expect(run.results[0].assessment!.classification).toBe('suspicious_review')
    expect(writer.customerNotes).toHaveLength(0)
    expect(writer.calls.filter((c) => c.op === 'setTicketContact')).toHaveLength(0)
    const explanations = writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC — Customer update NOT sent')
    expect(explanations).toHaveLength(1)
    expect((explanations[0] as { body: string }).body).toMatch(/No contact at this company is marked Customer Contact = Technical, and the device has no last signed-in user/)
  })

  it('does not depend on the Microsoft 365 mail setup — CUSTOMER_MAIL_* unset still posts the Autotask note', async () => {
    // CONNECTOR_CUSTOMER_EMAIL_ENABLED / CUSTOMER_MAIL_* are unset in this test.
    const { writer } = await replay(['36101'])
    expect(writer.customerNotes).toHaveLength(1)
    expect(writer.calls.filter((c) => c.op === 'createInternalNote' && c.title === 'SOC — Customer update NOT sent')).toHaveLength(0)
  })
})

describe('Kill switch SOC_AUTO_CUSTOMER_NOTIFY', () => {
  it('off → zero sends, and the capability report shows it off', async () => {
    process.env.SOC_AUTO_CUSTOMER_NOTIFY = 'off'
    const { writer, result } = await replay(['36101'])
    expect(writer.customerNotes).toHaveLength(0)
    expect(writer.calls.filter((c) => c.op === 'setTicketContact' || c.op === 'createCustomerNote')).toEqual([])
    expect(result!.ticketNote).toMatch(/CUSTOMER UPDATE: Not sent automatically — SOC_AUTO_CUSTOMER_NOTIFY is off/)
    const report = buildCapabilityReport([])
    expect(report.writeGuardrails.killSwitches.SOC_AUTO_CUSTOMER_NOTIFY).toBe(false)
    expect(report.writeGuardrails.automations.find((a) => a.envVar === 'SOC_AUTO_CUSTOMER_NOTIFY')?.enabled).toBe(false)
  })

  it('unset → on (the default), and the report says so', () => {
    delete process.env.SOC_AUTO_CUSTOMER_NOTIFY
    const report = buildCapabilityReport([])
    expect(report.writeGuardrails.killSwitches.SOC_AUTO_CUSTOMER_NOTIFY).toBe(true)
    const a = report.writeGuardrails.automations.find((x) => x.envVar === 'SOC_AUTO_CUSTOMER_NOTIFY')!
    expect(a.enabled).toBe(true)
    expect(a.source).toBe('default')
  })
})

describe('lastSignedInName (the RMM login shown to the customer)', () => {
  it('spaces a run-together name and strips the domain', async () => {
    const { lastSignedInName } = await import('./engine')
    expect(lastSignedInName('AzureAD\\EmilyArmstrong')).toBe('Emily Armstrong')
    expect(lastSignedInName('jsmith')).toBe('jsmith')
    expect(lastSignedInName('CORP\\emily.armstrong')).toBe('emily.armstrong')
    expect(lastSignedInName('emily@ezred.com')).toBe('emily@ezred.com')
    expect(lastSignedInName(null)).toBeNull()
  })
})


describe('Other-device detections and built-in accounts (T20260924.0023: 805 attributed events)', () => {
  const primary = {
    retrieved: true, recordSource: 'RocketCyber', incidentId: '1', threatName: 'Trojan:Script/Wacatac.H!ml', signal: 'malicious' as const,
    deviceHostname: 'DOG-006', user: 'NT AUTHORITY\\SYSTEM', timestampUtc: '2026-09-24T20:57:25Z', actionReported: null, executionStatus: null,
  }
  const lsass = (host: string, iso: string) => ({ hostname: host, threatName: 'Attempted Credential Stealing From lsass.exe', user: 'NT AUTHORITY\\SYSTEM', event_time: iso })
  const rc = {
    otherEvents: [
      lsass('DOGB-001', '2026-09-24T10:00:00.000Z'), lsass('DOGB-001', '2026-09-24T11:00:00.000Z'),
      lsass('DOG-002', '2026-09-24T12:00:00.000Z'), lsass('DOG-006', '2026-09-24T13:00:00.000Z'),
      lsass('NOT-OURS', '2026-09-24T12:00:00.000Z'),
    ],
  }

  it('a SYSTEM-context detection on ANOTHER device is not "the same user" and is not itemised', async () => {
    const { buildEvidenceInputs } = await import('./enrichment')
    const out = buildEvidenceInputs({
      ticket: { ticketNumber: 'T1' } as never, sourceSystem: 'rocketcyber', primary, rocketCyber: rc as never,
      edr: null, dns: null, saas: null, deviceRecord: null, rmmAlerts: [], alertDevice: 'DOG-006',
      clientHostnames: ['DOG-006', 'DOG-002', 'DOGB-001'], changeWindows: [],
    })
    const hosts = out.filter((e) => !e.isAlert).map((e) => e.deviceHostname)
    expect(hosts).toEqual(['DOG-006'])
  })

  it('summarises the rest in one line: count, device count, detection name — this client\'s devices only', async () => {
    const { summarizeOtherDeviceDetections } = await import('./enrichment')
    const line = summarizeOtherDeviceDetections({
      primary, rocketCyber: rc as never, alertDevice: 'DOG-006', clientHostnames: ['DOG-006', 'DOG-002', 'DOGB-001'], changeWindows: [],
    })!
    expect(line).toMatch(/3 detections on 2 other devices/)
    expect(line).toMatch(/Attempted Credential Stealing From lsass\.exe on 2 devices \((DOGB-001, DOG-002|DOG-002, DOGB-001)\)/)
    expect(line).not.toMatch(/NOT-OURS/)
  })

  it('an event inside a DETECTED TCT change window is itemised (labelled later), not summarised', async () => {
    const { buildEvidenceInputs, summarizeOtherDeviceDetections } = await import('./enrichment')
    const changeWindows = [{ fromUtc: '2026-09-24T11:30:00.000Z', toUtc: '2026-09-24T12:30:00.000Z' }]
    const out = buildEvidenceInputs({
      ticket: { ticketNumber: 'T1' } as never, sourceSystem: 'rocketcyber', primary, rocketCyber: rc as never,
      edr: null, dns: null, saas: null, deviceRecord: null, rmmAlerts: [], alertDevice: 'DOG-006',
      clientHostnames: ['DOG-006', 'DOG-002', 'DOGB-001'], changeWindows,
    })
    expect(out.map((e) => e.deviceHostname)).toContain('DOG-002')
    const line = summarizeOtherDeviceDetections({ primary, rocketCyber: rc as never, alertDevice: 'DOG-006', clientHostnames: ['DOG-006', 'DOG-002', 'DOGB-001'], changeWindows })!
    expect(line).toMatch(/2 detections on 1 other device\b/)
  })
})
