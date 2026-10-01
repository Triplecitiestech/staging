/**
 * SOC Evidence Model — deterministic, attributed, and computed in CODE.
 *
 * WHY THIS EXISTS (Wilmar, T20260927.0006 / .0005, 2026-09-27): the analyzer let
 * the LLM decide the verdict and its confidence, so runs on the same inputs
 * disagreed (50% vs 92%), counted "the device exists in Datto RMM" and "DNSFilter
 * blocked 0 queries" as corroboration, read TCT's own fleet-wide agent installs
 * and Defender scans as "active lateral movement", and treated the client's own
 * office IP as an unknown location.
 *
 * Everything that decides the outcome now lives here, as pure functions of their
 * arguments (no I/O, no clock reads): which events are attributed, which are
 * corroboration vs context vs a TCT-initiated change vs a data gap, which IPs
 * are the client's own, what each source could actually see for this client,
 * the classification, the confidence, and the customer message. The LLM only
 * writes a narrative paragraph, and even that passes a guard before it is used.
 *
 * The same inputs therefore always give the same classification, confidence and
 * message text — asserted by src/lib/soc/replay.test.ts.
 */

import { tierFromContractName } from '@/lib/reporting/delivery-economics/analyzer'
import type { RiskLevel, SocClassification } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Sources
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceSourceName =
  | 'RocketCyber'
  | 'Datto RMM'
  | 'Datto EDR'
  | 'DNSFilter'
  | 'SaaS Alerts'
  | 'M365'
  | 'Autotask'

/** Map the analyzer's alertSource enum onto the evidence source that raised it. */
export function alertSourceName(alertSource: string | null | undefined): EvidenceSourceName | null {
  switch (alertSource) {
    case 'rocketcyber': return 'RocketCyber'
    case 'datto_edr': return 'Datto EDR'
    case 'saas_alerts': return 'SaaS Alerts'
    default: return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SITE_TIMEZONE = 'America/New_York'

/** "Sun, Sep 27, 2026, 3:06 AM PDT" in the site's zone, or null when unparseable. */
export function formatLocalTime(utc: string | null | undefined, timezone: string): string | null {
  if (!utc) return null
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(d)
  } catch {
    return null
  }
}

/** Normalise any parseable timestamp (ISO or epoch ms/s) to ISO-8601 UTC, else null. */
export function toIsoUtc(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  let ms: number
  if (typeof v === 'number') ms = v > 1e12 ? v : v * 1000
  else if (typeof v === 'string' && /^\d{9,13}$/.test(v.trim())) {
    const n = parseInt(v.trim(), 10)
    ms = n > 1e12 ? n : n * 1000
  } else if (typeof v === 'string') ms = Date.parse(v)
  else return null
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** ISO without milliseconds, for display. */
export function isoSeconds(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, 'Z')
}

/** "2026-09-28 04:22 UTC" — compact, deterministic. */
export function formatUtcShort(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 6 — IP classification: internal vs the client's own egress vs unknown
// ─────────────────────────────────────────────────────────────────────────────

export type IpClass = 'internal' | 'client_office' | 'client_device_egress' | 'external_unknown'

export interface IpClassification {
  ip: string
  class: IpClass
  label: string
  /** A reputation lookup is meaningless for an internal or client-owned address. */
  reputationLookupApplies: boolean
  sites: string[]
  devices: string[]
}

export interface EgressDeviceInput {
  hostname: string | null
  extIpAddress: string | null
  siteName: string | null
}

export interface EgressEntry {
  /** Sites reporting this address, most devices first. */
  sites: string[]
  devices: string[]
  siteDeviceCounts: Record<string, number>
}

function parseIpv4(ip: string): number[] | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const o = m.slice(1).map(Number)
  return o.every((n) => n >= 0 && n <= 255) ? o : null
}

/** Private/non-routable ranges. RFC1918 is what the task names; loopback, link-local and IPv6 ULA are the same answer. */
export function privateRange(ip: string): 'RFC1918' | 'loopback' | 'link-local' | 'IPv6 unique-local' | null {
  const o = parseIpv4(ip)
  if (o) {
    if (o[0] === 10) return 'RFC1918'
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return 'RFC1918'
    if (o[0] === 192 && o[1] === 168) return 'RFC1918'
    if (o[0] === 127) return 'loopback'
    if (o[0] === 169 && o[1] === 254) return 'link-local'
    return null
  }
  const v6 = ip.trim().toLowerCase()
  if (v6 === '::1') return 'loopback'
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return 'IPv6 unique-local'
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return 'link-local'
  return null
}

/** Build ip → { sites, devices } from the company's Datto RMM devices. Deterministic order. */
export function buildEgressIndex(devices: EgressDeviceInput[]): Map<string, EgressEntry> {
  const acc = new Map<string, { perSite: Map<string, Set<string>>; devices: Set<string> }>()
  for (const d of devices) {
    const ip = (d.extIpAddress || '').trim()
    if (!ip) continue
    const e = acc.get(ip) ?? { perSite: new Map<string, Set<string>>(), devices: new Set<string>() }
    const site = d.siteName || 'site unknown'
    const set = e.perSite.get(site) ?? new Set<string>()
    if (d.hostname) { set.add(d.hostname); e.devices.add(d.hostname) }
    e.perSite.set(site, set)
    acc.set(ip, e)
  }
  const out = new Map<string, EgressEntry>()
  for (const ip of Array.from(acc.keys()).sort()) {
    const e = acc.get(ip)!
    const siteDeviceCounts: Record<string, number> = {}
    for (const [site, set] of e.perSite) siteDeviceCounts[site] = set.size
    const sites = Object.keys(siteDeviceCounts).sort((a, b) => siteDeviceCounts[b] - siteDeviceCounts[a] || a.localeCompare(b))
    out.set(ip, { sites, devices: Array.from(e.devices).sort(), siteDeviceCounts })
  }
  return out
}

function siteText(e: EgressEntry): string {
  const [top, ...rest] = e.sites
  if (!top) return 'site unknown'
  return rest.length ? `${top}; also reported by ${rest.map((s) => `${e.siteDeviceCounts[s]} device(s) in ${s}`).join(', ')}` : top
}

/**
 * An address shared by two or more managed devices is an office connection. One
 * seen from a single device (a laptop at home, typically) is still the client's
 * own and not an anomaly, but it is NOT called an office — that would be a claim
 * the data does not support.
 */
export function classifyIp(ip: string, egress: Map<string, EgressEntry>): IpClassification {
  const range = privateRange(ip)
  if (range) {
    return {
      ip, class: 'internal', reputationLookupApplies: false, sites: [], devices: [],
      label: `internal address (${range}) — no reputation lookup applies`,
    }
  }
  const e = egress.get(ip.trim())
  if (e && e.devices.length >= 2) {
    return {
      ip, class: 'client_office', reputationLookupApplies: false, sites: e.sites, devices: e.devices,
      label: `client office connection (${siteText(e)}) — public address of ${e.devices.length} managed devices; not an anomaly`,
    }
  }
  if (e) {
    return {
      ip, class: 'client_device_egress', reputationLookupApplies: false, sites: e.sites, devices: e.devices,
      label: `public address last reported by managed device ${e.devices[0] ?? 'unknown'} (${siteText(e)}) — the client's own device, likely off-site; not an anomaly`,
    }
  }
  return {
    ip, class: 'external_unknown', reputationLookupApplies: true, sites: [], devices: [],
    label: 'external address not seen on any of this client\'s managed devices — location unknown; reputation not checked (no provider wired in)',
  }
}

const IPV4_RE = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g

/** Every IPv4 in a blob of text/JSON, de-duplicated and sorted (numeric version strings are excluded by the octet check only). */
export function extractIpv4s(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(IPV4_RE)) {
    const ip = m[0]
    // Skip Windows version strings like 10.0.26100 that are not four octets anyway,
    // and 0.0.0.0 placeholders.
    if (ip === '0.0.0.0') continue
    found.add(ip)
  }
  return Array.from(found).sort()
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 4 — Visibility map
// ─────────────────────────────────────────────────────────────────────────────

export type VisibilitySource = 'RocketCyber' | 'Datto RMM' | 'Datto EDR' | 'DNSFilter' | 'SaaS Alerts' | 'M365'

export type VisibilityState =
  | 'connected'
  | 'unverified_mapping'
  | 'not_connected'
  | 'permission_blocked'
  | 'unreachable'
  | 'not_configured'
  | 'not_queried'

export interface VisibilityEntry {
  source: VisibilitySource
  state: VisibilityState
  /** What the source was resolved to for this client (site/org/customer/tenant), or null. */
  mappedTo: string | null
  detail: string
}

export const VISIBILITY_ORDER: VisibilitySource[] = ['RocketCyber', 'Datto RMM', 'Datto EDR', 'DNSFilter', 'SaaS Alerts', 'M365']

const VISIBILITY_WHAT: Record<VisibilitySource, string> = {
  'RocketCyber': 'RocketCyber org',
  'Datto RMM': 'Datto RMM site',
  'Datto EDR': 'Datto EDR org',
  'DNSFilter': 'DNSFilter org',
  'SaaS Alerts': 'SaaS Alerts customer',
  'M365': 'M365 tenant',
}

export function visibilityStateLabel(state: VisibilityState): string {
  switch (state) {
    case 'connected': return 'connected'
    case 'unverified_mapping': return 'matched by company name only — unverified, treated as unknown'
    case 'not_connected': return 'not connected for this client — unknown'
    case 'permission_blocked': return 'connected but permission-blocked — unknown'
    case 'unreachable': return 'lookup failed — unknown'
    case 'not_configured': return 'not configured in TCT\'s integrations — unknown'
    case 'not_queried': return 'not queried for this alert type'
  }
}

/** Only a verified connection can say anything. Everything else is UNKNOWN — never clean. */
export function isVerifiedVisibility(state: VisibilityState): boolean {
  return state === 'connected'
}

export function sortVisibility(entries: VisibilityEntry[]): VisibilityEntry[] {
  const idx = (s: VisibilitySource) => VISIBILITY_ORDER.indexOf(s)
  return [...entries].sort((a, b) => idx(a.source) - idx(b.source))
}

export function formatVisibilityLines(entries: VisibilityEntry[]): string[] {
  return sortVisibility(entries).map((e) =>
    `- ${VISIBILITY_WHAT[e.source]}: ${visibilityStateLabel(e.state)}${e.mappedTo ? ` — ${e.mappedTo}` : ''}${e.detail ? ` (${e.detail})` : ''}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 5 — TCT-initiated change windows
// ─────────────────────────────────────────────────────────────────────────────

export interface RmmAlertInput {
  alertUid: string
  /** alertContext @class, e.g. comp_script_ctx, perf_resource_usage_ctx */
  type: string
  timestampUtc: string
  resolvedOnUtc: string | null
  deviceHostname: string | null
  siteName: string | null
  /** Flattened alertContext text (samples, resource type) used only to categorise. */
  contextText: string
}

export type ChangeKind = 'agent_install' | 'resource_spike' | 'reboot'

export interface ChangeWindow {
  id: string
  kind: ChangeKind
  siteName: string
  startUtc: string
  endUtc: string
  deviceCount: number
  alertCount: number
  /** A few of the alert UIDs that make up the window — the source record ids behind it. */
  sampleAlertIds: string[]
  what: string
  /** "coincides with TCT-initiated change (<what>, <window>)" */
  label: string
  verification: string
}

const AGENT_WORDS = /(rocketagent|rocket agent|dns ?filter|datto|edr|sophos|agent|antivirus|endpoint)/i
const INSTALL_WORDS = /(does not exist|not installed|not found in add\/remove|install|self[- ]?heal|reinstall|is not running|missing)/i

export function classifyRmmAlert(a: RmmAlertInput): ChangeKind | null {
  const t = a.type.toLowerCase()
  if (t === 'perf_resource_usage_ctx') return 'resource_spike'
  if (t.includes('online_offline') || /\breboot/i.test(a.contextText)) return 'reboot'
  if (t === 'comp_script_ctx' && INSTALL_WORDS.test(a.contextText) && AGENT_WORDS.test(a.contextText)) return 'agent_install'
  return null
}

const KIND_WHAT: Record<ChangeKind, (n: number, sample: string) => string> = {
  agent_install: (n, sample) => `security-agent install/self-heal alerts across ${n} devices${sample ? ` (${sample})` : ''}`,
  resource_spike: (n, sample) => `simultaneous resource spikes across ${n} devices${sample ? ` (${sample})` : ''} — the pattern of a fleet-wide scan or update pushed by TCT`,
  reboot: (n) => `simultaneous reboots/offline events across ${n} devices`,
}

const KIND_VERIFY: Record<ChangeKind, string> = {
  agent_install: 'Confirm with the onboarding technician that the security-stack install ran at this time (Datto RMM job history for the site).',
  resource_spike: 'Confirm with the technician that a scan or update was pushed to these devices at this time (Datto RMM job history / Defender scan history).',
  reboot: 'Confirm with the technician that a patch or reboot job ran across these devices at this time.',
}

/** Minimum distinct devices for a pattern to count as fleet-wide at a site. */
export function fleetThreshold(siteDeviceCount: number): number {
  return Math.max(5, Math.ceil(siteDeviceCount * 0.1))
}

/**
 * Gap-cluster RMM alerts per site and kind; keep clusters touching at least the
 * fleet threshold of distinct devices. Deterministic: inputs are sorted first.
 */
export function detectFleetChangeWindows(
  alerts: RmmAlertInput[],
  opts: { siteDeviceCounts: Record<string, number>; fromUtc: string; toUtc: string; gapMinutes?: number },
): ChangeWindow[] {
  const gapMs = (opts.gapMinutes ?? 30) * 60_000
  const from = Date.parse(opts.fromUtc)
  const to = Date.parse(opts.toUtc)
  const groups = new Map<string, Array<RmmAlertInput & { kind: ChangeKind; t: number }>>()
  for (const a of alerts) {
    const kind = classifyRmmAlert(a)
    const t = Date.parse(a.timestampUtc)
    if (!kind || Number.isNaN(t) || t < from || t > to) continue
    const site = a.siteName || 'unknown site'
    const k = `${site}|${kind}`
    const list = groups.get(k) ?? []
    list.push({ ...a, kind, t })
    groups.set(k, list)
  }

  const windows: ChangeWindow[] = []
  for (const key of Array.from(groups.keys()).sort()) {
    const [site, kind] = key.split('|') as [string, ChangeKind]
    const list = groups.get(key)!.sort((a, b) => a.t - b.t || a.alertUid.localeCompare(b.alertUid))
    const clusters: typeof list[] = []
    let cur: typeof list = []
    for (const a of list) {
      if (cur.length && a.t - cur[cur.length - 1].t > gapMs) { clusters.push(cur); cur = [] }
      cur.push(a)
    }
    if (cur.length) clusters.push(cur)

    const threshold = fleetThreshold(opts.siteDeviceCounts[site] ?? 0)
    for (const c of clusters) {
      const devices = new Set(c.map((a) => a.deviceHostname).filter((h): h is string => !!h))
      if (devices.size < threshold) continue
      const start = c[0].t
      let end = c[c.length - 1].t
      // A resource spike lasts until the monitor clears; an install alert's
      // "resolved" is when the agent later became healthy (hours on), so only the
      // spike uses resolution time — capped so one slow clear cannot stretch it.
      if (kind === 'resource_spike') {
        for (const a of c) {
          const r = a.resolvedOnUtc ? Date.parse(a.resolvedOnUtc) : NaN
          if (!Number.isNaN(r) && r > end && r - c[c.length - 1].t <= 60 * 60_000) end = r
        }
      }
      const startUtc = new Date(start).toISOString()
      const endUtc = new Date(end).toISOString()
      const sampleText = kind === 'agent_install'
        ? Array.from(new Set(c.map((a) => (a.contextText.match(/Unhealthy:\s*([^-–]+?)\s*-/i)?.[1] ?? '').trim()).filter(Boolean))).sort().join(', ')
        : kind === 'resource_spike'
          ? Array.from(new Set(c.map((a) => (a.contextText.match(/\b(CPU|Memory|RAM|Disk)\b/i)?.[1] ?? '').toUpperCase()).filter(Boolean))).sort().join('/')
          : ''
      const what = `${site}: ${KIND_WHAT[kind](devices.size, sampleText)}`
      const windowText = `${formatUtcShort(startUtc)} – ${formatUtcShort(endUtc).slice(11)}`
      windows.push({
        id: `rmm:${site}:${kind}:${startUtc}`,
        kind, siteName: site, startUtc, endUtc,
        deviceCount: devices.size, alertCount: c.length,
        sampleAlertIds: c.slice(0, 5).map((a) => a.alertUid),
        what,
        label: `coincides with TCT-initiated change (${what}, ${windowText})`,
        verification: KIND_VERIFY[kind],
      })
    }
  }
  return windows.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.id.localeCompare(b.id))
}

export function windowContaining(tsUtc: string | null, windows: ChangeWindow[]): ChangeWindow | null {
  if (!tsUtc) return null
  const t = Date.parse(tsUtc)
  if (Number.isNaN(t)) return null
  return windows.find((w) => t >= Date.parse(w.startUtc) && t <= Date.parse(w.endUtc)) ?? null
}

export interface AutotaskWorkInput {
  kind: 'project' | 'ticket'
  id: number
  number: string | null
  title: string
  status: string | null
  startUtc: string | null
  endUtc: string | null
  lastActivityUtc: string | null
}

export interface ChangeContextItem extends AutotaskWorkInput {
  label: string
}

// Security-stack / onboarding work only. Deliberately NOT generic words like
// "cutover", "migration" or "upgrade" — a mail-archiver Graph cutover is not a
// change to the endpoints an alert fires on.
const CHANGE_WORK = /(onboard|security[- ]stack|sophos|rocket ?cyber|rocket ?agent|dns ?filter|datto (edr|rmm|av)|\bedr\b|defender|antivirus|endpoint protection|agent (install|deploy|rollout|removal))/i

/**
 * Open Autotask projects/tickets that indicate onboarding or security-stack
 * work active in the window. CONTEXT, not an exclusion window: a six-week
 * project cannot excuse every event inside it — only the precise fleet-wide
 * patterns above exclude anything.
 */
export function detectAutotaskChangeContext(
  work: AutotaskWorkInput[],
  opts: { fromUtc: string; toUtc: string; excludeTicketIds?: number[] },
): ChangeContextItem[] {
  const from = Date.parse(opts.fromUtc)
  const to = Date.parse(opts.toUtc)
  const exclude = new Set(opts.excludeTicketIds ?? [])
  const overlaps = (w: AutotaskWorkInput) => {
    const s = w.startUtc ? Date.parse(w.startUtc) : NaN
    const e = w.endUtc ? Date.parse(w.endUtc) : NaN
    const a = w.lastActivityUtc ? Date.parse(w.lastActivityUtc) : NaN
    const spans = !Number.isNaN(s) && s <= to && (Number.isNaN(e) || e >= from)
    const active = !Number.isNaN(a) && a >= from && a <= to
    return spans || active
  }
  return work
    .filter((w) => !(w.kind === 'ticket' && exclude.has(w.id)))
    .filter((w) => CHANGE_WORK.test(w.title) && overlaps(w))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id)
    .map((w) => ({
      ...w,
      label: `Open TCT ${w.kind} ${w.number ?? w.id} "${w.title}"${w.startUtc ? ` (${w.startUtc.slice(0, 10)} → ${w.endUtc ? w.endUtc.slice(0, 10) : 'open'})` : ''} — onboarding/security-stack work is in progress; verify with its owner before attributing activity to an attacker`,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 2 + 3 — Attributed events and honest corroboration
// ─────────────────────────────────────────────────────────────────────────────

export type EvidenceSignal = 'malicious' | 'suspicious' | 'informational'

export interface EvidenceEventInput {
  source: EvidenceSourceName
  /** The source system's own id for this record. Without it an event cannot corroborate. */
  sourceRecordId: string | null
  deviceHostname: string | null
  user: string | null
  /** Hash, domain or external IP this record is about. */
  ioc: string | null
  timestampUtc: string | null
  /** What the SOURCE ITSELF reported — never inferred from absence. */
  signal: EvidenceSignal
  summary: string
  /** The triggering detection itself. */
  isAlert?: boolean
}

export type Disposition = 'alert' | 'corroboration' | 'context' | 'tct_change' | 'data_gap'

export type Relation = 'the_alert' | 'same_device' | 'same_user' | 'same_ioc' | 'other_device' | 'no_subject'

export interface AttributedEvent extends EvidenceEventInput {
  key: string
  siteLocalTime: string | null
  siteTimezone: string
  attributed: boolean
  missing: string[]
  relation: Relation
  independent: boolean
  changeWindow: { id: string; label: string } | null
  disposition: Disposition
  reason: string
  verification: string | null
}

export interface AlertSubject {
  source: EvidenceSourceName | null
  deviceHostname: string | null
  user: string | null
  iocs: string[]
}

/** WIL0170, wil0170.wilmarcorp.com, WIL0170 | 192.168.0.136 → wil0170 */
export function normHost(h: string | null | undefined): string | null {
  if (!h) return null
  const first = h.split('|')[0].trim().split('.')[0].trim().toLowerCase()
  return first || null
}

/** DOMAIN\user, user@domain → user */
/**
 * Windows built-in principals. Every machine has them, so two events "sharing"
 * one says nothing about a person — matching on SYSTEM made every SYSTEM-context
 * detection on every computer at the client "the same user" as the alert
 * (805 attributed events on T20260924.0023). This is the documented, closed set
 * of well-known service identities, not a list of observed cases.
 */
const NON_PERSON_ACCOUNTS = new Set(['system', 'localsystem', 'local system', 'local service', 'localservice', 'network service', 'networkservice', 'anonymous logon', 'nt authority', 'n/a', 'na', '-', 'unknown', 'none'])

export function normUser(u: string | null | undefined): string | null {
  if (!u) return null
  const s = u.trim().toLowerCase()
  if (!s) return null
  const afterSlash = s.includes('\\') ? s.split('\\').pop()! : s
  const name = afterSlash.split('@')[0]
  if (!name || NON_PERSON_ACCOUNTS.has(name)) return null
  // Computer accounts (HOST$) and per-session system accounts (DWM-3, UMFD-0).
  if (name.endsWith('$') || /^(dwm|umfd)-\d+$/.test(name)) return null
  return name
}

function eventKey(e: EvidenceEventInput): string {
  return `${e.source}:${e.sourceRecordId ?? 'no-id'}:${e.timestampUtc ?? 'no-time'}:${normHost(e.deviceHostname) ?? normUser(e.user) ?? e.ioc ?? 'no-subject'}`
}

/**
 * Attribute and dispose every correlated event. Rules, in order:
 *   1. the triggering detection → alert
 *   2. missing source record id, UTC timestamp, or any subject (device/user/IOC)
 *      → data_gap (listed, never counted)
 *   3. inside a TCT-initiated change window → tct_change (excluded, with the
 *      verification step)
 *   4. an INDEPENDENT source reporting its OWN malicious/suspicious signal about
 *      the same device, user or IOC → corroboration
 *   5. everything else → context (existence, patch state, "0 blocked", other
 *      devices, same-source events) — never raises or lowers confidence
 */
export function attributeEvents(
  inputs: EvidenceEventInput[],
  subject: AlertSubject,
  windows: ChangeWindow[],
  timezone: string,
): AttributedEvent[] {
  const subjDevice = normHost(subject.deviceHostname)
  const subjUser = normUser(subject.user)
  const subjIocs = new Set(subject.iocs.map((i) => i.toLowerCase()))

  const seen = new Set<string>()
  const out: AttributedEvent[] = []
  for (const e of inputs) {
    const key = eventKey(e)
    if (seen.has(key)) continue
    seen.add(key)

    const device = normHost(e.deviceHostname)
    const user = normUser(e.user)
    const ioc = e.ioc ? e.ioc.toLowerCase() : null
    const missing: string[] = []
    if (!e.sourceRecordId) missing.push('source record id')
    if (!e.timestampUtc) missing.push('UTC timestamp')
    if (!device && !user && !ioc) missing.push('device, user or IOC')
    const attributed = missing.length === 0

    const relation: Relation = e.isAlert
      ? 'the_alert'
      : subjDevice && device === subjDevice ? 'same_device'
      : subjUser && user === subjUser ? 'same_user'
      : ioc && subjIocs.has(ioc) ? 'same_ioc'
      : device ? 'other_device'
      : 'no_subject'
    const independent = !!subject.source && e.source !== subject.source
    const win = e.isAlert ? null : windowContaining(e.timestampUtc, windows)

    let disposition: Disposition
    let reason: string
    let verification: string | null = null
    if (e.isAlert) {
      disposition = 'alert'
      reason = 'The detection that raised this ticket.'
    } else if (!attributed) {
      disposition = 'data_gap'
      reason = `Not attributed — missing ${missing.join(', ')}; listed for completeness, never counted.`
      if (win) reason += ` Also ${win.label}.`
    } else if (win) {
      disposition = 'tct_change'
      reason = `${win.label}; excluded from corroboration.`
      const w = windows.find((x) => x.id === win.id)
      verification = w?.verification ?? null
    } else if (
      (e.signal === 'malicious' || e.signal === 'suspicious') &&
      independent &&
      (relation === 'same_device' || relation === 'same_user' || relation === 'same_ioc')
    ) {
      disposition = 'corroboration'
      reason = `${e.source} independently reported a ${e.signal} signal about the ${relation.replace('same_', 'same ')}.`
    } else {
      disposition = 'context'
      reason = e.signal === 'informational'
        ? 'Informational record (existence, status or absence of findings) — context only.'
        : !independent
          ? `Reported by the same source that raised the alert (${e.source}) — not independent.`
          : relation === 'other_device' ? 'About a different device — not the same device, user or IOC.'
          : 'Not tied to the alert\'s device, user or IOC.'
    }

    out.push({
      ...e,
      key,
      siteTimezone: timezone,
      siteLocalTime: formatLocalTime(e.timestampUtc, timezone),
      attributed, missing, relation, independent,
      changeWindow: win ? { id: win.id, label: win.label } : null,
      disposition, reason, verification,
    })
  }
  const order: Disposition[] = ['alert', 'corroboration', 'tct_change', 'context', 'data_gap']
  return out.sort((a, b) =>
    order.indexOf(a.disposition) - order.indexOf(b.disposition) ||
    (a.timestampUtc ?? '').localeCompare(b.timestampUtc ?? '') ||
    a.key.localeCompare(b.key))
}

export function formatEventLine(e: AttributedEvent): string {
  const when = e.timestampUtc ? `${isoSeconds(e.timestampUtc)}${e.siteLocalTime ? ` (${e.siteLocalTime})` : ''}` : 'time unknown'
  const subject = e.deviceHostname || e.user || e.ioc || 'no device'
  return `- ${subject} · ${when} · ${e.source}${e.sourceRecordId ? ` #${e.sourceRecordId}` : ' (no record id)'} · ${e.summary} — ${e.reason}${e.verification ? ` Verify: ${e.verification}` : ''}`
}

/**
 * Collapse repeats: events with the same subject, source, summary and
 * disposition reason render as ONE line with a count and the first/last time.
 * A device that fires the same detection 100 times is one fact, not 100 — and
 * listing each one pushed the note past Autotask's 32,000-character limit, so
 * the write failed and the ticket got no assessment at all (T20260929.0016).
 */
export function formatEventGroups(events: AttributedEvent[]): string[] {
  const groups = new Map<string, AttributedEvent[]>()
  for (const e of events) {
    const subject = (e.deviceHostname || e.user || e.ioc || 'no device').toLowerCase()
    const k = [subject, e.source, e.summary, e.reason, e.verification ?? ''].join('\u0000')
    const g = groups.get(k)
    if (g) g.push(e)
    else groups.set(k, [e])
  }
  const t = (e: AttributedEvent) => (e.timestampUtc ? Date.parse(e.timestampUtc) : Number.POSITIVE_INFINITY)
  return [...groups.values()]
    .map((g) => [...g].sort((a, b) => t(a) - t(b)))
    .sort((a, b) => t(a[0]) - t(b[0]))
    .map((g) => {
      if (g.length === 1) return formatEventLine(g[0])
      const first = g[0]
      const last = g[g.length - 1]
      const at = (e: AttributedEvent) => (e.timestampUtc ? `${isoSeconds(e.timestampUtc)}${e.siteLocalTime ? ` (${e.siteLocalTime})` : ''}` : 'time unknown')
      const subject = first.deviceHostname || first.user || first.ioc || 'no device'
      const ids = g.map((e) => e.sourceRecordId).filter((x): x is string => !!x)
      const idText = ids.length ? ` (records #${ids[0]} … #${ids[ids.length - 1]})` : ''
      return `- ${subject} · ${g.length} times, ${at(first)} to ${at(last)} · ${first.source}${idText} · ${first.summary} — ${first.reason}${first.verification ? ` Verify: ${first.verification}` : ''}`
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 7 — Co-managed awareness (company profile)
// ─────────────────────────────────────────────────────────────────────────────

export interface SocCompanyOverride {
  /** Human label, for review in a diff. */
  label: string
  /** Explicit co-managed flag. Wins over the Autotask field when set. */
  coManaged?: boolean
  /** IANA timezone for local-time rendering. */
  timezone?: string
}

/**
 * Explicit per-company SOC settings, keyed by AUTOTASK company id.
 *
 * Display and timezone only. WHO receives a customer update is NOT decided here:
 * since 2026-09-29 it comes from each contact's "Customer Contact" UDF in
 * Autotask (Technical) or the device's last signed-in user — see
 * planCustomerNotify in delivery.ts. Review additions in the diff.
 */
export const SOC_COMPANY_OVERRIDES: Record<string, SocCompanyOverride> = {
  '450': {
    label: 'Wilmar, LLC — TCT Ally (Co-Managed). Site Wilmar - Washington is in Kent, WA.',
    coManaged: true,
    timezone: 'America/Los_Angeles',
  },
}

export interface CompanySecurityProfile {
  autotaskCompanyId: string | null
  companyName: string | null
  coManaged: boolean
  coManagedBasis: string
  timezone: string
  timezoneBasis: string
}

export function resolveCompanyProfile(input: {
  autotaskCompanyId: string | null
  companyName: string | null
  /** Companies.isEnabledForComanaged, or null when the company could not be read. */
  isEnabledForComanaged: boolean | null
  activeContractNames: string[]
  overrides?: Record<string, SocCompanyOverride>
}): CompanySecurityProfile {
  const table = input.overrides ?? SOC_COMPANY_OVERRIDES
  const ov = input.autotaskCompanyId ? table[input.autotaskCompanyId] : undefined
  const allyContract = input.activeContractNames.find((n) => tierFromContractName(n) === 'comanaged') ?? null

  let coManaged: boolean
  let coManagedBasis: string
  if (ov?.coManaged !== undefined) {
    coManaged = ov.coManaged
    coManagedBasis = `SOC_COMPANY_OVERRIDES[${input.autotaskCompanyId}]`
      + (input.isEnabledForComanaged !== null ? `; Autotask Companies.isEnabledForComanaged = ${input.isEnabledForComanaged}` : '')
      + (allyContract ? `; active contract "${allyContract}"` : '')
  } else if (input.isEnabledForComanaged === true) {
    coManaged = true
    coManagedBasis = 'Autotask Companies.isEnabledForComanaged = true' + (allyContract ? `; active contract "${allyContract}"` : '')
  } else {
    coManaged = false
    coManagedBasis = input.isEnabledForComanaged === false
      ? 'Autotask Companies.isEnabledForComanaged = false'
      : 'co-managed flag could not be read — treated as not co-managed'
  }
  return {
    autotaskCompanyId: input.autotaskCompanyId,
    companyName: input.companyName,
    coManaged,
    coManagedBasis,
    timezone: ov?.timezone ?? DEFAULT_SITE_TIMEZONE,
    timezoneBasis: ov?.timezone ? 'SOC_COMPANY_OVERRIDES' : 'TCT default (no site timezone configured)',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification + confidence — computed in code
// ─────────────────────────────────────────────────────────────────────────────

export interface PrimaryDetection {
  /** The detection record was obtained (from the source API, or its own notification). */
  retrieved: boolean
  recordSource: string
  incidentId: string | null
  threatName: string | null
  signal: EvidenceSignal
  deviceHostname: string | null
  user: string | null
  timestampUtc: string | null
  actionReported: string | null
  executionStatus: string | null
}

export interface ClassificationInput {
  primary: PrimaryDetection
  events: AttributedEvent[]
  knownBenign: { matched: boolean; matchedOn: string | null }
  technicianVerified: boolean
  identityChange: boolean
  m365BenignReenrollment: boolean
  uncorroboratedCap: number
}

export interface ClassificationResult {
  classification: SocClassification
  confidence: number
  riskLevel: RiskLevel
  rationale: string[]
  corroboratingSources: string[]
  corroborationCount: number
  corroboratedDevices: string[]
  corroboratedUsers: string[]
  /** Lockdown language is allowed only when this is true. */
  multiScopeCompromise: boolean
}

const SIGNATURE_FAMILY = /^(trojan|backdoor|ransom|pws|hacktool|virtool|exploit|worm|spyware|behavior|trojandownloader|trojandropper|virus|adware|pua)[:/]/i

/** A concrete-signature detection name (e.g. Trojan:Win32/NSteal.SA) is a malicious signal from the source. */
export function signalFromThreatName(threatName: string | null, bodyText = ''): EvidenceSignal {
  if (threatName && SIGNATURE_FAMILY.test(threatName.trim())) return 'malicious'
  if (/known bad|concrete signature/i.test(bodyText)) return 'malicious'
  return 'suspicious'
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function classifyFromEvidence(input: ClassificationInput): ClassificationResult {
  const corroborations = input.events.filter((e) => e.disposition === 'corroboration')
  const sources = Array.from(new Set(corroborations.map((e) => e.source))).sort()
  const devices = new Set(corroborations.map((e) => normHost(e.deviceHostname)).filter((x): x is string => !!x))
  const users = new Set(corroborations.map((e) => normUser(e.user)).filter((x): x is string => !!x))
  // The alert's own device counts as a compromised device only once something
  // independent corroborated it.
  const alertDevice = normHost(input.primary.deviceHostname)
  if (alertDevice && corroborations.some((e) => e.relation === 'same_device')) devices.add(alertDevice)
  const alertUser = normUser(input.primary.user)
  if (alertUser && corroborations.some((e) => e.relation === 'same_user')) users.add(alertUser)
  const multiScopeCompromise = devices.size >= 2 || users.size >= 2
  const rationale: string[] = []
  const base = {
    corroboratingSources: sources,
    corroborationCount: corroborations.length,
    corroboratedDevices: Array.from(devices).sort(),
    corroboratedUsers: Array.from(users).sort(),
    multiScopeCompromise,
  }

  const positiveBenign = input.knownBenign.matched || input.technicianVerified || input.m365BenignReenrollment
  if (positiveBenign && corroborations.length === 0) {
    if (input.knownBenign.matched) {
      rationale.push(`Matches a Known Benign catalogue entry (matched on ${input.knownBenign.matchedOn ?? 'artifact'}) and nothing independent contradicts it.`)
      const hash = input.knownBenign.matchedOn === 'hash'
      return { ...base, classification: hash ? 'confirmed_false_positive' : 'likely_false_positive', confidence: hash ? 0.9 : 0.8, riskLevel: hash ? 'none' : 'low', rationale }
    }
    if (input.technicianVerified) {
      rationale.push('Source IP verified as a TCT technician device and nothing independent contradicts it.')
      return { ...base, classification: 'likely_false_positive', confidence: 0.8, riskLevel: 'low', rationale }
    }
    rationale.push('The client\'s own Microsoft 365 tenant confirms a benign re-enrollment (method removed and a strong method re-registered).')
    return { ...base, classification: 'likely_false_positive', confidence: 0.75, riskLevel: 'low', rationale }
  }

  if (!input.primary.retrieved) {
    rationale.push(`The detection record could not be retrieved (${input.primary.recordSource}); there is nothing to classify beyond the ticket title.`)
    return { ...base, classification: 'insufficient_data', confidence: 0.3, riskLevel: 'medium', rationale }
  }

  if (input.primary.signal === 'informational' && corroborations.length === 0) {
    rationale.push(`${input.primary.recordSource} reported a user-level event${input.primary.threatName ? ` (${input.primary.threatName})` : ''}, not a detection, and no independent source reported anything about this device, user or IOC.`)
    return { ...base, classification: 'likely_false_positive', confidence: 0.6, riskLevel: 'low', rationale }
  }

  if (corroborations.length > 0) {
    rationale.push(`${corroborations.length} independent, attributed signal(s) from ${sources.join(', ')} about the same device, user or IOC.`)
    if (multiScopeCompromise) rationale.push(`Corroborated on ${devices.size} device(s) / ${users.size} account(s).`)
    const confidence = round2(Math.min(0.95, 0.6 + 0.15 * sources.length))
    return { ...base, classification: 'confirmed_malicious', confidence, riskLevel: multiScopeCompromise ? 'critical' : 'high', rationale }
  }

  rationale.push(
    `${input.primary.recordSource} reported ${input.primary.signal === 'malicious' ? 'a concrete-signature (known bad) detection' : 'a suspicious event'}${input.primary.threatName ? ` (${input.primary.threatName})` : ''}; no independent source corroborated it.`,
  )
  if (input.identityChange) rationale.push('Identity or access change (MFA, role or app grant) with no positive benign evidence — confirm with the user before closing.')
  const tctChanges = input.events.filter((e) => e.disposition === 'tct_change').length
  if (tctChanges > 0) rationale.push(`${tctChanges} correlated event(s) fell inside TCT-initiated change windows and were excluded.`)
  return {
    ...base,
    classification: 'suspicious_review',
    confidence: round2(input.uncorroboratedCap),
    riskLevel: input.primary.signal === 'malicious' ? 'high' : 'medium',
    rationale,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative guard — the LLM describes, it does not decide
// ─────────────────────────────────────────────────────────────────────────────

const UNSUPPORTED_IF_NOT_MULTI = [
  /lateral(ly)?\s+mov/i,
  /moved\s+laterally/i,
  /(active|ongoing)\s+(adversary|attacker|attack|intrusion|compromise|incident)/i,
  /multiple\s+(devices|computers|machines|accounts|systems)\s+(are|were|have been|may be)\s+(compromised|infected)/i,
  /spread\s+to\s+(other|additional|more)/i,
]
const ALWAYS_UNSUPPORTED = [
  /corroborat/i, // corroboration is stated by code, from dispositions, never by the model
  /\b\d{1,3}\s?%/, // confidence is computed in code
]

/**
 * Drop sentences that assert something the evidence does not support. Returns
 * the kept text and what was removed, so the note can say so.
 */
export function guardNarrative(text: string, opts: { multiScopeCompromise: boolean }): { text: string; removed: string[] } {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)
  const kept: string[] = []
  const removed: string[] = []
  for (const s of sentences) {
    if (!s) continue
    const bad = ALWAYS_UNSUPPORTED.some((r) => r.test(s)) || (!opts.multiScopeCompromise && UNSUPPORTED_IF_NOT_MULTI.some((r) => r.test(s)))
    ;(bad ? removed : kept).push(s)
  }
  return { text: kept.join(' '), removed }
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 8 — Customer message (deterministic template)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Who the customer update is written for (owner design, 2026-09-29):
 *   it_contact — the company contact marked Customer Contact = Technical; an IT reader.
 *   end_user   — the device's last signed-in user, matched to exactly one contact; plain language,
 *                only things an end user can do.
 */
export type CustomerAudience = 'it_contact' | 'end_user'

export interface CustomerMessageInput {
  classification: SocClassification
  multiScopeCompromise: boolean
  audience: CustomerAudience
  /** The device's last signed-in user, as a person's name when it matched a contact (else the raw RMM value). */
  lastSignedInUser: string | null
  companyName: string | null
  ticketNumber: string
  primary: PrimaryDetection
  /** Site time zone, so the customer reads their own local time. */
  timezone: string
  /** Containment steps TCT has ACTUALLY taken (from the ticket record), plain language. Never the AV's own action. */
  containmentDone: string[]
  corroboratedDevices: string[]
  corroboratedUsers: string[]
}

/** Words the customer message must never contain. Asserted by tests. */
export const CUSTOMER_MESSAGE_FORBIDDEN: RegExp[] = [
  /rocket\s?cyber/i, /datto/i, /dns\s?filter/i, /saas alerts/i, /autotask/i, /\bRMM\b/, /\bEDR\b/,
  /confidence/i, /\d+\s?%/, /\bimag(e|ing)\b/i, /lateral/i,
  /do not use any company accounts/i, /stop using (all|every|any) (company )?accounts/i,
]

/** Lockdown phrases — allowed only when compromise across devices/accounts is corroborated. */
export const LOCKDOWN_PATTERNS: RegExp[] = [
  /stop using/i, /stop signing in/i, /do not use/i, /don't use/i, /all staff/i, /everyone/i, /company-wide/i, /disconnect (all|every)/i,
]

function executionSentence(p: PrimaryDetection): string {
  // Plain language only. The raw value ("Unknown.", "Blocked", …) is a vendor field, not a sentence.
  const exec = (p.executionStatus || '').toLowerCase().replace(/[^a-z]/g, '')
  if (/^(blocked|prevented|notexecuted)$/.test(exec)) return 'It was stopped before it could run.'
  return 'We have not yet confirmed whether the file was opened or ran before it was caught.'
}

/**
 * Build the customer update — the BODY only. Autotask's notification template
 * (80076 "SOC - Security Alert Update (Ticket Contact)") adds the greeting, the
 * ticket summary and the signature, so none of those appear here, and the
 * subject already carries the ticket number. Plain American English,
 * evidence-scaled, no internal tool names, no percentages, and two voices:
 *   - it_contact: names the device and the last signed-in user, gives an ordered
 *     remediation handoff with admin steps.
 *   - end_user: "the computer you were signed in to", asks only for what an end
 *     user can do.
 * It never directs end users company-wide unless compromise across several
 * devices or accounts is corroborated.
 */
export function buildCustomerMessage(m: CustomerMessageInput): string {
  const p = m.primary
  const device = p.deviceHostname
  const local = formatLocalTime(p.timestampUtc, m.timezone)
  const action = /quarantin/i.test(p.actionReported || '') ? ' and reported it as quarantined' : ''
  const lines: string[] = []

  if (m.audience === 'end_user') {
    if (device) {
      lines.push(`Our security monitoring flagged a file on the computer you were signed in to${local ? ` on ${local}` : ''} (the computer labeled ${device}). Microsoft Defender identified it as malicious${action}. ${executionSentence(p)}`)
    } else {
      lines.push(`Our security monitoring flagged activity on your account${local ? ` on ${local}` : ''} that we could not confirm as expected.`)
    }
    lines.push('We have no signs that this has spread, and we are looking into it now.')
    lines.push('')
    lines.push('What we need from you:')
    const steps = device
      ? [
          'Do not open that file or attachment again, and do not click any links in the message it came with.',
          'Reply to this email and tell us whether you opened an attachment or clicked a link, and whether you typed your password into any page afterward.',
          'If you did enter your password anywhere, reply right away so we can help you secure your account.',
        ]
      : [
          'Reply to this email and tell us whether you did this yourself.',
          'If you did not, reply right away so we can help you secure your account.',
        ]
    steps.forEach((s2, i2) => lines.push(`${i2 + 1}. ${s2}`))
    lines.push('')
    lines.push('You do not need to do anything else. We will follow up if we need anything more.')
    return lines.join('\n')
  }

  // IT contact.
  if (device) {
    const detected = p.threatName
      ? `Microsoft Defender flagged a file on the computer ${device} as malicious (Defender's name for it is ${p.threatName})`
      : `A security alert was raised for the computer ${device}`
    lines.push(`${detected}${local ? ` on ${local}` : ''}${action}. ${executionSentence(p)}`)
    if (m.lastSignedInUser) lines.push(`${m.lastSignedInUser} was the last user signed in to ${device}, according to our device monitoring.`)
  } else if (p.user) {
    lines.push(`We received a security alert about the account ${p.user}${local ? ` on ${local}` : ''} that we could not confirm as expected activity.`)
  } else {
    lines.push('We received a security alert for your environment that we could not confirm as expected activity.')
  }
  if (m.classification === 'confirmed_malicious' && m.multiScopeCompromise) {
    const scope = [
      m.corroboratedDevices.length > 1 ? `${m.corroboratedDevices.length} computers (${m.corroboratedDevices.map((d) => d.toUpperCase()).join(', ')})` : null,
      m.corroboratedUsers.length > 1 ? `${m.corroboratedUsers.length} accounts` : null,
    ].filter(Boolean).join(' and ')
    lines.push(`A second, separate security system confirmed related problems on ${scope}, so this is not limited to one computer.`)
  } else {
    lines.push('So far we have no confirmed signs that this has spread to other computers or accounts.')
  }
  lines.push('')

  lines.push('What we have done so far:')
  const done = [...m.containmentDone, `Reviewed the alert and the ${device ? 'computer\'s' : 'account\'s'} recent activity in our monitoring.`]
  for (const d of done) lines.push(`- ${d}`)
  if (m.containmentDone.length === 0) {
    lines.push(device
      ? `- We have not disconnected ${device} or changed any accounts; those steps are below.`
      : '- We have not changed the account; the steps are below.')
  }
  lines.push('')

  const steps: string[] = []
  const user = m.lastSignedInUser ? `${m.lastSignedInUser} (the last user signed in)` : null
  if (m.classification === 'confirmed_malicious' && m.multiScopeCompromise) {
    steps.push(`Keep the affected computers (${m.corroboratedDevices.map((d) => d.toUpperCase()).join(', ') || device || 'listed above'}) off the network until they have been checked. Reply here and we can help disconnect them.`)
    steps.push('Have the people who use those computers, and the owners of the affected accounts, stop signing in to company systems from them until we confirm they are safe.')
    steps.push('Have those users change their passwords from a different computer that is working normally.')
  } else if (device) {
    steps.push(user
      ? `Check with ${user} whether they noticed anything unusual, such as unexpected pop-ups, password prompts, or account alerts.`
      : `Find out who uses ${device} and whether they noticed anything unusual, such as unexpected pop-ups, password prompts, or account alerts.`)
    steps.push(`Keep ${device} off the network until it has been checked. Reply here if you would like us to help disconnect it.`)
    steps.push(`Have ${user ? 'that user' : `the person who uses ${device}`} change their passwords from a different computer that is working normally, starting with email and any banking or payment sites.`)
    steps.push(`Check ${user ? 'that user\'s' : 'that person\'s'} email account for sign-ins or rules that forward email elsewhere that they do not recognize.`)
    steps.push(`Before ${device} goes back into normal use, have it wiped and set up again, or reply here and we will secure it for you.`)
  } else {
    steps.push(`Confirm with ${p.user ?? 'the user'} whether they did this.`)
    steps.push('If they did not, have them change their password from a computer that is working normally and tell us right away.')
  }
  lines.push('What we recommend, in this order:')
  steps.forEach((s2, i2) => lines.push(`${i2 + 1}. ${s2}`))
  lines.push('')
  lines.push('Please reply with what you find, or tell us which of these steps you would like us to take for you.')
  return lines.join('\n')
}

/** Every rule the customer message must obey. Returns violations (empty = ok). */
export function lintCustomerMessage(text: string, opts: { lockdownPermitted: boolean }): string[] {
  // The prose is what the reader reads; a full ticket URL necessarily carries
  // its host name, so URLs are checked for being full (https://…) and nothing else.
  const prose = text.replace(/https?:\/\/\S+/g, ' ')
  const v: string[] = []
  for (const r of CUSTOMER_MESSAGE_FORBIDDEN) if (r.test(prose)) v.push(`forbidden: ${r}`)
  if (!opts.lockdownPermitted) for (const r of LOCKDOWN_PATTERNS) if (r.test(prose)) v.push(`lockdown language without corroborated multi-device/account compromise: ${r}`)
  for (const m of text.matchAll(/(\S*)autotask\.net/gi)) {
    if (!/^https:\/\//i.test(m[1])) v.push(`ticket link is not a full URL: ${m[0]}`)
  }
  return v
}

// ─────────────────────────────────────────────────────────────────────────────
// What the alert itself says — the source's own fields, never inferred
// ─────────────────────────────────────────────────────────────────────────────

/** One line of "what the alert says". `value` is the source's own text; `meaning` is ours and labelled as such. */
export interface AlertFact {
  label: string
  value: string
  meaning?: string
}

export interface SaasAlertBody {
  product: string | null
  activityType: string | null
  eventDescription: string | null
  /** The alert rule's own triage guidance (the "Triage:" paragraph onward). */
  triage: string | null
  eventTimeUtc: string | null
  iocTriggeredAtUtc: string | null
  status: string | null
  ip: string | null
  city: string | null
  region: string | null
  country: string | null
  ipOwner: string | null
  ipType: string | null
  ipFlagsTrue: string[]
  userName: string | null
  fullName: string | null
  /** Entra object id of the account ("User Id"). */
  userId: string | null
  userAgent: string | null
  deviceStatus: string | null
  eventId: string | null
  iocName: string | null
  iocTriggerId: string | null
  links: Array<{ label: string; url: string }>
}

function gmtToIso(v: string | null): string | null {
  if (!v) return null
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(?:GMT|UTC|Z)?$/i)
  return m ? `${m[1]}T${m[2]}Z` : null
}

/**
 * Parse the SaaS Alerts ticket body ("Key: Value" lines). Until 2026-09-30 the
 * SOC kept only the email address from these tickets and threw away the
 * activity, time, IP, location, ISP, user agent and event id — so the
 * assessment could say nothing but "suspicious event" (T20260930.0005).
 * Returns null when the text is not a SaaS Alerts body.
 */
export function parseSaasAlertsBody(text: string): SaasAlertBody | null {
  if (!/Activity type:/i.test(text) || !/(IOC Name|Event ID|Partner Name):/i.test(text)) return null
  const line = (key: string): string | null => {
    const m = text.match(new RegExp(`^\\s*${key}:[ \\t]*(.*)$`, 'im'))
    const v = m?.[1]?.trim()
    return v && !/^(not available|n\/a|undefined|null)$/i.test(v) ? v : null
  }
  const descBlock = text.match(/Event Description:\s*([\s\S]*?)(?:\n\s*Date\/Time:|$)/i)?.[1]?.trim() ?? null
  let eventDescription = descBlock
  let triage: string | null = null
  if (descBlock) {
    const i = descBlock.search(/\n\s*Triage:/i)
    if (i >= 0) { eventDescription = descBlock.slice(0, i).trim(); triage = descBlock.slice(i).replace(/^\s*Triage:\s*/i, '').trim() }
  }
  const flags: string[] = []
  for (const m of text.matchAll(/^\s*(known abuser|known attacker|known anonymous|known threat|known bogon|tor network|known proxy):\s*(true|false)/gim)) {
    if (m[2].toLowerCase() === 'true') flags.push(m[1].toLowerCase())
  }
  const links = [...text.matchAll(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g)].map((m) => ({ label: m[1], url: m[2] }))
  return {
    product: line('Product'),
    activityType: line('Activity type'),
    eventDescription,
    triage,
    eventTimeUtc: gmtToIso(line('Date\\/Time')),
    iocTriggeredAtUtc: gmtToIso(line('IOC TriggeredAt')),
    status: line('Status'),
    ip: line('Ip Address'),
    city: line('City'),
    region: line('Region'),
    country: line('Country'),
    ipOwner: line('IP Address Owner'),
    ipType: line('Type'),
    ipFlagsTrue: flags,
    userName: line('User Name'),
    fullName: line('Full Name'),
    userId: line('User Id'),
    userAgent: line('Device User Agent'),
    deviceStatus: line('Device Status Type'),
    eventId: line('Event ID'),
    iocName: line('IOC Name'),
    iocTriggerId: line('IOC Trigger Id'),
    links,
  }
}

const BROWSER_UA = /mozilla\/|edg\/|chrome\/|safari\/|firefox\/|outlook|teams|onedrive|microsoft office/i

export function locationText(b: Pick<SaasAlertBody, 'city' | 'region' | 'country'>): string | null {
  const parts = [b.city, b.region && !/^\d+$/.test(b.region) ? b.region : null, b.country].filter((x): x is string => !!x)
  return parts.length ? parts.join(', ') : null
}

/** The SaaS Alerts fields a technician needs first, in the order they need them. */
export function saasAlertFacts(b: SaasAlertBody): AlertFact[] {
  const f: AlertFact[] = []
  if (b.activityType) f.push({ label: 'What happened', value: b.activityType })
  if (b.eventDescription) f.push({ label: 'Detail', value: b.eventDescription.replace(/\s*\n\s*/g, ' ') })
  const who = [b.fullName, b.userName].filter(Boolean).join(' — ')
  if (who) f.push({ label: 'Account', value: who })
  if (b.iocTriggeredAtUtc || b.eventTimeUtc) {
    f.push({ label: 'When (UTC)', value: [b.iocTriggeredAtUtc && `rule fired ${b.iocTriggeredAtUtc}`, b.eventTimeUtc && `event ${b.eventTimeUtc}`].filter(Boolean).join('; ') })
  }
  if (b.ip) {
    const loc = locationText(b)
    const owner = [b.ipOwner, b.ipType].filter(Boolean).join(', ')
    f.push({
      label: 'From',
      value: `${b.ip}${loc ? ` — ${loc}` : ''}${owner ? ` (${owner})` : ''}`,
      meaning: b.ipFlagsTrue.length ? `SaaS Alerts flags this address: ${b.ipFlagsTrue.join(', ')}.` : 'SaaS Alerts flags none of abuser / attacker / threat / proxy / Tor on this address.',
    })
  }
  if (b.userAgent) {
    f.push({
      label: 'Client',
      value: b.userAgent,
      meaning: BROWSER_UA.test(b.userAgent)
        ? undefined
        : 'Not a web browser or Office app — this action was made by a script, app or API library. Identify which app/integration uses it.',
    })
  }
  if (b.deviceStatus) f.push({ label: 'SaaS Alerts data quality', value: b.deviceStatus, meaning: /incomplete/i.test(b.deviceStatus) ? 'SaaS Alerts did not receive the full event — the app or role name is not in the alert and must be read from the tenant audit log.' : undefined })
  if (b.iocName) f.push({ label: 'Rule', value: `${b.iocName}${b.status ? ` (${b.status})` : ''}` })
  if (b.eventId) f.push({ label: 'SaaS Alerts event id', value: b.eventId })
  for (const l of b.links) f.push({ label: l.label, value: l.url })
  return f
}

/** A Datto RMM device as the account check needs it. */
export interface AccountDeviceInput {
  hostname: string
  extIpAddress: string | null
  lastUser: string | null
  description?: string | null
  lastSeen: string | null
  online: boolean | null
}

export interface AccountCheckInput {
  alertIp: string | null
  userName: string | null
  fullName: string | null
  alertTimeUtc: string | null
  devices: AccountDeviceInput[]
  privilegeEvents: Array<{ time: string; activity: string; result: string; ip: string | null; targets: string[]; details: string[] }> | null
  signIns: Array<{ time: string; ip: string | null; location: string | null; device: string | null; deviceName?: string | null; status: string }> | null
  /** Intune devices whose user is the account; null = not read. */
  managedDevices?: Array<{ deviceName: string; operatingSystem: string | null; lastSyncDateTime: string | null; complianceState: string | null }> | null
  /** Why the M365 lookup could not run or was partial — shown, never hidden. */
  m365Gap: string | null
}

const isV6 = (ip: string) => ip.includes(':')
const v6Prefix64 = (ip: string) => ip.toLowerCase().split(':').slice(0, 4).join(':')

/** Does a Datto RMM "last user" belong to this account? Exact on the UPN local part or the compacted full name — never fuzzy. */
export function deviceUserMatches(lastUser: string | null, userName: string | null, fullName: string | null): boolean {
  const u = normUser(lastUser)
  if (!u) return false
  const local = userName ? userName.toLowerCase().split('@')[0] : null
  const compact = fullName ? fullName.toLowerCase().replace(/[^a-z0-9]/g, '') : null
  return (!!local && u === local) || (!!compact && u.replace(/[^a-z0-9]/g, '') === compact)
}

export interface ResolvedUserDevice {
  hostname: string
  /** How the device was tied to the account — every basis, each naming its source. */
  basis: string[]
  /** strong = an authoritative record ties them; likely = two or more name signals; possible = one name signal. */
  strength: 'strong' | 'likely' | 'possible'
  rmm: AccountDeviceInput | null
}

const lc = (x: string | null | undefined) => (x ?? '').trim().toLowerCase()

/**
 * Map an account to the devices it uses, from every source that can say so.
 * One exact-name rule missed ELLYSEA (last user "ELLYSEA\\GhenelU", described
 * "Ghenels Personal Computer") for ghenel@ — a personal, non-Entra-joined
 * computer, the normal case for a contractor. Name signals are graded weaker
 * than records (Intune primary user, an Entra sign-in naming the device) and
 * each basis is shown, so a technician can judge the link rather than trust it.
 */
export function resolveUserDevices(a: {
  userName: string | null
  fullName: string | null
  rmmDevices: AccountDeviceInput[]
  managedDevices?: Array<{ deviceName: string; operatingSystem: string | null; lastSyncDateTime: string | null; complianceState: string | null }> | null
  signInDeviceNames?: string[]
}): ResolvedUserDevice[] {
  const local = a.userName ? lc(a.userName).split('@')[0].replace(/[^a-z0-9]/g, '') : ''
  const first = a.fullName ? lc(a.fullName).split(/\s+/)[0].replace(/[^a-z0-9]/g, '') : ''
  const compactFull = a.fullName ? lc(a.fullName).replace(/[^a-z0-9]/g, '') : ''
  const byHost = new Map<string, ResolvedUserDevice>()
  const get = (hostname: string) => {
    const k = lc(hostname)
    let r = byHost.get(k)
    if (!r) {
      r = { hostname, basis: [], strength: 'possible', rmm: a.rmmDevices.find((d) => lc(d.hostname) === k) ?? null }
      byHost.set(k, r)
    }
    return r
  }
  const strongHosts = new Set<string>()
  for (const d of a.rmmDevices) {
    const u = (normUser(d.lastUser) ?? '').replace(/[^a-z0-9]/g, '')
    if (u && ((local && u === local) || (compactFull && u === compactFull))) {
      get(d.hostname).basis.push(`Datto RMM last user "${d.lastUser}" is this account`); strongHosts.add(lc(d.hostname))
    } else if (u && ((local.length >= 4 && u.startsWith(local)) || (first.length >= 4 && u.startsWith(first)))) {
      get(d.hostname).basis.push(`Datto RMM last user "${d.lastUser}" begins with "${local.length >= 4 && u.startsWith(local) ? local : first}"`)
    }
    const desc = lc(d.description)
    const nameRe = (n: string) => new RegExp(`(^|[^a-z])${n}`)
    if (desc && ((first.length >= 4 && nameRe(first).test(desc)) || (compactFull && desc.replace(/[^a-z0-9]/g, '').includes(compactFull)))) {
      get(d.hostname).basis.push(`Datto RMM description "${d.description}" names the user`)
    }
  }
  for (const m of a.managedDevices ?? []) {
    get(m.deviceName).basis.push(`Intune: this account is the device's user${m.lastSyncDateTime ? ` (last sync ${m.lastSyncDateTime.replace(/\.\d+Z$/, 'Z')})` : ''}`)
    strongHosts.add(lc(m.deviceName))
  }
  for (const n of new Set((a.signInDeviceNames ?? []).filter(Boolean))) {
    get(n).basis.push('Microsoft 365: a sign-in by this account came from this device')
    strongHosts.add(lc(n))
  }
  for (const [k, r] of byHost) r.strength = strongHosts.has(k) ? 'strong' : r.basis.length >= 2 ? 'likely' : 'possible'
  const rank = { strong: 0, likely: 1, possible: 2 }
  return [...byHost.values()].sort((x, y) => rank[x.strength] - rank[y.strength])
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows failed logon (event 4625) raised as a Datto RMM event-log alert
// ─────────────────────────────────────────────────────────────────────────────

/** Microsoft "Table 11: Windows Logon Types" (event 4625 reference). */
const LOGON_TYPES: Record<string, string> = {
  '2': 'Interactive — someone at this computer', '3': 'Network — from another computer', '4': 'Batch', '5': 'Service',
  '7': 'Unlock — unlocking this computer', '8': 'NetworkCleartext — from another computer', '9': 'NewCredentials',
  '10': 'RemoteInteractive — Remote Desktop', '11': 'CachedInteractive — cached credentials at this computer',
}
/** Microsoft NTSTATUS values (MS-ERREF), the ones a failed logon carries. */
const NTSTATUS: Record<string, string> = {
  '0xc000006e': 'the user name and password were VALID, but an account restriction blocked the logon (STATUS_ACCOUNT_RESTRICTION)',
  '0xc000006a': 'wrong password (STATUS_WRONG_PASSWORD)',
  '0xc0000064': 'the account does not exist (STATUS_NO_SUCH_USER)',
  '0xc000006d': 'bad user name or authentication information (STATUS_LOGON_FAILURE)',
  '0xc0000234': 'the account is LOCKED OUT after too many failed attempts (STATUS_ACCOUNT_LOCKED_OUT)',
  '0xc0000071': 'the password has expired (STATUS_PASSWORD_EXPIRED)',
  '0xc0000224': 'the password must be changed before first logon (STATUS_PASSWORD_MUST_CHANGE)',
  '0xc000006f': 'logon outside authorised hours', '0xc0000070': 'logon from an unauthorised workstation',
  '0xc0000072': 'the account is disabled', '0xc0000193': 'the account has expired',
  '0xc000015b': 'the user has not been granted this logon type on this computer',
}

export interface WindowsLogonFailure {
  alertId: string | null
  policy: string | null
  device: string | null
  lastUser: string | null
  subjectAccount: string | null
  targetAccount: string | null
  targetDomain: string | null
  logonType: string | null
  failureReason: string | null
  status: string | null
  subStatus: string | null
  callerProcess: string | null
  workstation: string | null
  sourceAddress: string | null
  remote: boolean
}

/** Parse a Datto RMM "An account failed to log on" (event 4625) alert body. Null when it is not one. */
export function parseWindowsLogonFailure(text: string): WindowsLogonFailure | null {
  if (!/An account failed to log on/i.test(text)) return null
  const after = (label: string, from = 0) => {
    const i = text.indexOf(label, from)
    if (i < 0) return { v: null as string | null, at: -1 }
    const m = text.slice(i + label.length).match(/^[ \t]*:?[ \t]*([^\r\n]*)/)
    const v = m?.[1]?.trim() ?? ''
    return { v: v && v !== '-' ? v : (v === '-' ? '-' : null), at: i }
  }
  const failedIdx = text.indexOf('Account For Which Logon Failed')
  const subj = after('Account Name:')
  const tgt = failedIdx >= 0 ? after('Account Name:', failedIdx) : { v: null, at: -1 }
  const tgtDom = failedIdx >= 0 ? after('Account Domain:', failedIdx) : { v: null, at: -1 }
  const src = after('Source Network Address:').v
  const type = after('Logon Type:').v
  const local = !src || src === '-' || src === '::1' || src === '127.0.0.1'
  return {
    alertId: text.match(/AEM alert\s+#([0-9a-f-]{36})/i)?.[1] ?? null,
    policy: text.match(/within the policy\s+"([^"]+)"/i)?.[1] ?? null,
    device: text.match(/Workstation Name:\s*([A-Za-z0-9._-]+)/)?.[1] ?? null,
    lastUser: text.match(/last known user was\s+"([^"]+)"/i)?.[1] ?? null,
    subjectAccount: subj.v === '-' ? null : subj.v,
    targetAccount: tgt.v === '-' ? null : tgt.v,
    targetDomain: tgtDom.v === '-' ? null : tgtDom.v,
    logonType: type,
    failureReason: after('Failure Reason:').v,
    status: after('Status:').v?.toLowerCase() ?? null,
    subStatus: after('Sub Status:').v?.toLowerCase() ?? null,
    callerProcess: after('Caller Process Name:').v === '-' ? null : after('Caller Process Name:').v,
    workstation: after('Workstation Name:').v,
    sourceAddress: src === '-' ? null : src,
    remote: !local || ['3', '8', '10'].includes(type ?? ''),
  }
}

/** The 4625 fields a technician needs, each with Microsoft's meaning. */
export function windowsLogonFacts(w: WindowsLogonFailure): AlertFact[] {
  const f: AlertFact[] = []
  f.push({ label: 'What happened', value: `A logon to ${w.targetDomain ? `${w.targetDomain}\\` : ''}${w.targetAccount ?? 'an account'} failed on ${w.workstation ?? w.device ?? 'the computer'} (Windows event 4625)` })
  if (w.logonType) f.push({ label: 'Logon type', value: w.logonType, meaning: LOGON_TYPES[w.logonType] ? `Microsoft: ${LOGON_TYPES[w.logonType]}.` : undefined })
  const code = w.subStatus && w.subStatus !== '0x0' ? w.subStatus : w.status
  if (code) f.push({ label: 'Why it failed', value: `${w.failureReason ?? ''} ${code}`.trim(), meaning: NTSTATUS[code] ? `Microsoft: ${NTSTATUS[code]}.` : undefined })
  if (w.callerProcess) {
    const exe = w.callerProcess.split('\\').pop() ?? w.callerProcess
    const meaning = /msedge\.exe|chrome\.exe|firefox\.exe/i.test(exe)
      ? 'A web browser asked for the Windows account password — browsers do this before showing or filling saved passwords. Not a remote attempt.'
      : /winlogon\.exe|lsass\.exe|logonui\.exe/i.test(exe) ? 'The Windows sign-in screen.' : undefined
    f.push({ label: 'Process that asked', value: w.callerProcess, meaning })
  }
  f.push({
    label: 'From',
    value: w.sourceAddress ?? 'no network address (local)',
    meaning: w.remote ? 'The attempt came over the network — check where that address is.' : 'Made at the computer itself, not from the network.',
  })
  if (w.policy) f.push({ label: 'Datto RMM monitor', value: w.policy })
  if (w.alertId) f.push({ label: 'Datto RMM alert id', value: w.alertId })
  return f
}

/** Bottom line + next step for a Windows failed logon, from the event's own fields and how often it recurs. */
export function buildWindowsLogonFindings(w: WindowsLogonFailure, ctx: { recentCount: number; alertLocalTime: string | null }): AccountFindings {
  const code = w.subStatus && w.subStatus !== '0x0' ? w.subStatus : w.status
  const who = w.targetAccount ?? 'the user'
  const where = w.workstation ?? w.device ?? 'the computer'
  const exe = w.callerProcess?.split('\\').pop() ?? null
  const browser = !!exe && /msedge\.exe|chrome\.exe|firefox\.exe/i.test(exe)
  const summary: string[] = []
  summary.push(`${who}'s logon failed on ${where}${w.remote ? `, over the network from ${w.sourceAddress ?? 'an unknown address'}` : ', at the computer itself (not from the network)'}.`)
  if (code && NTSTATUS[code]) summary.push(`Reason (Microsoft): ${NTSTATUS[code]}.`)
  if (browser) summary.push(`The prompt came from ${exe} — a browser asking for the Windows password, typically before it shows or fills saved passwords.`)
  summary.push(ctx.recentCount > 1 ? `This has happened ${ctx.recentCount} times on ${where} in the period checked.` : 'This is the only such alert on this computer in the period checked.')
  const lowRisk = !w.remote && code !== '0xc0000234' && ctx.recentCount < 5
  const when = ctx.alertLocalTime ?? 'the alert time'
  const nextStep = lowRisk
    ? `Ask ${who} whether ${browser ? `${exe} asked for their Windows password` : 'they mistyped their Windows password'} around ${when}. If yes, no further action — close as expected user activity.${code === '0xc000006e' ? ' The restriction code means the password itself was right; if it repeats, check the account\'s logon restrictions (for example a blank password, which Windows only allows at the sign-in screen).' : ''}`
    : `Treat as a possible password-guessing attempt: confirm with ${who}, check ${w.remote ? `where ${w.sourceAddress ?? 'the source'} is` : 'who had access to the computer'}, and review the account's other failed logons.`
  return { summary, nextStep }
}

export interface AccountFindings {
  /** The answer, in the order a technician needs it: who, from where, what, what is unknown. */
  summary: string[]
  /** The one next step, reflecting what has ALREADY been checked. */
  nextStep: string
}

/**
 * The bottom line for an account alert, computed from what was actually
 * checked — never the LLM. Before this the page led with an AI summary that
 * never saw the checks and a "final recommendation" telling the technician to
 * read the audit log the SOC had already read (T20260930.0005).
 */
export function buildAccountFindings(a: AccountCheckInput & { clientIsScript: boolean; alertLocalTime: string | null }): AccountFindings {
  const who = a.fullName ?? a.userName ?? 'the account holder'
  const firstName = (a.fullName ?? '').split(/\s+/)[0] || who
  const summary: string[] = []
  // Who: the alert IP against the account's own sign-ins.
  let sameIp = 0
  if (a.signIns && a.alertIp) {
    sameIp = a.signIns.filter((s) => s.ip && s.ip.toLowerCase() === a.alertIp!.toLowerCase()).length
    const ok = a.signIns.filter((s) => s.ip && s.ip.toLowerCase() === a.alertIp!.toLowerCase() && /^success/.test(s.status)).length
    summary.push(sameIp
      ? `Most likely ${who} themself: the alert came from the same IP address as ${sameIp} of ${who}'s ${a.signIns.length} sign-in(s) around that time${ok ? ` (${ok} successful)` : ''}.`
      : `The alert IP matches none of ${who}'s ${a.signIns.length} sign-in(s) around that time — treat it as possibly not ${firstName} until shown otherwise.`)
  } else if (!a.signIns) {
    summary.push(`Could not check who made the change: ${who}'s sign-ins could not be read${a.m365Gap ? ` (${a.m365Gap})` : ''}.`)
  }
  // Where: the account's computer.
  const resolved = resolveUserDevices({
    userName: a.userName, fullName: a.fullName, rmmDevices: a.devices,
    managedDevices: a.managedDevices ?? null,
    signInDeviceNames: (a.signIns ?? []).map((s) => s.deviceName ?? '').filter(Boolean),
  })
  const top = resolved[0]
  if (top) {
    const d = top.rmm
    const ipLine = !d || !d.extIpAddress || !a.alertIp ? 'its IP could not be compared with the alert'
      : d.extIpAddress.toLowerCase() === a.alertIp.toLowerCase() ? 'it has the SAME public IP as the alert'
        : isV6(a.alertIp) !== isV6(d.extIpAddress) ? `its public IP (${d.extIpAddress}) cannot be compared with the IPv${isV6(a.alertIp) ? '6' : '4'} alert address`
          : `its public IP (${d.extIpAddress}) is DIFFERENT from the alert's`
    summary.push(`${firstName}'s computer is ${top.strength === 'strong' ? '' : top.strength + ' '}${top.hostname} (${top.basis.length} link${top.basis.length === 1 ? '' : 's'}: ${top.basis.map((b) => b.split(' "')[0].replace(/^Datto RMM /, 'RMM ')).join(', ')}); ${ipLine}.`)
  } else {
    summary.push(`No computer could be tied to ${who} in Datto RMM, Intune or sign-in records.`)
  }
  // What: the tenant's record of the grant.
  if (a.privilegeEvents && a.privilegeEvents.length) {
    const e = a.privilegeEvents[0]
    summary.push(`Microsoft 365 recorded: "${e.activity}"${e.targets.length ? ` on ${e.targets.join(', ')}` : ''}${e.details.length ? ` — ${e.details[0]}` : ''}${a.privilegeEvents.length > 1 ? ` (+${a.privilegeEvents.length - 1} more)` : ''}.`)
  } else if (a.privilegeEvents) {
    summary.push('Microsoft 365 has NO record of a consent, role or app change by this account within 6 hours — the grant SaaS Alerts reported is not confirmed by the tenant.')
  } else {
    summary.push(`What was granted is unknown: the Microsoft 365 audit log could not be read${a.m365Gap ? ` (${a.m365Gap})` : ''}.`)
  }
  if (a.clientIsScript) summary.push('The action came from a script or app library, not a web browser.')

  const when = a.alertLocalTime ?? a.alertTimeUtc ?? 'the alert time'
  let nextStep: string
  if (a.privilegeEvents && a.privilegeEvents.length) {
    nextStep = `Ask ${firstName} whether they intended "${a.privilegeEvents[0].activity}"${a.privilegeEvents[0].targets.length ? ` on ${a.privilegeEvents[0].targets[0]}` : ''} at ${when}. If not: remove the consent or role, revoke ${firstName}'s sessions, and escalate — a password reset alone does not remove an OAuth grant.`
  } else if (a.privilegeEvents && sameIp > 0) {
    nextStep = `Ask ${firstName} what app or script they connected to their account at ${when}${a.clientIsScript ? ' (the alert shows a script library, not a browser)' : ''}. If they don't recognise it, open the SaaS Alerts IOC details link for the raw event and treat it as unauthorised.`
  } else if (a.privilegeEvents) {
    nextStep = `The alert IP is not one ${firstName} signed in from, and Microsoft 365 has no record of the grant — open the SaaS Alerts IOC details link for the raw event, and confirm with ${firstName} before closing.`
  } else {
    nextStep = `Read the Microsoft Entra audit log for ${a.userName ?? 'the account'} around ${when} — the SOC could not (${a.m365Gap ?? 'tenant not readable'}).`
  }
  return { summary, nextStep }
}

/**
 * What the SOC can check itself about WHO did this and FROM WHERE: the
 * tenant's own record of what the account granted, its sign-ins around the
 * alert, and whether the alert's IP is the public IP of a computer that
 * account uses (Datto RMM). Every line states its source and its limit.
 */
export function buildAccountChecks(a: AccountCheckInput): AlertFact[] {
  const f: AlertFact[] = []
  // 1. What the tenant says the account did.
  if (a.privilegeEvents === null) {
    f.push({ label: 'Microsoft 365 audit log', value: 'Not read', meaning: a.m365Gap ?? 'The tenant could not be queried.' })
  } else if (a.privilegeEvents.length === 0) {
    f.push({ label: 'Microsoft 365 audit log', value: 'No consent, role or app change initiated by this account in the ±6h window', meaning: 'The tenant has no matching record — SaaS Alerts may have classified a different action as a grant. Open the SaaS Alerts IOC link to see the raw event.' })
  } else {
    for (const e of a.privilegeEvents) {
      f.push({
        label: `Microsoft 365 audit log — ${e.time.replace(/\.\d+Z$/, 'Z')}`,
        value: `${e.activity} (${e.result})${e.targets.length ? ` → ${e.targets.join('; ')}` : ''}${e.ip ? ` from ${e.ip}` : ''}`,
        meaning: e.details.length ? e.details.join(' | ') : undefined,
      })
    }
  }
  // 2. Sign-ins: was the alert IP one the account actually signed in from?
  if (a.signIns && a.alertIp) {
    const same = a.signIns.filter((s) => s.ip && s.ip.toLowerCase() === a.alertIp!.toLowerCase())
    const samePrefix = isV6(a.alertIp) ? a.signIns.filter((s) => s.ip && isV6(s.ip) && v6Prefix64(s.ip) === v6Prefix64(a.alertIp!) && !same.includes(s)) : []
    const first = same[0] ?? samePrefix[0]
    f.push({
      label: 'Sign-ins from the alert IP',
      value: same.length
        ? `${same.length} of ${a.signIns.length} sign-in(s) in the window came from ${a.alertIp}`
        : samePrefix.length
          ? `No exact match; ${samePrefix.length} sign-in(s) from the same /64 network (${v6Prefix64(a.alertIp)}::/64)`
          : `None of ${a.signIns.length} sign-in(s) in the window came from ${a.alertIp}`,
      meaning: first ? `e.g. ${first.time.replace(/\.\d+Z$/, 'Z')} · ${first.status}${first.device ? ` · ${first.device}` : ''}${first.location ? ` · ${first.location}` : ''}` : undefined,
    })
  }
  // 3. The account's computer(s), from every source that ties one to it, and
  //    each one's public IP from Datto RMM.
  const resolved = resolveUserDevices({
    userName: a.userName, fullName: a.fullName, rmmDevices: a.devices,
    managedDevices: a.managedDevices ?? null,
    signInDeviceNames: (a.signIns ?? []).map((s) => s.deviceName ?? '').filter(Boolean),
  })
  if (resolved.length === 0) {
    f.push({
      label: "Account's computer",
      value: 'No device could be tied to this account',
      meaning: `Checked Datto RMM last user and description${a.managedDevices ? ', Intune devices' : ' (Intune not read)'}${a.signIns ? ' and Microsoft 365 sign-in device names' : ''}. The action may have come from an unmanaged computer or a server-side app.`,
    })
  }
  for (const r of resolved) {
    const d = r.rmm
    let verdict: string
    if (!d) verdict = 'not in Datto RMM, so no public IP to compare'
    else if (!a.alertIp || !d.extIpAddress) verdict = 'cannot compare — one of the two addresses is missing'
    else if (d.extIpAddress.toLowerCase() === a.alertIp.toLowerCase()) verdict = 'SAME public IP as the alert'
    else if (isV6(a.alertIp) !== isV6(d.extIpAddress)) verdict = `cannot compare — the alert IP is IPv${isV6(a.alertIp) ? '6' : '4'} and Datto RMM reports IPv${isV6(d.extIpAddress) ? '6' : '4'} for the device; a home connection commonly has both`
    else verdict = 'DIFFERENT public IP from the alert'
    f.push({
      label: `Account's computer (${r.strength} link) — ${r.hostname}`,
      value: d
        ? `public IP ${d.extIpAddress ?? 'unknown'} · last user ${d.lastUser ?? 'unknown'} · ${d.online ? 'online' : 'offline'}${d.lastSeen ? ` · last seen ${d.lastSeen}` : ''}`
        : 'not a Datto RMM-managed device',
      meaning: `Linked by: ${r.basis.join('; ')}. IP check: ${verdict}.${d ? " Datto RMM reports the device's CURRENT public IP, not its IP at the time of the alert." : ''}`,
    })
  }
  return f
}

// ─────────────────────────────────────────────────────────────────────────────
// The internal assessment note (deterministic structure; the narrative is the
// only AI-written part and is labelled as such)
// ─────────────────────────────────────────────────────────────────────────────

export const NOTE_HEADER = '═══ SOC ANALYST ASSESSMENT ═══'
export const NOTE_END = '═══ END SOC ASSESSMENT ═══'

/**
 * Autotask rejects a TicketNotes.description over 32,000 characters (Kaseya
 * REST docs: `description string (32000)`). The note is kept under this, with
 * headroom for line-ending conversion, so the write can never fail on size.
 */
export const NOTE_MAX_CHARS = 30000

const CLASS_LABEL: Record<SocClassification, string> = {
  confirmed_malicious: 'CONFIRMED MALICIOUS',
  suspicious_review: 'SUSPICIOUS — NEEDS REVIEW',
  likely_false_positive: 'LIKELY FALSE POSITIVE',
  confirmed_false_positive: 'CONFIRMED FALSE POSITIVE',
  insufficient_data: 'INDETERMINATE — INSUFFICIENT DATA',
}

export function classificationLabel(c: SocClassification): string {
  return CLASS_LABEL[c]
}

export interface AssessmentNoteInput {
  ticketNumber: string
  autotaskTicketId: string
  twinTickets: Array<{ ticketNumber: string; autotaskTicketId: string; incidentId: string | null; threatName: string | null }>
  result: ClassificationResult
  primary: PrimaryDetection
  visibility: VisibilityEntry[]
  events: AttributedEvent[]
  changeWindows: ChangeWindow[]
  changeContext: ChangeContextItem[]
  ips: IpClassification[]
  dataGaps: string[]
  profile: CompanySecurityProfile
  narrative: string | null
  narrativeRemoved: string[]
  technicianActions: string[]
  customerUpdate: { status: string; message: string | null }
  generatedAtUtc: string
  /** The source's own fields (SaaS Alerts body etc.). Rendered first — it is what the technician acts on. */
  alertFacts?: AlertFact[]
  /** The alert rule's own triage guidance, verbatim. */
  alertTriage?: string | null
  /** What the SOC itself checked about the account (M365 + Datto RMM). */
  accountChecks?: AlertFact[]
  /** Computed bottom line (account alerts). Rendered FIRST, in place of the AI summary. */
  bottomLine?: string[] | null
}

export function buildAssessmentNote(n: AssessmentNoteInput): string {
  const r = n.result
  const L: string[] = []
  L.push(NOTE_HEADER)
  L.push(`Classification: ${CLASS_LABEL[r.classification]} (Confidence ${Math.round(r.confidence * 100)}%)  |  Risk: ${r.riskLevel}`)
  L.push(`Incident: ${n.primary.incidentId ? `${n.primary.recordSource} incident ${n.primary.incidentId}` : 'no external incident id'} on ticket ${n.ticketNumber}${n.primary.threatName ? `  |  Threat: ${n.primary.threatName}` : ''}`)
  L.push(`Classification and confidence are computed in code from the evidence below; the AI wrote only the narrative. Last assessed ${n.generatedAtUtc.replace(/\.\d{3}Z$/, 'Z')}.`)
  if (n.twinTickets.length) {
    L.push(`Twin tickets (same device, file and detection time — covered by this one assessment): ${n.twinTickets.map((t) => `${t.ticketNumber}${t.incidentId ? ` (incident ${t.incidentId}${t.threatName ? `, ${t.threatName}` : ''})` : ''}`).join('; ')}`)
  }
  if (n.bottomLine && n.bottomLine.length) {
    L.push('')
    L.push('BOTTOM LINE (computed from the checks below)')
    for (const b of n.bottomLine) L.push(`- ${b}`)
    if (n.technicianActions[0]) L.push(`NEXT STEP: ${n.technicianActions[0]}`)
  }
  if (n.alertFacts && n.alertFacts.length) {
    L.push('')
    L.push('WHAT THE ALERT SAYS (the source\'s own fields; "→" lines are our reading of them)')
    for (const f of n.alertFacts) {
      L.push(`- ${f.label}: ${f.value}`)
      if (f.meaning) L.push(`  → ${f.meaning}`)
    }
    if (n.alertTriage) {
      L.push('- The alert rule\'s own triage steps:')
      for (const t of n.alertTriage.split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean)) L.push(`  ${t}`)
    }
  }
  if (n.accountChecks && n.accountChecks.length) {
    L.push('')
    L.push('WHAT WE CHECKED (Microsoft 365 tenant + Datto RMM)')
    for (const f of n.accountChecks) {
      L.push(`- ${f.label}: ${f.value}`)
      if (f.meaning) L.push(`  → ${f.meaning}`)
    }
  }
  L.push('')
  L.push('VISIBILITY FOR THIS CLIENT (anything not "connected" is unknown — never clean)')
  L.push(...formatVisibilityLines(n.visibility))
  L.push('')
  L.push('CLIENT PROFILE')
  L.push(`- Co-managed: ${n.profile.coManaged ? 'yes' : 'no'} (${n.profile.coManagedBasis})`)
  L.push('- Customer updates go to: the contact marked Customer Contact = Technical; otherwise the device\'s last signed-in user if they match exactly one contact; otherwise nobody (a technician decides).')
  L.push(`- Site time zone: ${n.profile.timezone} (${n.profile.timezoneBasis})`)
  L.push('')
  if (!n.bottomLine || !n.bottomLine.length) {
    L.push('SUMMARY (AI-written from the evidence below; not itself evidence)')
    L.push(n.narrative && n.narrative.trim() ? n.narrative.trim() : r.rationale.join(' '))
  }
  if (n.narrativeRemoved.length) L.push(`[${n.narrativeRemoved.length} AI sentence(s) removed: they asserted something the evidence does not support.]`)
  L.push('')
  const byDisp = (d: Disposition) => n.events.filter((e) => e.disposition === d)
  L.push('THE ALERT')
  const alerts = byDisp('alert')
  L.push(...(alerts.length ? alerts.map(formatEventLine) : ['- (alert record not retrieved)']))
  L.push('')
  L.push('CORROBORATION (an independent source reporting its own malicious/suspicious signal about the same device, user or IOC)')
  const corr = byDisp('corroboration')
  L.push(...(corr.length ? corr.map(formatEventLine) : ['- None. No independent source reported its own signal about this device, user or IOC.']))
  L.push('')
  L.push('CONTEXT (does not raise or lower confidence)')
  const ctx = byDisp('context')
  const ctxStart = L.length
  L.push(...(ctx.length ? formatEventGroups(ctx) : ['- none']))
  const ctxEnd = L.length
  for (const c of n.changeContext) L.push(`- ${c.label}`)
  L.push('')
  L.push('TCT-INITIATED CHANGES (fleet-wide patterns; events inside are excluded from corroboration)')
  if (n.changeWindows.length === 0) L.push('- No fleet-wide pattern found in the data that was available (see Data Gaps — this does not prove no change occurred).')
  for (const w of n.changeWindows) {
    L.push(`- ${w.what}: ${isoSeconds(w.startUtc)} – ${isoSeconds(w.endUtc)} (${formatLocalTime(w.startUtc, n.profile.timezone) ?? 'local time unknown'}). ${w.alertCount} Datto RMM alerts, e.g. ${w.sampleAlertIds.slice(0, 3).join(', ')}. Verify: ${w.verification}`)
  }
  const inWin = byDisp('tct_change')
  if (inWin.length) {
    L.push('  Events inside these windows:')
    L.push(...formatEventGroups(inWin).map((line) => `  ${line}`))
  }
  L.push('')
  L.push('IP ADDRESSES')
  L.push(...(n.ips.length ? n.ips.map((i) => `- ${i.ip}: ${i.label}`) : ['- none found in the evidence']))
  L.push('')
  L.push('DATA GAPS')
  const gaps = [...n.dataGaps, ...formatEventGroups(byDisp('data_gap')).map((line) => line.slice(2))]
  L.push(...(gaps.length ? gaps.map((g) => `- ${g}`) : ['- none']))
  L.push('')
  L.push('WHY THIS CLASSIFICATION (computed in code)')
  L.push(...r.rationale.map((x) => `- ${x}`))
  L.push('')
  L.push('RECOMMENDED TECHNICIAN ACTION')
  L.push(...n.technicianActions.map((a, i) => `${i + 1}. ${a}`))
  L.push('')
  L.push(`CUSTOMER UPDATE: ${n.customerUpdate.status}`)
  if (n.customerUpdate.message) {
    L.push('--- message ---')
    L.push(n.customerUpdate.message)
    L.push('--- end message ---')
  }
  L.push(NOTE_END)
  return fitNoteToLimit(L, ctxStart, ctxEnd)
}

/**
 * Last line of defence for the size limit. Context is the only section that is
 * both unbounded and not decision-bearing, so it is trimmed first (latest lines
 * dropped, with a line saying how many); only if that is not enough is the
 * note cut, always keeping the end marker so an edit-in-place still finds it.
 */
export function fitNoteToLimit(lines: string[], ctxStart: number, ctxEnd: number, max = NOTE_MAX_CHARS): string {
  let text = lines.join('\n')
  if (text.length <= max) return text
  const ctx = lines.slice(ctxStart, ctxEnd)
  const before = lines.slice(0, ctxStart)
  const after = lines.slice(ctxEnd)
  let keep = ctx.length
  while (keep > 0) {
    keep--
    const omitted = ctx.length - keep
    const marker = `- [${omitted} more context line(s) omitted to fit Autotask's 32,000-character note limit — see the source portals]`
    text = [...before, ...ctx.slice(0, keep), marker, ...after].join('\n')
    if (text.length <= max) return text
  }
  const tail = `\n[Note cut to fit Autotask's 32,000-character limit]\n${NOTE_END}`
  return text.slice(0, max - tail.length) + tail
}

/** Deterministic technician steps, scoped by the evidence. */
export function technicianActions(r: ClassificationResult, p: PrimaryDetection, ctx: { coManaged: boolean; hasTctChange: boolean; notConnected: string[]; hasRuleTriage?: boolean; auditLogNeeded?: { user: string | null; atUtc: string | null; tenantReadable: boolean } | null; privilegeFound?: { user: string | null; events: Array<{ time: string; activity: string; targets: string[]; details: string[] }> } | null }): string[] {
  const a: string[] = []
  if (ctx.privilegeFound && ctx.privilegeFound.events.length) {
    const what = ctx.privilegeFound.events.slice(0, 3).map((e) => `"${e.activity}"${e.targets.length ? ` on ${e.targets.join(', ')}` : ''} at ${e.time.replace(/\.\d+Z$/, 'Z')}${e.details.length ? ` (${e.details[0]})` : ''}`).join('; ')
    a.push(`Ask ${ctx.privilegeFound.user ?? 'the account holder'} whether they intended this, as recorded by Microsoft 365: ${what}. If not intended: remove the consent or role in Entra, revoke the account's sessions, and escalate — a password reset alone does not remove an OAuth grant.`)
  }
  if (ctx.auditLogNeeded) {
    const who = ctx.auditLogNeeded.user ?? 'the account'
    const when = ctx.auditLogNeeded.atUtc ? ` around ${ctx.auditLogNeeded.atUtc.replace(/\.\d{3}Z$/, 'Z')} (UTC)` : ''
    a.push(`Read the Microsoft Entra audit log for ${who}${when} to name the application, consent or role involved — the alert does not contain it.${ctx.auditLogNeeded.tenantReadable ? '' : ' The SOC could not read that log itself (Graph permission missing on this tenant — see Data Gaps).'}`)
  }
  if (ctx.hasRuleTriage) a.push('Follow the alert rule\'s own triage steps listed under WHAT THE ALERT SAYS.')
  if (r.classification === 'likely_false_positive' || r.classification === 'confirmed_false_positive') {
    a.push('Confirm the benign explanation above still holds, document it, and close the ticket.')
    return a
  }
  if (p.deviceHostname) a.push(`Confirm ${p.deviceHostname}'s current state in Microsoft Defender (detection status, whether the file executed) and keep it isolated until checked.`)
  if (p.user) a.push(`Confirm the activity with ${p.user} directly before closing.`)
  if (ctx.hasTctChange) a.push('Confirm the TCT-initiated change windows listed above with the technician who ran them, so they are not mistaken for attacker activity.')
  if (ctx.notConnected.length) a.push(`Close the visibility gaps for this client (${ctx.notConnected.join(', ')}) — those sources could not be checked.`)
  a.push(ctx.coManaged
    ? 'Follow up with the client IT lead on the remediation handoff in the customer update and record their answers on this ticket.'
    : 'Carry out the remediation steps in the customer update and record the outcome on this ticket.')
  if (r.classification === 'insufficient_data') a.push('Retrieve the detection record from the source portal before deciding anything.')
  return a
}
