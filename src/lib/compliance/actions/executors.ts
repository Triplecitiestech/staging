/**
 * Remediation Executors
 *
 * Two kinds:
 *   - 'manual'    — staff carries the action out in a vendor console, then
 *                   marks it deployed. No code execution; the executor is
 *                   purely a "ready for deployment" gate.
 *   - 'automated' — a named handler in this registry is invoked. Handlers
 *                   are stubs today; real Graph / Intune / vendor API
 *                   implementations land in C13 follow-up work.
 *
 * The registry is the only place that maps `executor.handler` strings from
 * the catalog to actual code. Adding a new automated handler = adding an
 * entry here.
 *
 * Verification re-runs (the post-deployment evaluator pass) live elsewhere
 * in src/lib/compliance/engine.ts and are not the executor's concern.
 */

import type { RemediationAction } from './types'
import {
  applyMfaAllPolicy,
  removeMfaAllPolicy,
  applyBlockLegacyAuthPolicy,
  removeBlockLegacyAuthPolicy,
} from './executors/graph-ca-policies'
import {
  enablePasswordProtection,
  disablePasswordProtection,
} from './executors/graph-password-protection'
import {
  applyIntuneDefenderRealtime,
  removeIntuneDefenderRealtime,
} from './executors/intune-defender'
import {
  generatePolicyForControl,
} from './executors/policy-generate'

export interface ExecutorContext {
  /** TCT customer the action runs for. */
  companyId: string
  /** Staff member triggering the deployment. */
  staffEmail: string
  /** The exact action snapshot the pending change was staged against. */
  action: RemediationAction
  /** Free-form metadata captured on the pending change (deployment notes etc.). */
  metadata?: Record<string, unknown>
}

export interface ExecutorResult {
  /** True when execution succeeded; false to trigger rollback / surface alert. */
  success: boolean
  /** Human-readable summary, surfaced in audit log + admin UI. */
  summary: string
  /** Structured details (e.g., affected user count). Stored on the pending change. */
  details?: Record<string, unknown>
}

export type ExecutorHandler = (ctx: ExecutorContext) => Promise<ExecutorResult>

/**
 * Registry of automated handlers keyed by `executor.handler` from the catalog.
 *
 * Today every handler is a stub that succeeds without doing anything. The
 * stubs exist so the lifecycle state machine (drafted → ... → deployed →
 * verifying) can be tested end-to-end without real Graph calls. Real
 * implementations land in C13 follow-up — replace the stub with the real
 * Graph / Intune / vendor SDK call without changing this contract.
 */
const HANDLERS: Record<string, ExecutorHandler> = {
  // M365 / Entra — Conditional Access
  'graph.applyConditionalAccessPolicy.mfaAll': applyMfaAllPolicy,
  'graph.removeConditionalAccessPolicy.mfaAll': removeMfaAllPolicy,
  'graph.applyConditionalAccessPolicy.blockLegacyAuth': applyBlockLegacyAuthPolicy,
  'graph.removeConditionalAccessPolicy.blockLegacyAuth': removeBlockLegacyAuthPolicy,

  // Entra ID password protection (banned-password list + smart lockout)
  'graph.enablePasswordProtection': enablePasswordProtection,
  'graph.disablePasswordProtection': disablePasswordProtection,

  // Intune device configuration — Defender real-time monitoring
  'graph.applyIntuneConfigProfile.defenderRealtime': applyIntuneDefenderRealtime,
  'graph.removeIntuneConfigProfile.defenderRealtime': removeIntuneDefenderRealtime,

  // Policy generation — picks the right policy slug for the originating
  // control via FRAMEWORK_POLICY_MAPPINGS and generates/revises a draft.
  'policy.generate_for_control': generatePolicyForControl,
}

/** Handlers that are real implementations, not stubs. */
const REAL_HANDLERS = new Set<string>([
  'graph.applyConditionalAccessPolicy.mfaAll',
  'graph.removeConditionalAccessPolicy.mfaAll',
  'graph.applyConditionalAccessPolicy.blockLegacyAuth',
  'graph.removeConditionalAccessPolicy.blockLegacyAuth',
  'graph.enablePasswordProtection',
  'graph.disablePasswordProtection',
  'graph.applyIntuneConfigProfile.defenderRealtime',
  'graph.removeIntuneConfigProfile.defenderRealtime',
  'policy.generate_for_control',
])

async function stubHandler(ctx: ExecutorContext): Promise<ExecutorResult> {
  return {
    success: true,
    summary: `[stub] ${ctx.action.name} would be executed for company ${ctx.companyId}. Replace this handler with the real implementation before production rollout.`,
    details: { stub: true, handler: ctx.action.executor.kind === 'automated' ? ctx.action.executor.handler : null },
  }
}

/**
 * Run an action's executor. Manual executors return a success result that
 * indicates the action is "ready to be marked deployed" — the actual change
 * is performed by staff outside the platform, and the pending-change route
 * flips status to 'deployed' only when staff confirms. Automated executors
 * invoke the registered handler.
 */
export async function executeAction(ctx: ExecutorContext): Promise<ExecutorResult> {
  const exec = ctx.action.executor
  if (exec.kind === 'manual') {
    return {
      success: true,
      summary: `Manual action staged for ${ctx.action.name}. Staff must perform the change in the vendor console and then mark this pending change as deployed.`,
      details: { manual: true },
    }
  }
  const handler = HANDLERS[exec.handler]
  if (!handler) {
    return {
      success: false,
      summary: `No executor handler registered for "${exec.handler}". Update src/lib/compliance/actions/executors.ts.`,
    }
  }
  try {
    return await handler(ctx)
  } catch (err) {
    return {
      success: false,
      summary: `Executor "${exec.handler}" threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** Whether a given action has a real (non-stub) automated handler registered. */
export function hasRealHandler(handlerId: string): boolean {
  return REAL_HANDLERS.has(handlerId)
}
