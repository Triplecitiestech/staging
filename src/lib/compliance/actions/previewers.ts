/**
 * Impact Preview / Dry Run
 *
 * Answer to the customer-safety question: BEFORE a tech clicks "deploy"
 * on a remediation action, they should see the exact set of users,
 * devices, or other entities the action will touch — not just the
 * categorical blast-radius enum.
 *
 * Each catalog action gets an optional `previewer` handler analogous
 * to its `executor`. The previewer is read-only:
 *
 *   - Queries the tenant (Graph, Datto, etc.) to enumerate affected entities
 *   - Returns a structured list (user emails, device names, group ids)
 *   - Returns an estimated "after" state (e.g., "23 users currently lack MFA;
 *     they will be prompted to enroll")
 *
 * Production-safety guarantee: a previewer MUST NOT mutate any state.
 * Calling /preview-impact never changes the customer's tenant. Type-level
 * separation (PreviewerHandler vs ExecutorHandler) keeps them honest.
 *
 * Today every previewer here is a stub that returns "(preview unavailable
 * for this action — staff should manually review)". Real Graph queries
 * land alongside the real executor handlers in C13 follow-up work.
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §11 (NEW — Impact Preview).
 */

import type { RemediationAction } from './types'
import { checkPreconditions, type PreconditionRunResult } from './preconditions'
import {
  previewApplyMfaAllPolicy,
  previewRemoveMfaAllPolicy,
  previewApplyBlockLegacyAuthPolicy,
  previewRemoveBlockLegacyAuthPolicy,
} from './executors/graph-ca-policies'
import {
  previewEnablePasswordProtection,
  previewDisablePasswordProtection,
} from './executors/graph-password-protection'
import {
  previewApplyIntuneDefenderRealtime,
  previewRemoveIntuneDefenderRealtime,
} from './executors/intune-defender'
import {
  previewGeneratePolicyForControl,
} from './executors/policy-generate'
import {
  previewPublishPolicyToSharePoint,
} from './executors/sharepoint-publish'

/** Single entity the action would affect. */
export interface AffectedEntity {
  /** Stable identifier within the tenant (UPN, device id, group id, etc.). */
  id: string
  /** Display name. Shown verbatim in the preview report. */
  displayName: string
  /** Entity kind. */
  type: 'user' | 'device' | 'group' | 'site' | 'license' | 'policy' | 'other'
  /** Human-readable current state ("MFA: not enrolled"). Optional. */
  currentState?: string
  /** Human-readable state after the action runs ("MFA: required"). Optional. */
  projectedState?: string
}

/** Output of a previewer run. */
export interface ImpactPreview {
  /** Total entities affected. */
  totalAffected: number
  /** Sample of up to N entities (truncated for very large blast radies). */
  entities: AffectedEntity[]
  /** Whether the entities list is truncated; total still reflects full count. */
  truncated: boolean
  /** Free-form summary surfaced to the tech ("23 of 50 users will be prompted to enroll in MFA"). */
  summary: string
  /** True if the previewer ran a real tenant query; false if it returned a stub or estimate only. */
  isLiveQuery: boolean
  /** Optional warnings to display alongside the preview. */
  warnings?: string[]
  /**
   * Outcome of running every Precondition on the action against the
   * customer. Populated by previewImpact() before invoking the handler.
   * If `anyHardFail` is true, the deploy route refuses the action.
   */
  preconditions?: PreconditionRunResult
}

export interface PreviewerContext {
  companyId: string
  /** Catalog action snapshot the pending change was staged against. */
  action: RemediationAction
  /** Optional per-action filters (e.g., specific OU). Reserved for future use. */
  filters?: Record<string, unknown>
  /**
   * Free-form metadata forwarded from the caller. Used by previewers
   * that need additional inputs beyond (companyId, action) — e.g.
   * publish previews need the chosen SharePoint folder + policyId.
   */
  metadata?: Record<string, unknown>
}

/**
 * Read-only handler. Implementations MUST NOT mutate tenant state.
 * Use Graph / Datto / etc. read endpoints only.
 */
export type PreviewerHandler = (ctx: PreviewerContext) => Promise<ImpactPreview>

/**
 * Registry of previewer handlers keyed by `executor.handler` from the
 * catalog. Each entry pairs with an executor of the same id — the
 * previewer reads the same state the executor will change.
 *
 * Stubs today; real implementations land in C13 follow-up. The stub
 * returns "preview not yet available; manual review required" so the
 * cockpit shows a clear signal that the safety check is incomplete.
 */
const PREVIEWERS: Record<string, PreviewerHandler> = {
  // M365 / Entra — Conditional Access
  'graph.applyConditionalAccessPolicy.mfaAll': previewApplyMfaAllPolicy,
  'graph.removeConditionalAccessPolicy.mfaAll': previewRemoveMfaAllPolicy,
  'graph.applyConditionalAccessPolicy.blockLegacyAuth': previewApplyBlockLegacyAuthPolicy,
  'graph.removeConditionalAccessPolicy.blockLegacyAuth': previewRemoveBlockLegacyAuthPolicy,

  // Entra ID password protection
  'graph.enablePasswordProtection': previewEnablePasswordProtection,
  'graph.disablePasswordProtection': previewDisablePasswordProtection,

  // Intune device configuration — Defender real-time monitoring
  'graph.applyIntuneConfigProfile.defenderRealtime': previewApplyIntuneDefenderRealtime,
  'graph.removeIntuneConfigProfile.defenderRealtime': previewRemoveIntuneDefenderRealtime,

  // Policy generation
  'policy.generate_for_control': previewGeneratePolicyForControl,

  // Policy publish to customer SharePoint
  'policy.publish_to_sharepoint': previewPublishPolicyToSharePoint,
}


async function stubPreviewer(ctx: PreviewerContext): Promise<ImpactPreview> {
  return {
    totalAffected: 0,
    entities: [],
    truncated: false,
    summary:
      `Live impact preview for "${ctx.action.name}" is not yet implemented. ` +
      `Categorical estimate from the catalog: ${ctx.action.impact.blastRadius}, ` +
      `est. ${ctx.action.impact.estimatedDisruptionMinutes} min per affected person.`,
    isLiveQuery: false,
    warnings: [
      'No live tenant query was performed. Manual review of the customer\'s tenant is required before deploying.',
    ],
  }
}

/**
 * Run the previewer for an action. For manual-executor actions, returns
 * a synthesized "no live query" preview based on the catalog metadata.
 */
export async function previewImpact(ctx: PreviewerContext): Promise<ImpactPreview> {
  // Always run preconditions first — they're cheap and the result is
  // useful even when the previewer itself is a stub. The deploy route
  // refuses on anyHardFail; the cockpit surfaces unknowns as warnings.
  const preconditions = await checkPreconditions(ctx.companyId, ctx.action)

  const exec = ctx.action.executor
  let base: ImpactPreview
  if (exec.kind === 'manual') {
    base = {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary:
        `Manual action "${ctx.action.name}" — staff will perform the change in the vendor console. ` +
        `Catalog estimate: ${ctx.action.impact.blastRadius}, ` +
        `est. ${ctx.action.impact.estimatedDisruptionMinutes} min per affected person.`,
      isLiveQuery: false,
    }
  } else {
    const handler = PREVIEWERS[exec.handler]
    if (!handler) {
      base = {
        totalAffected: 0,
        entities: [],
        truncated: false,
        summary: `No previewer registered for "${exec.handler}". Manual review required before deploying.`,
        isLiveQuery: false,
        warnings: [`Previewer handler "${exec.handler}" is not registered.`],
      }
    } else {
      try {
        base = await handler(ctx)
      } catch (err) {
        base = {
          totalAffected: 0,
          entities: [],
          truncated: false,
          summary: `Previewer "${exec.handler}" threw — manual review required.`,
          isLiveQuery: false,
          warnings: [err instanceof Error ? err.message : String(err)],
        }
      }
    }
  }
  return { ...base, preconditions }
}

/** Whether the action has a real (non-stub) previewer registered. */
export function hasRealPreviewer(handlerId: string): boolean {
  return PREVIEWERS[handlerId] != null && PREVIEWERS[handlerId] !== stubPreviewer
}
