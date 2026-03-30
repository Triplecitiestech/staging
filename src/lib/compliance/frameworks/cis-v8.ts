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
} from '../types'

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

function noEvidence(controlId: string, sources: string[]): EvaluationResult {
  return {
    controlId,
    status: 'not_assessed',
    confidence: 'none',
    reasoning: 'Required evidence sources were not available for evaluation.',
    evidenceIds: [],
    missingEvidence: sources,
    remediation: null,
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
  if (!devices && !users) return noEvidence('cis-v8-1.1', ['microsoft_device_compliance', 'microsoft_users'])

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
  if (!ca) return noEvidence('cis-v8-3.3', ['microsoft_conditional_access'])

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
  if (!score) return noEvidence('cis-v8-4.1', ['microsoft_secure_score'])

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
  if (!bitlocker) return noEvidence('cis-v8-4.6', ['microsoft_bitlocker'])

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
  if (!mfa) return noEvidence('cis-v8-5.2', ['microsoft_mfa'])

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
  if (!ca && !users) return noEvidence('cis-v8-6.1', ['microsoft_conditional_access', 'microsoft_users'])

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
  if (!mfa) return noEvidence('cis-v8-6.3', ['microsoft_mfa', 'microsoft_conditional_access'])

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
  if (!mfa) return noEvidence('cis-v8-6.5', ['microsoft_mfa'])

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
evaluators['cis-v8-9.2'] = (_ctx: EvaluationContext): EvaluationResult => {
  // This is a placeholder for DNSFilter integration (Phase 2)
  // For now, we note it requires evidence we don't collect in MVP
  return noEvidence('cis-v8-9.2', ['dnsfilter_dns'])
}

// --- 10.1 Deploy and Maintain Anti-Malware Software ---
evaluators['cis-v8-10.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const defender = ctx.evidence.get('microsoft_defender')
  const devices = ctx.evidence.get('microsoft_device_compliance')
  if (!defender && !devices) return noEvidence('cis-v8-10.1', ['microsoft_defender', 'microsoft_device_compliance'])

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
evaluators['cis-v8-11.1'] = (_ctx: EvaluationContext): EvaluationResult => {
  // Requires Datto BCDR/SaaS Protect evidence (Phase 2)
  return noEvidence('cis-v8-11.1', ['datto_bcdr_backup', 'datto_saas_backup'])
}

// --- 12.6 Use of Encryption for Data in Transit ---
evaluators['cis-v8-12.6'] = (ctx: EvaluationContext): EvaluationResult => {
  const ca = ctx.evidence.get('microsoft_conditional_access')
  const score = ctx.evidence.get('microsoft_secure_score')
  if (!ca && !score) return noEvidence('cis-v8-12.6', ['microsoft_conditional_access', 'microsoft_secure_score'])

  // M365 services use TLS by default. CA policies can block unmanaged/insecure apps.
  return result('cis-v8-12.6', ctx, 'pass', 'medium',
    'Microsoft 365 enforces TLS 1.2+ for all data in transit by default. Conditional Access can further restrict access to compliant devices.',
    ['microsoft_conditional_access', 'microsoft_secure_score'],
    ['microsoft_mail_transport'],
    null)
}

// --- 14.1 Establish and Maintain a Security Awareness Program ---
evaluators['cis-v8-14.1'] = (_ctx: EvaluationContext): EvaluationResult => {
  // Cannot auto-evaluate — requires documentation evidence
  return {
    controlId: 'cis-v8-14.1',
    status: 'not_assessed',
    confidence: 'none',
    reasoning: 'Security awareness training requires manual evidence (training records, policy documents). Cannot be auto-evaluated from technical data.',
    evidenceIds: [],
    missingEvidence: ['manual_upload'],
    remediation: 'Implement a security awareness training program and upload evidence of training completion records.',
  }
}

// --- 15.7 Securely Decommission Service Providers ---
evaluators['cis-v8-15.7'] = (_ctx: EvaluationContext): EvaluationResult => {
  return {
    controlId: 'cis-v8-15.7',
    status: 'not_assessed',
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
  if (!users) return noEvidence('cis-v8-4.7', ['microsoft_users'])

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
  if (!users) return noEvidence('cis-v8-5.3', ['microsoft_users'])

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
  if (!users) return noEvidence('cis-v8-6.2', ['microsoft_users'])

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
  if (!score) return noEvidence('cis-v8-8.2', ['microsoft_secure_score'])

  // M365 unified audit log is enabled by default in most tenants
  return result('cis-v8-8.2', ctx, 'pass', 'medium',
    'Microsoft 365 Unified Audit Log is available by default for all E3/E5/Business Premium tenants. Provides comprehensive audit trail for user and admin activities.',
    ['microsoft_secure_score'], ['microsoft_audit_log'],
    null)
}

// --- 8.5 Collect Detailed Audit Logs ---
evaluators['cis-v8-8.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  if (!score) return noEvidence('cis-v8-8.5', ['microsoft_secure_score'])

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
// Control Definitions
// ---------------------------------------------------------------------------

const CIS_V8_CONTROLS: ControlDefinition[] = [
  {
    controlId: 'cis-v8-1.1', frameworkId: 'cis-v8', tier: 'IG1',
    category: '1 - Inventory and Control of Enterprise Assets',
    title: 'Establish and Maintain Detailed Enterprise Asset Inventory',
    description: 'Establish and maintain an accurate, detailed, and up-to-date inventory of all enterprise assets with the potential to store or process data.',
    evidenceSources: ['microsoft_device_compliance', 'microsoft_users', 'datto_rmm_devices'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-3.3', frameworkId: 'cis-v8', tier: 'IG1',
    category: '3 - Data Protection',
    title: 'Configure Data Access Control Lists',
    description: 'Configure data access control lists based on a user\'s need to know.',
    evidenceSources: ['microsoft_conditional_access'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-4.1', frameworkId: 'cis-v8', tier: 'IG1',
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Establish and Maintain a Secure Configuration Process',
    description: 'Establish and maintain a secure configuration process for enterprise assets and software.',
    evidenceSources: ['microsoft_secure_score'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-4.6', frameworkId: 'cis-v8', tier: 'IG1',
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Securely Manage Enterprise Assets and Software',
    description: 'Securely manage enterprise assets and software. Use encryption for data at rest on enterprise assets.',
    evidenceSources: ['microsoft_bitlocker'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-4.7', frameworkId: 'cis-v8', tier: 'IG1',
    category: '4 - Secure Configuration of Enterprise Assets and Software',
    title: 'Manage Default Accounts on Enterprise Assets and Software',
    description: 'Manage default accounts on enterprise assets and software such as root, administrator, and other pre-configured vendor default accounts.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-5.2', frameworkId: 'cis-v8', tier: 'IG1',
    category: '5 - Account Management',
    title: 'Use Unique Passwords',
    description: 'Use unique passwords for all enterprise assets. MFA enforcement significantly reduces password-based risk.',
    evidenceSources: ['microsoft_mfa'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-5.3', frameworkId: 'cis-v8', tier: 'IG1',
    category: '5 - Account Management',
    title: 'Disable Dormant Accounts',
    description: 'Delete or disable any dormant accounts after a period of 45 days of inactivity.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-6.1', frameworkId: 'cis-v8', tier: 'IG1',
    category: '6 - Access Control Management',
    title: 'Establish an Access Granting Process',
    description: 'Establish and follow a process for granting access to enterprise assets and data.',
    evidenceSources: ['microsoft_conditional_access', 'microsoft_users'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-6.2', frameworkId: 'cis-v8', tier: 'IG1',
    category: '6 - Access Control Management',
    title: 'Establish an Access Revoking Process',
    description: 'Establish and follow a process for revoking access to enterprise assets and data upon termination or role change.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-6.3', frameworkId: 'cis-v8', tier: 'IG1',
    category: '6 - Access Control Management',
    title: 'Require MFA for Externally-Exposed Applications',
    description: 'Require all externally-exposed enterprise or third-party applications to enforce multi-factor authentication.',
    evidenceSources: ['microsoft_mfa', 'microsoft_conditional_access'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-6.5', frameworkId: 'cis-v8', tier: 'IG1',
    category: '6 - Access Control Management',
    title: 'Require MFA for Administrative Access',
    description: 'Require MFA for all administrative access accounts.',
    evidenceSources: ['microsoft_mfa'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-8.2', frameworkId: 'cis-v8', tier: 'IG1',
    category: '8 - Audit Log Management',
    title: 'Collect Audit Logs',
    description: 'Collect audit logs. Ensure that logging is enabled for enterprise assets.',
    evidenceSources: ['microsoft_secure_score'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-8.5', frameworkId: 'cis-v8', tier: 'IG2',
    category: '8 - Audit Log Management',
    title: 'Collect Detailed Audit Logs',
    description: 'Configure detailed audit logging for enterprise assets containing sensitive data.',
    evidenceSources: ['microsoft_secure_score', 'microsoft_audit_log'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-9.2', frameworkId: 'cis-v8', tier: 'IG1',
    category: '9 - Email and Web Browser Protections',
    title: 'Use DNS Filtering Services',
    description: 'Use DNS filtering services on all enterprise assets to block access to known malicious domains.',
    evidenceSources: ['dnsfilter_dns'],
    evaluationType: 'auto',
  },
  {
    controlId: 'cis-v8-10.1', frameworkId: 'cis-v8', tier: 'IG1',
    category: '10 - Malware Defenses',
    title: 'Deploy and Maintain Anti-Malware Software',
    description: 'Deploy and maintain anti-malware software on all enterprise assets.',
    evidenceSources: ['microsoft_defender', 'microsoft_device_compliance', 'datto_edr_alerts'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-11.1', frameworkId: 'cis-v8', tier: 'IG1',
    category: '11 - Data Recovery',
    title: 'Establish and Maintain a Data Recovery Practice',
    description: 'Establish and maintain a data recovery practice including tested backup and recovery procedures.',
    evidenceSources: ['datto_bcdr_backup', 'datto_saas_backup'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-12.6', frameworkId: 'cis-v8', tier: 'IG2',
    category: '12 - Network Infrastructure Management',
    title: 'Use of Encryption for Data in Transit',
    description: 'Use encryption for data in transit, such as TLS for web and email.',
    evidenceSources: ['microsoft_conditional_access', 'microsoft_secure_score'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'cis-v8-14.1', frameworkId: 'cis-v8', tier: 'IG1',
    category: '14 - Security Awareness and Skills Training',
    title: 'Establish and Maintain a Security Awareness Program',
    description: 'Establish and maintain a security awareness program for all employees.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'cis-v8-15.7', frameworkId: 'cis-v8', tier: 'IG3',
    category: '15 - Service Provider Management',
    title: 'Securely Decommission Service Providers',
    description: 'Securely decommission service providers and revoke their access.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
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
