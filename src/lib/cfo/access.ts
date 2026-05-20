/**
 * CFO Dashboard access control.
 *
 * Access is granted if EITHER of two independent mechanisms passes:
 *
 *   1. Manual allowlist — the staff user holds the `view_cfo_dashboard`
 *      permission (baked into SUPER_ADMIN, or granted per-user via
 *      permissionOverrides on the staff_users row). This is the
 *      "just the people I choose" path and needs no Azure config.
 *
 *   2. Entra group membership — the user is a (transitive) member of one of
 *      the accounting/finance Entra security groups configured in
 *      CFO_DASHBOARD_ENTRA_GROUP_IDS. Checked live against TCT's own tenant
 *      via an app-only Microsoft Graph call (checkMemberGroups), reusing the
 *      token + request helpers in src/lib/graph.ts.
 *
 * The check FAILS CLOSED: any Graph error, missing config, or missing session
 * results in denial. This is a financial dashboard — never default to "allow".
 */

import type { Session } from 'next-auth'
import { hasPermission, type PermissionOverrides } from '@/lib/permissions'
import { getAccessToken, graphRequest } from '@/lib/graph'

// Short-lived per-isolate cache of Entra membership decisions, keyed by email.
// Membership changes rarely and the dashboard tolerates a few minutes of lag;
// this avoids a Graph round-trip on every request and nav render.
const GROUP_CACHE_TTL_MS = 5 * 60 * 1000
const groupCache = new Map<string, { allowed: boolean; expiresAt: number }>()

function configuredGroupIds(): string[] {
  return (process.env.CFO_DASHBOARD_ENTRA_GROUP_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Live Entra group membership check against TCT's own tenant.
 * Returns false (fail-closed) when groups aren't configured, Graph creds are
 * missing, or the Graph call fails.
 */
export async function isInCfoEntraGroup(email: string | null | undefined): Promise<boolean> {
  if (!email) return false

  const groupIds = configuredGroupIds()
  if (groupIds.length === 0) return false // group path disabled until configured

  const cacheKey = email.toLowerCase()
  const cached = groupCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.allowed

  const tenantId = process.env.AZURE_AD_TENANT_ID
  const clientId = process.env.AZURE_AD_CLIENT_ID
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    console.error('[cfo-access] AZURE_AD_* env vars missing — cannot check Entra group membership')
    return false
  }

  let allowed = false
  try {
    const token = await getAccessToken(tenantId, clientId, clientSecret)
    // checkMemberGroups returns the subset of the supplied IDs the user is a
    // (transitive) member of. App-only requires User.Read.All + GroupMember.Read.All.
    const res = await graphRequest<{ value: string[] }>(
      token,
      `/users/${encodeURIComponent(email)}/checkMemberGroups`,
      { method: 'POST', body: JSON.stringify({ groupIds }) }
    )
    allowed = Array.isArray(res?.value) && res.value.length > 0
  } catch (err) {
    // Fail closed. Common causes: user not found in tenant, or the app reg is
    // missing GroupMember.Read.All consent. Log without leaking the email.
    console.error('[cfo-access] Entra group check failed (denying):', err instanceof Error ? err.message : String(err))
    return false
  }

  groupCache.set(cacheKey, { allowed, expiresAt: Date.now() + GROUP_CACHE_TTL_MS })
  return allowed
}

/**
 * Resolve whether a session may access the CFO dashboard.
 * ORs the manual permission with the live Entra group check.
 */
export async function canAccessCfoDashboard(session: Session | null): Promise<boolean> {
  const email = session?.user?.email
  if (!email) return false

  // 1. Manual allowlist (synchronous, from the session) — checked first so the
  //    common owner/admin case never incurs a Graph call.
  const role = session.user?.role
  const overrides = session.user?.permissionOverrides as PermissionOverrides | null | undefined
  if (hasPermission(role, 'view_cfo_dashboard', overrides)) return true

  // 2. Entra finance/accounting group membership (live).
  return isInCfoEntraGroup(email)
}
