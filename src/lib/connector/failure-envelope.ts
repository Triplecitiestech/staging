// src/lib/connector/failure-envelope.ts
//
// THE structured failure contract for every MCP connector surface.
//
// WHY THIS EXISTS: when a tool call fails, the owner needs to know WHO can fix
// it before he can act. Four completely different problems used to be
// indistinguishable from the error text:
//
//   - the vendor API cannot do it            → nobody can fix it here
//   - the connector was never built to do it → Claude Code work
//   - a deliberate TCT guardrail blocked it  → the owner's approval
//   - the credential lacks the right         → a permissions change
//
// Reading "that didn't work" sent him chasing the wrong one. Every failure now
// carries a reasonCode, the EVIDENCE behind it, a remediation step, and who
// owns the fix — so a wall becomes a work item routed to the right person.
//
// THIS FILE IS VENDOR-NEUTRAL BY DESIGN. Autotask is the reference
// implementation (see ./autotask-capability.ts) but nothing here knows about
// it; IT Glue, UniFi, Datto RMM and the HR SharePoint surfaces retrofit onto
// the same helper without redefining the taxonomy.
//
// ADDITIVE GUARANTEE: successful responses are untouched. Only the failure path
// gains the envelope, so no caller that reads a success shape can break.

import { classifyError } from '@/lib/resilience'

// ---------------------------------------------------------------------------
// The taxonomy
// ---------------------------------------------------------------------------

/**
 * The complete, closed set of failure reasons. Deliberately small: a caller
 * reasoning about "who fixes this" needs a handful of buckets, not a synonym
 * list. Do NOT add a code without the owner's agreement — a fragmented
 * taxonomy is worse than a slightly loose fit, because it stops being a
 * routing decision and becomes prose again.
 */
export type ConnectorReasonCode =
  | 'NOT_IMPLEMENTED'
  | 'UPSTREAM_UNSUPPORTED'
  | 'POLICY_BLOCKED'
  | 'PERMISSION_DENIED'
  | 'PRECONDITION_FAILED'
  | 'INVALID_INPUT'
  | 'TRANSIENT'

/** Who owns the fix. Derived from the reason code, never passed in — see FIXABLE_BY. */
export type FixableBy = 'claude_code' | 'tct_human' | 'vendor' | 'caller' | 'retry'

/**
 * reasonCode → owner. This is a TOTAL function of the code, so it is derived
 * rather than supplied: a caller that could set fixableBy independently could
 * emit "UPSTREAM_UNSUPPORTED, fixableBy: claude_code", which routes the owner
 * to the wrong person — exactly the failure this contract removes.
 */
export const FIXABLE_BY: Record<ConnectorReasonCode, FixableBy> = {
  NOT_IMPLEMENTED: 'claude_code',
  UPSTREAM_UNSUPPORTED: 'vendor',
  POLICY_BLOCKED: 'tct_human',
  PERMISSION_DENIED: 'tct_human',
  PRECONDITION_FAILED: 'tct_human',
  INVALID_INPUT: 'caller',
  TRANSIENT: 'retry',
}

/** Plain-language meaning of each code, shipped to callers so it self-documents. */
export const REASON_CODE_MEANING: Record<ConnectorReasonCode, string> = {
  NOT_IMPLEMENTED:
    'The upstream API supports this; the connector does not expose it yet. Fixable by Claude Code.',
  UPSTREAM_UNSUPPORTED:
    'The vendor API has no capability for this. Not fixable by TCT — carries mandatory evidence.',
  POLICY_BLOCKED:
    'Supported upstream and implemented, but intentionally gated by a TCT guardrail (staged-write approval pending, single-target constraint, allowlist scope). The guardrail HELD — this is not an error to route around.',
  PERMISSION_DENIED:
    'Supported and implemented, but the credential lacks the required rights.',
  PRECONDITION_FAILED:
    'Supported, implemented and permitted, but current state or the shape of the request blocks it (record drifted since staging, required parent missing, dependency unmet, a required field pair sent half-empty). Never retry unchanged.',
  INVALID_INPUT: 'Caller error — a bad or missing argument.',
  TRANSIENT: 'Rate limit, timeout, or upstream 5xx. Retrying may succeed.',
}

/** Default next step per code, so `remediation` is never empty. */
const DEFAULT_REMEDIATION: Record<ConnectorReasonCode, string> = {
  NOT_IMPLEMENTED:
    'Report this to Kurtis as a connector gap so it can be handed to Claude Code as a build task.',
  UPSTREAM_UNSUPPORTED:
    'Do not retry and do not look for a workaround in the connector. Tell the user the vendor API cannot do this, and cite the evidence.',
  POLICY_BLOCKED:
    'Tell the user which guardrail applied and what human action clears it. Never attempt to bypass it.',
  PERMISSION_DENIED:
    'Tell Kurtis which credential needs which right. This is a permissions change, not a code change.',
  PRECONDITION_FAILED:
    'Re-read current state and start again from a fresh read; the world moved since the request was formed.',
  INVALID_INPUT: 'Correct the argument named in the message and call the tool again.',
  TRANSIENT: 'Wait briefly and retry the same call. If it persists, report it as an outage.',
}

// ---------------------------------------------------------------------------
// Secret scrubbing
// ---------------------------------------------------------------------------

// Env vars whose VALUES must never appear in an envelope. Vendor errors echo
// request context, and a UniFi API key or IT Glue token in an `evidence` string
// would be persisted in telemetry and pasted into chat. Value-based redaction
// is the reliable half of this (an exact string match cannot be fooled by
// formatting); the regexes below catch shapes we do not hold in env.
const SECRET_ENV_VARS = [
  'AUTOTASK_API_SECRET', 'AUTOTASK_API_INTEGRATION_CODE', 'AUTOTASK_API_USERNAME',
  'ITGLUE_API_KEY', 'DATTO_RMM_API_KEY', 'DATTO_RMM_API_SECRET',
  'UNIFI_API_KEY', 'UBIQUITI_API_KEY', 'UNIFI_SITE_MANAGER_API_KEY',
  'KASEYA_QUOTE_MANAGER_API_KEY',
  'MIGRATION_SECRET', 'CRON_SECRET', 'NEXTAUTH_SECRET', 'E2E_TEST_SECRET',
  'ENCRYPTION_MASTER_KEY_V1', 'WORKOS_API_KEY',
  'HR_GRAPH_CLIENT_SECRET', 'AZURE_AD_CLIENT_SECRET', 'M365_PORTAL_CLIENT_SECRET',
  'ANTHROPIC_API_KEY', 'RESEND_API_KEY',
]

const SECRET_SHAPES: Array<[RegExp, string]> = [
  // Authorization headers and bearer tokens.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [REDACTED]'],
  // key=value / "key": "value" for anything that names itself a credential.
  [/\b(api[-_]?key|apikey|secret|password|passwd|passphrase|token|x-api-key)\b(\s*[:=]\s*)("?)[^\s",;&}]{6,}\3/gi, '$1$2[REDACTED]'],
  // Credentials embedded in a URL (https://user:pass@host).
  [/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@'],
]

/**
 * Remove anything credential-shaped from text bound for an envelope.
 *
 * Applied to EVERY string field on the way out (message, evidence,
 * remediation, vendorError) rather than at call sites, so a new call site
 * cannot forget it. Cheap enough to run unconditionally on an error path.
 */
export function scrubSecrets(text: string): string {
  if (!text) return text
  let out = text
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name]
    // Short values would cause absurd false positives (e.g. a 3-char value
    // matching inside an entity name), so only redact substantial ones.
    if (value && value.length >= 8 && out.includes(value)) {
      out = out.split(value).join(`[REDACTED:${name}]`)
    }
  }
  for (const [pattern, replacement] of SECRET_SHAPES) out = out.replace(pattern, replacement)
  return out
}

/** Hard cap on any single envelope text field. */
const MAX_TEXT = 600

/**
 * Make upstream error text fit to read.
 *
 * Vendor errors are not always tidy: Autotask answers an unknown entity with a
 * full IIS 404 HTML page, which would otherwise bury the envelope in markup and
 * burn the caller's context for no information. Strips tags, collapses
 * whitespace, and truncates — the reason code carries the meaning, so the raw
 * body only needs to be recognisable, not complete.
 */
export function condenseVendorError(text: string): string {
  if (!text) return text
  const stripped = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!DOCTYPE[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > MAX_TEXT ? `${stripped.slice(0, MAX_TEXT)}… [truncated]` : stripped
}

/** Scrub, condense and cap a field bound for the envelope. */
function clean(text: string): string {
  const scrubbed = scrubSecrets(text)
  return scrubbed.length > MAX_TEXT || /<[a-z!/]/i.test(scrubbed) ? condenseVendorError(scrubbed) : scrubbed
}

// ---------------------------------------------------------------------------
// Vendor rule extraction
// ---------------------------------------------------------------------------

/**
 * Pull the vendor's OWN sentence out of a schema-violation error.
 *
 * When an upstream API says exactly what is wrong — "you must assign both a
 * assignedResourceID and assignedResourceRoleID" — that sentence is the
 * remediation. Paraphrasing it loses the field names, which are the only part
 * the caller can act on.
 *
 * Handles the two shapes these arrive in: our own client wrapper
 * (`Autotask POST Tickets failed (500): {"errors":["Data violation: …"]}`) and
 * bare text. Returns undefined rather than guessing when neither matches.
 */
export function extractVendorRule(raw: string): string | undefined {
  if (!raw) return undefined

  // JSON error arrays: Autotask, and most JSON:API-ish vendors.
  const jsonStart = raw.search(/[[{]/)
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as unknown
      const errors = Array.isArray(parsed)
        ? parsed
        : (parsed as { errors?: unknown })?.errors
      if (Array.isArray(errors)) {
        const messages = errors
          .map((e) => (typeof e === 'string' ? e : (e as { message?: unknown })?.message))
          .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        if (messages.length) return clean(messages.join(' '))
      }
    } catch {
      // Truncated or non-JSON body — fall through to the text scan.
    }
  }

  // Text fallback: the violation sentence, wherever it sits in the string.
  const sentence = raw.match(/(?:Data violation|Missing Required Field)[^"}\]\n]*/i)
  return sentence ? clean(sentence[0].trim()) : undefined
}

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

/** Which connector surface produced the failure. */
export type ConnectorSurface =
  | 'autotask'
  | 'itglue'
  | 'unifi'
  | 'datto_rmm'
  | 'hr_sharepoint'
  | 'kaseya_quote_manager'
  | 'connector'

export interface ConnectorFailure {
  /** Always false. Lets a caller branch on shape without inspecting reasonCode. */
  ok: false
  reasonCode: ConnectorReasonCode
  /** Plain-language explanation, written to be read by a human in chat. */
  message: string
  /**
   * How the connector KNOWS. Mandatory for UPSTREAM_UNSUPPORTED (enforced by
   * the input type below) and specific there — "entityInformation reports
   * Services.canDelete false", not "Autotask doesn't support it".
   */
  evidence?: string
  /** The concrete next step for whoever owns the fix. */
  remediation: string
  fixableBy: FixableBy
  surface: ConnectorSurface
  tool?: string
  /** Sanitized upstream error text, when there was one. */
  vendorError?: string
  /**
   * Set when the underlying error could not be classified and the code is a
   * best-effort route to an owner rather than a reviewed judgement. Present so
   * an unclassified crash is never mistaken for a researched capability claim.
   */
  unclassified?: true
  /** Machine-readable extras (entity, field, operation, stagedWriteId…). */
  details?: Record<string, unknown>
}

/**
 * Constructor input. The union makes `evidence` REQUIRED for
 * UPSTREAM_UNSUPPORTED at compile time — the one rule most likely to rot,
 * because an uncited vendor-limitation claim is the exact stale-belief failure
 * this contract exists to eliminate. Making it a type error is stronger than
 * a code-review convention.
 */
export type FailureInput =
  | {
      reasonCode: 'UPSTREAM_UNSUPPORTED'
      message: string
      /** REQUIRED. Cite the live metadata or the dated observation. */
      evidence: string
      remediation?: string
      surface: ConnectorSurface
      tool?: string
      vendorError?: string
      unclassified?: true
      details?: Record<string, unknown>
    }
  | {
      reasonCode: Exclude<ConnectorReasonCode, 'UPSTREAM_UNSUPPORTED'>
      message: string
      evidence?: string
      remediation?: string
      surface: ConnectorSurface
      tool?: string
      vendorError?: string
      unclassified?: true
      details?: Record<string, unknown>
    }

/**
 * Build a failure envelope. Derives fixableBy, fills a default remediation,
 * and scrubs every text field.
 */
export function connectorFailure(input: FailureInput): ConnectorFailure {
  const { reasonCode } = input

  // Runtime backstop for the compile-time rule above: JS callers, `as any`
  // casts and dynamically-built inputs can still reach here. An uncited vendor
  // claim is downgraded rather than emitted, because "we don't know" is
  // recoverable and "the vendor can't do this" (wrongly) is not.
  if (reasonCode === 'UPSTREAM_UNSUPPORTED' && !input.evidence?.trim()) {
    return connectorFailure({
      reasonCode: 'TRANSIENT',
      message:
        `${input.message} (Reported as TRANSIENT, not UPSTREAM_UNSUPPORTED: the connector could not substantiate a vendor-limitation claim, and an uncited one must never be asserted.)`,
      remediation:
        'Retry. If it persists, treat the capability as UNKNOWN — not unsupported — and verify against the vendor reference before telling the user it cannot be done.',
      surface: input.surface,
      tool: input.tool,
      vendorError: input.vendorError,
      unclassified: true,
      details: input.details,
    })
  }

  const evidence = input.evidence?.trim() ? clean(input.evidence.trim()) : undefined
  return {
    ok: false,
    reasonCode,
    message: clean(input.message),
    ...(evidence ? { evidence } : {}),
    remediation: clean(input.remediation?.trim() || DEFAULT_REMEDIATION[reasonCode]),
    fixableBy: FIXABLE_BY[reasonCode],
    surface: input.surface,
    ...(input.tool ? { tool: input.tool } : {}),
    ...(input.vendorError ? { vendorError: condenseVendorError(scrubSecrets(input.vendorError)) } : {}),
    ...(input.unclassified ? { unclassified: true as const } : {}),
    ...(input.details ? { details: input.details } : {}),
  }
}

// ---------------------------------------------------------------------------
// MCP tool response rendering
// ---------------------------------------------------------------------------

/** The MCP tool-result shape this codebase already returns from every tool. */
export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Render a failure envelope as an MCP tool result.
 *
 * The envelope goes in the TEXT block, not `structuredContent`: text is the one
 * channel guaranteed to reach the model on every client, and these tools
 * declare no outputSchema. The leading `Error: <message>` line is preserved
 * byte-compatibly with the previous behaviour so anything reading the first
 * line still works — the JSON is appended after it.
 */
export function failureResult(input: FailureInput): McpToolResult {
  const envelope = connectorFailure(input)
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${envelope.message}\n\n${JSON.stringify({ failure: envelope }, null, 2)}`,
      },
    ],
    isError: true,
  }
}

// ---------------------------------------------------------------------------
// Automatic classification of thrown errors
// ---------------------------------------------------------------------------

/**
 * Marker interface for errors that already know their own classification.
 *
 * Guard code throws these so the generic classifier below does not have to
 * pattern-match our own messages: a staged-write gate refusal is POLICY_BLOCKED
 * because the gate said so, not because the string contained "approve".
 */
export class ClassifiedConnectorError extends Error {
  readonly failure: FailureInput
  constructor(failure: FailureInput) {
    super(failure.message)
    this.name = 'ClassifiedConnectorError'
    this.failure = failure
  }
}

/** Throw a pre-classified failure from anywhere beneath a tool handler. */
export function throwClassified(failure: FailureInput): never {
  throw new ClassifiedConnectorError(failure)
}

export interface ClassifyContext {
  surface: ConnectorSurface
  tool?: string
  /**
   * Reason code used when the error carries no signal at all. Defaults to
   * NOT_IMPLEMENTED, which routes an unexplained connector crash to the party
   * that can actually fix it (Claude Code) and is always marked
   * `unclassified: true` so it is never read as a researched capability claim.
   */
  fallback?: ConnectorReasonCode
  details?: Record<string, unknown>
}

/**
 * Classify an arbitrary thrown value into a failure envelope.
 *
 * This is what retrofitted `catch` blocks call, so every tool gains the
 * envelope without hand-classifying each of ~130 call sites. Ordering matters:
 * pre-classified errors win, then transport/HTTP signals from the shared
 * classifyError(), then the context fallback.
 */
export function classifyThrown(err: unknown, ctx: ClassifyContext): ConnectorFailure {
  if (err instanceof ClassifiedConnectorError) {
    return connectorFailure({ ...err.failure, surface: err.failure.surface ?? ctx.surface, tool: err.failure.tool ?? ctx.tool })
  }

  const raw = err instanceof Error ? err.message : String(err)
  const classified = classifyError(err)
  const base = { surface: ctx.surface, tool: ctx.tool, vendorError: raw, details: ctx.details }

  switch (classified.category) {
    case 'rate_limit':
      return connectorFailure({
        ...base,
        reasonCode: 'TRANSIENT',
        message: `Rate limited by the upstream API. ${raw}`,
        evidence: 'Upstream returned a rate-limit response (classified by classifyError()).',
        remediation: 'Wait and retry — this call was throttled, not rejected.',
      })
    case 'timeout':
      return connectorFailure({
        ...base,
        reasonCode: 'TRANSIENT',
        message: `The upstream API did not respond in time. ${raw}`,
        evidence: 'Request aborted on the client timeout before a response arrived.',
      })
    case 'connection':
    case 'server_error':
      return connectorFailure({
        ...base,
        reasonCode: 'TRANSIENT',
        message: `Upstream API error — this is an availability problem, not a capability one. ${raw}`,
        evidence: `Classified as ${classified.category} by classifyError().`,
      })
    case 'data_violation': {
      // The upstream rejected the write against a DATA RULE. Two families reach
      // here and both are permanent: a required field or field pair missing,
      // and a value that conflicts with what the record (or a related record)
      // currently holds — "the companyLocationID[285] cannot be associated with
      // the Ticket", where the caller never sent that field at all.
      //
      // Autotask returns HTTP 500 for both, which used to classify as
      // server_error → TRANSIENT → "wait briefly and retry": advice that can
      // never work, and which this connector's own taxonomy forbids for
      // PRECONDITION_FAILED. Cost a retry loop on 2026-07-29 and a broken
      // ticket re-parent on 2026-08-28. The status is ignored here; the body
      // decides.
      const rule = extractVendorRule(raw)
      return connectorFailure({
        ...base,
        reasonCode: 'PRECONDITION_FAILED',
        message:
          `The upstream API rejected this write against a DATA RULE — either a required field (or a field pair that must travel together) was missing, or a value conflicts with what this record or a related record currently holds. This is NOT transient: retrying the identical call can never succeed. ${raw}`,
        evidence:
          'Upstream body names a data rule and refers to the request (classified as data_violation by classifyError()). The HTTP status may be 5xx — Autotask answers data violations with 500 — but a status is not what makes this permanent; the rule in the body is.',
        remediation:
          `${rule ? `The vendor's own message: "${rule}" — ` : ''}read it for WHICH field is blocking. If it names a field you sent, fix that value. If it names a field you did NOT send, the record is carrying a value that conflicts with your change: re-read current state and clear or move that field in the same call. If no tool parameter exposes it, that is a connector gap for Claude Code to close (a tool schema change), NOT a retry and NOT a permissions problem.`,
        details: { ...ctx.details, retryable: false, ...(rule ? { vendorRule: rule } : {}) },
      })
    }
    case 'auth':
      return connectorFailure({
        ...base,
        reasonCode: 'PERMISSION_DENIED',
        message:
          `The upstream API rejected the connector's credential for this call (401/403). The operation exists and is implemented — the credential lacks the right. ${raw}`,
        evidence: 'Upstream returned 401/403 (classified as auth by classifyError()).',
        remediation:
          'This is a permissions change, not a code change: tell Kurtis which vendor credential needs which right. Do NOT report this as a vendor limitation — the capability may well exist.',
      })
    case 'validation': {
      // Two routes reach here: a plain 4xx, and a 5xx whose body carried a
      // structured errors[] array. Autotask uses the second for every
      // request-shape rejection, so the message must not assert a status range
      // it may not have — and when the vendor enumerated the problems, its own
      // sentences are the remediation. Paraphrasing loses the field names,
      // which are the only part the caller can act on.
      const rule = extractVendorRule(raw)
      return connectorFailure({
        ...base,
        reasonCode: 'INVALID_INPUT',
        message: `The upstream API rejected this request as invalid. This is NOT transient — retrying it unchanged cannot succeed. ${raw}`,
        evidence:
          'Classified as validation by classifyError(): either a 4xx, or a 5xx whose body listed what is wrong with the request. A structured errors[] array means the vendor understood the request well enough to enumerate its problems, so the status code is not what decides this.',
        remediation:
          `${rule ? `The vendor's own message: "${rule}" — fix exactly what it names, then call again. ` : 'Check the arguments against the tool description. '}` +
          'If a required field has no tool parameter, that is a connector gap for Claude Code, not a retry. If every argument is right, the record may not exist — re-read current state first.',
        details: { ...ctx.details, retryable: false, ...(rule ? { vendorRule: rule } : {}) },
      })
    }
    default: {
      const fallback = ctx.fallback ?? 'NOT_IMPLEMENTED'
      // UPSTREAM_UNSUPPORTED can never be a FALLBACK: an unrecognised error is
      // not evidence of a vendor limitation. connectorFailure() would downgrade
      // it anyway; refusing it here keeps the intent obvious at the call site.
      const safe: Exclude<ConnectorReasonCode, 'UPSTREAM_UNSUPPORTED'> =
        fallback === 'UPSTREAM_UNSUPPORTED' ? 'NOT_IMPLEMENTED' : fallback
      return connectorFailure({
        ...base,
        reasonCode: safe,
        message: raw,
        evidence:
          'The connector could not classify this error, so the reason code is a best-effort route to an owner rather than a reviewed judgement.',
        unclassified: true,
      })
    }
  }
}

/**
 * Drop-in replacement for the per-file `fail()` helpers.
 *
 * Returns the MCP result so a retrofitted catch block stays a one-liner:
 *   catch (e) { return toolFailure(e, { surface: 'autotask', tool: 'x' }) }
 */
export function toolFailure(err: unknown, ctx: ClassifyContext): McpToolResult {
  const envelope = classifyThrown(err, ctx)
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${envelope.message}\n\n${JSON.stringify({ failure: envelope }, null, 2)}`,
      },
    ],
    isError: true,
  }
}

/**
 * The sentence appended to retrofitted tool descriptions so chat-side Claude
 * knows the envelope exists and what to do with it. Exported as one constant so
 * every surface says the same thing and it can be reworded in one place.
 */
export const FAILURE_ENVELOPE_TOOL_NOTE =
  'ON FAILURE this tool returns a structured envelope: {failure:{reasonCode, message, evidence, remediation, fixableBy}}. ' +
  'reasonCode is one of NOT_IMPLEMENTED (connector gap — Claude Code can build it), UPSTREAM_UNSUPPORTED (vendor API cannot do it — do not look for a workaround), ' +
  'POLICY_BLOCKED (a TCT guardrail held — never route around it), PERMISSION_DENIED (credential lacks the right), PRECONDITION_FAILED (state or request shape blocks it — re-read state or fix the shape; never retry unchanged), ' +
  'INVALID_INPUT (fix the argument), TRANSIENT (retry). ' +
  'SURFACE reasonCode, remediation and fixableBy to the user — do not flatten a failure to "that did not work", because who fixes it differs completely per code.'
