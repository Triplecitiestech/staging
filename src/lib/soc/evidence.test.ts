import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join as joinPath } from 'path'
import {
  attributeEvents,
  buildCustomerMessage,
  buildEgressIndex,
  classifyFromEvidence,
  classifyIp,
  detectAutotaskChangeContext,
  detectFleetChangeWindows,
  fitNoteToLimit,
  formatEventGroups,
  NOTE_END,
  NOTE_MAX_CHARS,
  normUser,
  buildAccountChecks,
  deviceUserMatches,
  resolveUserDevices,
  parseSaasAlertsBody,
  saasAlertFacts,
  guardNarrative,
  isVerifiedVisibility,
  lintCustomerMessage,
  resolveCompanyProfile,
  signalFromThreatName,
  type AttributedEvent,
  type EvidenceEventInput,
  type PrimaryDetection,
  type RmmAlertInput,
} from './evidence'
import { isIdentityChangeAlert } from './rules'
import type { SecurityTicket } from './types'

const egress = buildEgressIndex([
  { hostname: 'WIL0170', extIpAddress: '4.39.23.157', siteName: 'Wilmar - Washington' },
  { hostname: 'WIL0178', extIpAddress: '4.39.23.157', siteName: 'Wilmar - Washington' },
  { hostname: 'MOBILE066', extIpAddress: '4.39.23.157', siteName: 'Wilmar - Staging' },
  { hostname: 'MOBILE048', extIpAddress: '98.177.84.232', siteName: 'Wilmar - Staging' },
])

describe('item 6 — IP classification', () => {
  it('RFC1918 is internal and implies no reputation lookup', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.0.136']) {
      const c = classifyIp(ip, egress)
      expect(c.class).toBe('internal')
      expect(c.reputationLookupApplies).toBe(false)
    }
    expect(classifyIp('172.32.0.1', egress).class).toBe('external_unknown')
  })

  it('an address shared by managed devices is the client office connection, named by the site with most devices', () => {
    const c = classifyIp('4.39.23.157', egress)
    expect(c.class).toBe('client_office')
    expect(c.label).toMatch(/^client office connection \(Wilmar - Washington; also reported by 1 device\(s\) in Wilmar - Staging\)/)
    expect(c.reputationLookupApplies).toBe(false)
  })

  it('a single device\'s egress is the client\'s own but NOT called an office', () => {
    const c = classifyIp('98.177.84.232', egress)
    expect(c.class).toBe('client_device_egress')
    expect(c.label).not.toMatch(/office/)
  })

  it('an address on no managed device is unknown — never "clean"', () => {
    const c = classifyIp('203.0.113.9', egress)
    expect(c.class).toBe('external_unknown')
    expect(c.label).toMatch(/unknown/)
  })
})

function alert(uid: string, type: string, ts: string, dev: string, ctx = '', resolved: string | null = null): RmmAlertInput {
  return { alertUid: uid, type, timestampUtc: ts, resolvedOnUtc: resolved, deviceHostname: dev, siteName: 'Site A', contextText: ctx }
}
const INSTALL = "Unhealthy: RocketAgent - Service 'RocketAgent' does not exist"

describe('item 5 — fleet-wide change windows', () => {
  const win = { fromUtc: '2026-09-25T00:00:00.000Z', toUtc: '2026-09-29T00:00:00.000Z' }

  it('clusters simultaneous install alerts across many devices into one window', () => {
    const alerts = Array.from({ length: 12 }, (_, i) => alert(`a${i}`, 'comp_script_ctx', `2026-09-26T19:${String(36 + i).padStart(2, '0')}:00.000Z`, `DEV${i}`, INSTALL))
    const w = detectFleetChangeWindows(alerts, { siteDeviceCounts: { 'Site A': 50 }, ...win })
    expect(w).toHaveLength(1)
    expect(w[0].kind).toBe('agent_install')
    expect(w[0].startUtc).toBe('2026-09-26T19:36:00.000Z')
    expect(w[0].endUtc).toBe('2026-09-26T19:47:00.000Z')
    expect(w[0].deviceCount).toBe(12)
    expect(w[0].label).toMatch(/^coincides with TCT-initiated change \(Site A: security-agent install\/self-heal alerts across 12 devices/)
  })

  it('does not call a handful of devices fleet-wide', () => {
    const alerts = Array.from({ length: 4 }, (_, i) => alert(`a${i}`, 'perf_resource_usage_ctx', `2026-09-28T04:2${i}:00.000Z`, `DEV${i}`, 'type=CPU'))
    expect(detectFleetChangeWindows(alerts, { siteDeviceCounts: { 'Site A': 50 }, ...win })).toEqual([])
  })

  it('a resource spike lasts until the monitors clear (capped), an install does not', () => {
    const alerts = Array.from({ length: 6 }, (_, i) => alert(`c${i}`, 'perf_resource_usage_ctx', `2026-09-28T04:2${i}:00.000Z`, `DEV${i}`, 'type=CPU', '2026-09-28T04:59:00.000Z'))
    alerts.push(alert('late', 'perf_resource_usage_ctx', '2026-09-28T04:25:00.000Z', 'DEVX', 'type=CPU', '2026-09-28T09:00:00.000Z'))
    const w = detectFleetChangeWindows(alerts, { siteDeviceCounts: { 'Site A': 40 }, ...win })
    expect(w[0].endUtc).toBe('2026-09-28T04:59:00.000Z')
  })

  it('a gap longer than 30 minutes splits clusters; alerts outside the window are ignored', () => {
    const a = Array.from({ length: 6 }, (_, i) => alert(`x${i}`, 'comp_script_ctx', `2026-09-26T10:0${i}:00.000Z`, `D${i}`, INSTALL))
    const b = Array.from({ length: 6 }, (_, i) => alert(`y${i}`, 'comp_script_ctx', `2026-09-26T12:0${i}:00.000Z`, `E${i}`, INSTALL))
    const old = Array.from({ length: 6 }, (_, i) => alert(`z${i}`, 'comp_script_ctx', `2026-09-20T12:0${i}:00.000Z`, `F${i}`, INSTALL))
    expect(detectFleetChangeWindows([...a, ...b, ...old], { siteDeviceCounts: { 'Site A': 10 }, ...win })).toHaveLength(2)
  })

  it('Autotask onboarding work is context, and a generic "cutover" ticket is not security-stack work', () => {
    const items = detectAutotaskChangeContext([
      { kind: 'project', id: 55, number: 'P1', title: 'Wilmar Onboarding - Ally (Co-Managed)', status: '1', startUtc: '2026-08-26T00:00:00.000Z', endUtc: '2026-10-05T00:00:00.000Z', lastActivityUtc: null },
      { kind: 'ticket', id: 2, number: 'T2', title: 'GFI Archiver - Upgrade (Microsoft Graph Cutover)', status: '8', startUtc: '2026-09-25T00:00:00.000Z', endUtc: null, lastActivityUtc: '2026-09-25T00:00:00.000Z' },
    ], win)
    expect(items.map((i) => i.id)).toEqual([55])
  })
})

const ALERT: EvidenceEventInput = {
  source: 'RocketCyber', sourceRecordId: '13135962', deviceHostname: 'WIL0170', user: null, ioc: 'abc', timestampUtc: '2026-09-27T10:06:50.000Z', signal: 'malicious', summary: 'the alert', isAlert: true,
}
const SUBJECT = { source: 'RocketCyber' as const, deviceHostname: 'WIL0170', user: null, iocs: ['abc'] }
const WINDOW = detectFleetChangeWindows(
  Array.from({ length: 6 }, (_, i) => alert(`w${i}`, 'perf_resource_usage_ctx', `2026-09-28T04:2${i}:00.000Z`, `D${i}`, 'type=CPU', '2026-09-28T04:55:00.000Z')),
  { siteDeviceCounts: { 'Site A': 30 }, fromUtc: '2026-09-25T00:00:00.000Z', toUtc: '2026-09-29T00:00:00.000Z' },
)
function dispose(e: Partial<EvidenceEventInput>): AttributedEvent {
  const base: EvidenceEventInput = { source: 'Datto EDR', sourceRecordId: 'edr-1', deviceHostname: 'WIL0170', user: null, ioc: null, timestampUtc: '2026-09-27T12:00:00.000Z', signal: 'suspicious', summary: 'x' }
  return attributeEvents([ALERT, { ...base, ...e }], SUBJECT, WINDOW, 'America/Los_Angeles').find((x) => !x.isAlert)!
}

describe('items 2 + 3 — attribution and honest corroboration', () => {
  it('an independent source reporting its own signal about the same device corroborates', () => {
    expect(dispose({}).disposition).toBe('corroboration')
  })
  it('device existence / status / "no findings" is context, never corroboration', () => {
    expect(dispose({ source: 'Datto RMM', signal: 'informational' }).disposition).toBe('context')
    expect(dispose({ source: 'DNSFilter', signal: 'informational' }).disposition).toBe('context')
  })
  it('the same source as the alert is not independent', () => {
    expect(dispose({ source: 'RocketCyber' }).disposition).toBe('context')
  })
  it('a different device is context', () => {
    expect(dispose({ deviceHostname: 'WIL0225' }).disposition).toBe('context')
  })
  it('no record id, no timestamp or no subject → data gap, never counted', () => {
    expect(dispose({ sourceRecordId: null }).disposition).toBe('data_gap')
    expect(dispose({ timestampUtc: null }).disposition).toBe('data_gap')
    expect(dispose({ deviceHostname: null }).disposition).toBe('data_gap')
  })
  it('inside a TCT change window → excluded with the label and a verification step', () => {
    const e = dispose({ timestampUtc: '2026-09-28T04:30:00.000Z' })
    expect(e.disposition).toBe('tct_change')
    expect(e.reason).toMatch(/^coincides with TCT-initiated change \(/)
    expect(e.verification).toMatch(/Confirm with the technician/)
  })
  it('every event carries UTC plus the site\'s local time', () => {
    const e = dispose({})
    expect(e.timestampUtc).toBe('2026-09-27T12:00:00.000Z')
    expect(e.siteLocalTime).toBe('Sun, Sep 27, 2026, 5:00 AM PDT')
  })
})

const PRIMARY: PrimaryDetection = {
  retrieved: true, recordSource: 'RocketCyber', incidentId: '1', threatName: 'Trojan:Win32/NSteal.SA', signal: 'malicious',
  deviceHostname: 'WIL0170', user: null, timestampUtc: '2026-09-27T10:06:50.000Z', actionReported: 'threat source: Quarantine', executionStatus: 'Unknown',
}
const base = { primary: PRIMARY, events: [] as AttributedEvent[], knownBenign: { matched: false, matchedOn: null }, technicianVerified: false, identityChange: false, m365BenignReenrollment: false, uncorroboratedCap: 0.5 }

describe('classification and confidence are computed in code', () => {
  it('uncorroborated signature detection → suspicious_review at the cap, high risk', () => {
    const r = classifyFromEvidence(base)
    expect([r.classification, r.confidence, r.riskLevel]).toEqual(['suspicious_review', 0.5, 'high'])
    expect(r.multiScopeCompromise).toBe(false)
  })
  it('one independent corroborating source → confirmed_malicious 0.75; the same inputs always give the same answer', () => {
    const events = attributeEvents([ALERT, { source: 'Datto EDR', sourceRecordId: 'e1', deviceHostname: 'WIL0170', user: null, ioc: null, timestampUtc: '2026-09-27T11:00:00.000Z', signal: 'malicious', summary: 'x' }], SUBJECT, [], 'UTC')
    const a = classifyFromEvidence({ ...base, events })
    const b = classifyFromEvidence({ ...base, events: [...events].reverse() })
    expect([a.classification, a.confidence]).toEqual(['confirmed_malicious', 0.75])
    expect(b).toEqual(a)
  })
  it('multi-scope compromise needs corroboration on two devices — one is not enough for lockdown', () => {
    const one = attributeEvents([ALERT, { source: 'Datto EDR', sourceRecordId: 'e1', deviceHostname: 'WIL0170', user: null, ioc: null, timestampUtc: '2026-09-27T11:00:00.000Z', signal: 'malicious', summary: 'x' }], SUBJECT, [], 'UTC')
    expect(classifyFromEvidence({ ...base, events: one }).multiScopeCompromise).toBe(false)
    const two = attributeEvents([ALERT,
      { source: 'Datto EDR', sourceRecordId: 'e1', deviceHostname: 'WIL0170', user: null, ioc: null, timestampUtc: '2026-09-27T11:00:00.000Z', signal: 'malicious', summary: 'x' },
      { source: 'Datto EDR', sourceRecordId: 'e2', deviceHostname: 'WIL0225', user: null, ioc: 'abc', timestampUtc: '2026-09-27T11:05:00.000Z', signal: 'malicious', summary: 'same hash elsewhere' },
    ], SUBJECT, [], 'UTC')
    const r = classifyFromEvidence({ ...base, events: two })
    expect(r.multiScopeCompromise).toBe(true)
    expect(r.riskLevel).toBe('critical')
  })
  it('positive benign evidence (known benign) → likely false positive', () => {
    expect(classifyFromEvidence({ ...base, knownBenign: { matched: true, matchedOn: 'path' } }).classification).toBe('likely_false_positive')
  })
  it('no detection record → insufficient data', () => {
    expect(classifyFromEvidence({ ...base, primary: { ...PRIMARY, retrieved: false } }).classification).toBe('insufficient_data')
  })
  it('a concrete signature name is a malicious signal; a rule name is not', () => {
    expect(signalFromThreatName('Trojan:Win32/NSteal.SA')).toBe('malicious')
    expect(signalFromThreatName('Defender Manager - Non-ASR Detection')).toBe('suspicious')
  })
})

describe('item 4 — visibility', () => {
  it('only a verified connection counts as known', () => {
    expect(isVerifiedVisibility('connected')).toBe(true)
    for (const s of ['unverified_mapping', 'not_connected', 'permission_blocked', 'unreachable', 'not_configured', 'not_queried'] as const) {
      expect(isVerifiedVisibility(s)).toBe(false)
    }
  })
})

describe('narrative guard', () => {
  it('drops corroboration claims, percentages and unsupported spread', () => {
    const g = guardNarrative('Defender caught a file. Corroborated by Datto RMM. Confidence 92%. The attacker moved laterally to WIL0225.', { multiScopeCompromise: false })
    expect(g.text).toBe('Defender caught a file.')
    expect(g.removed).toHaveLength(3)
  })
})

describe('item 7 — co-managed profile', () => {
  it('the override table wins and records every basis it saw', () => {
    const p = resolveCompanyProfile({ autotaskCompanyId: '450', companyName: 'Wilmar, LLC', isEnabledForComanaged: true, activeContractNames: ['TCT Ally - 2026 - 2029'] })
    expect(p.coManaged).toBe(true)
    expect(p.coManagedBasis).toMatch(/SOC_COMPANY_OVERRIDES\[450\]; Autotask Companies\.isEnabledForComanaged = true; active contract "TCT Ally - 2026 - 2029"/)
    expect(p.timezone).toBe('America/Los_Angeles')
  })
  it('without an override, the Autotask flag decides and no IT lead is invented', () => {
    const p = resolveCompanyProfile({ autotaskCompanyId: '999', companyName: 'X', isEnabledForComanaged: true, activeContractNames: [] })
    expect(p.coManaged).toBe(true)
    expect(resolveCompanyProfile({ autotaskCompanyId: '999', companyName: 'X', isEnabledForComanaged: null, activeContractNames: [] }).coManaged).toBe(false)
  })
})

describe('item 8 — the customer message', () => {
  const msg = (over: Partial<Parameters<typeof buildCustomerMessage>[0]> = {}) => buildCustomerMessage({
    classification: 'suspicious_review', multiScopeCompromise: false, audience: 'it_contact', lastSignedInUser: 'EmilyArmstrong', companyName: 'Wilmar',
    ticketNumber: 'T1', primary: PRIMARY,
    timezone: 'America/Los_Angeles', containmentDone: [], corroboratedDevices: [], corroboratedUsers: [], ...over,
  })
  it('passes its own lint: no tool names, no percentages, no "image", no lockdown', () => {
    expect(lintCustomerMessage(msg(), { lockdownPermitted: false })).toEqual([])
  })
  it('lockdown language appears only for corroborated multi-device compromise', () => {
    const m = msg({ classification: 'confirmed_malicious', multiScopeCompromise: true, corroboratedDevices: ['wil0170', 'wil0225'] })
    expect(m).toMatch(/stop signing in/)
    expect(lintCustomerMessage(m, { lockdownPermitted: false }).length).toBeGreaterThan(0)
    expect(lintCustomerMessage(m, { lockdownPermitted: true })).toEqual([])
  })
  it('flags a forbidden word and a ticket link that is not a full URL', () => {
    expect(lintCustomerMessage('RocketCyber saw it. Please image the machine.', { lockdownPermitted: false })).toHaveLength(2)
    expect(lintCustomerMessage('See ww14.autotask.net/ticket', { lockdownPermitted: false })).toContain('ticket link is not a full URL: ww14.autotask.net')
  })
  it('is the BODY only — no greeting, no signature, no ticket link (the Autotask template adds those)', () => {
    for (const m of [msg(), msg({ audience: 'end_user' })]) {
      expect(m).not.toMatch(/^Hi |^Hello,/)
      expect(m).not.toMatch(/Triple Cities Tech\s*$/)
      expect(m).not.toMatch(/autotask\.net|Ticket: http/)
      expect(m).not.toMatch(/execution status/i)
    }
  })
  it('IT voice names the device and the last signed-in user — as last signed in, never as owner', () => {
    const m = msg()
    expect(m).toMatch(/EmilyArmstrong was the last user signed in to WIL0170, according to our device monitoring\./)
    expect(m).toMatch(/What we recommend, in this order:\n1\. Check with EmilyArmstrong \(the last user signed in\)/)
    expect(m).not.toMatch(/owner|owns|Find out who uses/)
  })
  it('end-user voice: "the computer you were signed in to", only end-user steps, no admin steps', () => {
    const m = msg({ audience: 'end_user' })
    expect(m).toMatch(/the computer you were signed in to on .* \(the computer labeled WIL0170\)/)
    expect(m).toMatch(/What we need from you:\n1\. Do not open that file/)
    expect(m).not.toMatch(/off the network|forward email|wiped|Find out who uses|sign-ins/)
    expect(lintCustomerMessage(m, { lockdownPermitted: false })).toEqual([])
  })
  it('never prints the raw execution-status field', () => {
    const m = msg({ primary: { ...PRIMARY, executionStatus: 'Unknown.' } })
    expect(m).toMatch(/We have not yet confirmed whether the file was opened or ran before it was caught\./)
    expect(m).not.toMatch(/"Unknown\."/)
  })
})

describe('identity-change detection ignores remediation boilerplate', () => {
  it('RocketCyber\'s "password reset" remediation text does not make a malware alert an identity change', () => {
    const t = { title: 'Defender Detected Trojan:Win32/NSteal.SA on WIL0170', description: 'Description: Known Bad\n\nRemediation: Conduct a password reset across all affected systems', } as SecurityTicket
    expect(isIdentityChangeAlert(t)).toBe(false)
    expect(isIdentityChangeAlert({ ...t, title: 'user@x.com/Respond: Multiple MFA Auth Failure' })).toBe(true)
  })
})


describe('assessment note size (T20260929.0016: a 36,286-char note exceeded Autotask\'s 32,000 limit and was never written)', () => {
  const ctxEvent = (i: number, device = 'ER-001', summary = 'Other RocketCyber detection: Attempted Credential Stealing From lsass.exe'): AttributedEvent => ({
    source: 'RocketCyber', sourceRecordId: `rec-${i}`, deviceHostname: device, user: null, ioc: null,
    timestampUtc: new Date(Date.UTC(2026, 8, 11, 13, i)).toISOString(), signal: 'malicious', summary,
    key: `k${i}`, siteLocalTime: null, siteTimezone: 'America/New_York', attributed: true, missing: [],
    relation: 'same_device', independent: false, changeWindow: null, disposition: 'context',
    reason: 'Reported by the same source that raised the alert (RocketCyber) — not independent.', verification: null,
  })

  it('collapses 100 identical detections on one device into ONE line with the count and first/last time', () => {
    const lines = formatEventGroups(Array.from({ length: 100 }, (_, i) => ctxEvent(i)))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('100 times')
    expect(lines[0]).toContain('2026-09-11T13:00:00Z')
    expect(lines[0]).toContain('#rec-0 … #rec-99')
  })

  it('keeps different devices and different detections as separate lines, in time order', () => {
    const lines = formatEventGroups([ctxEvent(5, 'ER-002'), ctxEvent(1), ctxEvent(2), ctxEvent(3, 'ER-001', 'Other detection: X')])
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('2 times')
    expect(lines[1]).toContain('Other detection: X')
    expect(lines[2]).toContain('ER-002')
  })

  it('a single event renders exactly as before', () => {
    expect(formatEventGroups([ctxEvent(1)])[0]).not.toContain('times,')
  })

  it('trims context lines, never the decision-bearing sections, and keeps the end marker', () => {
    const ctx = Array.from({ length: 2000 }, (_, i) => `- context line ${i} ${'x'.repeat(40)}`)
    const lines = ['HEADER', 'CONTEXT', ...ctx, 'WHY THIS CLASSIFICATION', 'CUSTOMER UPDATE: sent', NOTE_END]
    const out = fitNoteToLimit(lines, 2, 2 + ctx.length)
    expect(out.length).toBeLessThanOrEqual(NOTE_MAX_CHARS)
    expect(NOTE_MAX_CHARS).toBeLessThan(32000)
    expect(out).toContain('WHY THIS CLASSIFICATION')
    expect(out).toContain('CUSTOMER UPDATE: sent')
    expect(out.endsWith(NOTE_END)).toBe(true)
    expect(out).toMatch(/more context line\(s\) omitted to fit Autotask's 32,000-character note limit/)
  })

  it('cuts the note (keeping the end marker) only when trimming context alone cannot fit it', () => {
    const lines = ['HEADER', 'x'.repeat(40000), NOTE_END]
    const out = fitNoteToLimit(lines, 1, 1)
    expect(out.length).toBeLessThanOrEqual(NOTE_MAX_CHARS)
    expect(out.endsWith(NOTE_END)).toBe(true)
  })

  it('leaves a note under the limit byte-identical', () => {
    const lines = ['a', 'b', NOTE_END]
    expect(fitNoteToLimit(lines, 1, 2)).toBe(lines.join('\n'))
  })
})


describe('normUser — built-in accounts never identify a person', () => {
  it('SYSTEM, service, computer and session accounts are not users', () => {
    for (const u of ['NT AUTHORITY\\SYSTEM', 'SYSTEM', 'NT AUTHORITY\\LOCAL SERVICE', 'NETWORK SERVICE', 'CORP\\DOG-006$', 'Window Manager\\DWM-3', 'Font Driver Host\\UMFD-0', '-', 'N/A']) {
      expect(normUser(u)).toBeNull()
    }
  })
  it('real people still match across domain and UPN forms', () => {
    expect(normUser('AzureAD\\EmilyArmstrong')).toBe('emilyarmstrong')
    expect(normUser('emilyarmstrong@ezred.com')).toBe('emilyarmstrong')
  })
})


describe('SaaS Alerts ticket body (T20260930.0005: the SOC kept only the email and said "suspicious event")', () => {
  // Sanitised copy of the real body: account, name and user id replaced.
  const body = readFileSync(joinPath(__dirname, '__fixtures__/saas-alerts-stage3c-body.txt'), 'utf8')

  it('parses what happened, when, from where, with what client, and the rule', () => {
    const b = parseSaasAlertsBody(body)!
    expect(b.activityType).toBe('Admin privilege or app grant - user@example.com')
    expect(b.eventDescription).toMatch(/^Stage 3 IOC\. Privilege assignment, service principal creation or OAuth grant/)
    expect(b.eventDescription).not.toMatch(/Triage:/)
    expect(b.triage).toMatch(/^identify the application or role/)
    expect(b.triage).toMatch(/A password reset alone does not remove an OAuth grant\.$/)
    expect(b.iocTriggeredAtUtc).toBe('2026-09-30T12:35:03Z')
    expect(b.eventTimeUtc).toBe('2026-09-30T12:36:52Z')
    expect(b.ip).toBe('2001:4453:658:2800:cda5:3382:16bb:7e91')
    expect([b.city, b.country, b.ipOwner, b.ipType]).toEqual(['Sariaya', 'Philippines', 'Philippine Long Distance Telephone Company', 'isp'])
    expect(b.ipFlagsTrue).toEqual(['known anonymous'])
    expect(b.userAgent).toBe('google-api-nodejs-client/10.6.2')
    expect(b.deviceStatus).toBe('Incomplete Event Data')
    expect(b.eventId).toBe('20306215703773021')
    expect(b.iocName).toBe('Stage 3c — Privilege and application persistence')
    expect(b.status).toBe('critical')
    expect(b.links.map((l) => l.label)).toEqual(['SaaS Alerts Analysis', 'SaaS Alerts View IOC Trigger Details'])
  })

  it('facts lead with what happened; the non-browser client and incomplete data are called out', () => {
    const f = saasAlertFacts(parseSaasAlertsBody(body)!)
    expect(f[0]).toEqual({ label: 'What happened', value: 'Admin privilege or app grant - user@example.com' })
    const from = f.find((x) => x.label === 'From')!
    expect(from.value).toBe('2001:4453:658:2800:cda5:3382:16bb:7e91 — Sariaya, Philippines (Philippine Long Distance Telephone Company, isp)')
    expect(from.meaning).toMatch(/known anonymous/)
    expect(f.find((x) => x.label === 'Client')!.meaning).toMatch(/Not a web browser/)
    expect(f.find((x) => x.label === 'SaaS Alerts data quality')!.meaning).toMatch(/tenant audit log/)
  })

  it('a browser user agent is not called a script', () => {
    const b = parseSaasAlertsBody(body.replace('google-api-nodejs-client/10.6.2', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0'))!
    expect(saasAlertFacts(b).find((x) => x.label === 'Client')!.meaning).toBeUndefined()
  })

  it('a RocketCyber body is not mistaken for a SaaS Alerts one', () => {
    expect(parseSaasAlertsBody('Defender Detected Trojan on X\nDevice: DOG-006 | 192.168.1.153\nPlatform Time: 2026-09-24T20:57:25.000Z')).toBeNull()
  })
})


describe('account checks — IP vs the account\'s own computer and sign-ins (T20260930.0005)', () => {
  const base = { alertIp: '2001:4453:658:2800:cda5:3382:16bb:7e91', userName: 'user@example.com', fullName: 'Example User', alertTimeUtc: '2026-09-30T12:35:03Z', m365Gap: null }
  const dev = (o: Partial<{ hostname: string; extIpAddress: string | null; lastUser: string | null; lastSeen: string | null; online: boolean | null }>) => ({ hostname: 'TCT-LAP-01', extIpAddress: '112.200.1.2', lastUser: 'AzureAD\\ExampleUser', lastSeen: '2026-09-30T12:40:00Z', online: true, ...o })

  it('matches the account\'s device by UPN local part or compacted full name — never fuzzily', () => {
    expect(deviceUserMatches('AzureAD\\ExampleUser', 'user@example.com', 'Example User')).toBe(true)
    expect(deviceUserMatches('CORP\\user', 'user@example.com', null)).toBe(true)
    expect(deviceUserMatches('AzureAD\\ExampleUserTwo', 'user@example.com', 'Example User')).toBe(false)
    expect(deviceUserMatches('NT AUTHORITY\\SYSTEM', 'system@example.com', null)).toBe(false)
  })

  it('same public IP is stated as a match, with the "current, not historical" limit', () => {
    const f = buildAccountChecks({ ...base, alertIp: '112.200.1.2', devices: [dev({})], privilegeEvents: [], signIns: [] })
    const d = f.find((x) => x.label.startsWith("Account's computer"))!
    expect(d.label).toBe("Account's computer (strong link) — TCT-LAP-01")
    expect(d.meaning).toMatch(/IP check: SAME public IP as the alert\. Datto RMM reports the device's CURRENT public IP, not its IP at the time/)
  })

  it('an IPv6 alert against an IPv4 device is "cannot compare", never "different"', () => {
    const f = buildAccountChecks({ ...base, devices: [dev({})], privilegeEvents: [], signIns: [] })
    const d = f.find((x) => x.label.startsWith("Account's computer"))!
    expect(d.meaning).toMatch(/cannot compare — the alert IP is IPv6 and Datto RMM reports IPv4/)
    expect(d.meaning).not.toMatch(/DIFFERENT/)
  })

  it('no managed device for the account is said plainly', () => {
    const f = buildAccountChecks({ ...base, devices: [dev({ lastUser: 'AzureAD\\Someone' })], privilegeEvents: [], signIns: [] })
    expect(f.find((x) => x.label === "Account's computer")!.value).toBe('No device could be tied to this account')
  })

  it('sign-ins: exact IP match, then same /64 network', () => {
    const exact = buildAccountChecks({ ...base, devices: [], privilegeEvents: [], signIns: [{ time: '2026-09-30T12:30:00Z', ip: base.alertIp, location: 'Sariaya, PH', device: 'Windows', status: 'success' }] })
    expect(exact.find((x) => x.label === 'Sign-ins from the alert IP')!.value).toBe(`1 of 1 sign-in(s) in the window came from ${base.alertIp}`)
    const prefix = buildAccountChecks({ ...base, devices: [], privilegeEvents: [], signIns: [{ time: '2026-09-30T12:30:00Z', ip: '2001:4453:658:2800::99', location: null, device: null, status: 'success' }] })
    expect(prefix.find((x) => x.label === 'Sign-ins from the alert IP')!.value).toMatch(/same \/64 network \(2001:4453:658:2800::\/64\)/)
  })

  it('the tenant\'s own grant record is listed with what was granted', () => {
    const f = buildAccountChecks({ ...base, devices: [], signIns: null, privilegeEvents: [{ time: '2026-09-30T12:35:01.123Z', activity: 'Consent to application', result: 'success', ip: base.alertIp, targets: ['ServicePrincipal: Example Sync App'], details: ['ConsentAction.Permissions: Scope: Mail.Read'] }] })
    const e = f.find((x) => x.label.startsWith('Microsoft 365 audit log —'))!
    expect(e.label).toBe('Microsoft 365 audit log — 2026-09-30T12:35:01Z')
    expect(e.value).toMatch(/^Consent to application \(success\) → ServicePrincipal: Example Sync App from 2001:/)
    expect(e.meaning).toBe('ConsentAction.Permissions: Scope: Mail.Read')
  })

  it('when the tenant was not read, it says so and why', () => {
    const f = buildAccountChecks({ ...base, devices: [], signIns: null, privilegeEvents: null, m365Gap: 'M365 tenant not connected' })
    expect(f[0]).toEqual({ label: 'Microsoft 365 audit log', value: 'Not read', meaning: 'M365 tenant not connected' })
  })
})


describe('resolveUserDevices — every source that ties a device to the account (ELLYSEA, 2026-09-30)', () => {
  const ellysea = { hostname: 'ELLYSEA', extIpAddress: '112.200.1.2', lastUser: 'ELLYSEA\\GhenelU', description: 'Ghenels Personal Computer', lastSeen: null, online: true }
  const other = { hostname: 'TCT-DC01', extIpAddress: '1.2.3.4', lastUser: 'TCT\\admin', description: 'Domain controller', lastSeen: null, online: true }

  it('finds a personal, non-joined computer from its last user AND description — "likely", both bases shown', () => {
    const r = resolveUserDevices({ userName: 'ghenel@example.com', fullName: 'Ghenel Bacalla', rmmDevices: [ellysea, other] })
    expect(r).toHaveLength(1)
    expect(r[0].hostname).toBe('ELLYSEA')
    expect(r[0].strength).toBe('likely')
    expect(r[0].basis).toEqual([
      'Datto RMM last user "ELLYSEA\\GhenelU" begins with "ghenel"',
      'Datto RMM description "Ghenels Personal Computer" names the user',
    ])
  })

  it('an Intune record or a sign-in naming the device is a strong link and is joined to the Datto RMM record by hostname', () => {
    const r = resolveUserDevices({ userName: 'ghenel@example.com', fullName: 'Ghenel Bacalla', rmmDevices: [ellysea],
      managedDevices: [{ deviceName: 'ellysea', operatingSystem: 'Windows', lastSyncDateTime: '2026-09-30T10:00:00.000Z', complianceState: 'compliant' }],
      signInDeviceNames: ['LAPTOP-XYZ'] })
    const e = r.find((x) => x.hostname.toLowerCase() === 'ellysea')!
    expect(e.strength).toBe('strong')
    expect(e.rmm?.extIpAddress).toBe('112.200.1.2')
    const l = r.find((x) => x.hostname === 'LAPTOP-XYZ')!
    expect(l.strength).toBe('strong')
    expect(l.rmm).toBeNull()
  })

  it('short names never match by prefix — "al" does not claim "ALBERTPC\\alex"', () => {
    const r = resolveUserDevices({ userName: 'al@example.com', fullName: 'Al Bo', rmmDevices: [{ ...other, hostname: 'ALBERTPC', lastUser: 'ALBERTPC\\alex', description: 'Albert desk' }] })
    expect(r).toHaveLength(0)
  })
})
