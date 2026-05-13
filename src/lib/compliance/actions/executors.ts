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
  // M365 / Entra
  'graph.applyConditionalAccessPolicy.mfaAll': stubHandler,
  'graph.removeConditionalAccessPolicy.mfaAll': stubHandler,
  'graph.applyConditionalAccessPolicy.blockLegacyAuth': stubHandler,
  'graph.removeConditionalAccessPolicy.blockLegacyAuth': stubHandler,
  'graph.enablePasswordProtection': stubHandler,
  'graph.disablePasswordProtection': stubHandler,

  // Defender / Intune
  'graph.applyIntuneConfigProfile.defenderRealtime': stubHandler,
  'graph.removeIntuneConfigProfile.defenderRealtime': stubHandler,
}

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
  // All handlers are stubs today; this returns false for everything until
  // real implementations land in C13. Used by the pending-change API to
  // require manual confirmation even for actions tagged as automated.
  return HANDLERS[handlerId] != null && HANDLERS[handlerId] !== stubHandler
}
