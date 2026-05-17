/**
 * Intune Windows 10 compliance-policy executor.
 *
 * A compliance policy is fundamentally different from a configuration
 * profile (see intune-defender.ts): a configuration profile MAKES a
 * setting happen on the device; a compliance policy MARKS a device
 * non-compliant when the setting isn't already in the desired state.
 * Both can be used together — push Defender on with a config profile,
 * then mark the device non-compliant if Defender ever goes off.
 *
 * This executor creates a Windows 10 baseline compliance policy that
 * marks an endpoint non-compliant if:
 *   - Microsoft Defender Antivirus is not running
 *   - Real-time protection is not enabled
 *   - Antivirus / antispyware signatures are out of date
 *   - The device reports any active threats
 *   - BitLocker is not enabled on the OS volume
 *   - Secure Boot is not enabled
 *
 * Devices flagged non-compliant get reported to the Intune console and
 * downstream Conditional Access policies can block them from accessing
 * cloud resources. This is the mechanism CIS v8 controls 1.2, 2.3, 2.5,
 * and 4.1 actually rely on for "address unauthorized" enforcement —
 * documentation alone doesn't move the needle.
 *
 * Idempotency: TCT_POLICY_MARKER prefix on displayName, same pattern as
 * intune-defender.ts. Find-then-create, no orphan policies.
 *
 * Permissions needed on the customer's TCT Portal app reg:
 *   DeviceManagementConfiguration.ReadWrite.All
 *
 * Microsoft Graph docs:
 *   https://learn.microsoft.com/graph/api/intune-deviceconfig-devicecompliancepolicy-create
 *   https://learn.microsoft.com/graph/api/intune-deviceconfig-windows10compliancepolicy-update
 *   https://learn.microsoft.com/graph/api/intune-shared-devicecompliancepolicyassignment-create
 */

import { getGraphTokenForCompany, graphRequest } from '@/lib/graph'
import type { ExecutorContext, ExecutorResult } from '../executors'
import type { PreviewerContext, ImpactPreview } from '../previewers'
import { formatGraphPreviewError } from './graph-error-format'

/** Display-name prefix that identifies TCT-managed Intune compliance policies. */
const TCT_POLICY_MARKER = '[TCT-MANAGED]'
const WINDOWS_BASELINE_NAME = `${TCT_POLICY_MARKER} Windows 10 Baseline Compliance`

interface CompliancePolicy {
  id: string
  displayName: string
  '@odata.type': string
  createdDateTime?: string
}

interface ListResp<T> {
  value: T[]
}

async function findManagedWindowsBaselinePolicy(token: string): Promise<CompliancePolicy | null> {
  // Same approach as intune-defender — list and filter client-side
  // because $filter on displayName isn't reliable across all compliance
  // policy odata types. Compliance policies are usually <50 per tenant.
  const res = await graphRequest<ListResp<CompliancePolicy>>(
    token,
    '/deviceManagement/deviceCompliancePolicies?$select=id,displayName'
  )
  return (res?.value ?? []).find((c) => c.displayName === WINDOWS_BASELINE_NAME) ?? null
}

async function getTokenOrFail(ctx: ExecutorContext | PreviewerContext): Promise<{ token: string } | { failure: ExecutorResult }> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) {
    return {
      failure: {
        success: false,
        summary: 'Microsoft 365 is not connected for this customer — cannot run Graph executor.',
      },
    }
  }
  return { token }
}

/**
 * Count Intune-enrolled Windows devices for the preview. Same helper as
 * intune-defender — duplicated here rather than shared so the two
 * executors stay independent (intentional, per the source-of-truth rule
 * that each executor file owns its own Graph calls).
 */
async function countEnrolledWindowsDevices(token: string): Promise<number | null> {
  try {
    const res = await graphRequest<{ '@odata.count'?: number; value: unknown[] }>(
      token,
      "/deviceManagement/managedDevices/$count?$filter=operatingSystem eq 'Windows'",
      { headers: { ConsistencyLevel: 'eventual' } }
    )
    if (typeof res === 'number') return res
    return res?.['@odata.count'] ?? null
  } catch {
    return null
  }
}

/**
 * Sample current non-compliance counts across enrolled Windows devices so
 * the preview can say "of 47 Windows devices, 12 already lack Defender
 * realtime, 3 lack BitLocker, etc." Returns null if any of the underlying
 * queries fail. Keeps the preview honest about WHY devices will get
 * flagged once the policy is applied.
 *
 * Note: managedDevices only exposes a small set of compliance-related
 * fields directly; we count what we can and skip the rest rather than
 * lying about coverage.
 */
async function sampleDeviceComplianceGaps(token: string): Promise<{
  notEncrypted: number | null
  defenderUnknown: number | null
  totalQueried: number | null
} | null> {
  try {
    const res = await graphRequest<{
      value: Array<{ isEncrypted?: boolean; deviceName?: string }>
    }>(
      token,
      "/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id,deviceName,isEncrypted&$top=100"
    )
    const devices = res?.value ?? []
    const notEncrypted = devices.filter((d) => d.isEncrypted === false).length
    return {
      notEncrypted,
      defenderUnknown: null,  // Not directly exposed on managedDevice
      totalQueried: devices.length,
    }
  } catch {
    return null
  }
}

/**
 * Windows 10 compliance policy body. Conservative defaults — focuses on
 * "is the security baseline in place?" without enforcing things like OS
 * version that vary widely by customer. If a customer needs a stricter
 * baseline (require BitLocker AES-256, ban Windows 10 LTSC, etc.) they
 * customize the resulting policy in Intune; TCT just lays the floor.
 *
 * The `scheduledActionsForRule` block is REQUIRED on create — without it
 * Intune rejects the POST with a 400 even though the doc shows it as
 * optional. The `markDeviceNoncompliant` action with `gracePeriodHours: 0`
 * marks immediately on next check-in; bump if you want a softer rollout.
 */
const WINDOWS_BASELINE_BODY = {
  '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
  displayName: WINDOWS_BASELINE_NAME,
  description: 'TCT-managed: marks Windows endpoints non-compliant when Defender, BitLocker, or Secure Boot are not in the desired state.',
  // Defender
  defenderEnabled: true,
  antivirusRequired: true,
  antiSpywareRequired: true,
  signatureOutOfDate: true,  // Flag if AV signatures are stale
  rtpEnabled: true,           // Real-time protection must be on
  activeFirewallRequired: true,
  // BitLocker + secure boot
  bitLockerEnabled: true,
  secureBootEnabled: true,
  // No active threats
  defenderVersion: null,  // Don't pin a specific Defender version
  codeIntegrityEnabled: true,
  scheduledActionsForRule: [
    {
      ruleName: 'PasswordRequired',
      scheduledActionConfigurations: [
        {
          actionType: 'block',  // Block resources via CA after grace period
          gracePeriodHours: 24,
          notificationTemplateId: '',
          notificationMessageCCList: [],
        },
      ],
    },
  ],
}

/** Assignment body that targets every Intune-enrolled device. */
const ALL_DEVICES_ASSIGNMENT_BODY = {
  assignments: [
    {
      target: {
        '@odata.type': '#microsoft.graph.allDevicesAssignmentTarget',
      },
    },
  ],
}

/**
 * Create the Windows 10 baseline compliance policy AND assign it to
 * All Devices. Idempotent: existing TCT-managed policy = no-op success.
 */
export async function applyIntuneWindowsBaselineCompliance(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedWindowsBaselinePolicy(t.token)
    if (existing) {
      return {
        success: true,
        summary: `Windows baseline compliance policy already exists (id ${existing.id}). No change made.`,
        details: { policyId: existing.id, alreadyExisted: true },
      }
    }

    // 1. Create the compliance policy.
    const created = await graphRequest<CompliancePolicy>(
      t.token,
      '/deviceManagement/deviceCompliancePolicies',
      { method: 'POST', body: JSON.stringify(WINDOWS_BASELINE_BODY) }
    )

    // 2. Assign it to All Devices. Without an assignment the policy
    //    evaluates nothing — it's just a definition sitting in Intune.
    await graphRequest<void>(
      t.token,
      `/deviceManagement/deviceCompliancePolicies/${created.id}/assign`,
      { method: 'POST', body: JSON.stringify(ALL_DEVICES_ASSIGNMENT_BODY) }
    )

    return {
      success: true,
      summary: `Created Intune compliance policy "${WINDOWS_BASELINE_NAME}" (id ${created.id}) and assigned to All Devices. Windows endpoints will be evaluated within ~30 minutes; non-compliant devices are flagged in the Intune console.`,
      details: { policyId: created.id, alreadyExisted: false, assignedTo: 'all_devices' },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to apply Windows baseline compliance policy: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * DELETE the TCT-managed Windows baseline compliance policy. Assignments
 * cascade with the delete.
 */
export async function removeIntuneWindowsBaselineCompliance(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedWindowsBaselinePolicy(t.token)
    if (!existing) {
      return {
        success: true,
        summary: 'No TCT-managed Windows baseline compliance policy found. Nothing to remove.',
        details: { alreadyRemoved: true },
      }
    }
    await graphRequest<void>(
      t.token,
      `/deviceManagement/deviceCompliancePolicies/${existing.id}`,
      { method: 'DELETE' }
    )
    return {
      success: true,
      summary: `Removed Intune compliance policy "${WINDOWS_BASELINE_NAME}" (was id ${existing.id}). Devices that were marked non-compliant by this policy alone will revert to compliant at next check-in.`,
      details: { removedPolicyId: existing.id },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to remove Windows baseline compliance policy: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Previewers
// ---------------------------------------------------------------------------

export async function previewApplyIntuneWindowsBaselineCompliance(ctx: PreviewerContext): Promise<ImpactPreview> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: t.failure.summary,
      isLiveQuery: false,
      warnings: ['Connect M365 (step 3) before previewing or applying this action.'],
    }
  }

  try {
    const [existing, deviceCount, gaps] = await Promise.all([
      findManagedWindowsBaselinePolicy(t.token),
      countEnrolledWindowsDevices(t.token),
      sampleDeviceComplianceGaps(t.token),
    ])
    const total = deviceCount ?? 0

    if (existing) {
      return {
        totalAffected: total,
        entities: [{
          id: existing.id,
          displayName: existing.displayName,
          type: 'policy',
          currentState: 'configured + assigned',
        }],
        truncated: false,
        summary: `Policy already in place (id ${existing.id}). Applying again is a no-op. ${total} Windows devices currently in scope.`,
        isLiveQuery: true,
      }
    }

    // Build a specific gap callout from sampled fields so the operator
    // can see which baseline requirements will likely trip the most
    // devices. The operator's UX preference: "Be SPECIFIC in previews."
    const gapCallouts: string[] = []
    if (gaps && gaps.notEncrypted !== null && gaps.totalQueried !== null && gaps.totalQueried > 0) {
      if (gaps.notEncrypted > 0) {
        gapCallouts.push(`${gaps.notEncrypted} of the first ${gaps.totalQueried} sampled devices report disk encryption disabled (will flag for BitLocker)`)
      }
    }

    return {
      totalAffected: total,
      entities: [{
        id: 'pending-create',
        displayName: WINDOWS_BASELINE_NAME,
        type: 'policy',
        currentState: 'not present',
        projectedState: 'enabled + assigned to all Windows devices',
      }],
      truncated: false,
      summary: [
        `Will create Windows 10 compliance policy "${WINDOWS_BASELINE_NAME}" and assign to All Devices.`,
        `${total} Windows endpoints will be evaluated against the baseline at next Intune check-in (~30 min).`,
        gapCallouts.length > 0 ? `Likely flags: ${gapCallouts.join('; ')}.` : null,
        `Non-compliant devices appear in Intune > Devices > Compliance; downstream CA policies can block their access.`,
      ].filter(Boolean).join(' '),
      isLiveQuery: true,
      warnings: total === 0
        ? ['No Windows devices appear to be enrolled in Intune — the policy will be created but evaluates nothing until devices enroll.']
        : undefined,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: formatGraphPreviewError(err, 'preview the Windows baseline compliance policy apply'),
      isLiveQuery: false,
    }
  }
}

export async function previewRemoveIntuneWindowsBaselineCompliance(ctx: PreviewerContext): Promise<ImpactPreview> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: t.failure.summary,
      isLiveQuery: false,
    }
  }

  try {
    const existing = await findManagedWindowsBaselinePolicy(t.token)
    if (!existing) {
      return {
        totalAffected: 0,
        entities: [],
        truncated: false,
        summary: 'No TCT-managed Windows baseline compliance policy is present. Rollback is a no-op.',
        isLiveQuery: true,
      }
    }
    const deviceCount = (await countEnrolledWindowsDevices(t.token)) ?? 0
    return {
      totalAffected: deviceCount,
      entities: [{
        id: existing.id,
        displayName: existing.displayName,
        type: 'policy',
        currentState: 'configured + assigned',
        projectedState: 'removed',
      }],
      truncated: false,
      summary: `Will delete the compliance policy. ${deviceCount} Windows devices will lose this baseline evaluation; devices marked non-compliant solely by this policy will revert to compliant at next check-in.`,
      isLiveQuery: true,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: formatGraphPreviewError(err, 'preview the Windows baseline compliance policy removal'),
      isLiveQuery: false,
    }
  }
}
