/**
 * Real Graph executor handlers for Conditional Access policy actions.
 * (C13 — replacing the stubs registered in src/lib/compliance/actions/executors.ts.)
 *
 * Idempotency: every TCT-managed CA policy carries a stable displayName
 * prefix (TCT_POLICY_MARKER). Apply handlers look the policy up first
 * and skip the create if it already exists. Remove handlers look up by
 * the same marker and DELETE if found, no-op otherwise. The result is
 * that repeat clicks on the Remediate button are safe — nothing
 * duplicates, nothing throws on second invocation.
 *
 * Permissions: the TCT Customer Portal app registration must hold
 * `Policy.ReadWrite.ConditionalAccess` granted at tenant consent time.
 * Without it the POST/DELETE Graph calls return 403 and the executor
 * surfaces the error. Reading existing policies works with the lower
 * `Policy.Read.All` scope the collector already uses.
 *
 * Break-glass accounts: by design these policies do NOT auto-exclude
 * break-glass / emergency-access accounts. The catalog declares the
 * `break_glass_accounts_excluded` precondition as `unknown`, so the
 * operator gets a manual-verify prompt during preview. Adding an
 * automated exclusion requires a customer-specific group id we don't
 * track yet — wire that up before flipping the precondition to `pass`.
 *
 * Microsoft Graph docs:
 *   https://learn.microsoft.com/graph/api/conditionalaccessroot-post-policies
 *   https://learn.microsoft.com/graph/api/conditionalaccesspolicy-delete
 */

import { getGraphTokenForCompany, graphRequest } from '@/lib/graph'
import type { ExecutorContext, ExecutorResult } from '../executors'
import type { PreviewerContext, ImpactPreview, AffectedEntity } from '../previewers'

/** Display-name prefix that identifies TCT-managed Conditional Access policies. */
export const TCT_POLICY_MARKER = '[TCT-MANAGED]'

const MFA_ALL_NAME = `${TCT_POLICY_MARKER} Require MFA — All Users`
const BLOCK_LEGACY_NAME = `${TCT_POLICY_MARKER} Block Legacy Authentication`

interface ConditionalAccessPolicy {
  id: string
  displayName: string
  state: 'enabled' | 'disabled' | 'enabledForReportingButNotEnforced'
  createdDateTime?: string
  modifiedDateTime?: string
}

/**
 * Look up a single TCT-managed CA policy by its exact display name.
 * Returns null when not found. Filters server-side via $filter so even
 * tenants with hundreds of policies stay cheap.
 */
async function findManagedPolicy(token: string, displayName: string): Promise<ConditionalAccessPolicy | null> {
  // Graph supports $filter on displayName for CA policies (eq operator).
  // The path is part of the identity API — same root the collector reads.
  const escaped = displayName.replace(/'/g, "''")
  const res = await graphRequest<{ value: ConditionalAccessPolicy[] }>(
    token,
    `/identity/conditionalAccess/policies?$filter=displayName eq '${encodeURIComponent(escaped)}'&$select=id,displayName,state,createdDateTime,modifiedDateTime`
  )
  return res?.value?.[0] ?? null
}

async function getTokenOrFail(ctx: ExecutorContext): Promise<{ token: string } | { failure: ExecutorResult }> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) {
    return {
      failure: {
        success: false,
        summary: 'Microsoft 365 is not connected for this customer — cannot run Graph executor.',
        details: { handler: ctx.action.executor.kind === 'automated' ? ctx.action.executor.handler : null },
      },
    }
  }
  return { token }
}

// ---------------------------------------------------------------------------
// MFA — All Users
// ---------------------------------------------------------------------------

/**
 * POST a "Require MFA — All Users" Conditional Access policy. Idempotent:
 * if a policy with the managed display name already exists, returns
 * success without creating a duplicate.
 *
 * Policy shape: applies to all users + all cloud apps + requires MFA.
 * State = `enabled` (per the catalog's impact text, users will be
 * prompted on next sign-in). If you want a report-only rollout first,
 * extend the action catalog with a separate handler — don't switch this
 * one to report-only silently or the audit log will lie.
 */
export async function applyMfaAllPolicy(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedPolicy(t.token, MFA_ALL_NAME)
    if (existing) {
      return {
        success: true,
        summary: `MFA — All Users policy already in place (id ${existing.id}, state: ${existing.state}). No change made.`,
        details: { policyId: existing.id, state: existing.state, alreadyExisted: true },
      }
    }

    const body = {
      displayName: MFA_ALL_NAME,
      state: 'enabled',
      conditions: {
        applications: { includeApplications: ['All'] },
        users: { includeUsers: ['All'] },
      },
      grantControls: {
        operator: 'OR',
        builtInControls: ['mfa'],
      },
    }

    const created = await graphRequest<ConditionalAccessPolicy>(
      t.token,
      '/identity/conditionalAccess/policies',
      { method: 'POST', body: JSON.stringify(body) }
    )

    return {
      success: true,
      summary: `Created CA policy "${MFA_ALL_NAME}" (id ${created.id}, state: ${created.state}). Users will be prompted to enroll in Microsoft Authenticator on next sign-in.`,
      details: { policyId: created.id, state: created.state, alreadyExisted: false },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to apply MFA — All Users policy: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * DELETE the TCT-managed "Require MFA — All Users" policy. Idempotent:
 * succeeds with no-op when the policy doesn't exist.
 */
export async function removeMfaAllPolicy(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedPolicy(t.token, MFA_ALL_NAME)
    if (!existing) {
      return {
        success: true,
        summary: 'No TCT-managed MFA — All Users policy found. Nothing to remove.',
        details: { alreadyRemoved: true },
      }
    }
    await graphRequest<void>(
      t.token,
      `/identity/conditionalAccess/policies/${existing.id}`,
      { method: 'DELETE' }
    )
    return {
      success: true,
      summary: `Removed CA policy "${MFA_ALL_NAME}" (was id ${existing.id}). Users will no longer be prompted for MFA.`,
      details: { removedPolicyId: existing.id },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to remove MFA — All Users policy: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Block Legacy Authentication
// ---------------------------------------------------------------------------

/**
 * POST a "Block Legacy Authentication" Conditional Access policy.
 * Targets the `exchangeActiveSync` and `other` client app types, which
 * Microsoft documents as the legacy / basic-auth protocols (IMAP, POP,
 * MAPI, EWS, etc.).
 *
 * Idempotent the same way applyMfaAllPolicy is.
 */
export async function applyBlockLegacyAuthPolicy(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedPolicy(t.token, BLOCK_LEGACY_NAME)
    if (existing) {
      return {
        success: true,
        summary: `Block Legacy Authentication policy already in place (id ${existing.id}, state: ${existing.state}). No change made.`,
        details: { policyId: existing.id, state: existing.state, alreadyExisted: true },
      }
    }

    const body = {
      displayName: BLOCK_LEGACY_NAME,
      state: 'enabled',
      conditions: {
        applications: { includeApplications: ['All'] },
        users: { includeUsers: ['All'] },
        clientAppTypes: ['exchangeActiveSync', 'other'],
      },
      grantControls: {
        operator: 'OR',
        builtInControls: ['block'],
      },
    }

    const created = await graphRequest<ConditionalAccessPolicy>(
      t.token,
      '/identity/conditionalAccess/policies',
      { method: 'POST', body: JSON.stringify(body) }
    )

    return {
      success: true,
      summary: `Created CA policy "${BLOCK_LEGACY_NAME}" (id ${created.id}, state: ${created.state}). Legacy authentication clients will be blocked at next sign-in attempt.`,
      details: { policyId: created.id, state: created.state, alreadyExisted: false },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to apply Block Legacy Authentication policy: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Previewers — read-only sibling of each executor. Reports current policy
// state + an enabled-user-count estimate so the Remediate modal shows the
// operator real data instead of the "preview unavailable" stub.
// ---------------------------------------------------------------------------

/**
 * Count enabled user accounts in the tenant. A cheap top-line stat
 * that lets the previewer say "this will affect approximately N
 * users" without enumerating every individual user. Uses $count
 * (constant-time) to keep the call snappy even on large tenants.
 */
async function countEnabledUsers(token: string): Promise<number | null> {
  try {
    const res = await graphRequest<number>(
      token,
      "/users/$count?$filter=accountEnabled eq true",
      { headers: { ConsistencyLevel: 'eventual' } }
    )
    return typeof res === 'number' ? res : Number(res)
  } catch {
    return null
  }
}

function previewSummaryNotConnected(): ImpactPreview {
  return {
    totalAffected: 0,
    entities: [],
    truncated: false,
    summary: 'Microsoft 365 is not connected for this customer — cannot preview impact.',
    isLiveQuery: false,
    warnings: ['Connect M365 (step 3) before previewing or applying this action.'],
  }
}

function policyEntity(displayName: string, state: string, id?: string): AffectedEntity {
  return {
    id: id ?? displayName,
    displayName,
    type: 'policy',
    currentState: state,
  }
}

/**
 * Preview: would creating the MFA-All CA policy be a no-op (already
 * present) or a real create? Plus how many users it'd cover.
 */
export async function previewApplyMfaAllPolicy(ctx: PreviewerContext): Promise<ImpactPreview> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) return previewSummaryNotConnected()

  try {
    const [existing, userCount] = await Promise.all([
      findManagedPolicy(token, MFA_ALL_NAME),
      countEnabledUsers(token),
    ])
    const total = userCount ?? 0
    if (existing) {
      return {
        totalAffected: total,
        entities: [policyEntity(existing.displayName, existing.state, existing.id)],
        truncated: false,
        summary: `Policy already exists (state: ${existing.state}). Applying again is a no-op. ${total} enabled users are in scope.`,
        isLiveQuery: true,
      }
    }
    return {
      totalAffected: total,
      entities: [policyEntity(MFA_ALL_NAME, 'will be created (enabled)')],
      truncated: false,
      summary: `Will create CA policy "${MFA_ALL_NAME}" (state: enabled). ${total} enabled users in scope; they will be prompted to enroll in MFA on next sign-in.`,
      isLiveQuery: true,
      warnings: total === 0
        ? ['Could not enumerate user count — Reports.Read.All / User.Read.All may be missing. Apply still works.']
        : undefined,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: `Preview query failed: ${err instanceof Error ? err.message : String(err)}`,
      isLiveQuery: false,
      warnings: ['Live preview failed; the apply step may still work depending on the underlying error.'],
    }
  }
}

/**
 * Preview: does the TCT-managed MFA-All policy actually exist to remove?
 */
export async function previewRemoveMfaAllPolicy(ctx: PreviewerContext): Promise<ImpactPreview> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) return previewSummaryNotConnected()

  try {
    const existing = await findManagedPolicy(token, MFA_ALL_NAME)
    if (!existing) {
      return {
        totalAffected: 0,
        entities: [],
        truncated: false,
        summary: 'No TCT-managed MFA-All policy is in place. Rollback is a no-op.',
        isLiveQuery: true,
      }
    }
    const userCount = (await countEnabledUsers(token)) ?? 0
    return {
      totalAffected: userCount,
      entities: [policyEntity(existing.displayName, existing.state, existing.id)],
      truncated: false,
      summary: `Will delete CA policy "${existing.displayName}" (state: ${existing.state}). ${userCount} users will no longer be required to use MFA.`,
      isLiveQuery: true,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: `Preview query failed: ${err instanceof Error ? err.message : String(err)}`,
      isLiveQuery: false,
    }
  }
}

/**
 * Preview: would creating the Block-Legacy-Auth CA policy be a no-op?
 */
export async function previewApplyBlockLegacyAuthPolicy(ctx: PreviewerContext): Promise<ImpactPreview> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) return previewSummaryNotConnected()

  try {
    const [existing, userCount] = await Promise.all([
      findManagedPolicy(token, BLOCK_LEGACY_NAME),
      countEnabledUsers(token),
    ])
    const total = userCount ?? 0
    if (existing) {
      return {
        totalAffected: total,
        entities: [policyEntity(existing.displayName, existing.state, existing.id)],
        truncated: false,
        summary: `Policy already exists (state: ${existing.state}). Applying again is a no-op.`,
        isLiveQuery: true,
      }
    }
    return {
      totalAffected: total,
      entities: [policyEntity(BLOCK_LEGACY_NAME, 'will be created (enabled)')],
      truncated: false,
      summary: `Will create CA policy "${BLOCK_LEGACY_NAME}" (state: enabled). ${total} users in scope. Legacy client sign-ins (IMAP/POP/EAS/etc.) will start failing.`,
      isLiveQuery: true,
      warnings: [
        'Identify any service accounts or older devices that depend on basic auth BEFORE applying — they will break at next sign-in.',
      ],
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: `Preview query failed: ${err instanceof Error ? err.message : String(err)}`,
      isLiveQuery: false,
    }
  }
}

/**
 * Preview: does the TCT-managed Block-Legacy-Auth policy exist to remove?
 */
export async function previewRemoveBlockLegacyAuthPolicy(ctx: PreviewerContext): Promise<ImpactPreview> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) return previewSummaryNotConnected()

  try {
    const existing = await findManagedPolicy(token, BLOCK_LEGACY_NAME)
    if (!existing) {
      return {
        totalAffected: 0,
        entities: [],
        truncated: false,
        summary: 'No TCT-managed Block-Legacy-Auth policy is in place. Rollback is a no-op.',
        isLiveQuery: true,
      }
    }
    return {
      totalAffected: 1,
      entities: [policyEntity(existing.displayName, existing.state, existing.id)],
      truncated: false,
      summary: `Will delete CA policy "${existing.displayName}" (state: ${existing.state}). Legacy authentication will be allowed again across the tenant.`,
      isLiveQuery: true,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: `Preview query failed: ${err instanceof Error ? err.message : String(err)}`,
      isLiveQuery: false,
    }
  }
}

/**
 * DELETE the TCT-managed "Block Legacy Authentication" policy.
 */
export async function removeBlockLegacyAuthPolicy(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedPolicy(t.token, BLOCK_LEGACY_NAME)
    if (!existing) {
      return {
        success: true,
        summary: 'No TCT-managed Block Legacy Authentication policy found. Nothing to remove.',
        details: { alreadyRemoved: true },
      }
    }
    await graphRequest<void>(
      t.token,
      `/identity/conditionalAccess/policies/${existing.id}`,
      { method: 'DELETE' }
    )
    return {
      success: true,
      summary: `Removed CA policy "${BLOCK_LEGACY_NAME}" (was id ${existing.id}). Legacy authentication is now allowed again.`,
      details: { removedPolicyId: existing.id },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to remove Block Legacy Authentication policy: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
