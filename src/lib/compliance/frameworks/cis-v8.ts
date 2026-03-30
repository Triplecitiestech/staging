/**
 * CIS Controls v8 — Framework Definition & Evaluators
 *
 * Defines the subset of CIS Controls v8 that can be evaluated
 * using Microsoft 365 / Graph API data. Each control has:
 *   - metadata (ID, category, title, description)
 *   - evidence sources it needs
 *   - an evaluator function that takes collected evidence and returns a finding
 *
 * Implementation Groups (IG):
 *   IG1 = Essential Cyber Hygiene (all orgs)
 *   IG2 = IG1 + additional controls for moderate risk
 *   IG3 = IG2 + advanced controls for high risk
 *
 * MVP focuses on IG1 controls answerable from Microsoft 365.
 */

import type {
  ControlDefinition,
  ControlEvaluator,
  EvaluationContext,
  EvaluationResult,
  FrameworkDefinition,
  FindingStatus,
  ConfidenceLevel,
  EvidenceSourceType,
} from '../types'
import { EVIDENCE_TO_CONNECTOR, parseControlSortKey } from '../types'

// ---------------------------------------------------------------------------
// Helper: build a result object
// ---------------------------------------------------------------------------

function result(
  controlId: string,
  ctx: EvaluationContext,
  status: FindingStatus,
  confidence: ConfidenceLevel,
  reasoning: string,
  evidenceSourceTypes: string[],
  missingEvidence: string[],
  remediation: string | null = null
): EvaluationResult {
  const evidenceIds: string[] = []
  Array.from(ctx.evidence.entries()).forEach(([sourceType, record]) => {
    if (evidenceSourceTypes.includes(sourceType)) {
      evidenceIds.push(record.id)
    }
  })
  return { controlId, status, confidence, reasoning, evidenceIds, missingEvidence, remediation }
}

/**
 * Context-aware "no evidence" result.
 * Distinguishes between:
 *   - collection_failed: connector was available but collection errored
 *   - needs_review: connector is available but no data matched this customer
 *   - not_assessed: connector is not configured at all
 */
function noEvidence(controlId: string, sources: string[], ctx?: EvaluationContext): EvaluationResult {
  if (!ctx) {
    return {
      controlId, status: 'not_assessed', confidence: 'none',
      reasoning: 'Required evidence sources were not available for evaluation.',
      evidenceIds: [], missingEvidence: sources, remediation: null,
    }
  }

  // Check if any required connector failed during collection
  const failedSources: string[] = []
  const unavailableSources: string[] = []
  const availableButEmpty: string[] = []

  for (const src of sources) {
    const connector = EVIDENCE_TO_CONNECTOR[src as EvidenceSourceType]
    if (!connector) { unavailableSources.push(src); continue }
    if (ctx.failedConnectors.has(connector)) { failedSources.push(src); continue }
    if (ctx.availableConnectors.has(connector)) { availableButEmpty.push(src); continue }
    unavailableSources.push(src)
  }

  if (failedSources.length > 0) {
    return {
      controlId, status: 'collection_failed', confidence: 'none',
      reasoning: `Evidence collection failed for: ${failedSources.join(', ')}. The integration is configured but encountered errors during data retrieval.`,
      evidenceIds: [], missingEvidence: sources, remediation: 'Check integration connectivity and permissions, then re-run the assessment.',
    }
  }

  if (availableButEmpty.length > 0 && unavailableSources.length === 0) {
    return {
      controlId, status: 'needs_review', confidence: 'low',
      reasoning: `Integration is available but no matching data was found for this customer from: ${availableButEmpty.join(', ')}.`,
      evidenceIds: [], missingEvidence: sources, remediation: 'Verify customer account mapping in the integration. Data may exist but was not matched to this customer.',
    }
  }

  return {
    controlId, status: 'not_assessed', confidence: 'none',
    reasoning: `Required integrations are not configured: ${unavailableSources.join(', ')}.`,
    evidenceIds: [], missingEvidence: sources, remediation: null,
  }
}

// ---------------------------------------------------------------------------
// CIS v8 Control Evaluators (Microsoft 365 focused)
// ---------------------------------------------------------------------------

const evaluators: Record<string, ControlEvaluator> = {}

// --- 1.1 Establish and Maintain Detailed Enterprise Asset Inventory ---
evaluators['cis-v8-1.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const users = ctx.evidence.get('microsoft_users')
  if (!devices && !users) return noEvidence('cis-v8-1.1', ['microsoft_device_compliance', 'microsoft_users'], ctx)

  const deviceData = devices?.rawData as { devices?: unknown[]; totalCount?: number } | undefined
  const userData = users?.rawData as { users?: unknown[]; totalCount?: number } | undefined
  const deviceCount = deviceData?.totalCount ?? (deviceData?.devices as unknown[] | undefined)?.length ?? 0
  const userCount = userData?.totalCount ?? (userData?.users as unknown[] | undefined)?.length ?? 0

  if (deviceCount > 0 && userCount > 0) {
    return result('cis-v8-1.1', ctx, 'pass', 'medium',
      `Asset inventory maintained via Intune/Entra. ${deviceCount} managed devices and ${userCount} user accounts tracked.`,
      ['microsoft_device_compliance', 'microsoft_users'],
      ['datto_rmm_devices'],
      null)
  }
  return result('cis-v8-1.1', ctx, 'partial', 'low',
    `Limited asset tracking. ${deviceCount} devices and ${userCount} users found. Full inventory may require additional sources (Datto RMM).`,
    ['microsoft_device_compliance', 'microsoft_users'],
    ['datto_rmm_devices'],
    'Enroll all endpoints in Intune or Datto RMM for complete asset inventory coverage.')
}

// --- 3.3 Configure Data Access Control Lists ---
evaluators['cis-v8-3.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const ca = ctx.evidence.get('microsoft_conditional_access')
  if (!ca) return noEvidence('cis-v8-3.3', ['microsoft_conditional_access'], ctx)

  const caData = ca.rawData as { policies?: Array<{ state?: string; displayName?: string }> }
  const policies = caData.policies ?? []
  const enabled = policies.filter((p) => p.state === 'enabled' || p.state === 'enabledForReportingButNotEnforced')

  if (enabled.length >= 1) {
    return result('cis-v8-3.3', ctx, 'pass', 'medium',
      `${enabled.length} Conditional Access policies active, controlling data access based on conditions (location, device, risk).`,
      ['microsoft_conditional_access'], [])
  }
  return result('cis-v8-3.3', ctx, 'fail', 'high',
    'No active Conditional Access policies found. Data access is not controlled by conditions.',
    ['microsoft_conditional_access'], [],
    'Configure Conditional Access policies in Entra ID to enforce access controls based on user risk, device compliance, and location.')
}

// --- 4.1 Establish and Maintain a Secure Configuration Process ---
evaluators['cis-v8-4.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  if (!score) return noEvidence('cis-v8-4.1', ['microsoft_secure_score'], ctx)

  const scoreData = score.rawData as { currentScore?: number; maxScore?: number; percentage?: number }
  const pct = scoreData.percentage ?? (scoreData.maxScore ? Math.round((scoreData.currentScore ?? 0) / scoreData.maxScore * 100) : 0)

  if (pct >= 70) {
    return result('cis-v8-4.1', ctx, 'pass', 'high',
      `Microsoft Secure Score is ${pct}% (${scoreData.currentScore}/${scoreData.maxScore}), indicating strong baseline configuration.`,
      ['microsoft_secure_score'], [])
  }
  if (pct >= 40) {
    return result('cis-v8-4.1', ctx, 'partial', 'medium',
      `Microsoft Secure Score is ${pct}% (${scoreData.currentScore}/${scoreData.maxScore}). Configuration baseline exists but needs improvement.`,
      ['microsoft_secure_score'], [],
      `Review Microsoft Secure Score recommendations and implement top actions to improve from ${pct}% toward 70%+.`)
  }
  return result('cis-v8-4.1', ctx, 'fail', 'high',
    `Microsoft Secure Score is only ${pct}% (${scoreData.currentScore}/${scoreData.maxScore}), indicating weak security configuration.`,
    ['microsoft_secure_score'], [],
    'Urgently review and implement Microsoft Secure Score recommendations. Target at least 70% score.')
}

// --- 4.6 Securely Manage Enterprise Assets and Software (Encryption) ---
evaluators['cis-v8-4.6'] = (ctx: EvaluationContext): EvaluationResult => {
  const bitlocker = ctx.evidence.get('microsoft_bitlocker')
  if (!bitlocker) return noEvidence('cis-v8-4.6', ['microsoft_bitlocker'], ctx)

  const blData = bitlocker.rawData as { totalDevices?: number; encryptedDevices?: number; encryptionRate?: number }
  const total = blData.totalDevices ?? 0
  const encrypted = blData.encryptedDevices ?? 0
  const rate = total > 0 ? Math.round((encrypted / total) * 100) : 0

  if (rate >= 95) {
    return result('cis-v8-4.6', ctx, 'pass', 'high',
      `${encrypted}/${total} devices (${rate}%) have BitLocker encryption enabled.`,
      ['microsoft_bitlocker'], [])
  }
  if (rate >= 70) {
    return result('cis-v8-4.6', ctx, 'partial', 'medium',
      `${encrypted}/${total} devices (${rate}%) encrypted. Some devices lack disk encryption.`,
      ['microsoft_bitlocker'], [],
      `Enable BitLocker on the remaining ${total - encrypted} unencrypted devices via Intune policy.`)
  }
  return result('cis-v8-4.6', ctx, 'fail', 'high',
    `Only ${encrypted}/${total} devices (${rate}%) encrypted. Majority of devices lack disk encryption.`,
    ['microsoft_bitlocker'], [],
    'Deploy a mandatory BitLocker encryption policy via Intune to all managed Windows devices.')
}

// --- 5.2 Use Unique Passwords ---
// Evaluated via MFA data — if MFA enforced, password-only risk is greatly reduced
evaluators['cis-v8-5.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const mfa = ctx.evidence.get('microsoft_mfa')
  if (!mfa) return noEvidence('cis-v8-5.2', ['microsoft_mfa'], ctx)

  const mfaData = mfa.rawData as { totalUsers?: number; mfaRegisteredUsers?: number; mfaRate?: number }
  const total = mfaData.totalUsers ?? 0
  const registered = mfaData.mfaRegisteredUsers ?? 0
  const rate = total > 0 ? Math.round((registered / total) * 100) : 0

  if (rate >= 95) {
    return result('cis-v8-5.2', ctx, 'pass', 'medium',
      `${registered}/${total} users (${rate}%) have MFA registered, significantly reducing password-only attack surface.`,
      ['microsoft_mfa'], [],
      null)
  }
  if (rate >= 70) {
    return result('cis-v8-5.2', ctx, 'partial', 'medium',
      `${registered}/${total} users (${rate}%) have MFA. Some accounts rely on passwords alone.`,
      ['microsoft_mfa'], [],
      `Enforce MFA registration for the remaining ${total - registered} users via Conditional Access policy.`)
  }
  return result('cis-v8-5.2', ctx, 'fail', 'high',
    `Only ${registered}/${total} users (${rate}%) have MFA registered. Most accounts are password-only.`,
    ['microsoft_mfa'], [],
    'Enforce MFA for all users via Conditional Access. Require phishing-resistant methods (FIDO2, Authenticator) where possible.')
}

// --- 6.1 Establish an Access Granting Process ---
evaluators['cis-v8-6.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const ca = ctx.evidence.get('microsoft_conditional_access')
  const users = ctx.evidence.get('microsoft_users')
  if (!ca && !users) return noEvidence('cis-v8-6.1', ['microsoft_conditional_access', 'microsoft_users'], ctx)

  const caData = ca?.rawData as { policies?: Array<{ state?: string }> } | undefined
  const enabled = (caData?.policies ?? []).filter((p) => p.state === 'enabled').length

  if (enabled >= 2) {
    return result('cis-v8-6.1', ctx, 'pass', 'medium',
      `${enabled} Conditional Access policies enforce structured access granting process.`,
      ['microsoft_conditional_access', 'microsoft_users'], [])
  }
  return result('cis-v8-6.1', ctx, 'partial', 'low',
    `Only ${enabled} Conditional Access policies found. Access granting may not be fully controlled.`,
    ['microsoft_conditional_access', 'microsoft_users'], [],
    'Implement Conditional Access policies for access granting that require device compliance, MFA, and location restrictions.')
}

// --- 6.3 Require MFA for Externally-Exposed Applications ---
evaluators['cis-v8-6.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const mfa = ctx.evidence.get('microsoft_mfa')
  const ca = ctx.evidence.get('microsoft_conditional_access')
  if (!mfa) return noEvidence('cis-v8-6.3', ['microsoft_mfa', 'microsoft_conditional_access'], ctx)

  const mfaData = mfa.rawData as { totalUsers?: number; mfaRegisteredUsers?: number }
  const total = mfaData.totalUsers ?? 0
  const registered = mfaData.mfaRegisteredUsers ?? 0
  const rate = total > 0 ? Math.round((registered / total) * 100) : 0

  const caData = ca?.rawData as { policies?: Array<{ state?: string; displayName?: string }> } | undefined
  const mfaPolicies = (caData?.policies ?? []).filter(
    (p) => p.state === 'enabled' && (p.displayName ?? '').toLowerCase().includes('mfa')
  )

  if (rate >= 95 && mfaPolicies.length >= 1) {
    return result('cis-v8-6.3', ctx, 'pass', 'high',
      `MFA registered for ${rate}% of users with ${mfaPolicies.length} CA policy enforcing MFA on external access.`,
      ['microsoft_mfa', 'microsoft_conditional_access'], [])
  }
  if (rate >= 95) {
    return result('cis-v8-6.3', ctx, 'pass', 'medium',
      `MFA registered for ${rate}% of users. No explicit MFA-named CA policy found, but high registration rate provides coverage.`,
      ['microsoft_mfa', 'microsoft_conditional_access'], [],
      'Consider creating an explicit Conditional Access policy requiring MFA for all cloud apps.')
  }
  return result('cis-v8-6.3', ctx, 'fail', 'high',
    `Only ${rate}% of users have MFA registered. External applications are vulnerable to credential attacks.`,
    ['microsoft_mfa', 'microsoft_conditional_access'], [],
    'Create a Conditional Access policy requiring MFA for all cloud applications and enforce MFA registration for all users.')
}

// --- 6.5 Require MFA for Administrative Access ---
evaluators['cis-v8-6.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const mfa = ctx.evidence.get('microsoft_mfa')
  if (!mfa) return noEvidence('cis-v8-6.5', ['microsoft_mfa'], ctx)

  const mfaData = mfa.rawData as { adminUsers?: Array<{ mfaRegistered?: boolean; displayName?: string }> }
  const admins = mfaData.adminUsers ?? []

  if (admins.length === 0) {
    return result('cis-v8-6.5', ctx, 'not_assessed', 'low',
      'Could not determine admin MFA status. Admin role data not available from current evidence.',
      ['microsoft_mfa'], ['microsoft_audit_log'],
      'Ensure all admin accounts have MFA enforced via Conditional Access targeting admin roles.')
  }

  const mfaAdmins = admins.filter((a) => a.mfaRegistered)
  if (mfaAdmins.length === admins.length) {
    return result('cis-v8-6.5', ctx, 'pass', 'high',
      `All ${admins.length} admin accounts have MFA registered.`,
      ['microsoft_mfa'], [])
  }
  const missing = admins.filter((a) => !a.mfaRegistered).map((a) => a.displayName).join(', ')
  return result('cis-v8-6.5', ctx, 'fail', 'high',
    `${mfaAdmins.length}/${admins.length} admin accounts have MFA. Missing: ${missing}`,
    ['microsoft_mfa'], [],
    'Immediately enable MFA for all admin accounts. Use phishing-resistant MFA methods (FIDO2 keys, Windows Hello).')
}

// --- 9.2 Use DNS Filtering Services ---
evaluators['cis-v8-9.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const dns = ctx.evidence.get('dnsfilter_dns')
  if (!dns) return noEvidence('cis-v8-9.2', ['dnsfilter_dns'], ctx)

  const dnsData = dns.rawData as { totalQueries?: number; blockedQueries?: number }
  const total = dnsData.totalQueries ?? 0
  const blocked = dnsData.blockedQueries ?? 0

  if (total > 0 && blocked > 0) {
    return result('cis-v8-9.2', ctx, 'pass', 'medium',
      `DNS filtering active. ${blocked.toLocaleString()} threats blocked out of ${total.toLocaleString()} queries (30-day period). Note: MSP-level data.`,
      ['dnsfilter_dns'], [])
  }
  if (total > 0) {
    return result('cis-v8-9.2', ctx, 'pass', 'low',
      `DNS filtering active with ${total.toLocaleString()} queries processed. No threats blocked in period. Note: MSP-level data.`,
      ['dnsfilter_dns'], [])
  }
  return result('cis-v8-9.2', ctx, 'needs_review', 'low',
    'DNS filtering detected but no query data available. Verify DNSFilter is actively processing DNS traffic.',
    ['dnsfilter_dns'], [], 'Confirm DNS traffic is routing through DNSFilter for all endpoints.')
}

// --- 10.1 Deploy and Maintain Anti-Malware Software ---
evaluators['cis-v8-10.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const defender = ctx.evidence.get('microsoft_defender')
  const devices = ctx.evidence.get('microsoft_device_compliance')
  if (!defender && !devices) return noEvidence('cis-v8-10.1', ['microsoft_defender', 'microsoft_device_compliance'], ctx)

  const defData = defender?.rawData as { protectedDevices?: number; totalDevices?: number } | undefined
  const devData = devices?.rawData as { totalCount?: number } | undefined
  const protectedCount = defData?.protectedDevices ?? 0
  const total = defData?.totalDevices ?? devData?.totalCount ?? 0

  if (total === 0) {
    return result('cis-v8-10.1', ctx, 'not_assessed', 'low',
      'No device data available to assess anti-malware coverage.',
      ['microsoft_defender', 'microsoft_device_compliance'], ['datto_edr_alerts'])
  }

  const rate = Math.round((protectedCount / total) * 100)
  if (rate >= 95) {
    return result('cis-v8-10.1', ctx, 'pass', 'medium',
      `${protectedCount}/${total} devices (${rate}%) have Defender/anti-malware protection active.`,
      ['microsoft_defender', 'microsoft_device_compliance'], ['datto_edr_alerts'])
  }
  return result('cis-v8-10.1', ctx, 'partial', 'medium',
    `${protectedCount}/${total} devices (${rate}%) protected. Some endpoints may lack anti-malware.`,
    ['microsoft_defender', 'microsoft_device_compliance'], ['datto_edr_alerts'],
    'Deploy Microsoft Defender for Endpoint or Datto EDR to all managed devices. Verify coverage across all endpoints.')
}

// --- 11.1 Establish and Maintain a Data Recovery Practice ---
evaluators['cis-v8-11.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const bcdr = ctx.evidence.get('datto_bcdr_backup')
  const saas = ctx.evidence.get('datto_saas_backup')
  if (!bcdr && !saas) return noEvidence('cis-v8-11.1', ['datto_bcdr_backup', 'datto_saas_backup'], ctx)

  const bcdrData = bcdr?.rawData as { matched?: boolean; totalAppliances?: number; totalAlerts?: number; deviceDetails?: unknown[] } | undefined
  const saasData = saas?.rawData as { matched?: boolean; totalSeats?: number; activeSeats?: number; unprotectedSeats?: number } | undefined

  const hasBcdr = bcdrData?.matched && (bcdrData?.deviceDetails ?? []).length > 0
  const hasSaas = saasData?.matched && (saasData?.totalSeats ?? 0) > 0

  if (hasBcdr && hasSaas) {
    const unprotected = saasData?.unprotectedSeats ?? 0
    if (unprotected === 0) {
      return result('cis-v8-11.1', ctx, 'pass', 'high',
        `Backup coverage confirmed: ${(bcdrData?.deviceDetails ?? []).length} BCDR device(s) and ${saasData?.totalSeats} SaaS backup seat(s) with zero unprotected.`,
        ['datto_bcdr_backup', 'datto_saas_backup'], [])
    }
    return result('cis-v8-11.1', ctx, 'partial', 'medium',
      `Backup systems active: ${(bcdrData?.deviceDetails ?? []).length} BCDR device(s), ${saasData?.totalSeats} SaaS seats. However, ${unprotected} seat(s) are unprotected.`,
      ['datto_bcdr_backup', 'datto_saas_backup'], [],
      `Protect the ${unprotected} unprotected SaaS backup seat(s) to ensure complete data recovery coverage.`)
  }
  if (hasBcdr) {
    return result('cis-v8-11.1', ctx, 'partial', 'medium',
      `BCDR backup active with ${(bcdrData?.deviceDetails ?? []).length} device(s). No SaaS backup data found for this customer.`,
      ['datto_bcdr_backup'], ['datto_saas_backup'],
      'Ensure SaaS backup (M365/Google) is also configured for complete data recovery.')
  }
  if (hasSaas) {
    return result('cis-v8-11.1', ctx, 'partial', 'medium',
      `SaaS backup active with ${saasData?.totalSeats} seat(s). No BCDR backup devices found for this customer.`,
      ['datto_saas_backup'], ['datto_bcdr_backup'],
      'Ensure server/endpoint backup (BCDR) is also configured for complete data recovery.')
  }
  return result('cis-v8-11.1', ctx, 'needs_review', 'low',
    'Backup integrations are available but no matching devices/seats found for this customer. Verify company name mapping.',
    ['datto_bcdr_backup', 'datto_saas_backup'], [],
    'Verify that the company name in Datto BCDR/SaaS Protect matches the company name in TCT.')
}

// --- 12.6 Use of Encryption for Data in Transit ---
evaluators['cis-v8-12.6'] = (ctx: EvaluationContext): EvaluationResult => {
  const ca = ctx.evidence.get('microsoft_conditional_access')
  const score = ctx.evidence.get('microsoft_secure_score')
  if (!ca && !score) return noEvidence('cis-v8-12.6', ['microsoft_conditional_access', 'microsoft_secure_score'], ctx)

  // M365 services use TLS by default. CA policies can block unmanaged/insecure apps.
  return result('cis-v8-12.6', ctx, 'pass', 'medium',
    'Microsoft 365 enforces TLS 1.2+ for all data in transit by default. Conditional Access can further restrict access to compliant devices.',
    ['microsoft_conditional_access', 'microsoft_secure_score'],
    ['microsoft_mail_transport'],
    null)
}

// --- 14.1 Establish and Maintain a Security Awareness Program ---
evaluators['cis-v8-14.1'] = (_ctx: EvaluationContext): EvaluationResult => {
  return {
    controlId: 'cis-v8-14.1',
    status: 'needs_review',
    confidence: 'none',
    reasoning: 'Security awareness training requires manual evidence (training records, policy documents). Cannot be auto-evaluated from technical data alone.',
    evidenceIds: [],
    missingEvidence: ['manual_upload'],
    remediation: 'Implement a security awareness training program and upload evidence of training completion records.',
  }
}

// --- 15.7 Securely Decommission Service Providers ---
evaluators['cis-v8-15.7'] = (_ctx: EvaluationContext): EvaluationResult => {
  return {
    controlId: 'cis-v8-15.7',
    status: 'needs_review',
    confidence: 'none',
    reasoning: 'Service provider decommissioning is a process control requiring manual evidence and policy documentation.',
    evidenceIds: [],
    missingEvidence: ['manual_upload'],
    remediation: 'Document service provider management procedures including onboarding and decommissioning processes.',
  }
}

// --- 4.7 Manage Default Accounts on Enterprise Assets ---
evaluators['cis-v8-4.7'] = (ctx: EvaluationContext): EvaluationResult => {
  const users = ctx.evidence.get('microsoft_users')
  if (!users) return noEvidence('cis-v8-4.7', ['microsoft_users'], ctx)

  const userData = users.rawData as { users?: Array<{ userPrincipalName?: string; accountEnabled?: boolean }> }
  const allUsers = userData.users ?? []
  const defaultAccounts = allUsers.filter((u) => {
    const upn = (u.userPrincipalName ?? '').toLowerCase()
    return upn.startsWith('admin@') || upn.startsWith('administrator@') || upn.startsWith('guest@')
  })
  const enabledDefaults = defaultAccounts.filter((u) => u.accountEnabled)

  if (enabledDefaults.length === 0) {
    return result('cis-v8-4.7', ctx, 'pass', 'medium',
      `No enabled default/generic accounts found among ${allUsers.length} users.`,
      ['microsoft_users'], [])
  }
  return result('cis-v8-4.7', ctx, 'fail', 'medium',
    `${enabledDefaults.length} default/generic accounts are still enabled: ${enabledDefaults.map((u) => u.userPrincipalName).join(', ')}`,
    ['microsoft_users'], [],
    'Disable or rename default accounts (admin@, administrator@, guest@). Use named individual accounts instead.')
}

// --- 5.3 Disable Dormant Accounts ---
evaluators['cis-v8-5.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const users = ctx.evidence.get('microsoft_users')
  if (!users) return noEvidence('cis-v8-5.3', ['microsoft_users'], ctx)

  const userData = users.rawData as {
    users?: Array<{ accountEnabled?: boolean; lastSignInDateTime?: string; displayName?: string }>
    dormantUsers?: Array<{ displayName?: string; lastSignInDateTime?: string }>
  }
  const dormant = userData.dormantUsers ?? []

  if (dormant.length === 0) {
    return result('cis-v8-5.3', ctx, 'pass', 'medium',
      'No dormant accounts detected (all active users have signed in within 45 days).',
      ['microsoft_users'], ['microsoft_audit_log'])
  }
  return result('cis-v8-5.3', ctx, 'fail', 'medium',
    `${dormant.length} dormant accounts found (no sign-in for 45+ days): ${dormant.slice(0, 5).map((u) => u.displayName).join(', ')}${dormant.length > 5 ? '...' : ''}`,
    ['microsoft_users'], [],
    'Disable or remove dormant accounts. Implement an automated account lifecycle policy in Entra ID.')
}

// --- 6.2 Establish and Maintain an Access Revoking Process ---
evaluators['cis-v8-6.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const users = ctx.evidence.get('microsoft_users')
  if (!users) return noEvidence('cis-v8-6.2', ['microsoft_users'], ctx)

  // We check for disabled accounts as evidence of offboarding process
  const userData = users.rawData as { disabledUsers?: number; totalUsers?: number }
  const disabled = userData.disabledUsers ?? 0
  const total = userData.totalUsers ?? 0

  if (total === 0) {
    return result('cis-v8-6.2', ctx, 'not_assessed', 'low',
      'No user data available to assess access revoking process.',
      ['microsoft_users'], [])
  }

  // Having some disabled accounts is evidence of an active offboarding process
  if (disabled > 0) {
    return result('cis-v8-6.2', ctx, 'pass', 'low',
      `${disabled} disabled accounts found among ${total + disabled} total accounts, indicating an active access revoking process exists.`,
      ['microsoft_users'], ['manual_upload'],
      null)
  }
  return result('cis-v8-6.2', ctx, 'partial', 'low',
    'No disabled accounts found. Cannot confirm an access revoking process is in place.',
    ['microsoft_users'], ['manual_upload'],
    'Document and implement an access revoking process for employee offboarding. Consider automated lifecycle policies in Entra ID.')
}

// --- 8.2 Collect Audit Logs ---
evaluators['cis-v8-8.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  if (!score) return noEvidence('cis-v8-8.2', ['microsoft_secure_score'], ctx)

  // M365 unified audit log is enabled by default in most tenants
  return result('cis-v8-8.2', ctx, 'pass', 'medium',
    'Microsoft 365 Unified Audit Log is available by default for all E3/E5/Business Premium tenants. Provides comprehensive audit trail for user and admin activities.',
    ['microsoft_secure_score'], ['microsoft_audit_log'],
    null)
}

// --- 8.5 Collect Detailed Audit Logs ---
evaluators['cis-v8-8.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  if (!score) return noEvidence('cis-v8-8.5', ['microsoft_secure_score'], ctx)

  const scoreData = score.rawData as { currentScore?: number; maxScore?: number }
  const pct = scoreData.maxScore ? Math.round((scoreData.currentScore ?? 0) / scoreData.maxScore * 100) : 0

  if (pct >= 50) {
    return result('cis-v8-8.5', ctx, 'pass', 'medium',
      'M365 Unified Audit Log provides detailed logging. Secure Score suggests logging configuration meets baseline.',
      ['microsoft_secure_score'], ['microsoft_audit_log'])
  }
  return result('cis-v8-8.5', ctx, 'partial', 'low',
    'Audit logging available via M365 but Secure Score is low, suggesting logging configuration may need improvement.',
    ['microsoft_secure_score'], ['microsoft_audit_log'],
    'Review M365 audit log settings. Enable mailbox auditing, SharePoint access logging, and sign-in log retention.')
}

// ---------------------------------------------------------------------------
// Generic evaluators for controls without dedicated auto-evaluation logic.
// These check if required evidence exists and return needs_review for manual
// controls, or attempt basic evaluation for semi-auto controls.
// ---------------------------------------------------------------------------

/** Generic evaluator for manual/process controls that need policy or documentation */
function manualControlEvaluator(controlId: string, description: string): ControlEvaluator {
  return (_ctx: EvaluationContext): EvaluationResult => ({
    controlId,
    status: 'needs_review',
    confidence: 'none',
    reasoning: `${description} This is a process/documentation control that requires manual evidence or policy review.`,
    evidenceIds: [],
    missingEvidence: ['manual_upload'],
    remediation: `Document and implement the required process. Upload evidence of the policy or procedure to satisfy this control.`,
  })
}

/**
 * Smart semi-auto evaluator. Checks actual evidence data when possible:
 * - Device compliance data → checks compliantCount/totalCount
 * - RMM data → checks device count, patch rate, AV rate
 * - Secure Score → checks percentage
 * Falls back to 'needs_review' when evidence exists but can't be auto-interpreted.
 */
function semiAutoEvaluator(controlId: string, description: string, sources: EvidenceSourceType[]): ControlEvaluator {
  return (ctx: EvaluationContext): EvaluationResult => {
    const available = sources.filter((s) => ctx.evidence.has(s))
    if (available.length === 0) return noEvidence(controlId, sources, ctx)

    const evidenceIds = available.map((s) => ctx.evidence.get(s)!.id)
    const missing = sources.filter((s) => !ctx.evidence.has(s))

    // Try to extract quantitative signal from the evidence
    const devices = ctx.evidence.get('microsoft_device_compliance')
    const rmm = ctx.evidence.get('datto_rmm_devices')
    const score = ctx.evidence.get('microsoft_secure_score')

    // If we have device compliance data, use it
    if (devices && available.includes('microsoft_device_compliance')) {
      const devData = devices.rawData as { complianceRate?: number; compliantCount?: number; totalCount?: number }
      const rate = devData.complianceRate ?? (devData.totalCount ? Math.round(((devData.compliantCount ?? 0) / devData.totalCount) * 100) : 0)
      const total = devData.totalCount ?? 0
      if (total > 0 && rate >= 90) {
        return { controlId, status: 'pass', confidence: 'medium',
          reasoning: `${rate}% device compliance rate (${total} devices managed). ${description}`,
          evidenceIds, missingEvidence: missing, remediation: null }
      }
      if (total > 0 && rate >= 60) {
        return { controlId, status: 'partial', confidence: 'medium',
          reasoning: `${rate}% device compliance rate. Some devices may not meet this requirement. ${description}`,
          evidenceIds, missingEvidence: missing,
          remediation: `Review non-compliant devices and apply required configuration to improve from ${rate}%.` }
      }
      if (total > 0) {
        return { controlId, status: 'fail', confidence: 'medium',
          reasoning: `Only ${rate}% device compliance rate. ${description}`,
          evidenceIds, missingEvidence: missing,
          remediation: 'Review and remediate non-compliant devices via Intune compliance policies.' }
      }
    }

    // If we have RMM data, use device/patch/AV metrics
    if (rmm && available.includes('datto_rmm_devices')) {
      const rmmData = rmm.rawData as { totalDevices?: number; patchRate?: number; avRate?: number; matched?: boolean }
      if (rmmData.matched && (rmmData.totalDevices ?? 0) > 0) {
        const patchRate = rmmData.patchRate ?? 0
        const avRate = rmmData.avRate ?? 0
        const bestRate = Math.max(patchRate, avRate)
        if (bestRate >= 90) {
          return { controlId, status: 'pass', confidence: 'medium',
            reasoning: `RMM shows ${rmmData.totalDevices} managed devices with ${patchRate}% patch rate and ${avRate}% AV active. ${description}`,
            evidenceIds, missingEvidence: missing, remediation: null }
        }
        return { controlId, status: 'partial', confidence: 'low',
          reasoning: `RMM shows ${rmmData.totalDevices} devices (${patchRate}% patched, ${avRate}% AV active). ${description}`,
          evidenceIds, missingEvidence: missing,
          remediation: 'Review RMM dashboard for devices needing updates or configuration changes.' }
      }
    }

    // If we have Secure Score, use it as a general signal
    if (score && available.includes('microsoft_secure_score')) {
      const scoreData = score.rawData as { percentage?: number }
      const pct = scoreData.percentage ?? 0
      if (pct >= 70) {
        return { controlId, status: 'pass', confidence: 'low',
          reasoning: `Secure Score is ${pct}%, suggesting this configuration area meets baseline. ${description}`,
          evidenceIds, missingEvidence: missing, remediation: null }
      }
    }

    // Fallback: evidence exists but can't auto-evaluate
    return { controlId, status: 'needs_review', confidence: 'low',
      reasoning: `Evidence collected from ${available.join(', ')}. ${description}`,
      evidenceIds, missingEvidence: missing, remediation: null }
  }
}

// --- New evaluators for expanded controls ---

// 1.2 Address Unauthorized Assets
evaluators['cis-v8-1.2'] = semiAutoEvaluator('cis-v8-1.2',
  'Verify that a process exists to address unauthorized assets weekly.',
  ['datto_rmm_devices', 'microsoft_device_compliance'])

// 1.3 Active Discovery Tool
evaluators['cis-v8-1.3'] = semiAutoEvaluator('cis-v8-1.3',
  'Verify an active discovery tool runs daily to identify connected assets.',
  ['datto_rmm_devices'])

// 1.4 DHCP Logging
evaluators['cis-v8-1.4'] = manualControlEvaluator('cis-v8-1.4',
  'Use DHCP logging on all DHCP servers or IP address management tools.')

// 1.5 Passive Discovery
evaluators['cis-v8-1.5'] = semiAutoEvaluator('cis-v8-1.5',
  'Verify a passive discovery tool identifies assets on the network.',
  ['datto_rmm_devices'])

// 2.1 Software Inventory
evaluators['cis-v8-2.1'] = semiAutoEvaluator('cis-v8-2.1',
  'Verify a detailed inventory of all licensed software is maintained.',
  ['datto_rmm_devices', 'microsoft_device_compliance'])

// 2.2 Authorized Software Supported
evaluators['cis-v8-2.2'] = semiAutoEvaluator('cis-v8-2.2',
  'Verify only currently supported software is authorized for use.',
  ['datto_rmm_devices'])

// 2.3 Address Unauthorized Software
evaluators['cis-v8-2.3'] = semiAutoEvaluator('cis-v8-2.3',
  'Verify unauthorized software is removed or has a documented exception.',
  ['datto_rmm_devices', 'microsoft_device_compliance'])

// 3.1 Data Management Process
evaluators['cis-v8-3.1'] = manualControlEvaluator('cis-v8-3.1',
  'Establish a data management process with sensitivity classification, owners, retention, and disposal.')

// 3.2 Data Inventory
evaluators['cis-v8-3.2'] = manualControlEvaluator('cis-v8-3.2',
  'Establish and maintain a data inventory based on the data management process.')

// 3.4 Enforce Data Retention
evaluators['cis-v8-3.4'] = manualControlEvaluator('cis-v8-3.4',
  'Retain data according to the enterprise data management process.')

// 3.5 Securely Dispose of Data
evaluators['cis-v8-3.5'] = manualControlEvaluator('cis-v8-3.5',
  'Securely dispose of data as outlined in the data management process.')

// 3.6 Encrypt Data on End-User Devices (alias of 4.6 logic)
evaluators['cis-v8-3.6'] = (ctx: EvaluationContext): EvaluationResult => {
  const bitlocker = ctx.evidence.get('microsoft_bitlocker')
  if (!bitlocker) return noEvidence('cis-v8-3.6', ['microsoft_bitlocker', 'microsoft_device_compliance'], ctx)

  const blData = bitlocker.rawData as { totalDevices?: number; encryptedDevices?: number }
  const total = blData.totalDevices ?? 0
  const encrypted = blData.encryptedDevices ?? 0
  const rate = total > 0 ? Math.round((encrypted / total) * 100) : 0

  if (rate >= 95) {
    return result('cis-v8-3.6', ctx, 'pass', 'high',
      `${encrypted}/${total} devices (${rate}%) have encryption enabled on end-user devices.`,
      ['microsoft_bitlocker'], [])
  }
  return result('cis-v8-3.6', ctx, 'partial', 'medium',
    `${encrypted}/${total} devices (${rate}%) encrypted. Some end-user devices lack encryption.`,
    ['microsoft_bitlocker'], [],
    `Enable BitLocker/encryption on the remaining ${total - encrypted} unencrypted end-user devices.`)
}

// 4.2 Secure Config for Network Infrastructure
evaluators['cis-v8-4.2'] = manualControlEvaluator('cis-v8-4.2',
  'Establish a secure configuration process for network infrastructure (firewalls, routers, switches).')

// 4.3 Automatic Session Locking
evaluators['cis-v8-4.3'] = semiAutoEvaluator('cis-v8-4.3',
  'Verify automatic session locking is configured (max 15min for desktops, 2min for mobile).',
  ['microsoft_intune_config', 'microsoft_device_compliance'])

// 4.4 Firewall on Servers
evaluators['cis-v8-4.4'] = semiAutoEvaluator('cis-v8-4.4',
  'Verify host-based firewalls are enabled on servers.',
  ['microsoft_defender', 'datto_rmm_devices'])

// 4.5 Firewall on End-User Devices
evaluators['cis-v8-4.5'] = semiAutoEvaluator('cis-v8-4.5',
  'Verify host-based firewalls are enabled on end-user devices.',
  ['microsoft_defender', 'datto_rmm_devices'])

// 5.1 Inventory of Accounts
evaluators['cis-v8-5.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const users = ctx.evidence.get('microsoft_users')
  if (!users) return noEvidence('cis-v8-5.1', ['microsoft_users'], ctx)

  const userData = users.rawData as { totalUsers?: number; disabledUsers?: number; totalCount?: number }
  const total = userData.totalCount ?? userData.totalUsers ?? 0

  return result('cis-v8-5.1', ctx, 'pass', 'medium',
    `Account inventory maintained via Entra ID with ${total} total accounts tracked.`,
    ['microsoft_users'], [])
}

// 5.4 Restrict Admin Privileges
evaluators['cis-v8-5.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const mfa = ctx.evidence.get('microsoft_mfa')
  if (!mfa) return noEvidence('cis-v8-5.4', ['microsoft_users', 'microsoft_mfa'], ctx)

  const mfaData = mfa.rawData as { adminUsers?: Array<{ displayName?: string }> }
  const admins = mfaData.adminUsers ?? []

  if (admins.length > 0 && admins.length <= 5) {
    return result('cis-v8-5.4', ctx, 'pass', 'medium',
      `${admins.length} admin accounts identified. Verify these are dedicated admin accounts.`,
      ['microsoft_mfa'], [])
  }
  if (admins.length > 5) {
    return result('cis-v8-5.4', ctx, 'needs_review', 'medium',
      `${admins.length} admin accounts found. Review whether all need admin privileges and are dedicated accounts.`,
      ['microsoft_mfa'], [],
      'Reduce the number of admin accounts. Use dedicated admin accounts separate from daily-use accounts.')
  }
  return result('cis-v8-5.4', ctx, 'needs_review', 'low',
    'Could not determine admin account inventory from available evidence.',
    ['microsoft_mfa'], ['microsoft_users'])
}

// 6.4 MFA for Remote Network Access (same logic as 6.3)
evaluators['cis-v8-6.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const mfa = ctx.evidence.get('microsoft_mfa')
  const ca = ctx.evidence.get('microsoft_conditional_access')
  if (!mfa) return noEvidence('cis-v8-6.4', ['microsoft_mfa', 'microsoft_conditional_access'], ctx)

  const mfaData = mfa.rawData as { totalUsers?: number; mfaRegisteredUsers?: number }
  const rate = (mfaData.totalUsers ?? 0) > 0
    ? Math.round(((mfaData.mfaRegisteredUsers ?? 0) / (mfaData.totalUsers ?? 1)) * 100)
    : 0

  const caData = ca?.rawData as { policies?: Array<{ state?: string }> } | undefined
  const enabled = (caData?.policies ?? []).filter((p) => p.state === 'enabled').length

  if (rate >= 95 && enabled >= 1) {
    return result('cis-v8-6.4', ctx, 'pass', 'high',
      `MFA registered for ${rate}% of users with ${enabled} CA policies. Remote access requires MFA.`,
      ['microsoft_mfa', 'microsoft_conditional_access'], [])
  }
  if (rate >= 90) {
    return result('cis-v8-6.4', ctx, 'partial', 'medium',
      `MFA registered for ${rate}% of users. Verify CA policy explicitly requires MFA for remote access.`,
      ['microsoft_mfa', 'microsoft_conditional_access'], [])
  }
  return result('cis-v8-6.4', ctx, 'fail', 'high',
    `Only ${rate}% of users have MFA. Remote network access is not adequately protected.`,
    ['microsoft_mfa'], [],
    'Enforce MFA for all remote access via Conditional Access policy.')
}

// 7.x Vulnerability Management
evaluators['cis-v8-7.1'] = semiAutoEvaluator('cis-v8-7.1',
  'Verify a documented vulnerability management process exists.',
  ['datto_rmm_patches', 'microsoft_secure_score'])

evaluators['cis-v8-7.2'] = semiAutoEvaluator('cis-v8-7.2',
  'Verify a risk-based remediation strategy with monthly review exists.',
  ['autotask_tickets', 'datto_rmm_patches'])

evaluators['cis-v8-7.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  if (!rmm) return noEvidence('cis-v8-7.3', ['datto_rmm_patches', 'microsoft_device_compliance'], ctx)

  const rmmData = rmm.rawData as { patchRate?: number; totalDevices?: number; patchedDevices?: number }
  const rate = rmmData.patchRate ?? 0

  if (rate >= 90) {
    return result('cis-v8-7.3', ctx, 'pass', 'medium',
      `${rate}% of managed devices are fully patched. Automated OS patch management is active.`,
      ['datto_rmm_devices'], [])
  }
  if (rate >= 70) {
    return result('cis-v8-7.3', ctx, 'partial', 'medium',
      `${rate}% patch rate. Some devices have pending patches.`,
      ['datto_rmm_devices'], [],
      'Review and approve pending patches. Increase patch automation frequency.')
  }
  return result('cis-v8-7.3', ctx, 'fail', 'medium',
    `${rate}% patch rate is below acceptable threshold. Many devices have missing OS patches.`,
    ['datto_rmm_devices'], [],
    'Implement automated OS patching via RMM with at least monthly cadence.')
}

evaluators['cis-v8-7.4'] = semiAutoEvaluator('cis-v8-7.4',
  'Verify automated application patch management runs monthly or more frequently.',
  ['datto_rmm_patches'])

// 8.1 Audit Log Management Process
evaluators['cis-v8-8.1'] = semiAutoEvaluator('cis-v8-8.1',
  'Verify a documented audit log management process exists.',
  ['microsoft_secure_score', 'manual_upload'])

// 8.3 Adequate Audit Log Storage
evaluators['cis-v8-8.3'] = semiAutoEvaluator('cis-v8-8.3',
  'Verify logging destinations have adequate storage for retention requirements.',
  ['microsoft_secure_score'])

// 9.1 Supported Browsers and Email Clients
evaluators['cis-v8-9.1'] = semiAutoEvaluator('cis-v8-9.1',
  'Verify only fully supported browsers and email clients are in use.',
  ['datto_rmm_devices'])

// 10.2 Anti-Malware Signature Updates
evaluators['cis-v8-10.2'] = semiAutoEvaluator('cis-v8-10.2',
  'Verify automatic anti-malware signature updates are configured.',
  ['microsoft_defender', 'datto_rmm_devices'])

// 10.3 Disable Autorun/Autoplay
evaluators['cis-v8-10.3'] = semiAutoEvaluator('cis-v8-10.3',
  'Verify autorun and autoplay are disabled for removable media.',
  ['microsoft_intune_config', 'microsoft_device_compliance'])

// 11.2 Automated Backups
evaluators['cis-v8-11.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const bcdr = ctx.evidence.get('datto_bcdr_backup')
  const saas = ctx.evidence.get('datto_saas_backup')
  if (!bcdr && !saas) return noEvidence('cis-v8-11.2', ['datto_bcdr_backup', 'datto_saas_backup'], ctx)

  const hasBcdr = bcdr && (bcdr.rawData as { matched?: boolean }).matched
  const hasSaas = saas && (saas.rawData as { matched?: boolean }).matched

  if (hasBcdr || hasSaas) {
    return result('cis-v8-11.2', ctx, 'pass', 'medium',
      `Automated backups confirmed via ${[hasBcdr ? 'Datto BCDR' : '', hasSaas ? 'Datto SaaS Protect' : ''].filter(Boolean).join(' and ')}.`,
      ['datto_bcdr_backup', 'datto_saas_backup'].filter((s) => ctx.evidence.has(s as EvidenceSourceType)), [])
  }
  return result('cis-v8-11.2', ctx, 'needs_review', 'low',
    'Backup services detected but no matching data found for this customer.',
    ['datto_bcdr_backup', 'datto_saas_backup'], [],
    'Verify backup schedules are configured and running for this customer.')
}

// 11.3 Protect Recovery Data
evaluators['cis-v8-11.3'] = semiAutoEvaluator('cis-v8-11.3',
  'Verify recovery data is protected with equivalent controls (encryption, separation).',
  ['datto_bcdr_backup'])

// 11.4 Isolated Recovery Data
evaluators['cis-v8-11.4'] = semiAutoEvaluator('cis-v8-11.4',
  'Verify an isolated instance of recovery data exists (versioned or air-gapped).',
  ['datto_bcdr_backup'])

// 12.1 Network Infrastructure Up-to-Date
evaluators['cis-v8-12.1'] = manualControlEvaluator('cis-v8-12.1',
  'Ensure network infrastructure is kept up-to-date with latest stable firmware/software.')

// 13.1 Centralize Security Event Alerting
evaluators['cis-v8-13.1'] = semiAutoEvaluator('cis-v8-13.1',
  'Verify security event alerting is centralized for correlation and analysis.',
  ['microsoft_defender', 'datto_edr_alerts', 'dnsfilter_dns'])

// 14.x Security Awareness Training (all manual)
evaluators['cis-v8-14.2'] = manualControlEvaluator('cis-v8-14.2',
  'Train workforce to recognize social engineering attacks (phishing, pre-texting, tailgating).')
evaluators['cis-v8-14.3'] = manualControlEvaluator('cis-v8-14.3',
  'Train workforce on authentication best practices (MFA, password management).')
evaluators['cis-v8-14.4'] = manualControlEvaluator('cis-v8-14.4',
  'Train workforce on data handling best practices (storage, transfer, disposal).')
evaluators['cis-v8-14.5'] = manualControlEvaluator('cis-v8-14.5',
  'Train workforce on causes of unintentional data exposure.')
evaluators['cis-v8-14.6'] = manualControlEvaluator('cis-v8-14.6',
  'Train workforce on recognizing and reporting security incidents.')
evaluators['cis-v8-14.7'] = manualControlEvaluator('cis-v8-14.7',
  'Train workforce on identifying and reporting missing security updates.')
evaluators['cis-v8-14.8'] = manualControlEvaluator('cis-v8-14.8',
  'Train workforce on dangers of insecure networks for data transmission.')

// 15.1 Service Provider Inventory
evaluators['cis-v8-15.1'] = manualControlEvaluator('cis-v8-15.1',
  'Establish and maintain an inventory of service providers with sensitivity classification.')

// 15.2 Service Provider Management Policy
evaluators['cis-v8-15.2'] = manualControlEvaluator('cis-v8-15.2',
  'Establish a service provider management policy covering assessment, monitoring, and decommissioning.')

// 16.1 Secure Application Development
evaluators['cis-v8-16.1'] = manualControlEvaluator('cis-v8-16.1',
  'Establish and maintain a secure application development process.')

// 17.x Incident Response
evaluators['cis-v8-17.1'] = manualControlEvaluator('cis-v8-17.1',
  'Designate personnel (primary + backup) to manage incident handling.')
evaluators['cis-v8-17.2'] = manualControlEvaluator('cis-v8-17.2',
  'Establish contact information for parties to be informed of security incidents.')
evaluators['cis-v8-17.3'] = manualControlEvaluator('cis-v8-17.3',
  'Establish a process for workforce to report security incidents.')

// ---------------------------------------------------------------------------
// Control Definitions — Full CIS v8 IG1 (56 safeguards) + key IG2/IG3
// ---------------------------------------------------------------------------

const CIS_V8_CONTROLS: ControlDefinition[] = [
  // === Category 1: Inventory and Control of Enterprise Assets ===
  { controlId: 'cis-v8-1.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [1, 1],
    category: '1 - Inventory and Control of Enterprise Assets',
    title: 'Establish and Maintain Detailed Enterprise Asset Inventory',
    description: 'Establish and maintain an accurate, detailed, and up-to-date inventory of all enterprise assets with the potential to store or process data, including end-user devices, network devices, IoT devices, and servers.',
    evidenceSources: ['microsoft_device_compliance', 'microsoft_users', 'datto_rmm_devices'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-1.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [1, 2],
    category: '1 - Inventory and Control of Enterprise Assets',
    title: 'Address Unauthorized Assets',
    description: 'Ensure that a process exists to address unauthorized assets on a weekly basis. The enterprise may choose to remove the asset from the network, deny the asset from connecting remotely, or quarantine the asset.',
    evidenceSources: ['datto_rmm_devices', 'microsoft_device_compliance'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-1.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [1, 3],
    category: '1 - Inventory and Control of Enterprise Assets',
    title: 'Utilize an Active Discovery Tool',
    description: 'Utilize an active discovery tool to identify assets connected to the enterprise network. Configure the active discovery tool to execute daily, or more frequently.',
    evidenceSources: ['datto_rmm_devices'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-1.4', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [1, 4],
    category: '1 - Inventory and Control of Enterprise Assets',
    title: 'Use Dynamic Host Configuration Protocol (DHCP) Logging',
    description: 'Use DHCP logging on all DHCP servers or IP address management tools to update the enterprise asset inventory.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-1.5', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [1, 5],
    category: '1 - Inventory and Control of Enterprise Assets',
    title: 'Use a Passive Asset Discovery Tool',
    description: 'Use a passive discovery tool to identify assets connected to the enterprise network.',
    evidenceSources: ['datto_rmm_devices'],
    evaluationType: 'semi-auto' },

  // === Category 2: Inventory and Control of Software Assets ===
  { controlId: 'cis-v8-2.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [2, 1],
    category: '2 - Inventory and Control of Software Assets',
    title: 'Establish and Maintain a Software Inventory',
    description: 'Establish and maintain a detailed inventory of all licensed software installed on enterprise assets.',
    evidenceSources: ['datto_rmm_devices', 'microsoft_device_compliance'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-2.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [2, 2],
    category: '2 - Inventory and Control of Software Assets',
    title: 'Ensure Authorized Software is Currently Supported',
    description: 'Ensure that only currently supported software is designated as authorized in the software inventory.',
    evidenceSources: ['datto_rmm_devices'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-2.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [2, 3],
    category: '2 - Inventory and Control of Software Assets',
    title: 'Address Unauthorized Software',
    description: 'Ensure that unauthorized software is either removed from use on enterprise assets or receives a documented exception.',
    evidenceSources: ['datto_rmm_devices', 'microsoft_device_compliance'],
    evaluationType: 'semi-auto' },

  // === Category 3: Data Protection ===
  { controlId: 'cis-v8-3.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [3, 1],
    category: '3 - Data Protection',
    title: 'Establish and Maintain a Data Management Process',
    description: 'Establish and maintain a data management process including data sensitivity, data owner, handling of data, data retention limits, and disposal requirements.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-3.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [3, 2],
    category: '3 - Data Protection',
    title: 'Establish and Maintain a Data Inventory',
    description: 'Establish and maintain a data inventory based on the data management process.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-3.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [3, 3],
    category: '3 - Data Protection',
    title: 'Configure Data Access Control Lists',
    description: 'Configure data access control lists based on a user\'s need to know.',
    evidenceSources: ['microsoft_conditional_access'],
    evaluationType: 'auto' },
  { controlId: 'cis-v8-3.4', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [3, 4],
    category: '3 - Data Protection',
    title: 'Enforce Data Retention',
    description: 'Retain data according to the enterprise\'s data management process. Data retention must include both minimum and maximum timelines.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-3.5', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [3, 5],
    category: '3 - Data Protection',
    title: 'Securely Dispose of Data',
    description: 'Securely dispose of data as outlined in the enterprise\'s data management process.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-3.6', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [3, 6],
    category: '3 - Data Protection',
    title: 'Encrypt Data on End-User Devices',
    description: 'Encrypt data on end-user devices containing sensitive data.',
    evidenceSources: ['microsoft_bitlocker', 'microsoft_device_compliance'],
    evaluationType: 'auto' },

  // === Category 4: Secure Configuration ===
  { controlId: 'cis-v8-4.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [4, 1],
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Establish and Maintain a Secure Configuration Process',
    description: 'Establish and maintain a secure configuration process for enterprise assets and software.',
    evidenceSources: ['microsoft_secure_score'],
    evaluationType: 'auto' },
  { controlId: 'cis-v8-4.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [4, 2],
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Establish and Maintain a Secure Configuration Process for Network Infrastructure',
    description: 'Establish and maintain a secure configuration process for network infrastructure including firewalls, routers, and switches.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-4.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [4, 3],
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Configure Automatic Session Locking on Enterprise Assets',
    description: 'Configure automatic session locking on enterprise assets after a defined period of inactivity. For general purpose OSes, the period must not exceed 15 minutes. For mobile, the period must not exceed 2 minutes.',
    evidenceSources: ['microsoft_intune_config', 'microsoft_device_compliance'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-4.4', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [4, 4],
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Implement and Manage a Firewall on Servers',
    description: 'Implement and manage a firewall on servers where supported. Example implementations include a virtual firewall, OS firewall, or a third-party firewall agent.',
    evidenceSources: ['microsoft_defender', 'datto_rmm_devices'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-4.5', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [4, 5],
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Implement and Manage a Firewall on End-User Devices',
    description: 'Implement and manage a host-based firewall or port-filtering tool on end-user devices.',
    evidenceSources: ['microsoft_defender', 'datto_rmm_devices'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-4.6', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [4, 6],
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Securely Manage Enterprise Assets and Software',
    description: 'Securely manage enterprise assets and software. Use encryption for data at rest on enterprise assets.',
    evidenceSources: ['microsoft_bitlocker'],
    evaluationType: 'auto' },
  { controlId: 'cis-v8-4.7', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [4, 7],
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Manage Default Accounts on Enterprise Assets and Software',
    description: 'Manage default accounts such as root, administrator, and other pre-configured vendor default accounts.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'auto' },

  // === Category 5: Account Management ===
  { controlId: 'cis-v8-5.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [5, 1],
    category: '5 - Account Management',
    title: 'Establish and Maintain an Inventory of Accounts',
    description: 'Establish and maintain an inventory of all accounts managed in the enterprise including end-user, administrator, and service accounts.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-5.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [5, 2],
    category: '5 - Account Management',
    title: 'Use Unique Passwords',
    description: 'Use unique passwords for all enterprise assets. MFA enforcement significantly reduces password-based risk.',
    evidenceSources: ['microsoft_mfa'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-5.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [5, 3],
    category: '5 - Account Management',
    title: 'Disable Dormant Accounts',
    description: 'Delete or disable any dormant accounts after a period of 45 days of inactivity.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'auto' },
  { controlId: 'cis-v8-5.4', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [5, 4],
    category: '5 - Account Management',
    title: 'Restrict Administrator Privileges to Dedicated Administrator Accounts',
    description: 'Restrict administrator privileges to dedicated administrator accounts on enterprise assets.',
    evidenceSources: ['microsoft_users', 'microsoft_mfa'],
    evaluationType: 'semi-auto' },

  // === Category 6: Access Control Management ===
  { controlId: 'cis-v8-6.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [6, 1],
    category: '6 - Access Control Management',
    title: 'Establish an Access Granting Process',
    description: 'Establish and follow a process for granting access to enterprise assets and data.',
    evidenceSources: ['microsoft_conditional_access', 'microsoft_users'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-6.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [6, 2],
    category: '6 - Access Control Management',
    title: 'Establish an Access Revoking Process',
    description: 'Establish and follow a process for revoking access upon termination, rights revocation, or role change.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-6.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [6, 3],
    category: '6 - Access Control Management',
    title: 'Require MFA for Externally-Exposed Applications',
    description: 'Require all externally-exposed enterprise or third-party applications to enforce MFA.',
    evidenceSources: ['microsoft_mfa', 'microsoft_conditional_access'],
    evaluationType: 'auto' },
  { controlId: 'cis-v8-6.4', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [6, 4],
    category: '6 - Access Control Management',
    title: 'Require MFA for Remote Network Access',
    description: 'Require MFA for remote network access.',
    evidenceSources: ['microsoft_mfa', 'microsoft_conditional_access'],
    evaluationType: 'auto' },
  { controlId: 'cis-v8-6.5', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [6, 5],
    category: '6 - Access Control Management',
    title: 'Require MFA for Administrative Access',
    description: 'Require MFA for all administrative access accounts.',
    evidenceSources: ['microsoft_mfa'],
    evaluationType: 'auto' },

  // === Category 7: Continuous Vulnerability Management ===
  { controlId: 'cis-v8-7.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [7, 1],
    category: '7 - Continuous Vulnerability Management',
    title: 'Establish and Maintain a Vulnerability Management Process',
    description: 'Establish and maintain a documented vulnerability management process for enterprise assets.',
    evidenceSources: ['datto_rmm_patches', 'microsoft_secure_score'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-7.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [7, 2],
    category: '7 - Continuous Vulnerability Management',
    title: 'Establish and Maintain a Remediation Process',
    description: 'Establish and maintain a risk-based remediation strategy with monthly or more frequent review.',
    evidenceSources: ['autotask_tickets', 'datto_rmm_patches'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-7.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [7, 3],
    category: '7 - Continuous Vulnerability Management',
    title: 'Perform Automated Operating System Patch Management',
    description: 'Perform OS updates on enterprise assets through automated patch management monthly or more frequently.',
    evidenceSources: ['datto_rmm_patches', 'microsoft_device_compliance'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-7.4', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [7, 4],
    category: '7 - Continuous Vulnerability Management',
    title: 'Perform Automated Application Patch Management',
    description: 'Perform application updates on enterprise assets through automated patch management monthly or more frequently.',
    evidenceSources: ['datto_rmm_patches'],
    evaluationType: 'semi-auto' },

  // === Category 8: Audit Log Management ===
  { controlId: 'cis-v8-8.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [8, 1],
    category: '8 - Audit Log Management',
    title: 'Establish and Maintain an Audit Log Management Process',
    description: 'Establish and maintain an audit log management process that defines the logging requirements for the enterprise.',
    evidenceSources: ['microsoft_secure_score', 'manual_upload'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [8, 2],
    category: '8 - Audit Log Management',
    title: 'Collect Audit Logs',
    description: 'Collect audit logs. Ensure that logging is enabled for enterprise assets.',
    evidenceSources: ['microsoft_secure_score'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [8, 3],
    category: '8 - Audit Log Management',
    title: 'Ensure Adequate Audit Log Storage',
    description: 'Ensure that logging destinations maintain adequate storage to comply with the audit log management process.',
    evidenceSources: ['microsoft_secure_score'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.5', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [8, 5],
    category: '8 - Audit Log Management',
    title: 'Collect Detailed Audit Logs',
    description: 'Configure detailed audit logging for enterprise assets containing sensitive data.',
    evidenceSources: ['microsoft_secure_score', 'microsoft_audit_log'],
    evaluationType: 'semi-auto' },

  // === Category 9: Email and Web Browser Protections ===
  { controlId: 'cis-v8-9.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [9, 1],
    category: '9 - Email and Web Browser Protections',
    title: 'Ensure Use of Only Fully Supported Browsers and Email Clients',
    description: 'Ensure only fully supported browsers and email clients are allowed to execute in the enterprise.',
    evidenceSources: ['datto_rmm_devices'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-9.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [9, 2],
    category: '9 - Email and Web Browser Protections',
    title: 'Use DNS Filtering Services',
    description: 'Use DNS filtering services on all enterprise assets to block access to known malicious domains.',
    evidenceSources: ['dnsfilter_dns'],
    evaluationType: 'auto' },

  // === Category 10: Malware Defenses ===
  { controlId: 'cis-v8-10.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [10, 1],
    category: '10 - Malware Defenses',
    title: 'Deploy and Maintain Anti-Malware Software',
    description: 'Deploy and maintain anti-malware software on all enterprise assets.',
    evidenceSources: ['microsoft_defender', 'microsoft_device_compliance', 'datto_edr_alerts'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-10.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [10, 2],
    category: '10 - Malware Defenses',
    title: 'Configure Automatic Anti-Malware Signature Updates',
    description: 'Configure automatic updates for anti-malware signature files on all enterprise assets.',
    evidenceSources: ['microsoft_defender', 'datto_rmm_devices'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-10.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [10, 3],
    category: '10 - Malware Defenses',
    title: 'Disable Autorun and Autoplay for Removable Media',
    description: 'Disable autorun and autoplay auto-execute functionality for removable media.',
    evidenceSources: ['microsoft_intune_config', 'microsoft_device_compliance'],
    evaluationType: 'semi-auto' },

  // === Category 11: Data Recovery ===
  { controlId: 'cis-v8-11.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [11, 1],
    category: '11 - Data Recovery',
    title: 'Establish and Maintain a Data Recovery Practice',
    description: 'Establish and maintain a data recovery practice including tested backup and recovery procedures.',
    evidenceSources: ['datto_bcdr_backup', 'datto_saas_backup'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-11.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [11, 2],
    category: '11 - Data Recovery',
    title: 'Perform Automated Backups',
    description: 'Perform automated backups of in-scope enterprise assets. Run backups weekly, or more frequently, for sensitive data.',
    evidenceSources: ['datto_bcdr_backup', 'datto_saas_backup'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-11.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [11, 3],
    category: '11 - Data Recovery',
    title: 'Protect Recovery Data',
    description: 'Protect recovery data with equivalent controls to the original data. Reference encryption or data separation based on requirements.',
    evidenceSources: ['datto_bcdr_backup'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-11.4', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [11, 4],
    category: '11 - Data Recovery',
    title: 'Establish and Maintain an Isolated Instance of Recovery Data',
    description: 'Establish and maintain an isolated instance of recovery data using versioning or an air-gapped destination.',
    evidenceSources: ['datto_bcdr_backup'],
    evaluationType: 'semi-auto' },

  // === Category 12: Network Infrastructure Management ===
  { controlId: 'cis-v8-12.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [12, 1],
    category: '12 - Network Infrastructure Management',
    title: 'Ensure Network Infrastructure is Up-to-Date',
    description: 'Ensure network infrastructure is kept up-to-date. Example: run latest stable version of software and/or use currently-supported network-as-a-service (NaaS) offerings.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-12.6', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [12, 6],
    category: '12 - Network Infrastructure Management',
    title: 'Use of Encryption for Data in Transit',
    description: 'Use encryption for data in transit such as TLS for web and email.',
    evidenceSources: ['microsoft_conditional_access', 'microsoft_secure_score'],
    evaluationType: 'semi-auto' },

  // === Category 13: Network Monitoring and Defense ===
  { controlId: 'cis-v8-13.1', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [13, 1],
    category: '13 - Network Monitoring and Defense',
    title: 'Centralize Security Event Alerting',
    description: 'Centralize security event alerting across enterprise assets for log correlation and analysis.',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts', 'dnsfilter_dns'],
    evaluationType: 'semi-auto' },

  // === Category 14: Security Awareness and Skills Training ===
  { controlId: 'cis-v8-14.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 1],
    category: '14 - Security Awareness and Skills Training',
    title: 'Establish and Maintain a Security Awareness Program',
    description: 'Establish and maintain a security awareness program for the workforce.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-14.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 2],
    category: '14 - Security Awareness and Skills Training',
    title: 'Train Workforce Members to Recognize Social Engineering Attacks',
    description: 'Train workforce members to recognize social engineering attacks such as phishing, pre-texting, and tailgating.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-14.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 3],
    category: '14 - Security Awareness and Skills Training',
    title: 'Train Workforce Members on Authentication Best Practices',
    description: 'Train workforce members on authentication best practices including MFA, password composition, and credential management.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-14.4', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 4],
    category: '14 - Security Awareness and Skills Training',
    title: 'Train Workforce on Data Handling Best Practices',
    description: 'Train workforce members on how to identify and properly store, transfer, archive, and destroy sensitive data.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-14.5', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 5],
    category: '14 - Security Awareness and Skills Training',
    title: 'Train Workforce Members on Causes of Unintentional Data Exposure',
    description: 'Train workforce members to be aware of causes for unintentional data exposure.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-14.6', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 6],
    category: '14 - Security Awareness and Skills Training',
    title: 'Train Workforce Members on Recognizing and Reporting Security Incidents',
    description: 'Train workforce members to be able to recognize a potential incident and be able to report such an incident.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-14.7', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 7],
    category: '14 - Security Awareness and Skills Training',
    title: 'Train Workforce on How to Identify and Report if Their Assets are Missing Security Updates',
    description: 'Train workforce to understand how to verify and report out-of-date software patches or any failures in automated processes and tools.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-14.8', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [14, 8],
    category: '14 - Security Awareness and Skills Training',
    title: 'Train Workforce on the Dangers of Connecting to and Transmitting Data Over Insecure Networks',
    description: 'Train workforce on the dangers of connecting to and transmitting enterprise data over insecure networks.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },

  // === Category 15: Service Provider Management ===
  { controlId: 'cis-v8-15.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [15, 1],
    category: '15 - Service Provider Management',
    title: 'Establish and Maintain an Inventory of Service Providers',
    description: 'Establish and maintain an inventory of service providers including classification by sensitivity level.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-15.2', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [15, 2],
    category: '15 - Service Provider Management',
    title: 'Establish and Maintain a Service Provider Management Policy',
    description: 'Establish and maintain a service provider management policy. Ensure the policy addresses the classification, inventory, assessment, monitoring, and decommissioning of service providers.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-15.7', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [15, 7],
    category: '15 - Service Provider Management',
    title: 'Securely Decommission Service Providers',
    description: 'Securely decommission service providers and revoke their access.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },

  // === Category 16: Application Software Security ===
  { controlId: 'cis-v8-16.1', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [16, 1],
    category: '16 - Application Software Security',
    title: 'Establish and Maintain a Secure Application Development Process',
    description: 'Establish and maintain a secure application development process.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },

  // === Category 17: Incident Response Management ===
  { controlId: 'cis-v8-17.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [17, 1],
    category: '17 - Incident Response Management',
    title: 'Designate Personnel to Manage Incident Handling',
    description: 'Designate one key person and at least one backup who will manage the enterprise incident handling process.',
    evidenceSources: ['manual_upload', 'autotask_tickets'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-17.2', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [17, 2],
    category: '17 - Incident Response Management',
    title: 'Establish and Maintain Contact Information for Reporting Security Incidents',
    description: 'Establish and maintain contact information for parties that need to be informed of security incidents.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-17.3', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [17, 3],
    category: '17 - Incident Response Management',
    title: 'Establish and Maintain an Enterprise Process for Reporting Incidents',
    description: 'Establish and maintain an enterprise process for the workforce to report security incidents.',
    evidenceSources: ['manual_upload', 'autotask_tickets'],
    evaluationType: 'manual' },
]

// ---------------------------------------------------------------------------
// Framework export
// ---------------------------------------------------------------------------

export const CIS_V8_FRAMEWORK: FrameworkDefinition = {
  id: 'cis-v8',
  name: 'CIS Controls v8',
  version: '8.0',
  description: 'The Center for Internet Security (CIS) Controls version 8 — a prioritized set of actions to protect organizations and data from known cyber attack vectors.',
  controls: CIS_V8_CONTROLS,
}

export const CIS_V8_EVALUATORS: Record<string, ControlEvaluator> = evaluators

export function getFramework(): FrameworkDefinition {
  return CIS_V8_FRAMEWORK
}
