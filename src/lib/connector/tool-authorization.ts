// src/lib/connector/tool-authorization.ts
//
// PER-SURFACE caller authorization for the MCP connector.
//
// WHAT THIS ADDS. Until now the connector's only check was bearer-token
// verification: a structurally valid token for the app reached every tool, and
// `authInfo.extra.email` was used for ATTRIBUTION only. That is fine for the
// Autotask/IT Glue/Datto surfaces, which act on company records any technician
// may already see. It is not fine for a surface that reads ONE PERSON'S MAILBOX
// and files their personal documents.
//
// THE RULE IS DERIVED, NOT LISTED. Two derivations, both deliberate, because
// this repo has now paid four times for a hand-maintained lookup table
// (periodType, parentIdField, the errors[] phrase list, killSwitchState):
//
//   1. WHICH TOOLS are restricted comes from the tool-name PREFIX, not from a
//      list of tool names. A `scan_*` tool added tomorrow is restricted on the
//      day it is written, with nobody remembering to add it anywhere.
//
//   2. WHO is authorised for the scan surface comes from SCAN_MAILBOX — the
//      mailbox those tools read. That is not a coincidence dressed up as a
//      derivation: the sensitive material on this surface IS the mailbox
//      owner's, so re-scoping the mailbox must move the authorised caller with
//      it. Hardcoding an address here would let the two drift apart silently.
//
// WHERE IT IS ENFORCED. In the ONE place that already wraps every tool handler
// (recordingServer in ./capability-registry.ts), for the same reason telemetry
// is hooked there: a per-call-site check is a check somebody forgets on tool
// number 187.
//
// WHAT IT DOES NOT DO. It does not hide restricted tools from `tools/list`.
// Advertisement is discovery; invocation is access. Filtering advertisement
// per caller would mean rebuilding the tool surface per identity, and the
// security boundary is the invocation — which this closes.

import { scanMailbox } from '@/lib/scan-filing/graph'
import { connectorFailure, type ConnectorFailure } from './failure-envelope'
import { structuredLog } from '@/lib/resilience'

export interface SurfaceRestriction {
  /** Tool-name prefix this restriction covers. */
  prefix: string
  /** Human label for the surface, used in the refusal. */
  surface: string
  /** Why it is restricted — the caller is told this, not left guessing. */
  reason: string
  /**
   * Resolve the authorised callers. A FUNCTION, not an array, so the answer is
   * derived from configuration rather than frozen into this file.
   */
  allowedCallers: () => string[]
}

/**
 * The complete set of restricted surfaces.
 *
 * Adding an entry is a deliberate security decision and belongs in review.
 * What must NOT appear here is a list of individual tool names — that is the
 * part which rots.
 */
export const SURFACE_RESTRICTIONS: readonly SurfaceRestriction[] = [
  {
    prefix: 'scan_',
    surface: 'Raven scan filing',
    reason:
      'These tools read a single named mailbox and file that person\'s documents, including personal ' +
      'ones. Access is limited to the owner of that mailbox rather than to anyone holding a valid ' +
      'connector token.',
    allowedCallers: () => [scanMailbox()],
  },
]

/** Normalise an identity for comparison. Emails are case-insensitive. */
export function normalizeCaller(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/** The restriction covering this tool, if any. Prefix-derived. */
export function restrictionFor(toolName: string): SurfaceRestriction | undefined {
  return SURFACE_RESTRICTIONS.find((r) => toolName.startsWith(r.prefix))
}

/** Every tool name in `names` that is restricted — for reporting, not enforcement. */
export function restrictedToolNames(names: readonly string[]): string[] {
  return names.filter((n) => restrictionFor(n) !== undefined)
}

export type AuthorizationVerdict =
  | { allowed: true; restricted: boolean }
  | { allowed: false; failure: ConnectorFailure }

/**
 * May this caller invoke this tool?
 *
 * FAIL-CLOSED in all three unhappy cases: an unrestricted tool is allowed, but
 * a restricted one is refused when the token carries no identity, when the
 * surface's authorised list cannot be resolved, and when the identity simply is
 * not on it. A misconfiguration must not read as permission.
 */
export function authorizeToolCall(toolName: string, callerEmail: unknown): AuthorizationVerdict {
  const restriction = restrictionFor(toolName)
  if (!restriction) return { allowed: true, restricted: false }

  const caller = normalizeCaller(callerEmail)
  const allowed = restriction.allowedCallers().map(normalizeCaller).filter((e) => e.length > 0)

  if (allowed.length === 0) {
    return {
      allowed: false,
      failure: connectorFailure({
        reasonCode: 'POLICY_BLOCKED',
        message:
          `The ${restriction.surface} surface is restricted, but the connector cannot resolve who is ` +
          `authorised for it, so the call is refused.`,
        evidence:
          `${restriction.prefix}* is a restricted surface and its authorised-caller list resolved empty. ` +
          `For the scan surface that list comes from SCAN_MAILBOX.`,
        remediation:
          'This is a configuration problem, not a permissions decision: set SCAN_MAILBOX in the Vercel ' +
          'project. A restricted surface with no resolvable owner refuses everyone by design.',
        surface: 'connector',
        tool: toolName,
      }),
    }
  }

  if (!caller) {
    return {
      allowed: false,
      failure: connectorFailure({
        reasonCode: 'PERMISSION_DENIED',
        message:
          `${toolName} is restricted to the ${restriction.surface} owner, and this token carries no ` +
          `identity to check against.`,
        evidence:
          'The verified access token produced no email claim, so the caller could not be identified. ' +
          'A restricted surface treats an unidentified caller as unauthorised.',
        remediation:
          'Sign in to the connector again. If this persists, the Entra app is not emitting an email ' +
          'claim on its access tokens — see docs/runbooks/CONNECTOR_AUTH_ENTRA.md.',
        surface: 'connector',
        tool: toolName,
      }),
    }
  }

  if (!allowed.includes(caller)) {
    return {
      allowed: false,
      failure: connectorFailure({
        reasonCode: 'PERMISSION_DENIED',
        message:
          `${toolName} is restricted to the ${restriction.surface} owner. ${restriction.reason}`,
        evidence:
          `The signed-in caller is not the authorised owner of this surface. Token verification ` +
          `succeeded — this is a per-surface authorisation decision, not a bad token.`,
        remediation:
          'Do not retry, and do not look for another route to the same data. If this access is ' +
          'genuinely needed, Kurtis changes who is authorised for the surface; it is not something ' +
          'the caller can grant themselves.',
        surface: 'connector',
        tool: toolName,
      }),
    }
  }

  return { allowed: true, restricted: true }
}

/**
 * Record a denial.
 *
 * Denials go to the structured log rather than the `connector_tool_calls`
 * telemetry table, because the handler never ran — that table means "calls that
 * reached a tool", and a denial recorded there as a failure would look like
 * breakage rather than a guardrail holding. The actor is logged because a
 * refused attempt on a restricted surface is worth attributing; nothing else
 * about the call is.
 */
export function logAuthorizationDenial(toolName: string, callerEmail: unknown): void {
  structuredLog.warn(
    {
      correlationId: `connector-authz-${Date.now()}`,
      operation: 'connector.tool_authorization.denied',
      tool: toolName,
      actor: normalizeCaller(callerEmail) || 'unidentified',
      surface: restrictionFor(toolName)?.surface ?? 'unknown',
    },
    `${toolName} refused: caller is not authorised for this surface`
  )
}
