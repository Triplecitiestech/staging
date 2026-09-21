// src/lib/connector/autotask-exemptions.ts
//
// THE ONLY PLACE the connector is allowed to NOT expose something the Autotask
// API permits.
//
// The coverage check (./autotask-coverage.ts) fails the build on any entity,
// operation or writable field that live entityInformation permits and the
// connector does not offer. This file is the escape hatch, and it is
// deliberately narrow:
//
//   - every entry carries a DATE and a REASON,
//   - the reason must be one of two codes, and
//   - "not needed yet" is not one of them.
//
// That last rule is the whole point. "Not needed yet" is exactly how this
// surface got built — 79 tools covering 44 of ~180 entities, each one added
// after a missing capability blocked Kurtis mid-task. A $45 shipping charge
// could not be put on a ticket on 2026-09-21 because nobody had needed
// TicketCharges before. If "nobody has needed it" were a valid exemption, this
// file would simply become the new hand-picked list.
//
// TWO VALID REASONS
// -----------------
//   POLICY_GATED   A deliberate TCT guardrail, justified by BLAST RADIUS — the
//                  operation is destructive and irreversible enough that the
//                  connector should not offer it at all. Note that the default
//                  write policy is already the staged human-approval gate (see
//                  ./autotask-write-policy.ts), so an exemption here means
//                  "not even with approval", not "needs approval".
//
//   VENDOR_BROKEN  The API claims to permit it and does not. Requires the LIVE
//                  ERROR, captured verbatim, with the date it was observed.
//                  Without that this becomes the stale "Kaseya can't do this"
//                  claim the whole failure-envelope contract exists to end.
//
// A STALE EXEMPTION IS ALSO A FAILURE. The coverage check reports an exemption
// whose target no longer exists in the catalogue, or a VENDOR_BROKEN entry for
// something that now works, so the file cannot quietly accumulate fiction.

import type { EntityOperation } from './autotask-catalogue'

export type ExemptionReason = 'POLICY_GATED' | 'VENDOR_BROKEN'

export interface SurfaceExemption {
  entity: string
  /** Omit to exempt the whole entity (every operation). Prefer naming one. */
  operation?: EntityOperation
  /** Omit for an operation-level exemption; name a field to exempt just it. */
  field?: string
  reason: ExemptionReason
  /** ISO date the decision was made or the failure observed. YYYY-MM-DD. */
  dated: string
  /** Why. For POLICY_GATED this must argue blast radius, not convenience. */
  rationale: string
  /**
   * REQUIRED for VENDOR_BROKEN: the vendor's own error, verbatim, and when it
   * was seen. A vendor-limitation claim without the observation behind it is
   * the failure mode, not the documentation of one.
   */
  liveError?: string
}

export const SURFACE_EXEMPTIONS: SurfaceExemption[] = [
  {
    entity: 'TimeEntries',
    operation: 'delete',
    reason: 'POLICY_GATED',
    dated: '2026-09-21',
    rationale:
      'A time entry is a BILLING record. Once it has been picked up by a billing run, deleting it silently removes revenue from an invoice that may already have been approved or sent, and Autotask keeps no recoverable copy. The blast radius is a customer invoice, not a row. Correcting a time entry is what autotask_update_time_entry is for; removing one is a deliberate act a human performs in the Autotask UI, where the billing consequences are shown on screen.',
  },
  {
    entity: 'Contacts',
    operation: 'delete',
    reason: 'POLICY_GATED',
    dated: '2026-09-21',
    rationale:
      'Deleting a Contact detaches it from every ticket, opportunity, quote and contract that referenced it, and Autotask does not cascade a replacement — the history is left pointing at nothing. Contacts.isActive exists precisely so a departed person can be retired without destroying the record trail, and that is the operation the connector exposes. Autotask permits the delete; TCT does not want it available to an automated caller.',
  },
]

// NOT EXEMPTED, on purpose: Companies.delete.
//
// An entry for it was written on 2026-09-21 as belt-and-braces ("in case Kaseya
// ever flips canDelete") and the coverage check rejected it as stale, because
// this instance reports Companies.canDelete FALSE. The check is right, and the
// reasoning is worth keeping: an exemption for something the API does not permit
// is inert today and HARMFUL tomorrow — the day Kaseya turns the capability on,
// a standing exemption would swallow it silently instead of surfacing it as a
// decision. Meanwhile assertOperationPermitted already refuses the call with
// UPSTREAM_UNSUPPORTED and the live metadata as evidence, which is a better
// answer than a policy refusal for something the vendor cannot do anyway.

/** Index key for one exemption target. */
function keyOf(entity: string, operation?: string, field?: string): string {
  return [entity.toLowerCase(), operation ?? '*', (field ?? '*').toLowerCase()].join('::')
}

/**
 * The exemption covering this target, if any.
 *
 * Matching is deliberately specific-to-general: a field exemption, then the
 * operation, then the whole entity. A broad entity-level exemption therefore
 * still covers a field, but a field-level one cannot be stretched to cover an
 * operation it was never written for.
 */
export function findExemption(
  entity: string,
  operation?: EntityOperation,
  field?: string,
  // Defaults to the committed list. Taking it as a parameter is what lets the
  // coverage report be driven by a hypothetical set — including the test that
  // proves an exemption is what turns a violation into an accepted decision.
  // Reading the module constant unconditionally made that test silently
  // impossible to satisfy, which is a check that cannot be exercised.
  exemptions: SurfaceExemption[] = SURFACE_EXEMPTIONS,
): SurfaceExemption | undefined {
  const index = new Map(exemptions.map((e) => [keyOf(e.entity, e.operation, e.field), e]))
  const candidates = [
    field && operation ? keyOf(entity, operation, field) : null,
    field ? keyOf(entity, undefined, field) : null,
    operation ? keyOf(entity, operation) : null,
    keyOf(entity),
  ].filter((k): k is string => k !== null)
  for (const k of candidates) {
    const hit = index.get(k)
    if (hit) return hit
  }
  return undefined
}

export interface ExemptionDefect {
  exemption: SurfaceExemption
  problem: string
}

/**
 * Structural validation of the file itself.
 *
 * Checked by the coverage test rather than by review, because every rule here
 * is one somebody would otherwise be tempted to bend at 6pm: an undated entry,
 * a VENDOR_BROKEN claim with no observed error, or a rationale that amounts to
 * "we have not got round to it".
 */
export function validateExemptions(exemptions: SurfaceExemption[] = SURFACE_EXEMPTIONS): ExemptionDefect[] {
  const defects: ExemptionDefect[] = []
  const seen = new Set<string>()

  for (const e of exemptions) {
    const k = keyOf(e.entity, e.operation, e.field)
    if (seen.has(k)) defects.push({ exemption: e, problem: `duplicate exemption for ${k}` })
    seen.add(k)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dated)) {
      defects.push({ exemption: e, problem: `dated must be YYYY-MM-DD, got "${e.dated}"` })
    }
    if (e.reason === 'VENDOR_BROKEN' && !e.liveError?.trim()) {
      defects.push({
        exemption: e,
        problem:
          'VENDOR_BROKEN requires liveError — the vendor\'s own failure, verbatim. An uncited vendor-limitation claim is the exact stale belief this connector exists to eliminate.',
      })
    }
    if (e.rationale.trim().length < 80) {
      defects.push({
        exemption: e,
        problem: `rationale is ${e.rationale.trim().length} characters; it must actually argue the case (>= 80).`,
      })
    }
    // "Not needed yet" in any of its dialects. This is the one reason the file
    // must never accept, because it is how the hand-picked surface happened.
    if (/\b(not needed|no(?:body| one)? (?:has )?(?:asked|needed|wanted)|not yet needed|low priority|nobody uses|no use case|out of scope for now|we don'?t need)\b/i.test(e.rationale)) {
      defects.push({
        exemption: e,
        problem:
          '"not needed yet" is not a valid exemption reason. Expose it, or argue blast radius (POLICY_GATED) or capture the live failure (VENDOR_BROKEN).',
      })
    }
  }
  return defects
}
