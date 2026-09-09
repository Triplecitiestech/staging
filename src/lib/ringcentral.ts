// src/lib/ringcentral.ts
//
// THE RingCentral client for Triple Cities Tech. One client, no parallel
// implementation — same rule as autotask.ts and it-glue.ts.
//
// WHY THIS EXISTS: the connector had no RingCentral surface, so call work went
// through mcp.labs.ringcentral.com, a RingCentral-hosted "labs" MCP server we
// do not control, do not version and cannot fix. On 2026-09-09 it failed 4 of 4
// calls — get_my_call_activity three times across three date formats and
// search_my_call_insights once — every one returning the bare string "Tool
// execution failed", with no reason code, no vendor error and nothing to act
// on. The technician ended up exporting a transcript and two MP3s by hand.
// A dependency that cannot report WHY it failed cannot be debugged, so it is
// replaced rather than worked around.
//
// ── WHAT IS DOC-CONFIRMED VS INFERRED ──────────────────────────────────────
// This distinction is recorded because no live call could be made from the
// build environment (no RINGCENTRAL_JWT there), and a schema assumed is not a
// schema verified.
//
// CONFIRMED against RingCentral's own developer documentation (Sept 2026):
//   • JWT grant: POST /restapi/oauth/token with
//     grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer + assertion,
//     client credentials as HTTP Basic.
//   • Company call log:   GET /restapi/v1.0/account/~/call-log
//     Extension call log: GET /restapi/v1.0/account/~/extension/~/call-log
//     Filters include dateFrom, dateTo, view, direction, type; paging via
//     page + perPage.
//   • Call record fields: uri, id, sessionId, telephonySessionId, startTime,
//     duration (SECONDS), durationMs (MILLISECONDS), type, direction, action,
//     result, from{phoneNumber,name,location}, to{phoneNumber,name},
//     extension{uri,id}, legType, transport, lastModifiedTime, legs[].
//   • view=Detailed adds recording{uri,id,type,contentUri} on the record and
//     within each leg. recording.id is the id RingSense keys on.
//   • RingSense insights:
//     GET /ai/ringsense/v1/public/accounts/~/domains/pbx/records/{recordId}/insights
//     keyed by the call RECORDING id, returning transcription, summary,
//     highlight and "next steps" objects. Requires the RingSense scope and
//     must be authenticated by a SUPER ADMIN user.
//
// NOT CONFIRMED — the per-field JSON shape of the insights response. Its
// reference page returned 403 to automated fetching and no live call was
// possible. So the transcript and summary readers below NORMALISE TOLERANTLY
// across the plausible field spellings and, when they cannot interpret what
// came back, they say so (`parsed: false`, `unparsedShape`) instead of
// returning an empty transcript that reads like a short call. An empty result
// and an uninterpreted result are different answers and are reported as such.
//
// ── THE COVERAGE RULE (the reason this module is not just plumbing) ────────
// RingCentral STOPS TRANSCRIBING the moment a call becomes a three-way
// conference. On 2026-09-09 that silently truncated a transcript at 10:46 AM
// on a call that began at 10:41 AM, omitting the entire vendor conversation
// that contained the actual outcome — and nothing in the response said the
// transcript was partial. A truncated transcript that looks whole is worse
// than no transcript, because it gets quoted. So coverage is MEASURED against
// the call's own duration and reported on every transcript, and
// `coverageComplete` is tri-state: it is `null` when coverage could not be
// measured and NEVER defaults to true.

import { withRetry } from '@/lib/resilience'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_SERVER = 'https://platform.ringcentral.com'
const AUTH_TIMEOUT_MS = 15_000
const DATA_TIMEOUT_MS = 30_000

export interface RingCentralConfig {
  serverUrl: string
  clientId: string
  clientSecret: string
  jwt: string
}

export class RingCentralNotConfiguredError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(
      `RingCentral is not configured: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set. ` +
        'The JWT credential is issued under the RingCentral SUPER ADMIN developer account and is separate from the app client secret — ' +
        'RingSense will not return data for a non-super-admin credential. Set these in Vercel and redeploy; nothing here can substitute for them.',
    )
    this.name = 'RingCentralNotConfiguredError'
    this.missing = missing
  }
}

export class RingCentralApiError extends Error {
  readonly status: number
  readonly body: string
  readonly path: string
  constructor(path: string, status: number, body: string) {
    super(`RingCentral GET ${path} failed (${status}): ${body.slice(0, 500)}`)
    this.name = 'RingCentralApiError'
    this.status = status
    this.body = body
    this.path = path
  }
}

/** Read config, naming every missing piece at once rather than one per attempt. */
export function getRingCentralConfig(): RingCentralConfig {
  const serverUrl = (process.env.RINGCENTRAL_SERVER_URL || DEFAULT_SERVER).replace(/\/+$/, '')
  const clientId = process.env.RINGCENTRAL_CLIENT_ID || ''
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET || ''
  const jwt = process.env.RINGCENTRAL_JWT || ''

  const missing: string[] = []
  if (!clientId) missing.push('RINGCENTRAL_CLIENT_ID')
  if (!clientSecret) missing.push('RINGCENTRAL_CLIENT_SECRET')
  if (!jwt) missing.push('RINGCENTRAL_JWT')
  if (missing.length) throw new RingCentralNotConfiguredError(missing)

  return { serverUrl, clientId, clientSecret, jwt }
}

export function isRingCentralConfigured(): boolean {
  try {
    getRingCentralConfig()
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Auth — JWT bearer grant
// ---------------------------------------------------------------------------

// Warm-lambda token cache. Durable state belongs in Postgres; an access token
// is neither durable nor worth a row. Refresh tokens are DISABLED on this app,
// so the JWT grant is re-run when the access token expires — that is the
// intended flow for a JWT credential, not a workaround.
let tokenCache: { token: string; expiresAt: number } | null = null
const TOKEN_SAFETY_MARGIN_MS = 60_000

export async function getAccessToken(forceRefresh = false): Promise<string> {
  const cfg = getRingCentralConfig()
  if (!forceRefresh && tokenCache && Date.now() < tokenCache.expiresAt - TOKEN_SAFETY_MARGIN_MS) {
    return tokenCache.token
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: cfg.jwt,
  })

  const res = await fetch(`${cfg.serverUrl}/restapi/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  })

  const text = await res.text()
  if (!res.ok) {
    // The vendor's own error is preserved. "Tool execution failed" with no
    // reason is the exact failure this module exists to stop reproducing.
    throw new RingCentralApiError('/restapi/oauth/token', res.status, text)
  }

  let parsed: { access_token?: string; expires_in?: number }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new RingCentralApiError('/restapi/oauth/token', res.status, `non-JSON token response: ${text.slice(0, 200)}`)
  }
  if (!parsed.access_token) {
    throw new RingCentralApiError('/restapi/oauth/token', res.status, `token response carried no access_token: ${text.slice(0, 200)}`)
  }

  tokenCache = {
    token: parsed.access_token,
    expiresAt: Date.now() + (parsed.expires_in ?? 3600) * 1000,
  }
  return tokenCache.token
}

/**
 * Authenticated GET. READ-ONLY BY CONSTRUCTION: there is no method parameter,
 * so no caller can turn this into a write. Same guard as the Kaseya Quote
 * Manager client's `get()`.
 */
async function rcGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const cfg = getRingCentralConfig()
  const url = new URL(path.startsWith('http') ? path : `${cfg.serverUrl}${path}`)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v))
  }

  const attempt = async (token: string): Promise<Response> =>
    fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
    })

  return withRetry(
    async () => {
      let res = await attempt(await getAccessToken())
      // A 401 on a cached token means it expired inside the safety margin;
      // mint once and retry. A second 401 is a real auth problem and is
      // surfaced, not looped on.
      if (res.status === 401) res = await attempt(await getAccessToken(true))

      const text = await res.text()
      if (!res.ok) throw new RingCentralApiError(url.pathname, res.status, text)
      if (!text) return {} as T
      try {
        return JSON.parse(text) as T
      } catch {
        throw new RingCentralApiError(url.pathname, res.status, `non-JSON response: ${text.slice(0, 200)}`)
      }
    },
    {
      maxRetries: 2,
      baseDelayMs: 800,
      // Retry transport blips and RingCentral's documented 429; never retry a
      // 4xx that names the request, which cannot succeed unchanged.
      shouldRetry: (err) => {
        const raw = err as unknown as { status?: number }
        const status = typeof raw?.status === 'number' ? raw.status : undefined
        if (status === 429) return true
        if (status && status >= 400 && status < 500) return false
        return true
      },
    },
  )
}

// ---------------------------------------------------------------------------
// Call log
// ---------------------------------------------------------------------------

export interface RingCentralCallParty {
  phoneNumber?: string
  extensionNumber?: string
  name?: string
  location?: string
}

export interface RingCentralRecordingRef {
  id?: string
  uri?: string
  type?: string
  contentUri?: string
}

export interface RingCentralCallRecord {
  id?: string
  sessionId?: string
  telephonySessionId?: string
  startTime?: string
  duration?: number
  durationMs?: number
  type?: string
  direction?: string
  action?: string
  result?: string
  from?: RingCentralCallParty
  to?: RingCentralCallParty
  extension?: { id?: number | string; uri?: string }
  recording?: RingCentralRecordingRef
  legs?: Array<{ recording?: RingCentralRecordingRef; legType?: string; extension?: { id?: number | string } }>
}

export interface CallLogPage {
  records?: RingCentralCallRecord[]
  paging?: { page?: number; perPage?: number; totalPages?: number; totalElements?: number }
}

export interface ListCallsInput {
  /** YYYY-MM-DD or full ISO 8601. Converted to ISO before sending. */
  dateFrom: string
  dateTo?: string
  /** TCT extension number, e.g. "101". Scopes the read to one extension. */
  extensionNumber?: string
  direction?: 'Inbound' | 'Outbound'
  /** Cap on records returned across pages. */
  maxRecords?: number
  /** Only calls that have a recording (the ones RingSense can transcribe). */
  withRecordingOnly?: boolean
}

/**
 * Normalise a date the way a person types it. `2026-09-09` means the whole of
 * that day in ET, not midnight UTC — getting this wrong is why three different
 * date formats were tried against the labs server and all three failed.
 */
export function toIsoBoundary(input: string, edge: 'start' | 'end'): string {
  const trimmed = input.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // ET is UTC-4 in September (EDT) and UTC-5 in winter (EST). Rather than
    // hardcode an offset, resolve the real one for that date.
    const offsetHours = easternOffsetHours(`${trimmed}T12:00:00Z`)
    const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
    const sign = offsetHours <= 0 ? '-' : '+'
    const tz = `${sign}${pad(offsetHours)}:00`
    return edge === 'start' ? `${trimmed}T00:00:00.000${tz}` : `${trimmed}T23:59:59.999${tz}`
  }
  return new Date(trimmed).toISOString()
}

/** The UTC offset, in hours, that America/New_York was on at a given instant. */
export function easternOffsetHours(isoInstant: string): number {
  const d = new Date(isoInstant)
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((et.getTime() - utc.getTime()) / 3_600_000)
}

/** Render an instant in Eastern Time, the way TCT reads a call time. */
export function toEastern(iso: string | undefined | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  })
}

/** The recording id for a call, from the record or any leg that carries one. */
export function recordingIdOf(rec: RingCentralCallRecord): string | null {
  if (rec.recording?.id) return String(rec.recording.id)
  for (const leg of rec.legs ?? []) {
    if (leg.recording?.id) return String(leg.recording.id)
  }
  return null
}

export interface NormalisedCall {
  callId: string | null
  sessionId: string | null
  telephonySessionId: string | null
  direction: string | null
  result: string | null
  type: string | null
  action: string | null
  startTimeUtc: string | null
  startTimeEastern: string | null
  durationSeconds: number | null
  /** The other party — resolved name where RingCentral supplied one. */
  counterpartyNumber: string | null
  counterpartyName: string | null
  /** The TCT side of the call. */
  tctExtension: string | null
  tctNumber: string | null
  recordingId: string | null
  hasRecording: boolean
  /** Only a recorded call can have a RingSense transcript. */
  transcriptAvailable: boolean
}

export function normaliseCall(rec: RingCentralCallRecord): NormalisedCall {
  const outbound = (rec.direction ?? '').toLowerCase() === 'outbound'
  // On an outbound call the counterparty is `to`; on inbound it is `from`.
  const counterparty = outbound ? rec.to : rec.from
  const tctSide = outbound ? rec.from : rec.to
  const recordingId = recordingIdOf(rec)
  const durationSeconds =
    typeof rec.duration === 'number'
      ? rec.duration
      : typeof rec.durationMs === 'number'
        ? Math.round(rec.durationMs / 1000)
        : null

  return {
    callId: rec.id != null ? String(rec.id) : null,
    sessionId: rec.sessionId != null ? String(rec.sessionId) : null,
    telephonySessionId: rec.telephonySessionId != null ? String(rec.telephonySessionId) : null,
    direction: rec.direction ?? null,
    result: rec.result ?? null,
    type: rec.type ?? null,
    action: rec.action ?? null,
    startTimeUtc: rec.startTime ?? null,
    startTimeEastern: toEastern(rec.startTime),
    durationSeconds,
    counterpartyNumber: counterparty?.phoneNumber ?? null,
    counterpartyName: counterparty?.name ?? null,
    tctExtension: tctSide?.extensionNumber ?? (rec.extension?.id != null ? String(rec.extension.id) : null),
    tctNumber: tctSide?.phoneNumber ?? null,
    recordingId,
    hasRecording: recordingId != null,
    transcriptAvailable: recordingId != null,
  }
}

/**
 * Read the call log for a date range, paging until the cap.
 *
 * view=Detailed is not optional here: the `recording` object only appears in
 * the detailed view, and without a recording id there is no way to reach a
 * transcript — which is the whole point of listing calls for this workflow.
 */
export async function listCalls(input: ListCallsInput): Promise<{
  calls: NormalisedCall[]
  totalMatched: number | null
  truncated: boolean
  pagesRead: number
  window: { fromIso: string; toIso: string }
}> {
  const fromIso = toIsoBoundary(input.dateFrom, 'start')
  const toIso = toIsoBoundary(input.dateTo ?? input.dateFrom, 'end')
  const maxRecords = Math.min(Math.max(1, input.maxRecords ?? 100), 500)
  const perPage = Math.min(maxRecords, 250)

  const basePath = input.extensionNumber
    ? '/restapi/v1.0/account/~/extension/~/call-log'
    : '/restapi/v1.0/account/~/call-log'

  const collected: RingCentralCallRecord[] = []
  let page = 1
  let totalElements: number | null = null
  let pagesRead = 0

  for (;;) {
    const res = await rcGet<CallLogPage>(basePath, {
      dateFrom: fromIso,
      dateTo: toIso,
      view: 'Detailed',
      perPage,
      page,
      direction: input.direction,
      extensionNumber: input.extensionNumber,
    })
    pagesRead += 1
    const records = res.records ?? []
    collected.push(...records)
    if (res.paging?.totalElements != null) totalElements = res.paging.totalElements

    const totalPages = res.paging?.totalPages ?? 1
    if (records.length === 0 || page >= totalPages || collected.length >= maxRecords) break
    page += 1
  }

  let calls = collected.map(normaliseCall)
  if (input.withRecordingOnly) calls = calls.filter((c) => c.hasRecording)

  return {
    calls: calls.slice(0, maxRecords),
    totalMatched: totalElements,
    truncated: calls.length > maxRecords,
    pagesRead,
    window: { fromIso, toIso },
  }
}

/** One call by its call-log id, so a transcript request can find its duration. */
export async function findCallById(
  callId: string,
  hint: { dateFrom: string; dateTo?: string; extensionNumber?: string },
): Promise<NormalisedCall | null> {
  const { calls } = await listCalls({ ...hint, maxRecords: 500 })
  return calls.find((c) => c.callId === callId || c.sessionId === callId || c.recordingId === callId) ?? null
}

// ---------------------------------------------------------------------------
// RingSense — transcript, summary, and the coverage measurement
// ---------------------------------------------------------------------------

export const RINGSENSE_THREE_WAY_LIMIT =
  'RingCentral STOPS TRANSCRIBING the moment a call becomes a three-way conference, and returns the partial transcript with no indication that it is partial. Verified in production on 2026-09-09: a call beginning 10:41 AM ET had its transcript truncated at 10:46 AM, omitting the entire vendor conversation that contained the outcome. This is a RingCentral platform behaviour, not a connector defect and not a fixable one — the only defence is to measure transcript coverage against the call duration and refuse to present a partial transcript as whole.'

export interface TranscriptSegment {
  speaker: string | null
  text: string
  /** Seconds from the start of the recording. Null when not supplied. */
  startOffsetSeconds: number | null
  endOffsetSeconds: number | null
}

export interface TranscriptCoverage {
  /**
   * TRI-STATE, and never defaulted to true:
   *   true  — segments run to the end of the call within tolerance
   *   false — the transcript stops materially early (the three-way case)
   *   null  — coverage COULD NOT BE MEASURED. Not a pass.
   */
  coverageComplete: boolean | null
  /** Why, in a sentence a person can act on. Always present. */
  coverageReason: string
  /** Wall-clock ET instant the transcript stops at, when measurable. */
  coverageEndsAt: string | null
  coverageEndOffsetSeconds: number | null
  callDurationSeconds: number | null
  /** How much of the call the transcript covers, 0-1. Null when unmeasurable. */
  coverageFraction: number | null
  toleranceSeconds: number | null
  likelyCause: string | null
}

/**
 * Measure how much of a call its transcript actually covers.
 *
 * PURE, and exported so the rule is unit-tested rather than trusted.
 *
 * The tolerance is deliberately generous-to-flagging: a transcript legitimately
 * ends a little before a call does (hold music, silence, the goodbye), so a
 * few seconds short is not a truncation. But the cost asymmetry is severe — a
 * spurious "check this transcript" costs one glance, while a missed truncation
 * gets a partial transcript quoted as the whole conversation, which is what
 * happened on 2026-09-09. So the tolerance is the LARGER of 15 seconds and 5%
 * of the call, and anything beyond it is flagged.
 */
export function assessCoverage(
  segments: TranscriptSegment[],
  callDurationSeconds: number | null,
  callStartUtc: string | null,
): TranscriptCoverage {
  const ends = segments
    .map((s) => (s.endOffsetSeconds ?? s.startOffsetSeconds))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0)

  const coverageEndOffsetSeconds = ends.length ? Math.max(...ends) : null

  const endsAt = (offset: number): string | null => {
    if (!callStartUtc) return null
    const start = new Date(callStartUtc)
    if (Number.isNaN(start.getTime())) return null
    return toEastern(new Date(start.getTime() + offset * 1000).toISOString())
  }

  if (segments.length === 0) {
    return {
      coverageComplete: null,
      coverageReason:
        'NOT MEASURED: the transcript came back with no segments. That is not the same as a call with nothing said — it may mean no transcript exists for this recording yet, or that the response could not be interpreted. Do not treat this as a complete transcript.',
      coverageEndsAt: null,
      coverageEndOffsetSeconds: null,
      callDurationSeconds,
      coverageFraction: null,
      toleranceSeconds: null,
      likelyCause: null,
    }
  }

  if (coverageEndOffsetSeconds == null) {
    return {
      coverageComplete: null,
      coverageReason: `NOT MEASURED: ${segments.length} transcript segments came back but none carried a usable timestamp, so there is no way to tell where the transcript stops relative to the call. Read the transcript, but do not assert it is complete. ${RINGSENSE_THREE_WAY_LIMIT}`,
      coverageEndsAt: null,
      coverageEndOffsetSeconds: null,
      callDurationSeconds,
      coverageFraction: null,
      toleranceSeconds: null,
      likelyCause: null,
    }
  }

  if (callDurationSeconds == null || callDurationSeconds <= 0) {
    return {
      coverageComplete: null,
      coverageReason: `NOT MEASURED: the transcript runs to ${Math.round(coverageEndOffsetSeconds)}s but the call's own duration is unknown, so coverage cannot be computed. Fetch the call from the call log to get its duration before relying on this transcript being whole.`,
      coverageEndsAt: endsAt(coverageEndOffsetSeconds),
      coverageEndOffsetSeconds,
      callDurationSeconds,
      coverageFraction: null,
      toleranceSeconds: null,
      likelyCause: null,
    }
  }

  const toleranceSeconds = Math.max(15, callDurationSeconds * 0.05)
  const shortfall = callDurationSeconds - coverageEndOffsetSeconds
  const coverageFraction = Math.min(1, coverageEndOffsetSeconds / callDurationSeconds)

  if (shortfall <= toleranceSeconds) {
    return {
      coverageComplete: true,
      coverageReason: `Transcript covers the call: it runs to ${Math.round(coverageEndOffsetSeconds)}s of a ${Math.round(callDurationSeconds)}s call (${Math.round(coverageFraction * 100)}%), within the ${Math.round(toleranceSeconds)}s tolerance for trailing silence.`,
      coverageEndsAt: endsAt(coverageEndOffsetSeconds),
      coverageEndOffsetSeconds,
      callDurationSeconds,
      coverageFraction,
      toleranceSeconds,
      likelyCause: null,
    }
  }

  return {
    coverageComplete: false,
    coverageReason:
      `TRUNCATED TRANSCRIPT — DO NOT PRESENT THIS AS THE WHOLE CONVERSATION. It stops at ${Math.round(coverageEndOffsetSeconds)}s of a ${Math.round(callDurationSeconds)}s call, leaving ${Math.round(shortfall)}s (${Math.round((1 - coverageFraction) * 100)}% of the call) untranscribed` +
      `${endsAt(coverageEndOffsetSeconds) ? `, ending around ${endsAt(coverageEndOffsetSeconds)}` : ''}. ` +
      'Anything decided in the missing part is NOT in this transcript. Listen to the recording for the remainder, or ask the participants.',
    coverageEndsAt: endsAt(coverageEndOffsetSeconds),
    coverageEndOffsetSeconds,
    callDurationSeconds,
    coverageFraction,
    toleranceSeconds,
    likelyCause: RINGSENSE_THREE_WAY_LIMIT,
  }
}

// ── Tolerant normalisation of the insights payload ──────────────────────────
// The per-field shape is NOT doc-confirmed (see the header). Each candidate
// spelling below is tried; whatever is found is reported, and whatever cannot
// be interpreted is reported as uninterpreted rather than as absent.

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function firstString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

/** Read a time offset, converting milliseconds to seconds when the key says ms. */
function firstOffsetSeconds(o: Record<string, unknown>, secondKeys: string[], msKeys: string[]): number | null {
  for (const k of secondKeys) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  for (const k of msKeys) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v / 1000
  }
  return null
}

export interface ParsedInsights {
  segments: TranscriptSegment[]
  summaryParagraphs: string[]
  highlights: string[]
  nextSteps: string[]
  /** False when the payload arrived but no known shape matched. */
  parsed: boolean
  /** Top-level keys actually present, so an unknown shape is diagnosable. */
  payloadKeys: string[]
}

export function parseInsights(payload: unknown): ParsedInsights {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const payloadKeys = Object.keys(root)

  // The transcript may sit at the root or under a wrapper.
  const transcriptContainer =
    (root.transcript as Record<string, unknown> | undefined) ??
    (root.transcription as Record<string, unknown> | undefined) ??
    root

  const rawSegments = [
    ...asArray((transcriptContainer as Record<string, unknown>)?.segments),
    ...asArray((transcriptContainer as Record<string, unknown>)?.sentences),
    ...asArray((transcriptContainer as Record<string, unknown>)?.utterances),
    ...asArray(root.transcriptionSegments),
    ...asArray(Array.isArray(root.transcription) ? root.transcription : undefined),
    ...asArray(Array.isArray(root.transcript) ? root.transcript : undefined),
  ]

  const segments: TranscriptSegment[] = rawSegments
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      speaker: firstString(s, ['speaker', 'speakerId', 'speakerName', 'participantId', 'personName']),
      text: firstString(s, ['text', 'transcript', 'content', 'utterance', 'sentence']) ?? '',
      startOffsetSeconds: firstOffsetSeconds(s, ['start', 'startTime', 'startOffset', 'startSeconds'], ['startMs', 'startTimeMs', 'startOffsetMs', 'beginOffsetMs']),
      endOffsetSeconds: firstOffsetSeconds(s, ['end', 'endTime', 'endOffset', 'endSeconds'], ['endMs', 'endTimeMs', 'endOffsetMs']),
    }))
    .filter((s) => s.text.trim().length > 0)

  const summaryContainer = (root.summary ?? root.summaries) as unknown
  const summaryParagraphs: string[] = Array.isArray(summaryContainer)
    ? summaryContainer
        .map((p) => (typeof p === 'string' ? p : firstString((p ?? {}) as Record<string, unknown>, ['text', 'content', 'paragraph', 'summary']) ?? ''))
        .filter((t) => t.trim().length > 0)
    : typeof summaryContainer === 'string'
      ? [summaryContainer]
      : summaryContainer && typeof summaryContainer === 'object'
        ? asArray((summaryContainer as Record<string, unknown>).paragraphs)
            .map((p) => (typeof p === 'string' ? p : firstString((p ?? {}) as Record<string, unknown>, ['text', 'content']) ?? ''))
            .filter((t) => t.trim().length > 0)
        : []

  const textList = (v: unknown): string[] =>
    asArray(v)
      .map((h) => (typeof h === 'string' ? h : firstString((h ?? {}) as Record<string, unknown>, ['text', 'content', 'description', 'title']) ?? ''))
      .filter((t) => t.trim().length > 0)

  const highlights = textList(root.highlights ?? root.highlight)
  const nextSteps = textList(root.nextSteps ?? root['next-steps'] ?? root.actionItems)

  return {
    segments,
    summaryParagraphs,
    highlights,
    nextSteps,
    parsed: segments.length > 0 || summaryParagraphs.length > 0 || highlights.length > 0 || nextSteps.length > 0,
    payloadKeys,
  }
}

/** RingSense insights for one call RECORDING id. */
export async function getInsights(recordingId: string): Promise<unknown> {
  return rcGet<unknown>(
    `/ai/ringsense/v1/public/accounts/~/domains/pbx/records/${encodeURIComponent(recordingId)}/insights`,
  )
}
