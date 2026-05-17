/**
 * Real Graph executor handlers for Entra ID password protection.
 * (C13 — replacing the stubs in src/lib/compliance/actions/executors.ts.)
 *
 * What this configures: the Entra ID "Password protection" feature
 * that rejects passwords matching either a Microsoft-curated global
 * banned-words list or a tenant-specific list, and applies smart
 * lockout for failed sign-in attempts.
 *
 * Storage: the configuration lives in a Directory Settings object on
 * the tenant, instantiated from the "Password Rule Settings" template
 * (Microsoft-published template id 5cf42378-d67d-4f36-ba46-e8b86229381d).
 * The settings object is at most ONE per tenant for this template, so
 * idempotency = look up by templateId, create if missing, update if
 * present-but-not-enforced.
 *
 * Permissions needed on the customer's TCT Portal app reg:
 *   Directory.ReadWrite.All
 *
 * Microsoft Graph docs:
 *   https://learn.microsoft.com/graph/api/directorysetting-post-settings
 *   https://learn.microsoft.com/azure/active-directory/authentication/concept-password-ban-bad
 */

import { getGraphTokenForCompany, graphRequest } from '@/lib/graph'
import type { ExecutorContext, ExecutorResult } from '../executors'
import type { PreviewerContext, ImpactPreview } from '../previewers'
import { formatGraphPreviewError } from './graph-error-format'

/** Microsoft-published template id for the "Password Rule Settings" template. */
const PASSWORD_RULE_TEMPLATE_ID = '5cf42378-d67d-4f36-ba46-e8b86229381d'

interface DirectorySetting {
  id: string
  displayName: string
  templateId: string
  values: Array<{ name: string; value: string }>
}

interface DirectorySettingsList {
  value: DirectorySetting[]
}

async function findPasswordRuleSettings(token: string): Promise<DirectorySetting | null> {
  const res = await graphRequest<DirectorySettingsList>(
    token,
    `/settings?$filter=templateId eq '${PASSWORD_RULE_TEMPLATE_ID}'`
  )
  return res?.value?.[0] ?? null
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

/** Default banned-password / lockout values when enabling. */
const ENFORCED_VALUES: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'BannedPasswordCheckOnPremisesMode', value: 'Enforced' },
  { name: 'EnableBannedPasswordCheckOnPremises', value: 'true' },
  { name: 'EnableBannedPasswordCheck', value: 'true' },
  { name: 'LockoutDurationInSeconds', value: '60' },
  { name: 'LockoutThreshold', value: '10' },
  // BannedPasswordList stays empty by default — operator can add
  // tenant-specific terms (company name, product names, etc.) via
  // the Entra portal once the setting object exists. The global
  // Microsoft list is always applied.
  { name: 'BannedPasswordList', value: '' },
]

/**
 * POST or PATCH the password-rule directory settings object so the
 * banned-password check is enforced. Idempotent: settings already in
 * the enforced state are returned unchanged.
 */
export async function enablePasswordProtection(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findPasswordRuleSettings(t.token)
    const valuesMap = (existing?.values ?? []).reduce<Record<string, string>>((acc, v) => {
      acc[v.name] = v.value
      return acc
    }, {})

    // If every key already matches our enforced defaults, return no-op.
    const alreadyEnforced = ENFORCED_VALUES.every((v) => valuesMap[v.name] === v.value)
    if (existing && alreadyEnforced) {
      return {
        success: true,
        summary: `Password protection is already enforced (settings id ${existing.id}). No change made.`,
        details: { settingsId: existing.id, alreadyEnforced: true },
      }
    }

    if (existing) {
      // PATCH the existing settings object — Graph requires the FULL values
      // array, not a partial update. Merge enforced values over whatever
      // the tenant already has so we don't lose customizations like a
      // populated BannedPasswordList.
      const mergedValues = [
        ...existing.values.filter((v) => !ENFORCED_VALUES.some((ev) => ev.name === v.name)),
        ...ENFORCED_VALUES.map((ev) =>
          // Preserve a non-empty BannedPasswordList if the tenant set one.
          ev.name === 'BannedPasswordList' && valuesMap[ev.name]
            ? { name: ev.name, value: valuesMap[ev.name] }
            : ev
        ),
      ]
      await graphRequest<void>(
        t.token,
        `/settings/${existing.id}`,
        { method: 'PATCH', body: JSON.stringify({ values: mergedValues }) }
      )
      return {
        success: true,
        summary: `Updated password protection settings (id ${existing.id}) to enforced mode.`,
        details: { settingsId: existing.id, alreadyEnforced: false, mode: 'patch' },
      }
    }

    // No settings object yet — create one from the template.
    const created = await graphRequest<DirectorySetting>(
      t.token,
      '/settings',
      {
        method: 'POST',
        body: JSON.stringify({
          templateId: PASSWORD_RULE_TEMPLATE_ID,
          values: ENFORCED_VALUES,
        }),
      }
    )
    return {
      success: true,
      summary: `Enabled password protection (settings id ${created.id}). Common weak passwords will be rejected at next password change.`,
      details: { settingsId: created.id, alreadyEnforced: false, mode: 'create' },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to enable password protection: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * DELETE the password-rule directory settings object so the banned-
 * password enforcement reverts to off (the Entra default).
 */
export async function disablePasswordProtection(ctx: ExecutorContext): Promise<ExecutorResult> {
  const t = await getTokenOrFail(ctx)
  if ('failure' in t) return t.failure

  try {
    const existing = await findPasswordRuleSettings(t.token)
    if (!existing) {
      return {
        success: true,
        summary: 'Password protection settings object does not exist. Tenant is already in the default (off) state.',
        details: { alreadyRemoved: true },
      }
    }
    await graphRequest<void>(
      t.token,
      `/settings/${existing.id}`,
      { method: 'DELETE' }
    )
    return {
      success: true,
      summary: `Removed password protection settings (was id ${existing.id}). Banned-password check is no longer enforced.`,
      details: { removedSettingsId: existing.id },
    }
  } catch (err) {
    return {
      success: false,
      summary: `Failed to disable password protection: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Previewers
// ---------------------------------------------------------------------------

export async function previewEnablePasswordProtection(ctx: PreviewerContext): Promise<ImpactPreview> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: 'Microsoft 365 is not connected for this customer — cannot preview impact.',
      isLiveQuery: false,
      warnings: ['Connect M365 (step 3) before previewing or applying this action.'],
    }
  }

  try {
    const existing = await findPasswordRuleSettings(token)
    if (existing) {
      const mode = existing.values.find((v) => v.name === 'BannedPasswordCheckOnPremisesMode')?.value ?? '(unknown)'
      return {
        totalAffected: 1,
        entities: [{
          id: existing.id,
          displayName: 'Password Rule Settings',
          type: 'policy',
          currentState: `mode: ${mode}`,
          projectedState: 'mode: Enforced',
        }],
        truncated: false,
        summary: `Password Rule Settings already exists (current mode: ${mode}). Will switch to Enforced mode if not already.`,
        isLiveQuery: true,
      }
    }
    return {
      totalAffected: 1,
      entities: [{
        id: 'pending-create',
        displayName: 'Password Rule Settings',
        type: 'policy',
        currentState: 'not configured',
        projectedState: 'enabled (Enforced)',
      }],
      truncated: false,
      summary: 'No password-rule settings object exists yet. Will create one with banned-password enforcement enabled.',
      isLiveQuery: true,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: formatGraphPreviewError(err, 'preview the Entra password-protection change'),
      isLiveQuery: false,
    }
  }
}

export async function previewDisablePasswordProtection(ctx: PreviewerContext): Promise<ImpactPreview> {
  const token = await getGraphTokenForCompany(ctx.companyId)
  if (!token) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: 'Microsoft 365 is not connected for this customer — cannot preview impact.',
      isLiveQuery: false,
    }
  }

  try {
    const existing = await findPasswordRuleSettings(token)
    if (!existing) {
      return {
        totalAffected: 0,
        entities: [],
        truncated: false,
        summary: 'No password-rule settings object exists. Rollback is a no-op.',
        isLiveQuery: true,
      }
    }
    return {
      totalAffected: 1,
      entities: [{
        id: existing.id,
        displayName: 'Password Rule Settings',
        type: 'policy',
        currentState: 'configured',
        projectedState: 'removed',
      }],
      truncated: false,
      summary: `Will delete the Password Rule Settings object (id ${existing.id}). Tenant reverts to default behavior (banned-password check off).`,
      isLiveQuery: true,
    }
  } catch (err) {
    return {
      totalAffected: 0,
      entities: [],
      truncated: false,
      summary: formatGraphPreviewError(err, 'preview the Entra password-protection change'),
      isLiveQuery: false,
    }
  }
}
