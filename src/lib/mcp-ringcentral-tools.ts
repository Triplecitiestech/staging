// src/lib/mcp-ringcentral-tools.ts
//
// RingCentral read tools for the MCP connector. Replaces the dependency on
// mcp.labs.ringcentral.com, a RingCentral-hosted MCP we do not control, which
// failed 4 of 4 calls on 2026-09-09 with the bare string "Tool execution
// failed" — see the header of src/lib/ringcentral.ts for the full account.
//
// READ-ONLY BY CONSTRUCTION: the client exposes only `rcGet`, which has no
// method or body parameter, and nothing here stages or executes a write. There
// is therefore no staged-approval gate on this surface — there is nothing to
// gate.
//
// KILL SWITCH: CONNECTOR_RINGCENTRAL_ENABLED, DEFAULT FALSE. The name is
// declared in TOOL_FACTS and the connector derives the set of switches to read
// from that declaration (PR #213) — it is never a hand-maintained list of
// switch names, because that exact shape has been the defect four times in this
// repo (periodType, parentIdField, the errors[] phrase list, and
// CONNECTOR_SCAN_WRITES_ENABLED reporting five live tools as disabled).
//
// THE ONE RULE THAT MATTERS MOST HERE: a caller must never be able to mistake a
// truncated transcript for a whole one. RingCentral stops transcribing when a
// call becomes a three-way, silently. Every transcript response therefore
// carries a measured `coverageComplete` (tri-state — true / false / null for
// not-measured, never defaulted to true) plus `coverageEndsAt`.

import { z } from 'zod'
import {
  assessCoverage,
  findCallById,
  getInsights,
  isRingCentralConfigured,
  listCalls,
  parseInsights,
  RingCentralApiError,
  RingCentralNotConfiguredError,
  RINGSENSE_THREE_WAY_LIMIT,
  type NormalisedCall,
} from '@/lib/ringcentral'
import { failureResult } from '@/lib/connector/failure-envelope'

export const RINGCENTRAL_KILL_SWITCH = 'CONNECTOR_RINGCENTRAL_ENABLED'

/** Default false: an unset switch is OFF, never on. */
export function ringCentralToolsEnabled(): boolean {
  return process.env[RINGCENTRAL_KILL_SWITCH] === 'true'
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

/**
 * One place that turns any RingCentral failure into the structured envelope.
 * The vendor's own message is always carried through — the labs server's
 * reasonless "Tool execution failed" is the thing being replaced, so a
 * reasonless failure here would reintroduce it.
 */
function rcFailure(tool: string, err: unknown, details?: Record<string, unknown>) {
  if (err instanceof RingCentralNotConfiguredError) {
    return failureResult({
      reasonCode: 'POLICY_BLOCKED',
      message: err.message,
      evidence: `Checked at call time: ${err.missing.join(', ')} absent from the environment. No request was made.`,
      remediation:
        'Kurtis: add the missing variables to the Vercel project and redeploy. RINGCENTRAL_JWT must be a JWT credential created under the RingCentral SUPER ADMIN developer account — RingSense returns no data for a non-super-admin credential, and it is a separate secret from RINGCENTRAL_CLIENT_SECRET.',
      surface: 'connector',
      tool,
      details: { ...details, missing: err.missing },
    })
  }

  if (err instanceof RingCentralApiError) {
    // A 4xx names the request; a 5xx is RingCentral's side. Neither is ever
    // reported as an unexplained failure.
    const is4xx = err.status >= 400 && err.status < 500
    return failureResult({
      reasonCode: err.status === 401 || err.status === 403 ? 'PERMISSION_DENIED' : is4xx ? 'INVALID_INPUT' : 'TRANSIENT',
      message: err.message,
      evidence: `RingCentral answered HTTP ${err.status} for ${err.path}. Its own response body is quoted in the message.`,
      remediation:
        err.status === 403
          ? 'The credential authenticated but is not permitted this resource. RingSense specifically requires the RingSense scope on the app AND a credential belonging to a super admin user — check both before assuming the data does not exist.'
          : err.status === 401
            ? 'The JWT grant was rejected. Confirm RINGCENTRAL_JWT has not been revoked or rotated in the RingCentral developer console, and that it matches RINGCENTRAL_CLIENT_ID.'
            : err.status === 429
              ? 'Rate limited. The client already retries with backoff, so a persistent 429 means the app is over its per-minute allowance — space the calls out.'
              : is4xx
                ? 'Fix exactly what the quoted vendor message names, then call again. Retrying this unchanged cannot succeed.'
                : 'RingCentral-side error. Retry once; if it persists it is a platform issue, not a connector one.',
      surface: 'connector',
      tool,
      details: { ...details, status: err.status, path: err.path },
    })
  }

  const m = err instanceof Error ? err.message : String(err)
  return failureResult({
    reasonCode: 'TRANSIENT',
    message: `RingCentral call failed: ${m}`,
    evidence: 'Unclassified error from the RingCentral client; the underlying message is quoted verbatim.',
    remediation: 'Retry once. If it repeats with the same message, that message is the lead — do not report it as an unexplained failure.',
    surface: 'connector',
    tool,
    details,
  })
}

function disabled(tool: string) {
  return failureResult({
    reasonCode: 'POLICY_BLOCKED',
    message: `${tool} is turned off: the ${RINGCENTRAL_KILL_SWITCH} kill switch is not set to "true", so no RingCentral request was made.`,
    evidence: `Read ${RINGCENTRAL_KILL_SWITCH} from the environment at call time; it is off by default.`,
    remediation: `Kurtis: set ${RINGCENTRAL_KILL_SWITCH}=true in the Vercel project and redeploy to enable the RingCentral read tools. This is a deliberate default-off switch, not a fault.`,
    surface: 'connector',
    tool,
  })
}

const CALL_ID_HINT =
  'Because RingCentral\'s call log is queried by date range rather than by id, a date is needed to locate the call: pass dateFrom (and dateTo if the call might fall on the next day in UTC).'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerRingCentralTools(server: any) {
  // ── 1. Call log ───────────────────────────────────────────────────────────
  server.registerTool(
    'ringcentral_list_calls',
    {
      title: 'RingCentral: list phone calls for a date range',
      description:
        'Read the RingCentral phone CALL LOG for a date range — inbound and outbound calls, voicemails and missed calls — for the whole company or one TCT extension. Use this to find a call before asking for its transcript or AI summary, and to answer "who called", "what number was that", "how long was the call", "did anyone ring this customer back". Returns per call: call id, recording id, direction, result, counterparty phone number and the resolved name where RingCentral supplied one, the TCT extension and number, start time in BOTH UTC and Eastern Time, duration in seconds, and whether a recording (and therefore a transcript) exists. Dates may be plain YYYY-MM-DD, which is read as that whole day in Eastern Time — the offset is resolved for the actual date, so it is correct in both EDT and EST. Read-only.',
      inputSchema: {
        dateFrom: z.string().describe('Start of the window: YYYY-MM-DD (whole day, Eastern) or a full ISO 8601 instant'),
        dateTo: z.string().optional().describe('End of the window, same formats. Defaults to dateFrom (a single day)'),
        extensionNumber: z.string().optional().describe('One TCT extension number, e.g. "101". Omit for the whole company'),
        direction: z.enum(['Inbound', 'Outbound']).optional().describe('Restrict to inbound or outbound calls'),
        withRecordingOnly: z.boolean().optional().describe('Only calls that have a recording — i.e. the ones that can have a RingSense transcript'),
        maxRecords: z.number().int().min(1).max(500).optional().describe('Cap on calls returned (default 100, max 500)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      const TOOL = 'ringcentral_list_calls'
      if (!ringCentralToolsEnabled()) return disabled(TOOL)
      try {
        const result = await listCalls({
          dateFrom: args.dateFrom,
          dateTo: args.dateTo,
          extensionNumber: args.extensionNumber,
          direction: args.direction,
          withRecordingOnly: args.withRecordingOnly,
          maxRecords: args.maxRecords,
        })
        return ok({
          window: result.window,
          scope: args.extensionNumber ? `extension ${args.extensionNumber}` : 'whole company',
          count: result.calls.length,
          totalMatchedReportedByVendor: result.totalMatched,
          truncated: result.truncated,
          pagesRead: result.pagesRead,
          note: 'transcriptAvailable only means a recording exists for RingSense to work from. Whether that transcript covers the WHOLE call is a separate question that ringcentral_get_call_transcript measures — never assume it does.',
          calls: result.calls,
        })
      } catch (e) {
        return rcFailure(TOOL, e, { dateFrom: args.dateFrom, dateTo: args.dateTo })
      }
    },
  )

  // ── 2. Transcript, with the coverage measurement ──────────────────────────
  server.registerTool(
    'ringcentral_get_call_transcript',
    {
      title: 'RingCentral: get one call\'s transcript (with coverage check)',
      description:
        'Read the RingSense AI TRANSCRIPT of one recorded phone call — what was actually said, with speaker attribution and per-segment timestamps. Use it to write up a call, quote a customer or vendor, or check what was agreed. ' +
        'IT ALSO TELLS YOU WHETHER THE TRANSCRIPT IS COMPLETE, AND YOU MUST READ THAT BEFORE QUOTING IT: RingCentral stops transcribing the instant a call becomes a three-way conference and returns the partial transcript with no sign that it is partial (verified in production 2026-09-09 — a call from 10:41 AM ET was cut off at 10:46 AM, losing the entire vendor conversation that contained the outcome). So every response carries coverageComplete, which is THREE-VALUED: true means the transcript reaches the end of the call, false means it stops early and coverageEndsAt says when, and null means coverage could not be measured — null is NOT a pass. If coverageComplete is anything other than true, say so plainly and do not present the transcript as the whole conversation. ' +
        `Pass either callId or recordingId. ${CALL_ID_HINT} Read-only.`,
      inputSchema: {
        dateFrom: z.string().describe('The call\'s date: YYYY-MM-DD (Eastern) or full ISO 8601 — needed to locate the call and read its true duration'),
        dateTo: z.string().optional().describe('Widen the search window if the call may straddle a date boundary'),
        callId: z.string().optional().describe('Call-log id or sessionId from ringcentral_list_calls'),
        recordingId: z.string().optional().describe('Recording id from ringcentral_list_calls, if already known'),
        extensionNumber: z.string().optional().describe('Narrow the call-log search to one TCT extension'),
        includeSegments: z.boolean().optional().describe('Return every transcript segment (default true). Set false for coverage + summary only'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      const TOOL = 'ringcentral_get_call_transcript'
      if (!ringCentralToolsEnabled()) return disabled(TOOL)

      if (!args.callId && !args.recordingId) {
        return failureResult({
          reasonCode: 'INVALID_INPUT',
          message: 'Nothing was read: this tool needs either callId or recordingId, and neither was supplied.',
          evidence: 'Checked before any request was made.',
          remediation: 'Call ringcentral_list_calls for the date to get both ids, then pass one of them back here.',
          surface: 'connector',
          tool: TOOL,
        })
      }

      try {
        // The call record is fetched FIRST and for one reason: its duration is
        // the denominator of the coverage measurement. Without it coverage is
        // unmeasurable, and an unmeasurable coverage is reported as null rather
        // than assumed complete.
        let call: NormalisedCall | null = null
        try {
          call = await findCallById(String(args.callId ?? args.recordingId), {
            dateFrom: args.dateFrom,
            dateTo: args.dateTo,
            extensionNumber: args.extensionNumber,
          })
        } catch {
          // A call-log failure must not block the transcript; it only costs the
          // coverage denominator, and that is reported honestly below.
          call = null
        }

        const recordingId = args.recordingId ?? call?.recordingId
        if (!recordingId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: call
              ? `Call ${args.callId} was found, but it has NO RECORDING, so no transcript can exist for it. This is not a failure to retrieve a transcript — there is nothing to retrieve.`
              : `No call matching "${args.callId ?? args.recordingId}" was found in the call log for ${args.dateFrom}${args.dateTo ? ` to ${args.dateTo}` : ''}, so its recording id could not be resolved.`,
            evidence: call
              ? 'Read the call record from the call log (view=Detailed); neither the record nor any of its legs carried a recording object.'
              : 'Searched the Detailed call log for the given window and found no record with this id, sessionId or recording id.',
            remediation: call
              ? 'RingSense transcribes recordings only. If this call should have been recorded, check the extension\'s recording settings in RingCentral — that is an admin task, not something this tool can fix.'
              : 'Widen the window with dateTo, drop extensionNumber, or list the calls for that day with ringcentral_list_calls and take the id from there.',
            surface: 'connector',
            tool: TOOL,
            details: { callId: args.callId ?? null, searchedFrom: args.dateFrom, searchedTo: args.dateTo ?? null, callFound: !!call },
          })
        }

        const raw = await getInsights(String(recordingId))
        const insights = parseInsights(raw)
        const coverage = assessCoverage(insights.segments, call?.durationSeconds ?? null, call?.startTimeUtc ?? null)

        return ok({
          call: call
            ? {
                callId: call.callId,
                startTimeEastern: call.startTimeEastern,
                startTimeUtc: call.startTimeUtc,
                durationSeconds: call.durationSeconds,
                direction: call.direction,
                counterpartyNumber: call.counterpartyNumber,
                counterpartyName: call.counterpartyName,
                tctExtension: call.tctExtension,
              }
            : { note: 'The call record could not be read, so duration is unknown and coverage below is reported as not-measured.' },
          recordingId: String(recordingId),

          // Coverage is placed BEFORE the transcript deliberately: it is the
          // thing that must be read first.
          coverageComplete: coverage.coverageComplete,
          coverageEndsAt: coverage.coverageEndsAt,
          coverage,

          transcript: {
            segmentCount: insights.segments.length,
            speakers: [...new Set(insights.segments.map((s) => s.speaker).filter((s): s is string => !!s))],
            segments: args.includeSegments === false ? undefined : insights.segments,
          },
          summaryParagraphs: insights.summaryParagraphs,
          highlights: insights.highlights,
          nextSteps: insights.nextSteps,

          // An uninterpreted payload is reported as such. Returning zero
          // segments for a response we simply could not read would look
          // exactly like a call in which nothing was said.
          responseInterpreted: insights.parsed,
          ...(insights.parsed
            ? {}
            : {
                unparsedShape: {
                  payloadKeys: insights.payloadKeys,
                  warning:
                    'RingSense returned a payload this tool could not interpret, so the empty transcript above means NOT READ, not "nothing was said". The per-field shape of the insights response is not published in a form we could verify; report these payloadKeys so the normaliser can be extended.',
                },
              }),
          platformLimit: RINGSENSE_THREE_WAY_LIMIT,
        })
      } catch (e) {
        return rcFailure(TOOL, e, { callId: args.callId ?? null, recordingId: args.recordingId ?? null })
      }
    },
  )

  // ── 3. AI summary ─────────────────────────────────────────────────────────
  server.registerTool(
    'ringcentral_get_call_summary',
    {
      title: 'RingCentral: get one call\'s AI summary',
      description:
        'Read the RingSense AI SUMMARY of one recorded phone call — the generated recap paragraphs, key highlights and suggested next steps — without pulling the full transcript. Good for writing a ticket note or time entry about a call. ' +
        'THE SAME COVERAGE CAVEAT APPLIES AND IS RETURNED HERE TOO: the summary is generated from the transcript, so if RingCentral stopped transcribing partway through (which it does the moment a call becomes a three-way conference) the summary describes only the part it saw. Check coverageComplete before treating the summary as an account of the whole call. ' +
        `Pass either callId or recordingId. ${CALL_ID_HINT} Read-only.`,
      inputSchema: {
        dateFrom: z.string().describe('The call\'s date: YYYY-MM-DD (Eastern) or full ISO 8601'),
        dateTo: z.string().optional().describe('Widen the search window if the call may straddle a date boundary'),
        callId: z.string().optional().describe('Call-log id or sessionId from ringcentral_list_calls'),
        recordingId: z.string().optional().describe('Recording id from ringcentral_list_calls, if already known'),
        extensionNumber: z.string().optional().describe('Narrow the call-log search to one TCT extension'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (args: any) => {
      const TOOL = 'ringcentral_get_call_summary'
      if (!ringCentralToolsEnabled()) return disabled(TOOL)

      if (!args.callId && !args.recordingId) {
        return failureResult({
          reasonCode: 'INVALID_INPUT',
          message: 'Nothing was read: this tool needs either callId or recordingId, and neither was supplied.',
          evidence: 'Checked before any request was made.',
          remediation: 'Call ringcentral_list_calls for the date to get both ids, then pass one of them back here.',
          surface: 'connector',
          tool: TOOL,
        })
      }

      try {
        let call: NormalisedCall | null = null
        try {
          call = await findCallById(String(args.callId ?? args.recordingId), {
            dateFrom: args.dateFrom,
            dateTo: args.dateTo,
            extensionNumber: args.extensionNumber,
          })
        } catch {
          call = null
        }

        const recordingId = args.recordingId ?? call?.recordingId
        if (!recordingId) {
          return failureResult({
            reasonCode: 'PRECONDITION_FAILED',
            message: call
              ? `Call ${args.callId} has no recording, so RingSense has nothing to summarise. There is no summary to retrieve rather than a retrieval that failed.`
              : `No call matching "${args.callId ?? args.recordingId}" was found in the call log for the given window.`,
            evidence: 'Read the Detailed call log; no recording object was present on the record or its legs.',
            remediation: 'Use ringcentral_list_calls with withRecordingOnly: true to see which calls that day can be summarised.',
            surface: 'connector',
            tool: TOOL,
            details: { callId: args.callId ?? null, callFound: !!call },
          })
        }

        const insights = parseInsights(await getInsights(String(recordingId)))
        const coverage = assessCoverage(insights.segments, call?.durationSeconds ?? null, call?.startTimeUtc ?? null)

        return ok({
          call: call
            ? {
                callId: call.callId,
                startTimeEastern: call.startTimeEastern,
                durationSeconds: call.durationSeconds,
                direction: call.direction,
                counterpartyNumber: call.counterpartyNumber,
                counterpartyName: call.counterpartyName,
              }
            : { note: 'The call record could not be read, so coverage is reported as not-measured.' },
          recordingId: String(recordingId),
          coverageComplete: coverage.coverageComplete,
          coverageEndsAt: coverage.coverageEndsAt,
          coverage,
          summaryParagraphs: insights.summaryParagraphs,
          highlights: insights.highlights,
          nextSteps: insights.nextSteps,
          responseInterpreted: insights.parsed,
          ...(insights.parsed ? {} : { unparsedShape: { payloadKeys: insights.payloadKeys } }),
          platformLimit: RINGSENSE_THREE_WAY_LIMIT,
        })
      } catch (e) {
        return rcFailure(TOOL, e, { callId: args.callId ?? null, recordingId: args.recordingId ?? null })
      }
    },
  )
}

/** Exported for the capability report so "not configured" is distinguishable from "off". */
export function ringCentralSurfaceState(): { enabled: boolean; configured: boolean } {
  return { enabled: ringCentralToolsEnabled(), configured: isRingCentralConfigured() }
}
