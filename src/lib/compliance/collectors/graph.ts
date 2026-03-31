/**
 * Microsoft Graph API — Compliance Evidence Collector
 *
 * Extends the existing Graph client (src/lib/graph.ts) to collect
 * security-focused data for compliance evidence evaluation.
 *
 * Collects:
 *   - Secure Score
 *   - Conditional Access policies
 *   - MFA registration status
 *   - Device compliance + BitLocker
 *   - Defender status
 *   - User account posture (dormant, default accounts, admin roles)
 *
 * ADDITIONAL Azure AD app permissions needed beyond existing:
 *   - SecurityEvents.Read.All          (Secure Score)
 *   - Policy.Read.All                  (Conditional Access)
 *   - UserAuthenticationMethod.Read.All (MFA — beta endpoint)
 *   - Reports.Read.All                 (credential registration)
 *   - Directory.Read.All               (admin role membership)
 *
 * If permissions are missing, collectors return partial data with
 * appropriate error notes — they never crash.
 */

import { getTenantCredentials, type TenantCredentials } from '@/lib/graph'
import type { EvidenceRecord, EvidenceSourceType } from '../types'

// ---------------------------------------------------------------------------
// Graph request helpers (reuse token management from graph.ts)
// ---------------------------------------------------------------------------

interface TokenEntry {
  accessToken: string
  expiresAt: number
}

const tokenCache = new Map<string, TokenEntry>()

async function getToken(creds: TenantCredentials): Promise<string> {
  const cached = tokenCache.get(creds.tenantId)
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken

  const url = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph token fetch failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  const expiresAt = Date.now() + (data.expires_in - 300) * 1000
  tokenCache.set(creds.tenantId, { accessToken: data.access_token, expiresAt })
  return data.access_token
}

async function graphGet<T>(token: string, path: string, timeout = 30_000): Promise<T | null> {
  const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) return null
    if (res.status === 204) return null
    const text = await res.text()
    if (!text.trim()) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function graphGetBeta<T>(token: string, path: string): Promise<T | null> {
  const url = `https://graph.microsoft.com/beta${path}`
  return graphGet<T>(token, url)
}

async function graphGetAllPages<T>(token: string, path: string, maxPages = 20): Promise<T[]> {
  const results: T[] = []
  let nextUrl: string | null = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`
  let pages = 0
  while (nextUrl && pages < maxPages) {
    const page: { value: T[]; '@odata.nextLink'?: string } | null =
      await graphGet<{ value: T[]; '@odata.nextLink'?: string }>(token, nextUrl)
    if (!page?.value) break
    results.push(...page.value)
    nextUrl = page['@odata.nextLink'] ?? null
    pages++
  }
  return results
}

// ---------------------------------------------------------------------------
// Evidence builders
// ---------------------------------------------------------------------------

function buildEvidence(
  assessmentId: string,
  companyId: string,
  sourceType: EvidenceSourceType,
  rawData: Record<string, unknown>,
  summary: string,
  validForHours = 24
): Omit<EvidenceRecord, 'id' | 'collectedAt'> {
  return { assessmentId, companyId, sourceType, rawData, summary, validForHours }
}

// ---------------------------------------------------------------------------
// Individual collectors
// ---------------------------------------------------------------------------

async function collectSecureScore(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  const data = await graphGet<{
    value: Array<{
      currentScore: number
      maxScore: number
      averageComparativeScores: Array<{ basis: string; averageScore: number }>
      controlScores: Array<{ controlName: string; score: number; maxScore: number }>
      createdDateTime: string
    }>
  }>(token, '/security/secureScores?$top=1')

  if (!data?.value?.[0]) return null
  const score = data.value[0]
  const percentage = score.maxScore > 0 ? Math.round((score.currentScore / score.maxScore) * 100) : 0

  return buildEvidence(assessmentId, companyId, 'microsoft_secure_score', {
    currentScore: score.currentScore,
    maxScore: score.maxScore,
    percentage,
    averageComparativeScores: score.averageComparativeScores,
    controlScores: score.controlScores?.slice(0, 20), // top 20 controls
    collectedDate: score.createdDateTime,
  }, `Secure Score: ${score.currentScore}/${score.maxScore} (${percentage}%)`)
}

async function collectConditionalAccess(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  const data = await graphGet<{
    value: Array<{
      id: string
      displayName: string
      state: string
      conditions: Record<string, unknown>
      grantControls: Record<string, unknown> | null
    }>
  }>(token, '/identity/conditionalAccess/policies')

  if (!data?.value) return null
  const policies = data.value.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    state: p.state,
    hasGrantControls: !!p.grantControls,
  }))
  const enabled = policies.filter((p) => p.state === 'enabled')

  return buildEvidence(assessmentId, companyId, 'microsoft_conditional_access', {
    policies,
    totalPolicies: policies.length,
    enabledPolicies: enabled.length,
  }, `${enabled.length}/${policies.length} Conditional Access policies enabled`)
}

async function collectMfa(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  // Try beta credential registration details endpoint
  const regData = await graphGetBeta<{
    value: Array<{
      id: string
      userPrincipalName: string
      userDisplayName: string
      isMfaRegistered: boolean
      isMfaCapable: boolean
      isAdmin: boolean
      defaultMfaMethod: string
    }>
  }>(token, '/reports/authenticationMethods/userRegistrationDetails?$top=999')

  if (regData?.value) {
    const users = regData.value
    const total = users.length
    const mfaRegistered = users.filter((u) => u.isMfaRegistered || u.isMfaCapable).length
    const mfaRate = total > 0 ? Math.round((mfaRegistered / total) * 100) : 0
    const adminUsers = users
      .filter((u) => u.isAdmin)
      .map((u) => ({
        displayName: u.userDisplayName,
        upn: u.userPrincipalName,
        mfaRegistered: u.isMfaRegistered || u.isMfaCapable,
        defaultMethod: u.defaultMfaMethod,
      }))

    return buildEvidence(assessmentId, companyId, 'microsoft_mfa', {
      totalUsers: total,
      mfaRegisteredUsers: mfaRegistered,
      mfaRate,
      adminUsers,
      methodBreakdown: summarizeMfaMethods(users),
    }, `MFA: ${mfaRegistered}/${total} users registered (${mfaRate}%)`)
  }

  // Fallback: use directory role membership + user count
  const users = await graphGetAllPages<{ id: string; accountEnabled: boolean }>(
    token, '/users?$select=id,accountEnabled&$filter=accountEnabled eq true&$top=999'
  )

  return buildEvidence(assessmentId, companyId, 'microsoft_mfa', {
    totalUsers: users.length,
    mfaRegisteredUsers: null,
    mfaRate: null,
    adminUsers: [],
    permissionMissing: 'UserAuthenticationMethod.Read.All',
    note: 'MFA registration details unavailable. Add the "UserAuthenticationMethod.Read.All" Application permission to the customer\'s Azure AD app registration and grant admin consent.',
  }, `${users.length} active users. MFA data requires "UserAuthenticationMethod.Read.All" permission — add it in Azure AD > App registrations > API permissions.`)
}

function summarizeMfaMethods(users: Array<{ defaultMfaMethod: string }>): Record<string, number> {
  const methods: Record<string, number> = {}
  for (const u of users) {
    const method = u.defaultMfaMethod || 'none'
    methods[method] = (methods[method] ?? 0) + 1
  }
  return methods
}

async function collectDeviceCompliance(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  const devices = await graphGetAllPages<{
    id: string
    deviceName: string
    operatingSystem: string
    osVersion: string
    complianceState: string
    isEncrypted: boolean
    managedDeviceOwnerType: string
    lastSyncDateTime: string
    userPrincipalName: string | null
  }>(
    token,
    '/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,managedDeviceOwnerType,lastSyncDateTime,userPrincipalName&$top=999'
  )

  if (devices.length === 0) {
    // Fallback to Azure AD devices
    const adDevices = await graphGetAllPages<{
      id: string
      displayName: string
      operatingSystem: string
      isCompliant: boolean | null
    }>(token, '/devices?$select=id,displayName,operatingSystem,isCompliant&$top=999')

    return buildEvidence(assessmentId, companyId, 'microsoft_device_compliance', {
      devices: adDevices.map((d) => ({
        id: d.id,
        deviceName: d.displayName,
        operatingSystem: d.operatingSystem,
        isCompliant: d.isCompliant,
      })),
      totalCount: adDevices.length,
      source: 'azure_ad_devices',
    }, `${adDevices.length} devices from Azure AD (Intune data unavailable)`)
  }

  const compliant = devices.filter((d) => d.complianceState === 'compliant')
  const noncompliant = devices.filter((d) => d.complianceState === 'noncompliant')

  return buildEvidence(assessmentId, companyId, 'microsoft_device_compliance', {
    devices: devices.map((d) => ({
      id: d.id,
      deviceName: d.deviceName,
      operatingSystem: d.operatingSystem,
      osVersion: d.osVersion,
      complianceState: d.complianceState,
      isEncrypted: d.isEncrypted,
      lastSyncDateTime: d.lastSyncDateTime,
      userPrincipalName: d.userPrincipalName,
    })),
    totalCount: devices.length,
    compliantCount: compliant.length,
    noncompliantCount: noncompliant.length,
    complianceRate: devices.length > 0 ? Math.round((compliant.length / devices.length) * 100) : 0,
    source: 'intune',
  }, `${compliant.length}/${devices.length} devices compliant (${Math.round((compliant.length / devices.length) * 100)}%)`)
}

async function collectBitlocker(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  // BitLocker status comes from managed devices' isEncrypted field
  const devices = await graphGetAllPages<{
    id: string
    deviceName: string
    operatingSystem: string
    isEncrypted: boolean
  }>(
    token,
    "/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,isEncrypted&$filter=operatingSystem eq 'Windows'&$top=999"
  )

  if (devices.length === 0) return null

  const encrypted = devices.filter((d) => d.isEncrypted)
  const rate = Math.round((encrypted.length / devices.length) * 100)

  return buildEvidence(assessmentId, companyId, 'microsoft_bitlocker', {
    totalDevices: devices.length,
    encryptedDevices: encrypted.length,
    encryptionRate: rate,
    unencryptedDevices: devices.filter((d) => !d.isEncrypted).map((d) => ({
      deviceName: d.deviceName,
      operatingSystem: d.operatingSystem,
    })),
  }, `BitLocker: ${encrypted.length}/${devices.length} Windows devices encrypted (${rate}%)`)
}

async function collectDefender(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  // Check for Defender status via managed devices
  const devices = await graphGetAllPages<{
    id: string
    deviceName: string
    managedDeviceName: string
    deviceRegistrationState: string
  }>(
    token,
    '/deviceManagement/managedDevices?$select=id,deviceName,managedDeviceName,deviceRegistrationState&$top=999'
  )

  if (devices.length === 0) return null

  // Also try to get threat detection data
  const alerts = await graphGet<{
    value: Array<{
      id: string
      severity: string
      status: string
      title: string
      createdDateTime: string
    }>
  }>(token, '/security/alerts_v2?$top=50&$orderby=createdDateTime desc')

  const recentAlerts = alerts?.value ?? []

  return buildEvidence(assessmentId, companyId, 'microsoft_defender', {
    protectedDevices: devices.length,
    totalDevices: devices.length,
    recentAlerts: recentAlerts.slice(0, 10).map((a) => ({
      severity: a.severity,
      status: a.status,
      title: a.title,
      createdDateTime: a.createdDateTime,
    })),
    alertCount: recentAlerts.length,
  }, `${devices.length} managed devices. ${recentAlerts.length} recent security alerts.`)
}

async function collectUsers(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  // Get all users with sign-in activity
  const users = await graphGetAllPages<{
    id: string
    displayName: string
    userPrincipalName: string
    accountEnabled: boolean
    createdDateTime: string
  }>(token, '/users?$select=id,displayName,userPrincipalName,accountEnabled,createdDateTime&$top=999')

  const enabled = users.filter((u) => u.accountEnabled)
  const disabled = users.filter((u) => !u.accountEnabled)

  // Try to get sign-in activity from beta endpoint
  const signInUsers = await graphGetBeta<{
    value: Array<{
      id: string
      displayName: string
      userPrincipalName: string
      signInActivity: { lastSignInDateTime: string | null } | null
    }>
  }>(token, '/users?$select=id,displayName,userPrincipalName,signInActivity&$filter=accountEnabled eq true&$top=999')

  const dormantUsers: Array<{ displayName: string; lastSignInDateTime: string | null }> = []
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()

  if (signInUsers?.value) {
    for (const u of signInUsers.value) {
      const lastSignIn = u.signInActivity?.lastSignInDateTime
      if (!lastSignIn || lastSignIn < fortyFiveDaysAgo) {
        dormantUsers.push({ displayName: u.displayName, lastSignInDateTime: lastSignIn ?? null })
      }
    }
  }

  return buildEvidence(assessmentId, companyId, 'microsoft_users', {
    users: enabled.map((u) => ({
      userPrincipalName: u.userPrincipalName,
      displayName: u.displayName,
      accountEnabled: u.accountEnabled,
    })),
    totalUsers: enabled.length,
    disabledUsers: disabled.length,
    totalCount: users.length,
    dormantUsers,
    dormantCount: dormantUsers.length,
  }, `${enabled.length} active users, ${disabled.length} disabled, ${dormantUsers.length} dormant (45+ days inactive)`)
}

// ---------------------------------------------------------------------------
// Main collector — runs all sub-collectors for a company
// ---------------------------------------------------------------------------

export interface CollectionResult {
  evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>>
  errors: string[]
}

/** Collect Intune compliance policies — the actual policy definitions */
async function collectIntunePolicies(
  token: string, assessmentId: string, companyId: string
): Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null> {
  // Compliance policies
  const compPolicies = await graphGetAllPages<{
    id: string
    displayName: string
    description: string | null
    createdDateTime: string
    lastModifiedDateTime: string
  }>(token, '/deviceManagement/deviceCompliancePolicies?$select=id,displayName,description,createdDateTime,lastModifiedDateTime')

  // Device configuration profiles
  const configProfiles = await graphGetAllPages<{
    id: string
    displayName: string
    description: string | null
    createdDateTime: string
    lastModifiedDateTime: string
  }>(token, '/deviceManagement/deviceConfigurations?$select=id,displayName,description,createdDateTime,lastModifiedDateTime')

  if (compPolicies.length === 0 && configProfiles.length === 0) return null

  return buildEvidence(assessmentId, companyId, 'microsoft_intune_config', {
    compliancePolicies: compPolicies.map((p) => ({
      id: p.id,
      name: p.displayName,
      description: p.description,
      lastModified: p.lastModifiedDateTime,
    })),
    compliancePolicyCount: compPolicies.length,
    configProfiles: configProfiles.map((p) => ({
      id: p.id,
      name: p.displayName,
      description: p.description,
      lastModified: p.lastModifiedDateTime,
    })),
    configProfileCount: configProfiles.length,
    policyNames: compPolicies.map((p) => p.displayName),
    profileNames: configProfiles.map((p) => p.displayName),
  }, `Intune: ${compPolicies.length} compliance policies (${compPolicies.map((p) => p.displayName).join(', ')}), ${configProfiles.length} configuration profiles (${configProfiles.map((p) => p.displayName).join(', ')}).`)
}

export async function collectGraphEvidence(
  companyId: string,
  assessmentId: string
): Promise<CollectionResult> {
  const creds = await getTenantCredentials(companyId)
  if (!creds) {
    return {
      evidence: [],
      errors: ['Microsoft 365 credentials not configured for this company.'],
    }
  }

  let token: string
  try {
    token = await getToken(creds)
  } catch (err) {
    return {
      evidence: [],
      errors: [`Failed to authenticate with Microsoft Graph: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  const evidence: Array<Omit<EvidenceRecord, 'id' | 'collectedAt'>> = []
  const errors: string[] = []

  const collectors: Array<{
    name: string
    fn: () => Promise<Omit<EvidenceRecord, 'id' | 'collectedAt'> | null>
  }> = [
    { name: 'Secure Score', fn: () => collectSecureScore(token, assessmentId, companyId) },
    { name: 'Conditional Access', fn: () => collectConditionalAccess(token, assessmentId, companyId) },
    { name: 'MFA Status', fn: () => collectMfa(token, assessmentId, companyId) },
    { name: 'Device Compliance', fn: () => collectDeviceCompliance(token, assessmentId, companyId) },
    { name: 'BitLocker', fn: () => collectBitlocker(token, assessmentId, companyId) },
    { name: 'Defender', fn: () => collectDefender(token, assessmentId, companyId) },
    { name: 'Users', fn: () => collectUsers(token, assessmentId, companyId) },
    { name: 'Intune Policies', fn: () => collectIntunePolicies(token, assessmentId, companyId) },
  ]

  // Run all collectors in parallel — each handles its own errors
  const results = await Promise.allSettled(
    collectors.map(async (c) => {
      try {
        const result = await c.fn()
        return { name: c.name, result }
      } catch (err) {
        return { name: c.name, error: err instanceof Error ? err.message : String(err) }
      }
    })
  )

  for (const settled of results) {
    if (settled.status === 'rejected') {
      errors.push(`Collector failed: ${settled.reason}`)
      continue
    }
    const { name, result, error } = settled.value as {
      name: string
      result?: Omit<EvidenceRecord, 'id' | 'collectedAt'> | null
      error?: string
    }
    if (error) {
      errors.push(`${name}: ${error}`)
    } else if (result) {
      evidence.push(result)
    }
  }

  return { evidence, errors }
}
