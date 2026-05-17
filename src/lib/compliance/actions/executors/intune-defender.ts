/**
 * Real Graph executor handlers for Intune device configurations
 * that enable Microsoft Defender real-time protection on Windows
 * endpoints. (C13 — replacing the stubs.)
 *
 * Storage: a Windows 10 endpoint-protection configuration with
 * `defenderRealtimeMonitoringEnabled: true` is created, then
 * assigned to "All Devices" so it actually applies to enrolled
 * Windows endpoints. Both the configuration AND its assignment are
 * required — creating the profile without an assignment is a no-op
 * from the endpoint's perspective.
 *
 * Idempotency: profiles carry the same TCT_PROFILE_MARKER prefix on
 * displayName that the CA-policy executors use. find-then-create.
 * Removal also looks up by marker and DELETEs (cascade removes
 * assignments).
 *
 * Permissions needed on the customer's TCT Portal app reg:
 *   DeviceManagementConfiguration.ReadWrite.All
 *
 * Microsoft Graph docs:
 *   https://learn.microsoft.com/graph/api/intune-deviceconfig-deviceconfiguration-create
 *   https://learn.microsoft.com/graph/api/intune-shared-deviceconfigurationassignment-create
 */

import { getGraphTokenForCompany, graphRequest } from '@/lib/graph'
import type { ExecutorContext, ExecutorResult } from '../executors'
import type { PreviewerContext, ImpactPreview } from '../previewers'
import { formatGraphPreviewError } from './graph-error-format'

/** Display-name prefix that identifies TCT-managed Intune profiles. */
const TCT_PROFILE_MARKER = '[TCT-MANAGED]'
const DEFENDER_REALTIME_NAME = `${TCT_PROFILE_MARKER} Defender Real-Time Protection`

interface DeviceConfiguration {
  id: string
  displayName: string
  '@odata.type': string
  createdDateTime?: string
}

interface ListResp<T> {
  value: T[]
}

async function findManagedDefenderProfile(token: string): Promise<DeviceConfiguration | null> {
  // The deviceConfigurations endpoint doesn't support $filter on displayName
  // for every config type, so we list and filter client-side. Cheap because
  // Intune profiles are typically <100 per tenant.
  const res = await graphRequest<ListResp<DeviceConfiguration>>(
    token,
    '/deviceManagement/deviceConfigurations?$select=id,displayName'
  )
  return (res?.value ?? []).find((c) => c.displayName === DEFENDER_REALTIME_NAME) ?? null
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
 * Count Intune-enrolled Windows devices. Cheap top-line stat so the
 * preview can say "approximately N devices will receive this config".
 * Returns null if the query fails (permissions or scope issue) —
 * caller handles the fallback message.
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
 * Body for the windows10EndpointProtectionConfiguration POST.
 * Only the Defender realtime fields are set; everything else
 * inherits Intune defaults so we don't accidentally configure
 * BitLocker, firewall, etc.
 */
const DEFENDER_REALTIME_BODY = {
  '@odata.type': '#microsoft.graph.windows10EndpointProtectionConfiguration',
  displayName: DEFENDER_REALTIME_NAME,
  description: 'TCT-managed: enables Microsoft Defender real-time protection on enrolled Windows endpoints.',
  defenderRealtimeMonitoringEnabled: true,
  defenderMonitorFileActivity: 'monitorAllFiles',
  defenderBlockOnAccessProtectionEnabled: true,
  defenderScanIncomingMail: 'enable',
  defenderScanScriptsLoadedInInternetExplorer: 'enable',
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
 * Create the Defender realtime config AND assign it to All Devices.
 * Idempotent: existing TCT-managed profile = success, no change.
 */
export async function applyIntuneDefenderRealtime(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedDefenderProfile(t.token)
    if (existing) {
      return {
        success: true,
        summary: `Defender Real-Time Protection profile already exists (id ${existing.id}). No change made.`,
        details: { profileId: existing.id, alreadyExisted: true },
      }
    }

    // 1. Create the configuration.
    const created = await graphRequest<DeviceConfiguration>(
      t.token,
      '/deviceManagement/deviceConfigurations',
      { method: 'POST', body: JSON.stringify(DEFENDER_REALTIME_BODY) }
    )

    // 2. Assign it to All Devices. Without this the profile sits unused.
    await graphRequest<void>(
      t.token,
      `/deviceManagement/deviceConfigurations/${created.id}/assign`,
      { method: 'POST', body: JSON.stringify(ALL_DEVICES_ASSIGNMENT_BODY) }
    )

    return {
      success: true,
      summary: `Created Intune profile "${DEFENDER_REALTIME_NAME}" (id ${created.id}) and assigned it to All Devices. Defender real-time protection will be enforced on enrolled Windows endpoints within ~30 minutes.`,
      details: { profileId: created.id, alreadyExisted: false, assignedTo: 'all_devices' },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to apply Defender real-time protection: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * DELETE the TCT-managed Defender realtime profile. Assignments
 * cascade with the delete, so no separate cleanup needed.
 */
export async function removeIntuneDefenderRealtime(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findManagedDefenderProfile(t.token)
    if (!existing) {
      return {
        success: true,
        summary: 'No TCT-managed Defender Real-Time Protection profile found. Nothing to remove.',
        details: { alreadyRemoved: true },
      }
    }
    await graphRequest<void>(
      t.token,
      `/deviceManagement/deviceConfigurations/${existing.id}`,
      { method: 'DELETE' }
    )
    return {
      success: true,
      summary: `Removed Intune profile "${DEFENDER_REALTIME_NAME}" (was id ${existing.id}). Endpoints will revert to whatever Defender setting their next-most-specific Intune policy specifies.`,
      details: { removedProfileId: existing.id },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to remove Defender real-time protection profile: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Previewers
// ---------------------------------------------------------------------------

export async function previewApplyIntuneDefenderRealtime(ctx: PreviewerContext): Promise<ImpactPreview> {
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
    const [existing, deviceCount] = await Promise.all([
      findManagedDefenderProfile(t.token),
      countEnrolledWindowsDevices(t.token),
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
        summary: `Profile already in place (id ${existing.id}). Applying again is a no-op. ${total} Windows devices currently enrolled.`,
        isLiveQuery: true,
      }
    }
    return {
      totalAffected: total,
      entities: [{
        id: 'pending-create',
        displayName: DEFENDER_REALTIME_NAME,
        type: 'policy',
        currentState: 'not present',
        projectedState: 'enabled + assigned to all devices',
      }],
      truncated: false,
      summary: `Will create the profile and assign to All Devices. ${total} Windows devices will receive Defender real-time monitoring at next Intune check-in (~30 min).`,
      isLiveQuery: true,
      warnings: total === 0
        ? ['No Windows devices appear to be enrolled in Intune — the profile will be created but won\'t apply until devices enroll.']
        : undefined,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: formatGraphPreviewError(err, 'preview the Defender real-time protection apply'),
      isLiveQuery: false,
    }
  }
}

export async function previewRemoveIntuneDefenderRealtime(ctx: PreviewerContext): Promise<ImpactPreview> {
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
    const existing = await findManagedDefenderProfile(t.token)
    if (!existing) {
      return {
        totalAffected: 0,
        entities: [],
        truncated: false,
        summary: 'No TCT-managed Defender Real-Time Protection profile is present. Rollback is a no-op.',
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
      summary: `Will delete the profile. ${deviceCount} Windows devices will lose this realtime-monitoring enforcement at next Intune check-in.`,
      isLiveQuery: true,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: formatGraphPreviewError(err, 'preview the Defender real-time protection removal'),
      isLiveQuery: false,
    }
  }
}
