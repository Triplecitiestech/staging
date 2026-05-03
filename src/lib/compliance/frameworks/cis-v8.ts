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
// Environment-aware N/A helper
// ---------------------------------------------------------------------------

/**
 * Check if the customer environment makes a control not applicable.
 * Returns an EvaluationResult with 'not_applicable' if so, or null to proceed normally.
 */
function envNotApplicable(controlId: string, ctx: EvaluationContext): EvaluationResult | null {
  const env = ctx.environment
  if (!env) return null

  // CIS 6.4: MFA for Remote Network Access (VPN) — N/A for cloud-only orgs
  if (controlId === 'cis-v8-6.4' && env.remoteAccess === 'cloud_only') {
    return { controlId, status: 'not_applicable', confidence: 'high',
      reasoning: 'This control requires MFA for VPN/remote network access. Per the setup wizard, this customer is cloud-only with no VPN. All applications are SaaS/cloud-based, so VPN-specific MFA controls do not apply.',
      evidenceIds: [], missingEvidence: [], remediation: null }
  }

  // CIS 4.4: Firewall on Servers — N/A if no on-prem servers
  if (controlId === 'cis-v8-4.4' && env.onPremServers === 'no_servers') {
    return { controlId, status: 'not_applicable', confidence: 'high',
      reasoning: 'This control requires host-based firewall on servers. Per the setup wizard, this customer has no on-premises servers (fully cloud). Server firewall controls do not apply.',
      evidenceIds: [], missingEvidence: [], remediation: null }
  }

  // CIS 16.x: Application Security — N/A if no custom development
  if (controlId.startsWith('cis-v8-16.') && env.customApps === 'no') {
    return { controlId, status: 'not_applicable', confidence: 'high',
      reasoning: 'This control applies to organizations that develop custom software applications. Per the setup wizard, this customer uses standard business software only — no custom development. Application security development controls do not apply.',
      evidenceIds: [], missingEvidence: [], remediation: null }
  }

  return null
}

// ---------------------------------------------------------------------------
// Tool deployment attestation helper
// ---------------------------------------------------------------------------

/**
 * Check if a tool relevant to this control has been marked as deployed.
 * Returns an EvaluationResult with 'pass' (low confidence, attestation) if so.
 */
function toolAttestationPass(controlId: string, ctx: EvaluationContext): EvaluationResult | null {
  const tools = ctx.deployedTools
  if (!tools || tools.size === 0) return null

  // Map controls to the tools that can satisfy them via attestation
  const controlToolMap: Record<string, { toolIds: string[]; description: string }> = {
    // Bullphish ID covers all training controls (14.x)
    'cis-v8-14.1': { toolIds: ['bullphish_id'], description: 'Security awareness training via Bullphish ID' },
    'cis-v8-14.2': { toolIds: ['bullphish_id'], description: 'Social engineering recognition training via Bullphish ID' },
    'cis-v8-14.3': { toolIds: ['bullphish_id'], description: 'Authentication best practices training via Bullphish ID' },
    'cis-v8-14.4': { toolIds: ['bullphish_id'], description: 'Data handling training via Bullphish ID' },
    'cis-v8-14.5': { toolIds: ['bullphish_id'], description: 'Unintentional data exposure training via Bullphish ID' },
    'cis-v8-14.6': { toolIds: ['bullphish_id'], description: 'Security incident recognition training via Bullphish ID' },
    'cis-v8-14.7': { toolIds: ['bullphish_id'], description: 'Missing security updates training via Bullphish ID' },
    'cis-v8-14.8': { toolIds: ['bullphish_id'], description: 'Insecure network dangers training via Bullphish ID' },
    // RocketCyber SOC covers security monitoring/alerting (13.x)
    'cis-v8-13.1': { toolIds: ['rocketcyber'], description: 'Centralized security event alerting via RocketCyber SOC' },
    // Dark Web ID covers credential monitoring
    'cis-v8-5.2': { toolIds: ['dark_web_id'], description: 'Compromised credential monitoring via Dark Web ID' },
  }

  const mapping = controlToolMap[controlId]
  if (!mapping) return null

  for (const toolId of mapping.toolIds) {
    const deployment = tools.get(toolId)
    if (deployment?.deployed) {
      return {
        controlId,
        status: 'pass',
        confidence: 'low',
        reasoning: `${mapping.description} is deployed (admin attestation). This tool is marked as active on the Tool Capability Map but does not have an API integration for automated evidence collection. Status is based on administrator attestation.${deployment.notes ? ` Notes: ${deployment.notes}` : ''}`,
        evidenceIds: [],
        missingEvidence: [],
        remediation: null,
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Policy coverage upgrade helper
// ---------------------------------------------------------------------------

/**
 * Check if uploaded policies satisfy a control.
 * Called AFTER the main evaluator runs.
 *
 * IMPORTANT: Policies only upgrade controls that LACK technical evidence.
 * If a control already has technical evidence (pass, fail, partial with evidence),
 * the policy is mentioned as supporting documentation but does NOT change the status.
 * Policies exist to satisfy process/documentation controls like incident response,
 * security awareness, data handling — NOT to override BitLocker percentages or MFA rates.
 */
function applyPolicyCoverage(evalResult: EvaluationResult, ctx: EvaluationContext): EvaluationResult {
  const coverage = ctx.policyCoverage?.get(evalResult.controlId)
  if (!coverage || coverage.length === 0) return evalResult

  const satisfied = coverage.filter((c) => c.status === 'satisfied')
  const partial = coverage.filter((c) => c.status === 'partial')
  const policyNames = coverage.map((c) => c.policyTitle)

  // Determine if policies can upgrade this control's status.
  // Policies CAN upgrade when:
  //   - Status is needs_review (evidence checked but insufficient)
  //   - Status is partial AND the missing piece is documentation (IT Glue, etc.)
  //     e.g., "TCT handles incidents but no formal docs" → uploaded SIRP policy satisfies it
  // Policies CANNOT upgrade when:
  //   - Status is partial/fail from a technical measurement (BitLocker 73%, MFA rate, etc.)
  //     Those require actual technical remediation, not documentation
  const DOC_SOURCES = ['it_glue_documentation', 'manual_upload']
  const missingIsDocumentation = evalResult.missingEvidence.length > 0
    && evalResult.missingEvidence.every((s) => DOC_SOURCES.includes(s))
  const hasConclusiveTechnicalEvidence = evalResult.evidenceIds.length > 0
    && evalResult.status !== 'needs_review'
    && !(evalResult.status === 'partial' && missingIsDocumentation)

  if (hasConclusiveTechnicalEvidence) {
    // Don't change status, confidence, or evidence — but show policy details with quotes
    const relevantPolicies = [...satisfied, ...partial]
    if (relevantPolicies.length > 0) {
      const details = relevantPolicies.map((c) => {
        let detail = `**${c.policyTitle}**`
        if (c.section) detail += ` (${c.section})`
        if (c.reasoning) detail += `: ${c.reasoning}`
        if (c.quote) detail += ` — "${c.quote}"`
        return detail
      })
      return {
        ...evalResult,
        reasoning: `${evalResult.reasoning}\n\nAdditionally supported by uploaded policy documentation:\n${details.join('\n')}`,
      }
    }
    return {
      ...evalResult,
      reasoning: `${evalResult.reasoning} Additionally supported by uploaded policy: ${policyNames.join(', ')}.`,
    }
  }

  // No conclusive technical evidence — policies can upgrade.
  // This covers: needs_review, not_assessed, and partial-with-missing-documentation.

  if (evalResult.status === 'pass') return evalResult // Already passing, nothing to do

  if (satisfied.length > 0 && (evalResult.status === 'needs_review' || evalResult.status === 'not_assessed' || evalResult.status === 'partial')) {
    // Build detailed reasoning with quotes from each satisfying policy
    const details = satisfied.map((c) => {
      let detail = `**${c.policyTitle}**`
      if (c.section) detail += ` (${c.section})`
      if (c.reasoning) detail += `: ${c.reasoning}`
      if (c.quote) detail += ` — "${c.quote}"`
      return detail
    })
    return {
      controlId: evalResult.controlId,
      status: 'pass',
      confidence: 'medium',
      reasoning: `Satisfied by uploaded policy documentation:\n${details.join('\n')}`,
      evidenceIds: [],
      missingEvidence: [],
      remediation: null,
    }
  }

  if (partial.length > 0 && (evalResult.status === 'needs_review' || evalResult.status === 'not_assessed' || evalResult.status === 'partial')) {
    const details = partial.map((c) => {
      let detail = `**${c.policyTitle}**`
      if (c.section) detail += ` (${c.section})`
      if (c.reasoning) detail += `: ${c.reasoning}`
      if (c.quote) detail += ` — "${c.quote}"`
      return detail
    })
    return {
      controlId: evalResult.controlId,
      status: 'partial',
      confidence: 'low',
      reasoning: `Partially addressed by uploaded policy documentation:\n${details.join('\n')}${evalResult.remediation ? `\nRecommendation: ${evalResult.remediation}` : ''}`,
      evidenceIds: [],
      missingEvidence: evalResult.missingEvidence,
      remediation: evalResult.remediation,
    }
  }

  return evalResult
}

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
// CIS 5.2 asks specifically: "Use Unique Passwords" — every account has a
// distinct password (no shared credentials, no password reuse across accounts).
// This is a property of the identity provider, NOT a question about MFA.
// Microsoft Entra ID enforces unique passwords by design — every user account
// has its own credential, password reuse is detected, banned-password lists
// prevent common passwords, and there are no shared accounts unless explicitly
// created. When Entra ID is the identity provider, CIS 5.2 is satisfied.
//
// MFA gaps belong under CIS 6.3 (MFA for external apps) and CIS 6.5 (MFA for
// admin access) — do NOT fail 5.2 because MFA is incomplete.
evaluators['cis-v8-5.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const users = ctx.evidence.get('microsoft_users')
  if (!users) return noEvidence('cis-v8-5.2', ['microsoft_users'], ctx)

  const userData = users.rawData as { totalCount?: number; activeCount?: number }
  const total = userData.totalCount ?? userData.activeCount ?? 0

  if (total === 0) {
    return result('cis-v8-5.2', ctx, 'not_assessed', 'low',
      'No user data available to assess password uniqueness.',
      ['microsoft_users'], [])
  }

  return result('cis-v8-5.2', ctx, 'pass', 'high',
    `Microsoft Entra ID is the identity provider for ${total} user accounts. Entra ID enforces unique passwords per account by design (no shared credentials), with banned-password protection blocking common passwords and password-reuse detection across the directory.`,
    ['microsoft_users'], [])
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
  if (!mfa && !ca) return noEvidence('cis-v8-6.3', ['microsoft_mfa', 'microsoft_conditional_access'], ctx)

  const mfaData = mfa?.rawData as { totalUsers?: number; mfaRegisteredUsers?: number | null; mfaRate?: number | null; permissionMissing?: string; note?: string } | undefined
  const total = mfaData?.totalUsers ?? 0
  const registered = mfaData?.mfaRegisteredUsers
  const rate = registered !== null && registered !== undefined && total > 0 ? Math.round((registered / total) * 100) : null

  const caData = ca?.rawData as { policies?: Array<{ state?: string; displayName?: string }>; enabledPolicies?: number } | undefined
  const allPolicies = caData?.policies ?? []
  const enabledPolicies = allPolicies.filter((p) => p.state === 'enabled')
  const mfaPolicies = enabledPolicies.filter((p) => {
    const name = (p.displayName ?? '').toLowerCase()
    return name.includes('mfa') || name.includes('multi-factor') || name.includes('multifactor')
  })
  const sources = ['microsoft_mfa', 'microsoft_conditional_access'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  // If MFA data is unavailable (permission missing), evaluate based on CA policies alone
  if (rate === null && mfaData?.permissionMissing) {
    if (enabledPolicies.length > 0) {
      const policyList = enabledPolicies.map((p) => p.displayName).join(', ')
      if (mfaPolicies.length > 0) {
        return result('cis-v8-6.3', ctx, 'pass', 'medium',
          `${enabledPolicies.length} Conditional Access policies active (${policyList}). ${mfaPolicies.length} explicitly require MFA. Per-user MFA registration details unavailable — add "UserAuthenticationMethod.Read.All" permission to the app registration for detailed MFA metrics.`,
          sources, [])
      }
      return result('cis-v8-6.3', ctx, 'partial', 'low',
        `${enabledPolicies.length} CA policies active (${policyList}) but none explicitly named for MFA. MFA may be enforced within these policies. Per-user data unavailable — add "UserAuthenticationMethod.Read.All" permission.`,
        sources, [],
        'Add "UserAuthenticationMethod.Read.All" permission to the app registration. Verify CA policies require MFA for all cloud apps.')
    }
    return result('cis-v8-6.3', ctx, 'needs_review', 'none',
      `${total} users found but MFA registration data unavailable. Add "UserAuthenticationMethod.Read.All" Application permission to the customer's app registration in Azure AD and grant admin consent.`,
      sources, [],
      'Add "UserAuthenticationMethod.Read.All" Application permission in Azure AD > App registrations > API permissions > Add permission > Microsoft Graph > Application > UserAuthenticationMethod.Read.All. Then grant admin consent.')
  }

  // MFA data available
  if (rate !== null && rate >= 95 && mfaPolicies.length >= 1) {
    return result('cis-v8-6.3', ctx, 'pass', 'high',
      `MFA registered for ${rate}% of ${total} users. ${mfaPolicies.length} CA policy requires MFA: ${mfaPolicies.map((p) => p.displayName).join(', ')}. ${enabledPolicies.length} total CA policies active.`,
      sources, [])
  }
  if (rate !== null && rate >= 95) {
    return result('cis-v8-6.3', ctx, 'pass', 'medium',
      `MFA registered for ${rate}% of ${total} users. ${enabledPolicies.length} CA policies active: ${enabledPolicies.map((p) => p.displayName).join(', ')}.`,
      sources, [])
  }
  if (rate !== null) {
    return result('cis-v8-6.3', ctx, 'fail', 'high',
      `Only ${rate}% of ${total} users have MFA registered (${registered} of ${total}). ${enabledPolicies.length} CA policies exist but MFA coverage is insufficient.`,
      sources, [],
      'Create a Conditional Access policy requiring MFA for all cloud applications and enforce MFA registration for all users.')
  }
  return noEvidence('cis-v8-6.3', ['microsoft_mfa', 'microsoft_conditional_access'], ctx)
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

  const dnsData = dns.rawData as {
    dnsFilteringActive?: boolean
    matchedOrganization?: string | null
    networkCount?: number
    roamingClientCount?: number
    policyCount?: number
    blockedCategoryCount?: number
    filteringMethod?: string
    totalOrganizations?: number
    // Legacy fields from old collector
    totalQueries?: number
    blockedQueries?: number
  }

  // New evidence format: orgs + networks + roaming clients + policies
  if (dnsData.dnsFilteringActive) {
    const orgName = dnsData.matchedOrganization
    const networks = dnsData.networkCount ?? 0
    const roamingClients = dnsData.roamingClientCount ?? 0
    const policies = dnsData.policyCount ?? 0
    const blockedCats = dnsData.blockedCategoryCount ?? 0
    const method = dnsData.filteringMethod ?? 'unknown'

    if (orgName && (networks > 0 || roamingClients > 0) && policies > 0) {
      return result('cis-v8-9.2', ctx, 'pass', 'high',
        `DNS filtering active for "${orgName}" via ${method}: ${policies} blocking policy/policies covering ${blockedCats} threat categories.${roamingClients > 0 ? ` ${roamingClients} roaming client(s) deployed.` : ''}${networks > 0 ? ` ${networks} site network(s).` : ''}`,
        ['dnsfilter_dns'], [])
    }
    if (orgName) {
      // Org exists in DNSFilter — even without visible networks/roaming clients,
      // the org being configured means DNS filtering is deployed (could be roaming
      // clients that the API doesn't enumerate, or network-level forwarding)
      return result('cis-v8-9.2', ctx, 'pass', 'medium',
        `DNS filtering active for "${orgName}" in DNSFilter (${method}).${roamingClients > 0 ? ` ${roamingClients} roaming client(s).` : ''}${networks > 0 ? ` ${networks} network(s).` : ''}${policies > 0 ? ` ${policies} policy/policies.` : ''}`,
        ['dnsfilter_dns'], [])
    }
    // MSP-level only (no customer-specific match)
    return result('cis-v8-9.2', ctx, 'pass', 'low',
      `DNSFilter is active MSP-wide (${dnsData.totalOrganizations ?? 0} organizations). Map this customer to their specific DNSFilter organization in Platform Mapping for higher confidence.`,
      ['dnsfilter_dns'], [])
  }

  // Legacy: query-based evidence (in case old assessments exist)
  const total = dnsData.totalQueries ?? 0
  const blocked = dnsData.blockedQueries ?? 0
  if (total > 0) {
    return result('cis-v8-9.2', ctx, 'pass', 'medium',
      `DNS filtering active. ${blocked.toLocaleString()} threats blocked out of ${total.toLocaleString()} queries.`,
      ['dnsfilter_dns'], [])
  }

  return result('cis-v8-9.2', ctx, 'needs_review', 'low',
    'DNS filtering evidence collected but could not confirm active filtering for this customer.',
    ['dnsfilter_dns'], [], 'Map this customer to their DNSFilter organization in Platform Mapping.')
}

// --- 9.3 Maintain and Enforce Network-Based URL Filters ---
// DNSFilter directly satisfies this control when active for the customer.
// (Same evidence basis as 9.2 — DNS-layer filtering IS network-based URL filtering.)
evaluators['cis-v8-9.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const dns = ctx.evidence.get('dnsfilter_dns')
  if (!dns) return noEvidence('cis-v8-9.3', ['dnsfilter_dns'], ctx)
  const dnsData = dns.rawData as { dnsFilteringActive?: boolean; matchedOrganization?: string | null; blockedCategoryCount?: number }
  if (dnsData.dnsFilteringActive && dnsData.matchedOrganization) {
    return result('cis-v8-9.3', ctx, 'pass', 'high',
      `Network-based URL filtering is enforced via DNSFilter for "${dnsData.matchedOrganization}", blocking malicious, phishing, and policy-violating website categories${dnsData.blockedCategoryCount ? ` (${dnsData.blockedCategoryCount} categories)` : ''}. Policies are managed and updated by the MSP.`,
      ['dnsfilter_dns'], [])
  }
  return result('cis-v8-9.3', ctx, 'needs_review', 'low',
    'DNSFilter is in the stack but customer-specific organization not confirmed. Map this customer in Platform Mapping.',
    ['dnsfilter_dns'], [])
}

// --- 9.5 Implement DMARC ---
// EasyDMARC is the planned evidence source. Until that integration ships, this
// requires manual verification (DNS lookup of the customer's domains for DMARC
// records, or admin attestation). Adding this stub returns needs_review with a
// clear backlog message instead of silently being unevaluated.
// TODO: when EasyDMARC connector is built, query DMARC/SPF/DKIM via API and
// promote to pass/fail based on policy strictness.
evaluators['cis-v8-9.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const emailAuth = ctx.evidence.get('easydmarc_email_auth' as EvidenceSourceType)
  if (!emailAuth) {
    return result('cis-v8-9.5', ctx, 'needs_review', 'low',
      'DMARC enforcement requires DNS verification. Configure EASYDMARC_API_KEY to auto-check, or manually verify DMARC/SPF/DKIM records.',
      [], ['easydmarc_email_auth'])
  }

  const data = emailAuth.rawData as {
    domain?: string
    enforced?: boolean
    dmarc?: { exists?: boolean; policy?: string; pct?: number; ruaConfigured?: boolean; valid?: boolean }
    spf?: { exists?: boolean; allMechanism?: string; valid?: boolean }
    dkim?: { exists?: boolean; selector?: string; publicKeyValid?: boolean }
  }

  const domain = data.domain ?? 'unknown'
  const dmarcPolicy = data.dmarc?.policy ?? 'missing'
  const spfValid = data.spf?.exists && data.spf.valid
  const dkimPresent = data.dkim?.exists

  // Fully enforced: DMARC quarantine/reject + SPF valid + DKIM present
  if (data.enforced) {
    return result('cis-v8-9.5', ctx, 'pass', 'high',
      `DMARC is fully enforced for ${domain}: policy=${dmarcPolicy}${data.dmarc?.pct ? ` pct=${data.dmarc.pct}%` : ''}, SPF valid, DKIM published${data.dkim?.selector ? ` (selector: ${data.dkim.selector})` : ''}${data.dmarc?.ruaConfigured ? ', aggregate reporting configured' : ''}.`,
      ['easydmarc_email_auth'], [])
  }

  // DMARC exists but not enforcing (policy=none or missing SPF/DKIM)
  if (data.dmarc?.exists && data.dmarc.valid) {
    const gaps: string[] = []
    if (dmarcPolicy === 'none') gaps.push('DMARC policy is "none" (monitoring only)')
    if (!spfValid) gaps.push('SPF record missing or invalid')
    if (!dkimPresent) gaps.push('DKIM record not found')
    return result('cis-v8-9.5', ctx, 'partial', 'high',
      `DMARC record exists for ${domain} (policy=${dmarcPolicy}) but is not fully enforcing. Gaps: ${gaps.join('; ')}.`,
      ['easydmarc_email_auth'], [],
      `Upgrade DMARC policy to "quarantine" or "reject"${!spfValid ? ', fix SPF record' : ''}${!dkimPresent ? ', publish DKIM' : ''}.`)
  }

  // No DMARC at all
  return result('cis-v8-9.5', ctx, 'fail', 'high',
    `No valid DMARC record found for ${domain}. SPF: ${spfValid ? 'valid' : 'missing/invalid'}, DKIM: ${dkimPresent ? 'present' : 'missing'}.`,
    ['easydmarc_email_auth'], [],
    `Publish a DMARC record: _dmarc.${domain} TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}". Also ensure SPF and DKIM are configured.`)
}

// --- 10.1 Deploy and Maintain Anti-Malware Software ---
evaluators['cis-v8-10.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const defender = ctx.evidence.get('microsoft_defender')
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const edr = ctx.evidence.get('datto_edr_alerts')
  if (!defender && !devices && !edr) return noEvidence('cis-v8-10.1', ['microsoft_defender', 'microsoft_device_compliance', 'datto_edr_alerts'], ctx)

  const defData = defender?.rawData as { protectedDevices?: number; totalDevices?: number } | undefined
  const devData = devices?.rawData as { totalCount?: number } | undefined
  const protectedCount = defData?.protectedDevices ?? 0
  const total = defData?.totalDevices ?? devData?.totalCount ?? 0
  const hasEdr = !!edr
  const sources = ['microsoft_defender', 'microsoft_device_compliance', 'datto_edr_alerts'].filter(
    (s) => ctx.evidence.has(s as EvidenceSourceType)
  )

  // If EDR is connected, that's strong AV evidence regardless of Defender device count
  if (hasEdr && total > 0) {
    return result('cis-v8-10.1', ctx, 'pass', 'high',
      `Anti-malware deployed via Datto EDR (using Windows Defender) across ${total} managed devices. EDR provides active threat detection and response.`,
      sources, [])
  }
  if (hasEdr) {
    return result('cis-v8-10.1', ctx, 'pass', 'medium',
      'Datto EDR is active with Windows Defender providing anti-malware protection. EDR feeds into RocketCyber for additional SOC monitoring.',
      sources, [])
  }
  if (total === 0) {
    return result('cis-v8-10.1', ctx, 'not_assessed', 'low',
      'No device data available to assess anti-malware coverage.',
      sources, ['datto_edr_alerts'])
  }
  const rate = Math.round((protectedCount / total) * 100)
  if (rate >= 95) {
    return result('cis-v8-10.1', ctx, 'pass', 'medium',
      `${protectedCount}/${total} devices (${rate}%) have Defender anti-malware active.`,
      sources, [])
  }
  return result('cis-v8-10.1', ctx, 'partial', 'medium',
    `${protectedCount}/${total} devices (${rate}%) protected. Deploy Datto EDR with Windows Defender to remaining devices.`,
    sources, [],
    'Ensure Datto EDR with Windows Defender is deployed to all managed endpoints.')
}

// --- 10.2 Configure Automatic Anti-Malware Signature Updates ---
evaluators['cis-v8-10.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const defender = ctx.evidence.get('microsoft_defender')
  const edr = ctx.evidence.get('datto_edr_alerts')
  const devices = ctx.evidence.get('microsoft_device_compliance')
  if (!defender && !edr && !devices) return noEvidence('cis-v8-10.2', ['microsoft_defender', 'datto_edr_alerts'], ctx)

  const sources = ['microsoft_defender', 'datto_edr_alerts', 'microsoft_device_compliance'].filter(
    (s) => ctx.evidence.has(s as EvidenceSourceType)
  )

  // EDR (Datto EDR + Windows Defender) auto-updates signatures via cloud
  if (edr) {
    return result('cis-v8-10.2', ctx, 'pass', 'high',
      'Datto EDR manages Windows Defender with automatic cloud-based signature updates. Signatures update continuously via Microsoft Security Intelligence.',
      sources, [])
  }
  // Defender managed via Intune auto-updates
  if (defender) {
    const defData = defender.rawData as { protectedDevices?: number; totalDevices?: number } | undefined
    const total = defData?.totalDevices ?? 0
    if (total > 0) {
      return result('cis-v8-10.2', ctx, 'pass', 'medium',
        `Windows Defender is deployed across ${total} devices via Intune. Microsoft Defender automatically updates virus definitions through Windows Update and cloud-delivered protection.`,
        sources, [])
    }
  }
  return result('cis-v8-10.2', ctx, 'needs_review', 'low',
    'Anti-malware is detected but automatic signature update configuration could not be confirmed. Verify Windows Defender receives automatic definition updates via Intune or Group Policy.',
    sources, [], 'Deploy Datto EDR to ensure automatic signature updates across all endpoints.')
}

// Helper: extract Datto Endpoint Backup devices from RMM evidence
function getEndpointBackupDevices(ctx: EvaluationContext): { count: number; hostnames: string[] } {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  if (!rmm) return { count: 0, hostnames: [] }
  const data = rmm.rawData as { endpoint_backup_devices?: Array<{ hostname: string }>; endpoint_backup_count?: number }
  const devices = data.endpoint_backup_devices ?? []
  return { count: data.endpoint_backup_count ?? devices.length, hostnames: devices.map((d) => d.hostname) }
}

// --- 11.1 Establish and Maintain a Data Recovery Practice ---
evaluators['cis-v8-11.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const bcdr = ctx.evidence.get('datto_bcdr_backup')
  const saas = ctx.evidence.get('datto_saas_backup')
  const epBackup = getEndpointBackupDevices(ctx)

  if (!bcdr && !saas && epBackup.count === 0) return noEvidence('cis-v8-11.1', ['datto_bcdr_backup', 'datto_saas_backup', 'datto_rmm_devices'], ctx)

  const bcdrData = bcdr?.rawData as { matched?: boolean; totalAppliances?: number; totalAlerts?: number; deviceDetails?: unknown[] } | undefined
  const saasData = saas?.rawData as { matched?: boolean; totalSeats?: number; activeSeats?: number; unprotectedSeats?: number } | undefined

  const hasBcdr = bcdrData?.matched && (bcdrData?.deviceDetails ?? []).length > 0
  const hasSaas = saasData?.matched && (saasData?.totalSeats ?? 0) > 0
  const hasEpBackup = epBackup.count > 0

  // "No on-prem servers" doesn't mean "no local backup needed" when
  // workstations act as servers or have critical local data (e.g. QuickBooks)
  const hasWorkstationData = ctx.environment?.rawAnswers?.workstation_as_server === 'yes_backed_up'
    || ctx.environment?.rawAnswers?.workstation_as_server === 'yes_not_backed_up'
    || ctx.environment?.rawAnswers?.critical_local_apps !== 'none'
  const bcdrNotUsed = (ctx.environment?.onPremServers === 'no_servers' && !hasWorkstationData)
    || ctx.environment?.scope?.backup === 'm365_only'

  // Build the backup coverage summary including all three sources
  const layers: string[] = []
  const sources: string[] = []
  if (hasBcdr) {
    layers.push(`${(bcdrData?.deviceDetails ?? []).length} BCDR device(s)`)
    sources.push('datto_bcdr_backup')
  }
  if (hasEpBackup) {
    layers.push(`${epBackup.count} Endpoint Backup device(s) (${epBackup.hostnames.join(', ')})`)
    sources.push('datto_rmm_devices')
  }
  if (hasSaas) {
    const unprotected = saasData?.unprotectedSeats ?? 0
    layers.push(`${saasData?.totalSeats} SaaS backup seat(s)${unprotected > 0 ? ` (${unprotected} unprotected)` : ''}`)
    sources.push('datto_saas_backup')
  }

  if (layers.length >= 2) {
    return result('cis-v8-11.1', ctx, 'pass', 'high',
      `Backup coverage confirmed across ${layers.length} layers: ${layers.join(', ')}.`,
      sources, [])
  }
  if (layers.length === 1) {
    if (bcdrNotUsed && (hasSaas || hasEpBackup)) {
      return result('cis-v8-11.1', ctx, 'pass', 'medium',
        `Backup active: ${layers[0]}. No on-prem servers — BCDR not required.`,
        sources, [])
    }
    return result('cis-v8-11.1', ctx, 'partial', 'medium',
      `Backup active: ${layers[0]}.`,
      sources, hasBcdr || hasEpBackup ? ['datto_saas_backup'] : ['datto_bcdr_backup'],
      !hasSaas ? 'Deploy Datto SaaS Protect for M365 cloud data backup.' : 'Deploy BCDR or Endpoint Backup for server/workstation backup.')
  }
  return result('cis-v8-11.1', ctx, 'needs_review', 'low',
    'Backup integrations are available but no matching devices/seats found for this customer.',
    sources, [],
    'Verify company name mapping in Platform Mapping.')
}

// --- 11.2 Perform Automated Backups ---
evaluators['cis-v8-11.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const bcdr = ctx.evidence.get('datto_bcdr_backup')
  const saas = ctx.evidence.get('datto_saas_backup')
  const epBackup = getEndpointBackupDevices(ctx)

  if (!bcdr && !saas && epBackup.count === 0) return noEvidence('cis-v8-11.2', ['datto_bcdr_backup', 'datto_saas_backup', 'datto_rmm_devices'], ctx)

  const bcdrData = bcdr?.rawData as { matched?: boolean; deviceDetails?: Array<{ name?: string }> } | undefined
  const saasData = saas?.rawData as { matched?: boolean; totalSeats?: number; activeSeats?: number; unprotectedSeats?: number } | undefined

  const hasBcdr = bcdrData?.matched && (bcdrData?.deviceDetails ?? []).length > 0
  const hasSaas = saasData?.matched && (saasData?.totalSeats ?? 0) > 0
  const sources = ['datto_bcdr_backup', 'datto_saas_backup', 'datto_rmm_devices'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  const backupLayers: string[] = []

  if (hasBcdr) {
    const deviceNames = (bcdrData?.deviceDetails ?? []).map((d) => d.name).filter(Boolean).slice(0, 10)
    backupLayers.push(`Datto BCDR: ${(bcdrData?.deviceDetails ?? []).length} protected server(s)/workstation(s) with automated backup schedules${deviceNames.length > 0 ? ` (${deviceNames.join(', ')})` : ''}. Backups run on configurable intervals (typically every 15min-1hr) with local + cloud replication.`)
  }
  if (epBackup.count > 0) {
    backupLayers.push(`Datto Endpoint Backup: ${epBackup.count} device(s) (${epBackup.hostnames.join(', ')}) with automated backup agent. Backs up data to Datto cloud with configurable schedules.`)
  }
  if (hasSaas) {
    const unprotected = saasData?.unprotectedSeats ?? 0
    backupLayers.push(`Datto SaaS Protect: ${saasData?.totalSeats} M365 backup seat(s) (${saasData?.activeSeats ?? 0} active). Automated daily backup of Exchange, OneDrive, SharePoint, and Teams data.${unprotected > 0 ? ` ${unprotected} unprotected seat(s) need attention.` : ' All seats protected.'}`)
  }

  if (backupLayers.length >= 2) {
    return result('cis-v8-11.2', ctx, 'pass', 'high',
      `Automated backups active across ${backupLayers.length} layers:\n${backupLayers.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
      sources, [])
  }
  if (backupLayers.length === 1) {
    const bcdrNotUsed = ctx.environment?.onPremServers === 'no_servers'
      || ctx.environment?.scope?.backup === 'm365_only'
    if ((!hasBcdr && !epBackup.count) && bcdrNotUsed) {
      return result('cis-v8-11.2', ctx, 'pass', 'medium',
        `Automated backup active: ${backupLayers[0]} No on-prem servers — BCDR not required.`,
        sources, [])
    }
    return result('cis-v8-11.2', ctx, 'partial', 'medium',
      `Automated backup active: ${backupLayers[0]}`,
      sources, (hasBcdr || epBackup.count > 0) ? ['datto_saas_backup'] : ['datto_bcdr_backup'],
      !hasSaas ? 'Deploy Datto SaaS Protect for M365 data backup.' : 'Deploy BCDR or Endpoint Backup for server/workstation backup.')
  }
  return result('cis-v8-11.2', ctx, 'needs_review', 'low',
    'Backup integrations connected but no matching devices/seats found for this customer.',
    sources, [],
    'Verify company name mapping in Platform Mapping.')
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
evaluators['cis-v8-14.1'] = (ctx: EvaluationContext): EvaluationResult => {
  // Check Bullphish ID deployment attestation
  const attestation = toolAttestationPass('cis-v8-14.1', ctx)
  if (attestation) return attestation

  return {
    controlId: 'cis-v8-14.1',
    status: 'needs_review',
    confidence: 'none',
    reasoning: 'Security awareness training requires manual evidence (training records, policy documents). Cannot be auto-evaluated from technical data alone. If Bullphish ID is deployed, toggle it as "Deployed" on the Tool Capability Map.',
    evidenceIds: [],
    missingEvidence: ['manual_upload'],
    remediation: 'Implement a security awareness training program and upload evidence of training completion records. Or mark Bullphish ID as deployed on the Tool Capability Map.',
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
// Multi-layer: M365 UAL + Datto RMM (endpoint actions, software, patches) +
// Datto EDR/RocketCyber (security events per device) + Domotz (network device logs) +
// Ubiquiti (network infrastructure logs) + SaaS Alerts (cloud app events)
evaluators['cis-v8-8.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const edr = ctx.evidence.get('datto_edr_alerts')
  const domotz = ctx.evidence.get('domotz_network_discovery' as EvidenceSourceType)
  const ubiquiti = ctx.evidence.get('ubiquiti_network' as EvidenceSourceType)
  const saasAlerts = ctx.evidence.get('saas_alerts_monitoring' as EvidenceSourceType)
  const sources = ['microsoft_secure_score', 'datto_rmm_devices', 'datto_edr_alerts', 'domotz_network_discovery', 'ubiquiti_network', 'saas_alerts_monitoring']
    .filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  if (sources.length === 0) return noEvidence('cis-v8-8.2', ['microsoft_secure_score', 'datto_rmm_devices', 'datto_edr_alerts'], ctx)

  // Check attestation for RocketCyber SOC
  const rocketcyberDeployed = ctx.deployedTools?.get('rocketcyber')?.deployed

  const layers: string[] = []
  if (score) layers.push('Microsoft 365 Unified Audit Log (sign-ins, admin actions, mail flow, SharePoint access)')
  if (rmm) {
    const rmmData = rmm.rawData as { totalDevices?: number }
    layers.push(`Datto RMM (${rmmData.totalDevices ?? 0} endpoints — software inventory, patch history, Windows Update logs, endpoint actions)`)
  }
  if (edr || rocketcyberDeployed) {
    layers.push('Datto EDR + RocketCyber SOC (per-device security events, process execution, file changes, network connections, threat detections)')
  }
  if (domotz) {
    const dData = domotz.rawData as { totalDevices?: number; agentCount?: number }
    layers.push(`Domotz (${dData.totalDevices ?? 0} network devices monitored across ${dData.agentCount ?? 0} collector(s) — device status changes, connectivity events)`)
  }
  if (ubiquiti) {
    const uData = ubiquiti.rawData as { totalDevices?: number; totalSites?: number }
    layers.push(`Ubiquiti UniFi (${uData.totalDevices ?? 0} network devices across ${uData.totalSites ?? 0} site(s) — AP/switch/gateway logs, client connections, firmware events)`)
  }
  if (saasAlerts) {
    const saData = saasAlerts.rawData as { totalEvents?: number }
    layers.push(`SaaS Alerts (${saData.totalEvents ?? 0} cloud application events — suspicious logins, data exfiltration, permission changes)`)
  }

  if (layers.length >= 3) {
    return result('cis-v8-8.2', ctx, 'pass', 'high',
      `Audit logs collected across ${layers.length} layers:\n${layers.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
      sources, [])
  }
  if (layers.length >= 2) {
    return result('cis-v8-8.2', ctx, 'pass', 'medium',
      `Audit logs collected across ${layers.length} layers:\n${layers.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
      sources, [])
  }
  return result('cis-v8-8.2', ctx, 'partial', 'low',
    `Audit logs collected from: ${layers.join('; ')}. Additional logging layers recommended.`,
    sources, [],
    'Deploy additional logging: Datto RMM for endpoint logs, RocketCyber SOC for security event correlation, Domotz for network device monitoring.')
}

// --- 8.5 Collect Detailed Audit Logs ---
evaluators['cis-v8-8.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const edr = ctx.evidence.get('datto_edr_alerts')
  const saasAlerts = ctx.evidence.get('saas_alerts_monitoring' as EvidenceSourceType)
  const sources = ['microsoft_secure_score', 'datto_rmm_devices', 'datto_edr_alerts', 'saas_alerts_monitoring']
    .filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  if (sources.length === 0) return noEvidence('cis-v8-8.5', ['microsoft_secure_score', 'datto_rmm_devices', 'datto_edr_alerts'], ctx)

  const rocketcyberDeployed = ctx.deployedTools?.get('rocketcyber')?.deployed
  const detailLayers: string[] = []

  if (score) {
    const scoreData = score.rawData as { percentage?: number }
    detailLayers.push(`M365 UAL detailed logging (Secure Score ${scoreData.percentage ?? 0}% — includes command-line audit, mailbox audit, sign-in risk events)`)
  }
  if (rmm) {
    detailLayers.push('Datto RMM detailed endpoint telemetry (process execution, software changes, patch deployment results, Windows Event Log collection)')
  }
  if (edr || rocketcyberDeployed) {
    detailLayers.push('Datto EDR/RocketCyber detailed security logs (per-process execution, file hash tracking, network connection logs, threat intel correlation)')
  }
  if (saasAlerts) {
    detailLayers.push('SaaS Alerts detailed cloud telemetry (per-user activity, anomaly scoring, data movement tracking)')
  }

  if (detailLayers.length >= 3) {
    return result('cis-v8-8.5', ctx, 'pass', 'high',
      `Detailed audit logs collected across ${detailLayers.length} sources:\n${detailLayers.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
      sources, [])
  }
  if (detailLayers.length >= 2) {
    return result('cis-v8-8.5', ctx, 'pass', 'medium',
      `Detailed audit logs from: ${detailLayers.join('; ')}.`,
      sources, [])
  }
  return result('cis-v8-8.5', ctx, 'partial', 'low',
    `Detailed logging available from: ${detailLayers.join('; ')}. Additional detail sources recommended.`,
    sources, [],
    'Enable detailed audit logging in M365 (mailbox auditing, sign-in logs). Deploy Datto EDR for process-level telemetry.')
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

// --- Helper for 14.x training controls ---

/** Training controls check for Bullphish ID deployment attestation first, then fall back to needs_review */
function trainingEvaluator(controlId: string, description: string, ctx: EvaluationContext): EvaluationResult {
  // Check if Bullphish ID is toggled as deployed via attestation
  const attestation = toolAttestationPass(controlId, ctx)
  if (attestation) return attestation

  return {
    controlId,
    status: 'needs_review',
    confidence: 'none',
    reasoning: `${description}. This control requires security awareness training evidence (Bullphish ID or equivalent). If Bullphish ID is deployed, toggle it as "Deployed" on the Tool Capability Map to attest compliance.`,
    evidenceIds: [],
    missingEvidence: ['manual_upload'],
    remediation: 'Deploy Bullphish ID or equivalent training platform. Mark as deployed on the Tool Capability Map, or upload training completion evidence.',
  }
}

// --- New evaluators for expanded controls ---

// 1.2 Address Unauthorized Assets
// This control requires: active network discovery showing ALL devices (Domotz),
// compared against managed device inventory (RMM/Intune), to identify rogues.
// Having "10 managed devices" is NOT evidence — you need to show what's unmanaged.
evaluators['cis-v8-1.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const domotz = ctx.evidence.get('domotz_network_discovery' as EvidenceSourceType)
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const devices = ctx.evidence.get('microsoft_device_compliance')

  if (!domotz && !rmm && !devices) return noEvidence('cis-v8-1.2', ['domotz_network_discovery', 'datto_rmm_devices', 'microsoft_device_compliance'], ctx)

  const domotzData = domotz?.rawData as { totalDevices?: number; uniqueMacAddresses?: number; discoveryActive?: boolean } | undefined
  const rmmData = rmm?.rawData as { totalDevices?: number; matched?: boolean } | undefined
  const devData = devices?.rawData as { totalCount?: number } | undefined

  const networkDevices = domotzData?.totalDevices ?? 0
  const managedDevices = (rmmData?.matched ? (rmmData?.totalDevices ?? 0) : 0) + (devData?.totalCount ?? 0)
  const sources = ['domotz_network_discovery', 'datto_rmm_devices', 'microsoft_device_compliance'].filter(
    (s) => ctx.evidence.has(s as EvidenceSourceType)
  )

  if (domotz && domotzData?.discoveryActive && networkDevices > 0 && managedDevices > 0) {
    const unmanaged = Math.max(0, networkDevices - managedDevices)
    if (unmanaged <= 0) {
      return result('cis-v8-1.2', ctx, 'pass', 'high',
        `Domotz discovered ${networkDevices} devices on the network. ${managedDevices} are managed via RMM/Intune. All discovered devices are accounted for.`,
        sources, [])
    }
    return result('cis-v8-1.2', ctx, 'partial', 'medium',
      `Domotz discovered ${networkDevices} network devices but only ${managedDevices} are managed. Approximately ${unmanaged} unmanaged device(s) detected — these need to be addressed (quarantined, documented, or enrolled).`,
      sources, [],
      `Review the ${unmanaged} unmanaged devices found by Domotz. Apply zero-trust network policy or enroll them in management.`)
  }
  if (domotz && domotzData?.discoveryActive) {
    return result('cis-v8-1.2', ctx, 'needs_review', 'low',
      `Domotz active discovery is running (${networkDevices} devices found). RMM/Intune data needed to compare managed vs unmanaged.`,
      sources, ['datto_rmm_devices'])
  }
  // No Domotz — can't properly assess unauthorized assets
  return result('cis-v8-1.2', ctx, 'needs_review', 'low',
    `${managedDevices} managed devices found via RMM/Intune, but without active network discovery (Domotz), unauthorized devices cannot be identified. Managed device count alone does not address this control.`,
    sources, ['domotz_network_discovery'],
    'Deploy Domotz or equivalent network scanner to discover ALL devices on the network. Compare against managed inventory to identify unauthorized assets.')
}

// 1.3 Active Discovery Tool
// This MUST use Domotz or equivalent network scanner. RMM is NOT active discovery.
evaluators['cis-v8-1.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const domotz = ctx.evidence.get('domotz_network_discovery' as EvidenceSourceType)
  if (!domotz) return noEvidence('cis-v8-1.3', ['domotz_network_discovery'], ctx)

  const data = domotz.rawData as {
    totalDevices?: number; uniqueMacAddresses?: number; uniqueIpAddresses?: number
    discoveryActive?: boolean; agentCount?: number
    agents?: Array<{ name: string; status: string; deviceCount: number }>
  }

  if (data.discoveryActive && (data.totalDevices ?? 0) > 0) {
    const agentInfo = (data.agents ?? []).map((a) => `${a.name} (${a.status}, ${a.deviceCount} devices)`).join(', ')
    return result('cis-v8-1.3', ctx, 'pass', 'high',
      `Domotz active network discovery is running. ${data.agentCount ?? 0} collector(s) scanning the network: ${agentInfo || 'active'}. ${data.totalDevices} devices discovered, ${data.uniqueMacAddresses ?? 0} unique MAC addresses, ${data.uniqueIpAddresses ?? 0} unique IPs.`,
      ['domotz_network_discovery'], [])
  }
  if (data.agentCount && data.agentCount > 0) {
    return result('cis-v8-1.3', ctx, 'partial', 'medium',
      `Domotz is configured with ${data.agentCount} collector(s) but discovery may not be actively running. Verify collectors are online and scanning.`,
      ['domotz_network_discovery'], [],
      'Check Domotz dashboard — ensure all collectors are online and auto-discovery is enabled.')
  }
  return result('cis-v8-1.3', ctx, 'needs_review', 'low',
    'Domotz evidence was collected but no active discovery data found. Verify the Domotz configuration.',
    ['domotz_network_discovery'], [])
}

// 1.4 DHCP Logging — Domotz can show DHCP-assigned devices
evaluators['cis-v8-1.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const domotz = ctx.evidence.get('domotz_network_discovery' as EvidenceSourceType)
  if (domotz) {
    const data = domotz.rawData as { totalDevices?: number; discoveryActive?: boolean }
    if (data.discoveryActive) {
      return result('cis-v8-1.4', ctx, 'pass', 'medium',
        `Domotz monitors network device connections including DHCP-assigned devices. ${data.totalDevices ?? 0} devices tracked with IP/MAC correlation.`,
        ['domotz_network_discovery'], [])
    }
  }
  return { controlId: 'cis-v8-1.4', status: 'needs_review', confidence: 'none',
    reasoning: 'DHCP logging requires verification of router/DHCP server configuration. Domotz provides device tracking but DHCP server logging should be confirmed separately.',
    evidenceIds: [], missingEvidence: ['domotz_network_discovery'], remediation: 'Enable DHCP logging on the network gateway/DHCP server. Verify Domotz is tracking all DHCP leases.' }
}

// 1.5 Passive Discovery — Domotz does this, NOT RMM
evaluators['cis-v8-1.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const domotz = ctx.evidence.get('domotz_network_discovery' as EvidenceSourceType)
  if (!domotz) return noEvidence('cis-v8-1.5', ['domotz_network_discovery'], ctx)

  const data = domotz.rawData as { totalDevices?: number; discoveryActive?: boolean; uniqueMacAddresses?: number }
  if (data.discoveryActive) {
    return result('cis-v8-1.5', ctx, 'pass', 'high',
      `Domotz passive discovery is active, monitoring the network for new devices. ${data.uniqueMacAddresses ?? 0} unique MAC addresses tracked.`,
      ['domotz_network_discovery'], [])
  }
  return result('cis-v8-1.5', ctx, 'partial', 'medium',
    'Domotz is configured but passive discovery status could not be confirmed.',
    ['domotz_network_discovery'], [])
}

// 2.1 Software Inventory — RMM provides software audit data
evaluators['cis-v8-2.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  if (!rmm) return noEvidence('cis-v8-2.1', ['datto_rmm_devices'], ctx)

  const rmmData = rmm.rawData as { totalDevices?: number; matched?: boolean }
  if (rmmData.matched && (rmmData.totalDevices ?? 0) > 0) {
    return result('cis-v8-2.1', ctx, 'pass', 'medium',
      `Datto RMM maintains software inventory via audit scans across ${rmmData.totalDevices} managed devices. Software lists are collected per device during each audit cycle.`,
      ['datto_rmm_devices'], [])
  }
  return result('cis-v8-2.1', ctx, 'needs_review', 'low',
    'RMM data exists but no matched devices found for this customer. Software inventory cannot be confirmed.',
    ['datto_rmm_devices'], [])
}

// 2.2 Authorized Software Supported — check via RMM audit + patch data
evaluators['cis-v8-2.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  if (!rmm) return noEvidence('cis-v8-2.2', ['datto_rmm_devices'], ctx)

  const rmmData = rmm.rawData as { totalDevices?: number; patchRate?: number; matched?: boolean }
  if (rmmData.matched && (rmmData.totalDevices ?? 0) > 0) {
    const patchRate = rmmData.patchRate ?? 0
    return result('cis-v8-2.2', ctx, patchRate >= 80 ? 'pass' : 'partial', 'medium',
      `RMM monitors ${rmmData.totalDevices} devices. Patch compliance rate: ${patchRate}%. Unsupported software would show as unpatchable in the RMM dashboard.`,
      ['datto_rmm_devices'], [],
      patchRate < 80 ? 'Review RMM for devices running unsupported OS or software versions.' : null)
  }
  return noEvidence('cis-v8-2.2', ['datto_rmm_devices'], ctx)
}

// 2.3 Address Unauthorized Software — Intune compliance + RMM
evaluators['cis-v8-2.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const policies = ctx.evidence.get('microsoft_intune_config')
  const rmm = ctx.evidence.get('datto_rmm_devices')
  if (!devices && !rmm && !policies) return noEvidence('cis-v8-2.3', ['microsoft_device_compliance', 'microsoft_intune_config', 'datto_rmm_devices'], ctx)

  const devData = devices?.rawData as { complianceRate?: number; totalCount?: number; noncompliantCount?: number; devices?: Array<{ deviceName?: string; complianceState?: string }> } | undefined
  const policyData = policies?.rawData as { compliancePolicyCount?: number; policyNames?: string[]; configProfileCount?: number; profileNames?: string[] } | undefined
  const rate = devData?.complianceRate ?? 0
  const total = devData?.totalCount ?? 0
  const noncompliant = devData?.noncompliantCount ?? 0
  const sources = ['microsoft_device_compliance', 'microsoft_intune_config', 'datto_rmm_devices'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  const policyCount = policyData?.compliancePolicyCount ?? 0
  const policyNames = policyData?.policyNames ?? []

  if (policyCount > 0 && total > 0 && rate >= 90) {
    const noncompliantDevices = (devData?.devices ?? []).filter((d) => d.complianceState === 'noncompliant').map((d) => d.deviceName).slice(0, 5)
    return result('cis-v8-2.3', ctx, 'pass', 'high',
      `${policyCount} Intune compliance policies enforced: ${policyNames.join(', ')}. ${rate}% compliance across ${total} devices.${noncompliant > 0 ? ` ${noncompliant} noncompliant device(s): ${noncompliantDevices.join(', ')}.` : ' All devices compliant.'}`,
      sources, [])
  }
  if (policyCount > 0 && total > 0) {
    return result('cis-v8-2.3', ctx, 'partial', 'medium',
      `${policyCount} compliance policies exist (${policyNames.join(', ')}) but only ${rate}% of ${total} devices are compliant. ${noncompliant} device(s) noncompliant.`,
      sources, [],
      `Review the ${noncompliant} noncompliant devices in Intune and remediate or document exceptions.`)
  }
  if (policyCount === 0 && total > 0) {
    return result('cis-v8-2.3', ctx, 'fail', 'medium',
      `${total} Intune-managed devices found but no compliance policies are configured. Without policies, unauthorized software cannot be automatically detected or blocked.`,
      sources, [],
      'Create Intune compliance policies that define allowed software baselines. Non-compliant devices should be blocked from corporate resources.')
  }
  return result('cis-v8-2.3', ctx, 'needs_review', 'low',
    'RMM provides software audit data but Intune compliance policies are needed to enforce authorized software. Formal unauthorized software remediation process should be documented.',
    sources, [], 'Configure Intune compliance policies and document the software authorization process.')
}

// 3.1 Data Management Process — IT Glue documentation
evaluators['cis-v8-3.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  if (!itg) return noEvidence('cis-v8-3.1', ['it_glue_documentation'], ctx)

  const data = itg.rawData as { hasDocumentedPolicies?: boolean; flexibleAssetTypeCount?: number }
  if (data.hasDocumentedPolicies) {
    return result('cis-v8-3.1', ctx, 'pass', 'medium',
      `IT Glue contains documented policies (${data.flexibleAssetTypeCount ?? 0} flexible asset types configured). Data management process documentation found.`,
      ['it_glue_documentation'], [])
  }
  return result('cis-v8-3.1', ctx, 'needs_review', 'low',
    `IT Glue is configured with ${data.flexibleAssetTypeCount ?? 0} flexible asset types but no policy-type documentation was detected. Verify data management process is documented.`,
    ['it_glue_documentation'], [],
    'Create a data management process document in IT Glue covering data sensitivity, owners, retention, and disposal.')
}

// 3.2 Data Inventory — IT Glue configurations
evaluators['cis-v8-3.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  if (!itg) return noEvidence('cis-v8-3.2', ['it_glue_documentation'], ctx)

  const data = itg.rawData as { configurationCount?: number; organizationCount?: number }
  if ((data.configurationCount ?? 0) > 0) {
    return result('cis-v8-3.2', ctx, 'pass', 'low',
      `IT Glue contains ${data.configurationCount} configuration items for this organization. These serve as a data/asset inventory.`,
      ['it_glue_documentation'], [])
  }
  return result('cis-v8-3.2', ctx, 'needs_review', 'low',
    'IT Glue is configured but no configuration items found for this customer. Create a data inventory.',
    ['it_glue_documentation'], [],
    'Document sensitive data locations and classifications as IT Glue configurations or flexible assets.')
}

// 3.4 Enforce Data Retention — check SaaS backup + IT Glue policy
evaluators['cis-v8-3.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  const saas = ctx.evidence.get('datto_saas_backup')
  const sources = ['it_glue_documentation', 'datto_saas_backup'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  if (itg && (itg.rawData as { hasDocumentedPolicies?: boolean }).hasDocumentedPolicies) {
    return result('cis-v8-3.4', ctx, 'pass', 'low',
      'IT Glue contains policy documentation. Data retention policies should be defined within.' + (saas ? ' Datto SaaS Protect provides backup retention for cloud data.' : ''),
      sources, [])
  }
  if (saas) {
    return result('cis-v8-3.4', ctx, 'partial', 'low',
      'Datto SaaS Protect provides backup retention for M365 data, but a formal data retention policy should be documented.',
      sources, ['it_glue_documentation'],
      'Document a data retention policy in IT Glue specifying min/max retention timelines.')
  }
  return noEvidence('cis-v8-3.4', ['it_glue_documentation', 'datto_saas_backup'], ctx)
}

// 3.5 Securely Dispose of Data — IT Glue documentation
evaluators['cis-v8-3.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  if (!itg) return noEvidence('cis-v8-3.5', ['it_glue_documentation'], ctx)

  const data = itg.rawData as { hasDocumentedProcedures?: boolean }
  if (data.hasDocumentedProcedures) {
    return result('cis-v8-3.5', ctx, 'pass', 'low',
      'IT Glue contains documented procedures. Data disposal process should be included.',
      ['it_glue_documentation'], [])
  }
  return result('cis-v8-3.5', ctx, 'needs_review', 'none',
    'No documented data disposal procedures found in IT Glue.',
    ['it_glue_documentation'], [],
    'Create a data disposal SOP in IT Glue covering secure deletion, drive wiping, and certificate of destruction processes.')
}

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

// 4.2 Secure Config for Network Infrastructure — Domotz + IT Glue
evaluators['cis-v8-4.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const domotz = ctx.evidence.get('domotz_network_discovery' as EvidenceSourceType)
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  const sources = ['domotz_network_discovery', 'it_glue_documentation'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  if (domotz && itg) {
    const dData = domotz.rawData as { agentCount?: number; discoveryActive?: boolean }
    const iData = itg.rawData as { hasDocumentedProcedures?: boolean }
    if (dData.discoveryActive && iData.hasDocumentedProcedures) {
      return result('cis-v8-4.2', ctx, 'pass', 'medium',
        `Domotz monitors ${dData.agentCount ?? 0} network collector(s). IT Glue contains documented procedures for network configuration management.`,
        sources, [])
    }
  }
  if (domotz) {
    return result('cis-v8-4.2', ctx, 'partial', 'low',
      'Domotz monitors network infrastructure but secure configuration procedures should be documented in IT Glue.',
      sources, ['it_glue_documentation'],
      'Document network infrastructure secure configuration standards in IT Glue.')
  }
  return noEvidence('cis-v8-4.2', ['domotz_network_discovery', 'it_glue_documentation'], ctx)
}

// 4.3 Automatic Session Locking — Intune device compliance
evaluators['cis-v8-4.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const policies = ctx.evidence.get('microsoft_intune_config')
  if (!devices && !policies) return noEvidence('cis-v8-4.3', ['microsoft_device_compliance', 'microsoft_intune_config'], ctx)

  const devData = devices?.rawData as { complianceRate?: number; totalCount?: number } | undefined
  const policyData = policies?.rawData as { configProfileCount?: number; profileNames?: string[]; compliancePolicyCount?: number; policyNames?: string[] } | undefined
  const sources = ['microsoft_device_compliance', 'microsoft_intune_config'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  const rate = devData?.complianceRate ?? 0
  const profileCount = policyData?.configProfileCount ?? 0
  const profileNames = policyData?.profileNames ?? []
  const policyCount = policyData?.compliancePolicyCount ?? 0
  const policyNames = policyData?.policyNames ?? []

  if (profileCount > 0 && rate >= 90) {
    return result('cis-v8-4.3', ctx, 'pass', 'high',
      `${profileCount} Intune configuration profiles deployed: ${profileNames.join(', ')}. ${policyCount} compliance policies: ${policyNames.join(', ')}. ${rate}% compliance across ${devData?.totalCount ?? 0} devices. Session locking should be configured within these policies.`,
      sources, [])
  }
  if (profileCount > 0) {
    return result('cis-v8-4.3', ctx, 'partial', 'medium',
      `${profileCount} configuration profiles exist (${profileNames.join(', ')}) but compliance rate is ${rate}%. Verify session lock timeout is specifically configured (15min desktop, 2min mobile).`,
      sources, [],
      'Review Intune configuration profiles to ensure screen lock timeout is set to 15min or less for desktops and 2min for mobile.')
  }
  return result('cis-v8-4.3', ctx, 'needs_review', 'low',
    'Device compliance data exists but session locking policy cannot be specifically confirmed. Verify in Intune.',
    sources, [],
    'Create an Intune compliance policy requiring screen lock (15min max for desktops, 2min for mobile).')
}

// 4.4 Firewall on Servers — N/A if no on-prem servers
evaluators['cis-v8-4.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const envNA = envNotApplicable('cis-v8-4.4', ctx)
  if (envNA) return envNA

  const defender = ctx.evidence.get('microsoft_defender')
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const edr = ctx.evidence.get('datto_edr_alerts')
  if (!defender && !devices && !edr) return noEvidence('cis-v8-4.4', ['microsoft_defender', 'microsoft_device_compliance', 'datto_edr_alerts'], ctx)

  // Defender manages Windows Firewall. If Defender is deployed, firewalls are typically enabled.
  const defData = defender?.rawData as { protectedDevices?: number; totalDevices?: number } | undefined
  const total = defData?.totalDevices ?? 0

  if (total > 0) {
    return result('cis-v8-4.4', ctx, 'pass', 'medium',
      `${total} devices managed by Defender for Endpoint. Windows Firewall is enabled by default with Defender. EDR provides additional monitoring via RocketCyber.`,
      ['microsoft_defender', 'datto_edr_alerts'].filter((s) => ctx.evidence.has(s as EvidenceSourceType)), [])
  }
  if (edr) {
    return result('cis-v8-4.4', ctx, 'pass', 'low',
      'Datto EDR is active with Windows Defender, which includes Windows Firewall management. RocketCyber provides additional firewall log monitoring.',
      ['datto_edr_alerts'], [])
  }
  return result('cis-v8-4.4', ctx, 'needs_review', 'low',
    'Device compliance data available but cannot confirm firewall status specifically. Verify Windows Firewall is enabled via Intune compliance policy.',
    ['microsoft_device_compliance'].filter((s) => ctx.evidence.has(s as EvidenceSourceType)), ['microsoft_defender'],
    'Verify Windows Firewall is enabled across all servers via Intune or Group Policy.')
}

// 4.5 Firewall on End-User Devices
evaluators['cis-v8-4.5'] = (ctx: EvaluationContext): EvaluationResult => {
  const defender = ctx.evidence.get('microsoft_defender')
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const edr = ctx.evidence.get('datto_edr_alerts')
  if (!defender && !devices && !edr) return noEvidence('cis-v8-4.5', ['microsoft_defender', 'microsoft_device_compliance', 'datto_edr_alerts'], ctx)

  const defData = defender?.rawData as { protectedDevices?: number; totalDevices?: number } | undefined
  const total = defData?.totalDevices ?? 0

  if (total > 0) {
    return result('cis-v8-4.5', ctx, 'pass', 'medium',
      `${total} end-user devices managed by Defender for Endpoint. Windows Firewall enabled by default. Datto EDR provides additional endpoint protection.`,
      ['microsoft_defender', 'datto_edr_alerts'].filter((s) => ctx.evidence.has(s as EvidenceSourceType)), [])
  }
  if (edr) {
    return result('cis-v8-4.5', ctx, 'pass', 'low',
      'Datto EDR is active with Windows Defender on end-user devices, which includes Windows Firewall. RocketCyber provides additional monitoring.',
      ['datto_edr_alerts'], [])
  }
  return result('cis-v8-4.5', ctx, 'needs_review', 'low',
    'Device compliance data available but cannot confirm firewall status specifically. Verify Windows Firewall is enabled via Intune policy.',
    ['microsoft_device_compliance'].filter((s) => ctx.evidence.has(s as EvidenceSourceType)), ['microsoft_defender'],
    'Verify Windows Firewall is enabled across all end-user devices via Intune or Group Policy.')
}

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

// 6.4 MFA for Remote Network Access — N/A for cloud-only environments
evaluators['cis-v8-6.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const envNA = envNotApplicable('cis-v8-6.4', ctx)
  if (envNA) return envNA

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

// 7.1 Vulnerability Management Process — RMM patching + Secure Score
evaluators['cis-v8-7.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const score = ctx.evidence.get('microsoft_secure_score')
  const sources = ['datto_rmm_devices', 'microsoft_secure_score', 'it_glue_documentation'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (sources.length === 0) return noEvidence('cis-v8-7.1', ['datto_rmm_devices', 'microsoft_secure_score'], ctx)

  const rmmData = rmm?.rawData as { patchRate?: number; totalDevices?: number; patchedDevices?: number; unpatchedDevices?: number } | undefined
  const scoreData = score?.rawData as { percentage?: number } | undefined
  const patchRate = rmmData?.patchRate ?? 0
  const scorePct = scoreData?.percentage ?? 0
  const total = rmmData?.totalDevices ?? 0
  const patched = rmmData?.patchedDevices ?? 0
  const unpatched = rmmData?.unpatchedDevices ?? 0

  if (patchRate >= 80 && scorePct >= 50) {
    return result('cis-v8-7.1', ctx, 'pass', 'medium',
      `Vulnerability management active: ${patched}/${total} devices fully patched (${patchRate}%), Secure Score ${scorePct}%. Datto RMM provides automated patch management for OS and third-party applications with policy-based deployment and scheduling.`,
      sources, [])
  }
  if (patchRate > 0 || scorePct > 0) {
    return result('cis-v8-7.1', ctx, 'partial', 'low',
      `${patched}/${total} devices patched (${patchRate}%), Secure Score: ${scorePct}%. ${unpatched > 0 ? `${unpatched} device(s) have pending patches.` : ''} Automated patch management is configured but compliance rate needs improvement.`,
      sources, [], 'Review and approve pending patches in Datto RMM. Address devices with outstanding patches.')
  }
  return result('cis-v8-7.1', ctx, 'needs_review', 'low', 'Vulnerability management evidence is limited.', sources, [])
}

// 7.2 Remediation Process — Autotask tickets + RMM patches
evaluators['cis-v8-7.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const sources = ['datto_rmm_devices', 'autotask_tickets'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (sources.length === 0) return noEvidence('cis-v8-7.2', ['datto_rmm_devices', 'autotask_tickets'], ctx)

  const rmmData = rmm?.rawData as { patchRate?: number; totalDevices?: number; unpatchedDevices?: number; unpatchedDeviceList?: Array<{ hostname: string; pending: number }> } | undefined
  const rate = rmmData?.patchRate ?? 0
  const unpatched = rmmData?.unpatchedDevices ?? 0
  const unpatchedList = (rmmData?.unpatchedDeviceList ?? []).slice(0, 5)
  const deviceDetail = unpatchedList.length > 0
    ? ` Devices with pending patches: ${unpatchedList.map((d) => `${d.hostname} (${d.pending} pending)`).join(', ')}.`
    : ''

  return result('cis-v8-7.2', ctx, rate >= 80 ? 'pass' : 'partial', 'low',
    `Remediation via Datto RMM automated patching (${rate}% compliance) and Autotask ticketing.${unpatched > 0 ? ` ${unpatched} device(s) have pending patches requiring remediation.${deviceDetail}` : ' All devices fully patched.'}`,
    sources, [], rate < 80 ? 'Review pending patches in RMM and create Autotask tickets for devices requiring manual remediation.' : null)
}

// 7.3 OS Patch Management — Datto RMM manages Windows Update
evaluators['cis-v8-7.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  if (!rmm) return noEvidence('cis-v8-7.3', ['datto_rmm_devices', 'microsoft_device_compliance'], ctx)

  const rmmData = rmm.rawData as { patchRate?: number; totalDevices?: number; patchedDevices?: number; unpatchedDevices?: number; unpatchedDeviceList?: Array<{ hostname: string; os: string; pending: number }> }
  const rate = rmmData.patchRate ?? 0
  const total = rmmData.totalDevices ?? 0
  const patched = rmmData.patchedDevices ?? 0
  const unpatched = rmmData.unpatchedDevices ?? 0
  const unpatchedList = (rmmData.unpatchedDeviceList ?? []).slice(0, 5)

  // RMM manages both OS and 3rd party patches — rate is combined
  if (rate >= 90) {
    return result('cis-v8-7.3', ctx, 'pass', 'medium',
      `${patched}/${total} devices fully patched (${rate}%). Datto RMM manages OS updates (Windows Update) with automated, policy-based deployment and scheduling.`,
      ['datto_rmm_devices'], [])
  }
  if (rate >= 70) {
    return result('cis-v8-7.3', ctx, 'partial', 'medium',
      `${patched}/${total} devices patched (${rate}%). ${unpatched} device(s) have pending updates.${unpatchedList.length > 0 ? ` Unpatched: ${unpatchedList.map((d) => `${d.hostname} (${d.os}, ${d.pending} pending)`).join(', ')}.` : ''}`,
      ['datto_rmm_devices'], [],
      'Approve pending OS patches in Datto RMM and investigate devices with stale patch status.')
  }
  return result('cis-v8-7.3', ctx, 'fail', 'medium',
    `${patched}/${total} devices patched (${rate}%). ${unpatched} device(s) have pending updates.${unpatchedList.length > 0 ? ` Unpatched: ${unpatchedList.map((d) => `${d.hostname} (${d.pending} pending)`).join(', ')}.` : ''}`,
    ['datto_rmm_devices'], [],
    'Review and approve all pending patches in Datto RMM. Ensure automated patch policies run at least monthly.')
}

// 7.4 Automated Application Patch Management — RMM handles third-party patching
evaluators['cis-v8-7.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  if (!rmm) return noEvidence('cis-v8-7.4', ['datto_rmm_devices'], ctx)

  const rmmData = rmm.rawData as { patchRate?: number; totalDevices?: number; patchedDevices?: number; unpatchedDevices?: number; matched?: boolean }
  if (!rmmData.matched || (rmmData.totalDevices ?? 0) === 0) return noEvidence('cis-v8-7.4', ['datto_rmm_devices'], ctx)

  const rate = rmmData.patchRate ?? 0
  const total = rmmData.totalDevices ?? 0
  const patched = rmmData.patchedDevices ?? 0
  const unpatched = rmmData.unpatchedDevices ?? 0

  // RMM manages both OS and 3rd party — rate is combined. Note this in the evidence.
  return result('cis-v8-7.4', ctx, rate >= 80 ? 'pass' : 'partial', 'medium',
    `Datto RMM manages third-party application patching across ${total} devices. ${patched}/${total} fully patched (${rate}%).${unpatched > 0 ? ` ${unpatched} device(s) have pending application updates.` : ''} RMM deploys third-party patches via automated patch policies alongside OS updates.`,
    ['datto_rmm_devices'], [],
    rate < 80 ? 'Review and approve pending third-party application patches in Datto RMM.' : null)
}

// 8.1 Audit Log Management Process — multi-layer logging architecture
evaluators['cis-v8-8.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const edr = ctx.evidence.get('datto_edr_alerts')
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  const saasAlerts = ctx.evidence.get('saas_alerts_monitoring' as EvidenceSourceType)
  const sources = ['microsoft_secure_score', 'datto_rmm_devices', 'datto_edr_alerts', 'it_glue_documentation', 'saas_alerts_monitoring']
    .filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (sources.length === 0) return noEvidence('cis-v8-8.1', ['microsoft_secure_score', 'it_glue_documentation', 'datto_rmm_devices'], ctx)

  const scoreData = score?.rawData as { percentage?: number } | undefined
  const itgData = itg?.rawData as { hasDocumentedProcedures?: boolean } | undefined
  const rocketcyberDeployed = ctx.deployedTools?.get('rocketcyber')?.deployed

  // Count active logging layers as evidence of a managed process
  const activeLayers: string[] = []
  if (score) activeLayers.push('M365 Unified Audit Log')
  if (rmm) activeLayers.push('Datto RMM endpoint logging')
  if (edr || rocketcyberDeployed) activeLayers.push('Datto EDR/RocketCyber SOC event correlation')
  if (saasAlerts) activeLayers.push('SaaS Alerts cloud monitoring')

  const hasProcess = activeLayers.length >= 2 // Multiple managed tools = an operational log management process
  const hasDocumentation = itgData?.hasDocumentedProcedures

  if (hasProcess && hasDocumentation) {
    return result('cis-v8-8.1', ctx, 'pass', 'high',
      `Audit log management process established with ${activeLayers.length} active logging layers (${activeLayers.join(', ')}). IT Glue contains documented procedures. Secure Score: ${scoreData?.percentage ?? 'N/A'}%.`,
      sources, [])
  }
  if (hasProcess) {
    return result('cis-v8-8.1', ctx, 'pass', 'medium',
      `Audit log management process operational across ${activeLayers.length} layers: ${activeLayers.join(', ')}. Secure Score: ${scoreData?.percentage ?? 'N/A'}%. Formal documentation in IT Glue would strengthen this control.`,
      sources, ['it_glue_documentation'],
      'Document the audit log management process in IT Glue — cover which tools collect logs, review frequency, and retention policies.')
  }
  if (activeLayers.length === 1) {
    return result('cis-v8-8.1', ctx, 'partial', 'low',
      `Audit logging active via ${activeLayers[0]}. Additional logging layers and formal process documentation recommended.`,
      sources, ['it_glue_documentation'],
      'Expand logging coverage with Datto RMM (endpoints), RocketCyber (security events), and document the process in IT Glue.')
  }
  return result('cis-v8-8.1', ctx, 'needs_review', 'low', 'Audit log management process needs documentation and additional tool coverage.', sources, [])
}

// 8.3 Adequate Audit Log Storage — multi-layer retention
evaluators['cis-v8-8.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const score = ctx.evidence.get('microsoft_secure_score')
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const edr = ctx.evidence.get('datto_edr_alerts')
  const sources = ['microsoft_secure_score', 'datto_rmm_devices', 'datto_edr_alerts']
    .filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  if (sources.length === 0) return noEvidence('cis-v8-8.3', ['microsoft_secure_score', 'datto_rmm_devices'], ctx)

  const rocketcyberDeployed = ctx.deployedTools?.get('rocketcyber')?.deployed
  const storageDetails: string[] = []

  if (score) {
    const scoreData = score.rawData as { percentage?: number }
    storageDetails.push(`M365: 90-day retention (standard) or 1 year (E5/compliance add-on). Secure Score: ${scoreData.percentage ?? 0}%`)
  }
  if (rmm) storageDetails.push('Datto RMM: endpoint audit data retained in RMM cloud platform (patch history, software changes, component logs)')
  if (edr || rocketcyberDeployed) storageDetails.push('RocketCyber SOC: security event logs retained with full incident history and forensic timeline')

  return result('cis-v8-8.3', ctx, 'pass', storageDetails.length >= 2 ? 'high' : 'medium',
    `Audit log storage across ${storageDetails.length} platform(s):\n${storageDetails.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    sources, [])
}

// 9.1 Supported Browsers/Email Clients — RMM software audit can show browser versions
evaluators['cis-v8-9.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const rmm = ctx.evidence.get('datto_rmm_devices')
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const sources = ['datto_rmm_devices', 'microsoft_device_compliance'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (sources.length === 0) return noEvidence('cis-v8-9.1', ['datto_rmm_devices'], ctx)

  const rmmData = rmm?.rawData as { totalDevices?: number; matched?: boolean } | undefined
  const devData = devices?.rawData as { complianceRate?: number } | undefined

  if (rmmData?.matched && (rmmData.totalDevices ?? 0) > 0) {
    return result('cis-v8-9.1', ctx, 'partial', 'low',
      `RMM manages ${rmmData.totalDevices} devices with software audit capability. Browser versions can be verified via RMM software inventory. Intune compliance rate: ${devData?.complianceRate ?? 'N/A'}%.`,
      sources, [],
      'Review RMM software audit reports for unsupported browser or email client versions. Consider Intune compliance policy requiring minimum browser version.')
  }
  return result('cis-v8-9.1', ctx, 'needs_review', 'low',
    'Device data available but specific browser/email client version verification requires RMM software audit review.',
    sources, [])
}

// 10.3 Disable Autorun/Autoplay — Intune device config profiles + compliance rate
evaluators['cis-v8-10.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const devices = ctx.evidence.get('microsoft_device_compliance')
  const score = ctx.evidence.get('microsoft_secure_score')
  const intuneConfig = ctx.evidence.get('microsoft_intune_config')
  if (!devices && !score && !intuneConfig) return noEvidence('cis-v8-10.3', ['microsoft_device_compliance', 'microsoft_secure_score', 'microsoft_intune_config'], ctx)

  const devData = devices?.rawData as { complianceRate?: number; totalCount?: number } | undefined
  const scoreData = score?.rawData as { percentage?: number } | undefined
  const configData = intuneConfig?.rawData as {
    configProfiles?: Array<{ name: string; description: string | null }>
    configProfileCount?: number
    profileNames?: string[]
  } | undefined

  const sources = (['microsoft_device_compliance', 'microsoft_secure_score', 'microsoft_intune_config'] as const)
    .filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  // Check for autorun-specific configuration profiles
  const autorunKeywords = ['autorun', 'autoplay', 'removable media', 'removable storage', 'usb']
  const matchingProfiles: string[] = []
  if (configData?.configProfiles) {
    for (const profile of configData.configProfiles) {
      const nameAndDesc = `${profile.name} ${profile.description ?? ''}`.toLowerCase()
      if (autorunKeywords.some((kw) => nameAndDesc.includes(kw))) {
        matchingProfiles.push(profile.name)
      }
    }
  }

  if (matchingProfiles.length > 0) {
    // Found explicit autorun/removable media config profiles — high confidence
    return result('cis-v8-10.3', ctx, 'pass', 'high',
      `Intune configuration profile(s) specifically addressing autorun/removable media: ${matchingProfiles.join(', ')}. ${devData?.totalCount ? `${devData.totalCount} managed devices.` : ''} Compliance rate: ${devData?.complianceRate ?? 'N/A'}%.`,
      sources, [])
  }

  if ((devData?.complianceRate ?? 0) >= 90) {
    return result('cis-v8-10.3', ctx, 'pass', 'medium',
      `${devData?.complianceRate}% device compliance across ${devData?.totalCount ?? 0} Intune-managed devices. ${configData?.configProfileCount ? `${configData.configProfileCount} configuration profiles deployed` : 'No configuration profiles found'} (none specifically named for autorun — Windows 10/11 disables autorun by default). Secure Score: ${scoreData?.percentage ?? 'N/A'}%.`,
      sources, [], 'Consider creating an explicit Intune configuration profile named "Disable Autorun" for audit clarity.')
  }
  if ((scoreData?.percentage ?? 0) >= 60) {
    return result('cis-v8-10.3', ctx, 'pass', 'low',
      `Secure Score ${scoreData?.percentage}% suggests baseline policies are in place. Windows 10/11 disables autorun by default. ${configData?.configProfileCount ? `${configData.configProfileCount} Intune profiles deployed.` : ''} Verify via Intune configuration profile.`,
      sources, [], 'Create an explicit Intune configuration profile for autorun/autoplay to improve audit evidence.')
  }
  return result('cis-v8-10.3', ctx, 'needs_review', 'low',
    `No Intune configuration profile specifically targeting autorun/autoplay found. ${configData?.configProfileCount ? `${configData.configProfileCount} profiles exist but none match autorun keywords.` : 'No Intune configuration profiles detected.'} Windows 10/11 disables autorun by default, but explicit policy is recommended.`,
    sources, [], 'Create an Intune configuration profile to explicitly disable autorun and autoplay for removable media.')
}

// 11.3 Protect Recovery Data — encryption of backup data
evaluators['cis-v8-11.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const bcdr = ctx.evidence.get('datto_bcdr_backup')
  const saas = ctx.evidence.get('datto_saas_backup')
  const epBackup = getEndpointBackupDevices(ctx)
  const bcdrNotUsed = ctx.environment?.onPremServers === 'no_servers'
    || ctx.environment?.scope?.backup === 'm365_only'

  if (!bcdr && !saas && epBackup.count === 0) return noEvidence('cis-v8-11.3', ['datto_bcdr_backup', 'datto_saas_backup', 'datto_rmm_devices'], ctx)

  const layers: string[] = []
  const sources: string[] = []

  const bcdrData = bcdr?.rawData as { matched?: boolean; totalDevices?: number; applianceCount?: number } | undefined
  if (bcdrData?.matched) {
    layers.push(`Datto BCDR: AES-256 encryption at rest, TLS in transit. ${bcdrData.applianceCount ?? 0} appliance(s) with encrypted offsite cloud replication.`)
    sources.push('datto_bcdr_backup')
  }
  if (epBackup.count > 0) {
    layers.push(`Datto Endpoint Backup: ${epBackup.count} device(s) (${epBackup.hostnames.join(', ')}) encrypted at rest and in transit to Datto cloud.`)
    sources.push('datto_rmm_devices')
  }
  const saasData = saas?.rawData as { matched?: boolean; totalSeats?: number } | undefined
  if (saasData?.matched && (saasData?.totalSeats ?? 0) > 0) {
    layers.push(`Datto SaaS Protect: M365 backup data encrypted at rest and in transit. ${saasData.totalSeats} seat(s) protected in Datto's secure cloud.`)
    sources.push('datto_saas_backup')
  }

  if (layers.length > 0) {
    return result('cis-v8-11.3', ctx, 'pass', 'high',
      `Recovery data protected:\n${layers.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
      sources, [])
  }
  if (bcdrNotUsed) {
    return result('cis-v8-11.3', ctx, 'needs_review', 'low',
      'No on-prem servers — BCDR not applicable. Verify SaaS Protect encryption settings.',
      [], [])
  }
  return result('cis-v8-11.3', ctx, 'needs_review', 'low',
    'Backup evidence exists but no matched devices. Verify backup encryption settings.',
    sources, [])
}

// 11.4 Isolated Recovery Data — offsite/air-gapped backup copy
evaluators['cis-v8-11.4'] = (ctx: EvaluationContext): EvaluationResult => {
  const bcdr = ctx.evidence.get('datto_bcdr_backup')
  const saas = ctx.evidence.get('datto_saas_backup')
  const epBackup = getEndpointBackupDevices(ctx)
  const bcdrNotUsed = ctx.environment?.onPremServers === 'no_servers'
    || ctx.environment?.scope?.backup === 'm365_only'

  if (!bcdr && !saas && epBackup.count === 0) return noEvidence('cis-v8-11.4', ['datto_bcdr_backup', 'datto_saas_backup', 'datto_rmm_devices'], ctx)

  const layers: string[] = []
  const sources: string[] = []

  const bcdrData = bcdr?.rawData as { matched?: boolean; applianceCount?: number } | undefined
  if (bcdrData?.matched) {
    layers.push(`Datto BCDR: Offsite cloud replication to Datto's geographically separate infrastructure with instant virtualization capability.`)
    sources.push('datto_bcdr_backup')
  }
  if (epBackup.count > 0) {
    layers.push(`Datto Endpoint Backup: ${epBackup.count} device(s) (${epBackup.hostnames.join(', ')}) replicated to Datto cloud, isolated from production environment.`)
    sources.push('datto_rmm_devices')
  }
  const saasData = saas?.rawData as { matched?: boolean; totalSeats?: number } | undefined
  if (saasData?.matched && (saasData?.totalSeats ?? 0) > 0) {
    layers.push(`Datto SaaS Protect: M365 data backed up to Datto's cloud (separate from Microsoft infrastructure), providing isolated recovery independent of the production M365 tenant.`)
    sources.push('datto_saas_backup')
  }

  if (layers.length > 0) {
    return result('cis-v8-11.4', ctx, 'pass', 'high',
      `Recovery data isolated:\n${layers.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
      sources, [])
  }
  if (bcdrNotUsed) {
    return result('cis-v8-11.4', ctx, 'needs_review', 'low',
      'No on-prem servers — verify SaaS Protect provides isolated recovery.',
      [], [])
  }
  return result('cis-v8-11.4', ctx, 'needs_review', 'low',
    'Backup evidence exists but no matched devices. Verify offsite replication.',
    sources, [])
}

// 12.1 Network Infrastructure Up-to-Date — Domotz + Ubiquiti monitor network devices
evaluators['cis-v8-12.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const domotz = ctx.evidence.get('domotz_network_discovery' as EvidenceSourceType)
  const ubiquiti = ctx.evidence.get('ubiquiti_network' as EvidenceSourceType)
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  const sources = ['domotz_network_discovery', 'ubiquiti_network', 'it_glue_documentation'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  // Ubiquiti provides actual firmware versions per device — strong evidence
  if (ubiquiti) {
    const ubData = ubiquiti.rawData as {
      totalDevices?: number; totalSites?: number; devicesByModel?: Record<string, number>
      devices?: Array<{ hostname?: string; model?: string; firmware?: string; siteName?: string }>
    }
    const deviceCount = ubData.totalDevices ?? 0
    const siteCount = ubData.totalSites ?? 0
    const models = ubData.devicesByModel ?? {}
    const modelList = Object.entries(models).map(([k, v]) => `${k} (${v})`).join(', ')
    const firmwareList = (ubData.devices ?? []).slice(0, 10)
      .map((d) => `${d.hostname}: ${d.model} v${d.firmware}`)
      .join('; ')

    if (deviceCount > 0) {
      return result('cis-v8-12.1', ctx, 'pass', 'high',
        `UniFi manages ${deviceCount} network device(s) across ${siteCount} site(s). Models: ${modelList}. Firmware: ${firmwareList}. UniFi Cloud provides centralized firmware management with auto-update capability.${domotz ? ' Domotz provides additional network monitoring.' : ''}`,
        sources, [])
    }
  }

  if (domotz) {
    const data = domotz.rawData as { agentCount?: number; discoveryActive?: boolean; deviceTypes?: Record<string, number> }
    if (data.discoveryActive) {
      return result('cis-v8-12.1', ctx, 'partial', 'medium',
        `Domotz monitors network infrastructure with ${data.agentCount ?? 0} collector(s). Network device types discovered: ${data.deviceTypes ? Object.entries(data.deviceTypes).map(([k, v]) => `${k}: ${v}`).join(', ') : 'N/A'}. Firmware version tracking requires manual verification or vendor-specific monitoring.`,
        sources, [],
        'Verify network device firmware is current. Document firmware update schedule in IT Glue.')
    }
  }
  if (itg) {
    return result('cis-v8-12.1', ctx, 'needs_review', 'low',
      'IT Glue documentation available — verify network infrastructure update records are maintained.',
      sources, ['domotz_network_discovery', 'ubiquiti_network'])
  }
  return noEvidence('cis-v8-12.1', ['domotz_network_discovery', 'ubiquiti_network', 'it_glue_documentation'], ctx)
}

// 13.1 Centralize Security Event Alerting — RocketCyber SOC + SaaS Alerts + EDR + Defender
evaluators['cis-v8-13.1'] = (ctx: EvaluationContext): EvaluationResult => {
  // Check RocketCyber deployment attestation first — if it's marked deployed, it covers SOC
  const attestation = toolAttestationPass('cis-v8-13.1', ctx)

  const edr = ctx.evidence.get('datto_edr_alerts')
  const defender = ctx.evidence.get('microsoft_defender')
  const saasAlerts = ctx.evidence.get('saas_alerts_monitoring' as EvidenceSourceType)
  const dns = ctx.evidence.get('dnsfilter_dns')
  const sources = ['datto_edr_alerts', 'microsoft_defender', 'saas_alerts_monitoring', 'dnsfilter_dns'].filter(
    (s) => ctx.evidence.has(s as EvidenceSourceType)
  )
  // If no API evidence but RocketCyber is attested, use attestation
  if (sources.length === 0 && attestation) return attestation
  if (sources.length === 0) return noEvidence('cis-v8-13.1', ['datto_edr_alerts', 'microsoft_defender', 'saas_alerts_monitoring'], ctx)

  const alertSources: string[] = []
  if (edr) alertSources.push('Datto EDR (endpoint threats → RocketCyber SOC)')
  if (defender) alertSources.push('Microsoft Defender (endpoint + cloud alerts)')
  if (saasAlerts) {
    const saData = saasAlerts.rawData as { totalEvents?: number; customerCount?: number }
    alertSources.push(`SaaS Alerts (${saData.totalEvents ?? 0} events across ${saData.customerCount ?? 0} tenants)`)
  }
  if (dns) alertSources.push('DNSFilter (DNS threat blocking)')

  if (alertSources.length >= 3) {
    return result('cis-v8-13.1', ctx, 'pass', 'high',
      `Security event alerting centralized across ${alertSources.length} sources: ${alertSources.join('; ')}. RocketCyber SOC aggregates endpoint and firewall events for correlation.`,
      sources, [])
  }
  if (alertSources.length >= 2) {
    return result('cis-v8-13.1', ctx, 'pass', 'medium',
      `Security alerting from ${alertSources.length} sources: ${alertSources.join('; ')}.`,
      sources, [])
  }
  return result('cis-v8-13.1', ctx, 'partial', 'low',
    `Limited centralized alerting: ${alertSources.join('; ')}. Deploy additional monitoring sources for comprehensive coverage.`,
    sources, [], 'Consider deploying RocketCyber SOC for centralized SIEM capability across endpoints, network, and cloud.')
}

// 14.x Security Awareness Training — Check for Bullphish ID via tool deployment attestation
// These all require the same evidence: security awareness training tool deployed
evaluators['cis-v8-14.2'] = (ctx: EvaluationContext): EvaluationResult => {
  return trainingEvaluator('cis-v8-14.2', 'Social engineering recognition training (phishing, pre-texting, tailgating)', ctx)
}
evaluators['cis-v8-14.3'] = (ctx: EvaluationContext): EvaluationResult => {
  return trainingEvaluator('cis-v8-14.3', 'Authentication best practices training (MFA, password management)', ctx)
}
evaluators['cis-v8-14.4'] = (ctx: EvaluationContext): EvaluationResult => {
  return trainingEvaluator('cis-v8-14.4', 'Data handling best practices training (storage, transfer, disposal)', ctx)
}
evaluators['cis-v8-14.5'] = (ctx: EvaluationContext): EvaluationResult => {
  return trainingEvaluator('cis-v8-14.5', 'Unintentional data exposure training', ctx)
}
evaluators['cis-v8-14.6'] = (ctx: EvaluationContext): EvaluationResult => {
  return trainingEvaluator('cis-v8-14.6', 'Security incident recognition and reporting training', ctx)
}
evaluators['cis-v8-14.7'] = (ctx: EvaluationContext): EvaluationResult => {
  return trainingEvaluator('cis-v8-14.7', 'Missing security updates identification training', ctx)
}
evaluators['cis-v8-14.8'] = (ctx: EvaluationContext): EvaluationResult => {
  return trainingEvaluator('cis-v8-14.8', 'Insecure network dangers training', ctx)
}

// 15.1 Service Provider Inventory — IT Glue documentation
evaluators['cis-v8-15.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  if (!itg) return noEvidence('cis-v8-15.1', ['it_glue_documentation'], ctx)

  const data = itg.rawData as { flexibleAssetTypeCount?: number; organizationCount?: number }
  if ((data.flexibleAssetTypeCount ?? 0) > 0) {
    return result('cis-v8-15.1', ctx, 'partial', 'low',
      `IT Glue contains ${data.flexibleAssetTypeCount} flexible asset types. Service provider inventory should be maintained as a flexible asset type with vendor name, service type, and data sensitivity classification.`,
      ['it_glue_documentation'], [],
      'Create a "Service Providers" flexible asset type in IT Glue to track vendor name, service classification, and contact information.')
  }
  return noEvidence('cis-v8-15.1', ['it_glue_documentation'], ctx)
}

// 15.2 Service Provider Management Policy — IT Glue
evaluators['cis-v8-15.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  if (!itg) return noEvidence('cis-v8-15.2', ['it_glue_documentation'], ctx)

  const data = itg.rawData as { hasDocumentedPolicies?: boolean }
  if (data.hasDocumentedPolicies) {
    return result('cis-v8-15.2', ctx, 'pass', 'low',
      'IT Glue contains policy documentation. Service provider management policy should be included covering assessment, monitoring, and decommissioning.',
      ['it_glue_documentation'], [])
  }
  return result('cis-v8-15.2', ctx, 'needs_review', 'none',
    'No policy documentation detected in IT Glue.',
    ['it_glue_documentation'], [],
    'Create a service provider management policy in IT Glue covering vendor assessment, ongoing monitoring, and secure decommissioning procedures.')
}

// 16.1 Secure Application Development — N/A if no custom development
evaluators['cis-v8-16.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const envNA = envNotApplicable('cis-v8-16.1', ctx)
  if (envNA) return envNA

  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  if (itg) {
    const data = itg.rawData as { hasDocumentedProcedures?: boolean }
    if (data.hasDocumentedProcedures) {
      return result('cis-v8-16.1', ctx, 'partial', 'low',
        'IT Glue contains procedure documentation. Verify a secure development process is documented if the organization develops custom applications.',
        ['it_glue_documentation'], [])
    }
  }
  return { controlId: 'cis-v8-16.1', status: 'not_applicable', confidence: 'medium',
    reasoning: 'Most MSP-managed SMBs do not develop custom applications. If the customer does develop software, document a secure development process in IT Glue.',
    evidenceIds: [], missingEvidence: [], remediation: null }
}

// 17.1 Designate Incident Handling Personnel — IT Glue + Autotask
evaluators['cis-v8-17.1'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  const sources = ['it_glue_documentation', 'autotask_tickets'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  if (itg) {
    const data = itg.rawData as { hasDocumentedProcedures?: boolean }
    if (data.hasDocumentedProcedures) {
      return result('cis-v8-17.1', ctx, 'pass', 'low',
        'IT Glue contains documented procedures. As the MSP, Triple Cities Tech serves as the designated incident handling team with primary and backup technicians. Autotask PSA tracks incident tickets.',
        sources, [])
    }
  }
  return result('cis-v8-17.1', ctx, 'partial', 'low',
    'As the MSP, TCT handles incidents via Autotask ticketing. Formal incident handling personnel designation should be documented in IT Glue.',
    sources, ['it_glue_documentation'],
    'Document incident handling personnel (primary + backup) in IT Glue with contact information and escalation procedures.')
}

// 17.2 Incident Contact Information — IT Glue
evaluators['cis-v8-17.2'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  if (!itg) return noEvidence('cis-v8-17.2', ['it_glue_documentation'], ctx)

  const data = itg.rawData as { organizationCount?: number; matchedOrganization?: string }
  return result('cis-v8-17.2', ctx, 'partial', 'low',
    `IT Glue maintains organization records (${data.organizationCount ?? 0} orgs). Contact information for incident reporting should include internal staff, MSP contacts, law enforcement, and cyber insurance provider. ${data.matchedOrganization ?? ''}`,
    ['it_glue_documentation'], [],
    'Create an "Incident Response Contacts" flexible asset in IT Glue listing internal stakeholders, MSP contacts, legal counsel, insurance, and law enforcement contacts.')
}

// 17.3 Incident Reporting Process — IT Glue + Autotask
evaluators['cis-v8-17.3'] = (ctx: EvaluationContext): EvaluationResult => {
  const itg = ctx.evidence.get('it_glue_documentation' as EvidenceSourceType)
  const sources = ['it_glue_documentation', 'autotask_tickets'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  if (itg) {
    const data = itg.rawData as { hasDocumentedProcedures?: boolean }
    if (data.hasDocumentedProcedures) {
      return result('cis-v8-17.3', ctx, 'pass', 'low',
        'IT Glue contains documented procedures. Incident reporting process exists via Autotask ticketing system — customers report incidents to TCT, who creates tickets and follows the documented response procedure.',
        sources, [])
    }
  }
  return result('cis-v8-17.3', ctx, 'partial', 'low',
    'Autotask provides incident ticketing. A formal incident reporting process (timeframes, escalation, minimum information required) should be documented in IT Glue.',
    sources, ['it_glue_documentation'],
    'Document the incident reporting process in IT Glue: who to contact, how to report (email/phone/portal), minimum info to include, and expected response timeframes.')
}

// ---------------------------------------------------------------------------
// Tool-coverage helpers: evaluators for controls satisfied by stack composition
// ---------------------------------------------------------------------------

/** Helper: check if an attestation-based tool is deployed for this customer */
function isToolDeployed(ctx: EvaluationContext, toolId: string): boolean {
  return ctx.deployedTools?.get(toolId)?.deployed === true
}

// =============================================================================
// 8.x Audit Log Management — Rocket Cyber SOC + DNSFilter + Unifi coverage
// =============================================================================

// 8.6 Collect DNS Query Audit Logs — DNSFilter + Unifi
evaluators['cis-v8-8.6'] = (ctx) => {
  const dns = ctx.evidence.get('dnsfilter_dns')
  const unifi = ctx.evidence.get('ubiquiti_network')
  const sources = ['dnsfilter_dns', 'ubiquiti_network'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (dns || unifi) {
    return result('cis-v8-8.6', ctx, 'pass', 'high',
      `DNS query logs are collected via ${[dns && 'DNSFilter (cloud-side query logs and threat intelligence)', unifi && 'Ubiquiti UniFi (gateway DNS visibility)'].filter(Boolean).join(' and ')}.`,
      sources, [])
  }
  return noEvidence('cis-v8-8.6', ['dnsfilter_dns', 'ubiquiti_network'], ctx)
}

// 8.7 Collect URL Request Audit Logs — DNSFilter
evaluators['cis-v8-8.7'] = (ctx) => {
  const dns = ctx.evidence.get('dnsfilter_dns')
  if (dns) {
    return result('cis-v8-8.7', ctx, 'pass', 'high',
      'DNSFilter logs all DNS-resolved URL requests across managed devices, providing full URL request audit trail.',
      ['dnsfilter_dns'], [])
  }
  return noEvidence('cis-v8-8.7', ['dnsfilter_dns'], ctx)
}

// 8.8 Collect Command-Line Audit Logs — Datto EDR + RocketCyber
evaluators['cis-v8-8.8'] = (ctx) => {
  const edr = ctx.evidence.get('datto_edr_alerts')
  const socDeployed = isToolDeployed(ctx, 'rocketcyber')
  if (edr) {
    return result('cis-v8-8.8', ctx, 'pass', 'high',
      `Command-line audit logs are collected via Datto EDR's process telemetry${socDeployed ? ' and aggregated into Rocket Cyber SOC for correlation' : ''}.`,
      ['datto_edr_alerts'], [])
  }
  if (socDeployed) {
    return result('cis-v8-8.8', ctx, 'pass', 'medium',
      'Rocket Cyber SOC is deployed and aggregates command-line / process logs from connected sensors.',
      [], [])
  }
  return noEvidence('cis-v8-8.8', ['datto_edr_alerts'], ctx)
}

// 8.9 Centralize Audit Logs — RocketCyber SOC aggregates everything
evaluators['cis-v8-8.9'] = (ctx) => {
  const socDeployed = isToolDeployed(ctx, 'rocketcyber')
  const sources = ['datto_edr_alerts', 'dnsfilter_dns'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (socDeployed) {
    return result('cis-v8-8.9', ctx, 'pass', 'high',
      'Rocket Cyber managed SOC centralizes audit logs from EDR, M365, DNSFilter, UniFi, SaaS Alerts, and other sources for correlation and analysis.',
      sources, [])
  }
  return result('cis-v8-8.9', ctx, 'needs_review', 'low',
    'No central log aggregator confirmed. Deploy Rocket Cyber SOC or another SIEM to centralize logs.',
    sources, ['rocketcyber'])
}

// 8.10 Retain Audit Logs (90+ days) — M365 UAL + SOC + EDR
evaluators['cis-v8-8.10'] = (ctx) => {
  const ual = ctx.evidence.get('microsoft_audit_log')
  const edr = ctx.evidence.get('datto_edr_alerts')
  const socDeployed = isToolDeployed(ctx, 'rocketcyber')
  const sources = ['microsoft_audit_log', 'datto_edr_alerts'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (ual || edr || socDeployed) {
    return result('cis-v8-8.10', ctx, 'pass', 'high',
      `Audit logs retained 90+ days via ${[ual && 'Microsoft 365 Unified Audit Log (default 180 days)', edr && 'Datto EDR (90 days+)', socDeployed && 'Rocket Cyber SOC'].filter(Boolean).join(', ')}.`,
      sources, [])
  }
  return noEvidence('cis-v8-8.10', ['microsoft_audit_log', 'datto_edr_alerts'], ctx)
}

// 8.11 Conduct Audit Log Reviews — Rocket Cyber SOC (24/7 continuous review)
evaluators['cis-v8-8.11'] = (ctx) => {
  const socDeployed = isToolDeployed(ctx, 'rocketcyber')
  if (socDeployed) {
    return result('cis-v8-8.11', ctx, 'pass', 'high',
      'Rocket Cyber managed SOC performs 24/7 continuous audit log review and threat hunting.',
      [], [])
  }
  return result('cis-v8-8.11', ctx, 'needs_review', 'low',
    'No managed SOC confirmed. Audit log reviews require either an internal SOC team or a managed SOC service.',
    [], ['rocketcyber'])
}

// 8.12 Service Provider Logs — IG3, partial via SaaS Alerts
evaluators['cis-v8-8.12'] = (ctx) => {
  const saas = ctx.evidence.get('saas_alerts_monitoring')
  if (saas) {
    return result('cis-v8-8.12', ctx, 'partial', 'medium',
      'SaaS Alerts ingests logs from M365, Google Workspace, and other SaaS providers — covers part of the service-provider log requirement, but no formal program documents log collection from ALL service providers.',
      ['saas_alerts_monitoring'], ['manual_upload'],
      'Document a formal service-provider log collection program in IT Glue.')
  }
  return result('cis-v8-8.12', ctx, 'not_assessed', 'low',
    'IG3 control. No service-provider log collection program currently in place. Mark N/A if outside the customer\'s IG scope.',
    [], ['saas_alerts_monitoring'])
}

// =============================================================================
// 10.x Malware Defenses — Datto EDR + Windows Defender coverage
// =============================================================================

// 10.4 Auto-Scan Removable Media — Defender default
evaluators['cis-v8-10.4'] = (ctx) => {
  const edr = ctx.evidence.get('datto_edr_alerts')
  const defender = ctx.evidence.get('microsoft_defender')
  if (edr || defender) {
    const sources = ['datto_edr_alerts', 'microsoft_defender'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
    return result('cis-v8-10.4', ctx, 'pass', 'high',
      'Windows Defender scans removable media on insertion by default (Real-Time Protection); Datto EDR enforces Defender policy across managed endpoints.',
      sources, [])
  }
  return noEvidence('cis-v8-10.4', ['datto_edr_alerts', 'microsoft_defender'], ctx)
}

// 10.5 Anti-Exploitation (Defender Exploit Guard / DEP)
evaluators['cis-v8-10.5'] = (ctx) => {
  const edr = ctx.evidence.get('datto_edr_alerts')
  const defender = ctx.evidence.get('microsoft_defender')
  if (edr || defender) {
    const sources = ['datto_edr_alerts', 'microsoft_defender'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
    return result('cis-v8-10.5', ctx, 'pass', 'high',
      'Windows Defender Exploit Guard (Attack Surface Reduction, Controlled Folder Access, Network Protection) is enabled by default on Windows 10/11 and managed via Datto EDR.',
      sources, [])
  }
  return noEvidence('cis-v8-10.5', ['datto_edr_alerts', 'microsoft_defender'], ctx)
}

// 10.6 Centrally Manage Anti-Malware — Datto EDR is exactly this
evaluators['cis-v8-10.6'] = (ctx) => {
  const edr = ctx.evidence.get('datto_edr_alerts')
  if (edr) {
    return result('cis-v8-10.6', ctx, 'pass', 'high',
      'Datto EDR is a centralized Windows Defender management platform — this is its core function. Policies, signature updates, and incident response are all centrally managed.',
      ['datto_edr_alerts'], [])
  }
  const defender = ctx.evidence.get('microsoft_defender')
  if (defender) {
    return result('cis-v8-10.6', ctx, 'pass', 'medium',
      'Microsoft Defender is centrally managed via Intune.',
      ['microsoft_defender'], [])
  }
  return noEvidence('cis-v8-10.6', ['datto_edr_alerts', 'microsoft_defender'], ctx)
}

// 10.7 Behavior-Based Anti-Malware — EDR's core differentiator
evaluators['cis-v8-10.7'] = (ctx) => {
  const edr = ctx.evidence.get('datto_edr_alerts')
  if (edr) {
    return result('cis-v8-10.7', ctx, 'pass', 'high',
      'Datto EDR provides behavior-based detection — analyzing process behavior, network activity, file system changes, and anomalous patterns. This is the primary differentiator of EDR vs. signature-only AV.',
      ['datto_edr_alerts'], [])
  }
  return noEvidence('cis-v8-10.7', ['datto_edr_alerts'], ctx)
}

// =============================================================================
// 11.5 Test Data Recovery — distinguish endpoint backup vs SaaS Protection
// =============================================================================
evaluators['cis-v8-11.5'] = (ctx) => {
  const bcdr = ctx.evidence.get('datto_bcdr_backup')
  const saas = ctx.evidence.get('datto_saas_backup')
  const epBackup = getEndpointBackupDevices(ctx)
  const sources = ['datto_bcdr_backup', 'datto_saas_backup', 'datto_rmm_devices'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))

  // Datto BCDR has automated screenshot verification
  if (bcdr) {
    return result('cis-v8-11.5', ctx, 'pass', 'high',
      'Datto BCDR performs automated screenshot verification after every backup — boots the image and captures a screenshot confirming recoverability.',
      sources, [], saas
        ? 'For SaaS-only assets covered by Datto SaaS Protection, schedule a quarterly manual restore test (SaaS Protection has no automated restore verification).'
        : null)
  }
  // Datto Endpoint Backup also has screenshot verification
  if (epBackup.count > 0) {
    return result('cis-v8-11.5', ctx, 'pass', 'high',
      `Datto Endpoint Backup on ${epBackup.count} device(s) (${epBackup.hostnames.join(', ')}) performs automated screenshot verification after every backup — confirms recoverability automatically.`,
      sources, [], saas
        ? 'For SaaS-only assets covered by Datto SaaS Protection, schedule a quarterly manual restore test.'
        : null)
  }
  // SaaS Protection alone — no automated restore testing
  if (saas) {
    return result('cis-v8-11.5', ctx, 'partial', 'medium',
      'Datto SaaS Protection verifies backup job completion but does NOT perform automated restore testing. Quarterly manual restore tests must be documented to satisfy this control.',
      sources, ['manual_upload'],
      'Document a quarterly restore test schedule for M365 data in IT Glue.')
  }
  return noEvidence('cis-v8-11.5', ['datto_bcdr_backup', 'datto_saas_backup', 'datto_rmm_devices'], ctx)
}

// =============================================================================
// 12.x Network Infrastructure — Domotz + Unifi coverage
// =============================================================================

// 12.2 Secure Network Architecture — Unifi VLANs + Domotz visibility
evaluators['cis-v8-12.2'] = (ctx) => {
  const unifi = ctx.evidence.get('ubiquiti_network')
  const domotz = ctx.evidence.get('domotz_network_discovery')
  const sources = ['ubiquiti_network', 'domotz_network_discovery'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
  if (unifi) {
    const netCfg = (unifi.rawData as { networkConfig?: { vlanCount?: number; guestNetworkConfigured?: boolean; guestIsolation?: boolean; networkSegmented?: boolean } }).networkConfig
    const vlanDetail = netCfg
      ? ` ${netCfg.vlanCount} VLANs configured${netCfg.guestNetworkConfigured ? ', guest network present' : ''}${netCfg.guestIsolation ? ' (isolated)' : ''}${netCfg.networkSegmented ? ' — network is segmented.' : '.'}`
      : ' (VLAN config details unavailable — API endpoint may not support network config query).'
    return result('cis-v8-12.2', ctx, 'pass', netCfg?.networkSegmented ? 'high' : 'medium',
      `Secure network architecture managed via Ubiquiti UniFi.${vlanDetail}${domotz ? ' Continuously monitored via Domotz network discovery.' : ''}`,
      sources, [])
  }
  return noEvidence('cis-v8-12.2', ['ubiquiti_network', 'domotz_network_discovery'], ctx)
}

// 12.3 Securely Manage Network Infrastructure — Unifi HTTPS-only
evaluators['cis-v8-12.3'] = (ctx) => {
  const unifi = ctx.evidence.get('ubiquiti_network')
  if (unifi) {
    return result('cis-v8-12.3', ctx, 'pass', 'high',
      'Ubiquiti UniFi controller is HTTPS-only with role-based access control and managed credentials. Network management uses encrypted protocols.',
      ['ubiquiti_network'], [])
  }
  return noEvidence('cis-v8-12.3', ['ubiquiti_network'], ctx)
}

// 12.4 Architecture Diagrams — Domotz auto-generates live topology
evaluators['cis-v8-12.4'] = (ctx) => {
  const domotz = ctx.evidence.get('domotz_network_discovery')
  if (domotz) {
    return result('cis-v8-12.4', ctx, 'pass', 'high',
      'Domotz auto-generates live network topology diagrams as a core feature — diagrams are continuously updated based on active network discovery.',
      ['domotz_network_discovery'], [])
  }
  return noEvidence('cis-v8-12.4', ['domotz_network_discovery'], ctx)
}

// 12.5 Centralize Network AAA — Unifi controller
evaluators['cis-v8-12.5'] = (ctx) => {
  const unifi = ctx.evidence.get('ubiquiti_network')
  if (unifi) {
    return result('cis-v8-12.5', ctx, 'pass', 'medium',
      'Ubiquiti UniFi controller centralizes authentication, authorization, and audit logging for all managed network devices.',
      ['ubiquiti_network'], [])
  }
  return noEvidence('cis-v8-12.5', ['ubiquiti_network'], ctx)
}

// =============================================================================
// 13.x Network Monitoring and Defense
// =============================================================================

// 13.2 Host-Based IDS — Datto EDR + Defender
evaluators['cis-v8-13.2'] = (ctx) => {
  const edr = ctx.evidence.get('datto_edr_alerts')
  const defender = ctx.evidence.get('microsoft_defender')
  if (edr || defender) {
    const sources = ['datto_edr_alerts', 'microsoft_defender'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
    return result('cis-v8-13.2', ctx, 'pass', 'high',
      'Host-based intrusion detection is provided by Datto EDR with Windows Defender across all managed endpoints.',
      sources, [])
  }
  return noEvidence('cis-v8-13.2', ['datto_edr_alerts', 'microsoft_defender'], ctx)
}

// 13.3 Network IDS — Domotz + RocketCyber SOC
evaluators['cis-v8-13.3'] = (ctx) => {
  const domotz = ctx.evidence.get('domotz_network_discovery')
  const socDeployed = isToolDeployed(ctx, 'rocketcyber')
  if (domotz || socDeployed) {
    const sources = domotz ? ['domotz_network_discovery'] : []
    return result('cis-v8-13.3', ctx, 'pass', 'medium',
      `Network intrusion detection is provided via ${[domotz && 'Domotz network discovery (anomaly detection)', socDeployed && 'Rocket Cyber SOC (network event correlation)'].filter(Boolean).join(' + ')}.`,
      sources, [])
  }
  return noEvidence('cis-v8-13.3', ['domotz_network_discovery'], ctx)
}

// 13.4 Inter-Segment Traffic Filtering — Unifi firewall rules
evaluators['cis-v8-13.4'] = (ctx) => {
  const unifi = ctx.evidence.get('ubiquiti_network')
  if (unifi) {
    return result('cis-v8-13.4', ctx, 'pass', 'high',
      'Ubiquiti UniFi enforces inter-VLAN firewall rules controlling traffic flow between network segments.',
      ['ubiquiti_network'], [])
  }
  return noEvidence('cis-v8-13.4', ['ubiquiti_network'], ctx)
}

// 13.5 Remote Asset Access Control — Intune + Conditional Access
evaluators['cis-v8-13.5'] = (ctx) => {
  const ca = ctx.evidence.get('microsoft_conditional_access')
  const intune = ctx.evidence.get('microsoft_device_compliance')
  if (ca || intune) {
    const sources = ['microsoft_conditional_access', 'microsoft_device_compliance'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
    return result('cis-v8-13.5', ctx, 'pass', 'high',
      'Remote asset access is controlled via Microsoft Intune device compliance + Entra ID Conditional Access policies.',
      sources, [])
  }
  return noEvidence('cis-v8-13.5', ['microsoft_conditional_access', 'microsoft_device_compliance'], ctx)
}

// 13.6 Network Traffic Flow Logs — Unifi + Domotz
evaluators['cis-v8-13.6'] = (ctx) => {
  const unifi = ctx.evidence.get('ubiquiti_network')
  const domotz = ctx.evidence.get('domotz_network_discovery')
  if (unifi || domotz) {
    const sources = ['ubiquiti_network', 'domotz_network_discovery'].filter((s) => ctx.evidence.has(s as EvidenceSourceType))
    return result('cis-v8-13.6', ctx, 'pass', 'medium',
      `Network traffic flow logs collected via ${[unifi && 'UniFi (gateway flow logs)', domotz && 'Domotz (network monitoring)'].filter(Boolean).join(' + ')}.`,
      sources, [])
  }
  return noEvidence('cis-v8-13.6', ['ubiquiti_network', 'domotz_network_discovery'], ctx)
}

// 13.7 Host-Based IPS — Datto EDR (automated response = prevention)
evaluators['cis-v8-13.7'] = (ctx) => {
  const edr = ctx.evidence.get('datto_edr_alerts')
  if (edr) {
    return result('cis-v8-13.7', ctx, 'pass', 'high',
      'Datto EDR provides automated response actions (process termination, file quarantine, network isolation) — this constitutes host-based intrusion prevention, not just detection.',
      ['datto_edr_alerts'], [])
  }
  return noEvidence('cis-v8-13.7', ['datto_edr_alerts'], ctx)
}

// 13.8 Network IPS — Unifi Threat Management (requires API verification)
evaluators['cis-v8-13.8'] = (ctx) => {
  const unifi = ctx.evidence.get('ubiquiti_network')
  if (unifi) {
    const data = unifi.rawData as { threatManagementEnabled?: boolean; ipsMode?: string }
    if (data.threatManagementEnabled || data.ipsMode === 'ips') {
      return result('cis-v8-13.8', ctx, 'pass', 'high',
        'Ubiquiti UniFi Threat Management (IDS/IPS) is enabled on the security gateway.',
        ['ubiquiti_network'], [])
    }
    return result('cis-v8-13.8', ctx, 'needs_review', 'medium',
      'UniFi is deployed but Threat Management/IPS status not confirmed via API. Verify IDS/IPS is enabled in the UniFi controller (Settings > Threat Management > IPS Mode).',
      ['ubiquiti_network'], [],
      'Enable UniFi Threat Management (IPS mode) on the security gateway.')
  }
  return noEvidence('cis-v8-13.8', ['ubiquiti_network'], ctx)
}

// 13.9 Port-Level Access Control (802.1X) — Unifi (requires explicit config)
evaluators['cis-v8-13.9'] = (ctx) => {
  const unifi = ctx.evidence.get('ubiquiti_network')
  if (unifi) {
    const data = unifi.rawData as { dot1xEnabled?: boolean; macFilteringEnabled?: boolean }
    if (data.dot1xEnabled || data.macFilteringEnabled) {
      return result('cis-v8-13.9', ctx, 'pass', 'high',
        'Port-level access control is enforced via UniFi (802.1X or MAC filtering).',
        ['ubiquiti_network'], [])
    }
    return result('cis-v8-13.9', ctx, 'needs_review', 'medium',
      'UniFi is deployed but 802.1X/MAC filtering not confirmed. Verify port-level access control is configured on UniFi switches.',
      ['ubiquiti_network'], [],
      'Configure 802.1X authentication or MAC filtering on UniFi switches per the secure architecture requirement.')
  }
  return noEvidence('cis-v8-13.9', ['ubiquiti_network'], ctx)
}

// 13.10 Application Layer Filtering — DNSFilter
evaluators['cis-v8-13.10'] = (ctx) => {
  const dns = ctx.evidence.get('dnsfilter_dns')
  if (dns) {
    return result('cis-v8-13.10', ctx, 'pass', 'high',
      'DNSFilter performs application-layer filtering at the DNS resolution stage, blocking access to malicious or policy-violating applications.',
      ['dnsfilter_dns'], [])
  }
  return noEvidence('cis-v8-13.10', ['dnsfilter_dns'], ctx)
}

// 13.11 Tune Alerting Thresholds — Rocket Cyber SOC
evaluators['cis-v8-13.11'] = (ctx) => {
  const socDeployed = isToolDeployed(ctx, 'rocketcyber')
  if (socDeployed) {
    return result('cis-v8-13.11', ctx, 'pass', 'medium',
      'Rocket Cyber SOC continuously tunes alerting thresholds based on threat intel and customer-specific patterns as part of its managed service.',
      [], [])
  }
  return result('cis-v8-13.11', ctx, 'needs_review', 'low',
    'IG3 control. Without a managed SOC, alert tuning must be done by internal staff.',
    [], ['rocketcyber'])
}

// =============================================================================
// 14.x Security Awareness Training — BullPhish admin attestation
// =============================================================================

/** Helper: BullPhish-based training evaluator (admin attestation = sufficient evidence) */
function bullphishTraining(ctx: EvaluationContext, controlId: string, topic: string): EvaluationResult {
  if (isToolDeployed(ctx, 'bullphish_id')) {
    return result(controlId, ctx, 'pass', 'medium',
      `BullPhish ID is deployed for this customer (admin-attested) and runs ${topic} training campaigns to all workforce members.`,
      [], [])
  }
  return result(controlId, ctx, 'fail', 'medium',
    `No security awareness training platform confirmed deployed. BullPhish ID covers ${topic} training when active.`,
    [], ['bullphish_id'],
    'Deploy BullPhish ID (or an equivalent training platform) and confirm in tool configuration.')
}

evaluators['cis-v8-14.2'] = (ctx) => bullphishTraining(ctx, 'cis-v8-14.2', 'social engineering / phishing')
evaluators['cis-v8-14.3'] = (ctx) => bullphishTraining(ctx, 'cis-v8-14.3', 'authentication best practices')
evaluators['cis-v8-14.4'] = (ctx) => bullphishTraining(ctx, 'cis-v8-14.4', 'data handling')
evaluators['cis-v8-14.5'] = (ctx) => bullphishTraining(ctx, 'cis-v8-14.5', 'unintentional data exposure')
evaluators['cis-v8-14.6'] = (ctx) => bullphishTraining(ctx, 'cis-v8-14.6', 'incident recognition and reporting')
evaluators['cis-v8-14.7'] = (ctx) => bullphishTraining(ctx, 'cis-v8-14.7', 'identifying missing security updates')
evaluators['cis-v8-14.8'] = (ctx) => bullphishTraining(ctx, 'cis-v8-14.8', 'insecure network awareness')

// 14.1 Establish and Maintain Security Awareness Program — needs documented program
// (overrides existing 14.1 because it should distinguish tool-presence from documented program)
evaluators['cis-v8-14.1'] = (ctx) => {
  const bullphishDeployed = isToolDeployed(ctx, 'bullphish_id')
  if (bullphishDeployed) {
    return result('cis-v8-14.1', ctx, 'pass', 'medium',
      'BullPhish ID is deployed and running awareness campaigns. Note: "Establish and maintain" controls also expect a documented program in IT Glue (training cadence, coverage, role-based curriculum). If only the tool is in place, consider this partially satisfied.',
      [], ['it_glue_documentation'])
  }
  return result('cis-v8-14.1', ctx, 'fail', 'medium',
    'No security awareness training program confirmed. Deploy BullPhish ID (or equivalent) and document the program in IT Glue.',
    [], ['bullphish_id', 'it_glue_documentation'],
    'Deploy a training platform and write a brief program description in IT Glue.')
}

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
  { controlId: 'cis-v8-8.6', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [8, 6],
    category: '8 - Audit Log Management',
    title: 'Collect DNS Query Audit Logs',
    description: 'Collect DNS query audit logs on enterprise assets, where appropriate and supported.',
    evidenceSources: ['dnsfilter_dns', 'ubiquiti_network'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.7', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [8, 7],
    category: '8 - Audit Log Management',
    title: 'Collect URL Request Audit Logs',
    description: 'Collect URL request audit logs on enterprise assets, where appropriate and supported.',
    evidenceSources: ['dnsfilter_dns'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.8', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [8, 8],
    category: '8 - Audit Log Management',
    title: 'Collect Command-Line Audit Logs',
    description: 'Collect command-line audit logs. Example implementations include collecting audit logs from PowerShell, BASH, and remote administrative terminals.',
    evidenceSources: ['datto_edr_alerts'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.9', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [8, 9],
    category: '8 - Audit Log Management',
    title: 'Centralize Audit Logs',
    description: 'Centralize, to the extent possible, audit log collection and retention across enterprise assets.',
    evidenceSources: ['datto_edr_alerts', 'dnsfilter_dns'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.10', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [8, 10],
    category: '8 - Audit Log Management',
    title: 'Retain Audit Logs',
    description: 'Retain audit logs across enterprise assets for a minimum of 90 days.',
    evidenceSources: ['microsoft_audit_log', 'datto_edr_alerts'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.11', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [8, 11],
    category: '8 - Audit Log Management',
    title: 'Conduct Audit Log Reviews',
    description: 'Conduct reviews of audit logs to detect anomalies or abnormal events that could indicate a potential threat. Conduct reviews on a weekly, or more frequent, basis.',
    evidenceSources: ['datto_edr_alerts'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-8.12', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [8, 12],
    category: '8 - Audit Log Management',
    title: 'Collect Service Provider Logs',
    description: 'Collect service provider logs, where supported.',
    evidenceSources: ['saas_alerts_monitoring'],
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
  { controlId: 'cis-v8-9.3', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [9, 3],
    category: '9 - Email and Web Browser Protections',
    title: 'Maintain and Enforce Network-Based URL Filters',
    description: 'Enforce and update network-based URL filters to limit access to potentially malicious or unapproved websites.',
    evidenceSources: ['dnsfilter_dns'],
    evaluationType: 'auto' },
  { controlId: 'cis-v8-9.5', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [9, 5],
    category: '9 - Email and Web Browser Protections',
    title: 'Implement DMARC',
    description: 'Implement DMARC policy for the organization\'s email domain to prevent email spoofing and phishing.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },

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
  { controlId: 'cis-v8-10.4', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [10, 4],
    category: '10 - Malware Defenses',
    title: 'Configure Automatic Anti-Malware Scanning of Removable Media',
    description: 'Configure anti-malware software to automatically scan removable media.',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-10.5', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [10, 5],
    category: '10 - Malware Defenses',
    title: 'Enable Anti-Exploitation Features',
    description: 'Enable anti-exploitation features on enterprise assets and software, where possible (e.g. Windows Defender Exploit Guard, DEP).',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-10.6', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [10, 6],
    category: '10 - Malware Defenses',
    title: 'Centrally Manage Anti-Malware Software',
    description: 'Centrally manage anti-malware software.',
    evidenceSources: ['datto_edr_alerts', 'microsoft_defender'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-10.7', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [10, 7],
    category: '10 - Malware Defenses',
    title: 'Use Behavior-Based Anti-Malware Software',
    description: 'Use behavior-based anti-malware software.',
    evidenceSources: ['datto_edr_alerts'],
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
  { controlId: 'cis-v8-11.5', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [11, 5],
    category: '11 - Data Recovery',
    title: 'Test Data Recovery',
    description: 'Test backup recovery quarterly, or more frequently, for a sampling of in-scope enterprise assets.',
    evidenceSources: ['datto_bcdr_backup', 'datto_saas_backup'],
    evaluationType: 'semi-auto' },

  // === Category 12: Network Infrastructure Management ===
  { controlId: 'cis-v8-12.1', frameworkId: 'cis-v8', tier: 'IG1', sortKey: [12, 1],
    category: '12 - Network Infrastructure Management',
    title: 'Ensure Network Infrastructure is Up-to-Date',
    description: 'Ensure network infrastructure is kept up-to-date. Example: run latest stable version of software and/or use currently-supported network-as-a-service (NaaS) offerings.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-12.2', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [12, 2],
    category: '12 - Network Infrastructure Management',
    title: 'Establish and Maintain a Secure Network Architecture',
    description: 'Establish and maintain a secure network architecture (e.g. segmentation, least privilege, availability).',
    evidenceSources: ['ubiquiti_network', 'domotz_network_discovery'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-12.3', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [12, 3],
    category: '12 - Network Infrastructure Management',
    title: 'Securely Manage Network Infrastructure',
    description: 'Securely manage network infrastructure. Example implementations include version-controlled-infrastructure-as-code, and the use of secure network protocols such as SSH and HTTPS.',
    evidenceSources: ['ubiquiti_network'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-12.4', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [12, 4],
    category: '12 - Network Infrastructure Management',
    title: 'Establish and Maintain Architecture Diagrams',
    description: 'Establish and maintain architecture diagram(s) and/or other network system documentation.',
    evidenceSources: ['domotz_network_discovery'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-12.5', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [12, 5],
    category: '12 - Network Infrastructure Management',
    title: 'Centralize Network Authentication, Authorization, and Auditing (AAA)',
    description: 'Centralize network AAA. Example implementations include directory services like LDAP and AD.',
    evidenceSources: ['ubiquiti_network'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-12.6', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [12, 6],
    category: '12 - Network Infrastructure Management',
    title: 'Use of Encryption for Data in Transit',
    description: 'Use encryption for data in transit such as TLS for web and email.',
    evidenceSources: ['microsoft_conditional_access', 'microsoft_secure_score'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-12.7', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [12, 7],
    category: '12 - Network Infrastructure Management',
    title: 'Ensure Remote Devices Utilize a VPN and Connect to AAA',
    description: 'Require remote devices to use a VPN to connect to the enterprise network and to authenticate via AAA.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },
  { controlId: 'cis-v8-12.8', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [12, 8],
    category: '12 - Network Infrastructure Management',
    title: 'Establish and Maintain Dedicated Computing Resources for All Administrative Work',
    description: 'Establish and maintain dedicated computing resources for all administrative work or work requiring elevated access.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },

  // === Category 13: Network Monitoring and Defense ===
  { controlId: 'cis-v8-13.1', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [13, 1],
    category: '13 - Network Monitoring and Defense',
    title: 'Centralize Security Event Alerting',
    description: 'Centralize security event alerting across enterprise assets for log correlation and analysis.',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts', 'dnsfilter_dns'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.2', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [13, 2],
    category: '13 - Network Monitoring and Defense',
    title: 'Deploy a Host-Based Intrusion Detection Solution',
    description: 'Deploy a host-based intrusion detection solution on enterprise assets where appropriate or supported.',
    evidenceSources: ['datto_edr_alerts', 'microsoft_defender'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.3', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [13, 3],
    category: '13 - Network Monitoring and Defense',
    title: 'Deploy a Network Intrusion Detection Solution',
    description: 'Deploy a network intrusion detection solution on enterprise assets where appropriate.',
    evidenceSources: ['domotz_network_discovery'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.4', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [13, 4],
    category: '13 - Network Monitoring and Defense',
    title: 'Perform Traffic Filtering Between Network Segments',
    description: 'Perform traffic filtering between network segments where appropriate.',
    evidenceSources: ['ubiquiti_network'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.5', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [13, 5],
    category: '13 - Network Monitoring and Defense',
    title: 'Manage Access Control for Remote Assets',
    description: 'Manage access control for assets remotely connecting to enterprise resources.',
    evidenceSources: ['microsoft_conditional_access', 'microsoft_device_compliance'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.6', frameworkId: 'cis-v8', tier: 'IG2', sortKey: [13, 6],
    category: '13 - Network Monitoring and Defense',
    title: 'Collect Network Traffic Flow Logs',
    description: 'Collect network traffic flow logs and/or network traffic to review and alert upon.',
    evidenceSources: ['ubiquiti_network', 'domotz_network_discovery'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.7', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [13, 7],
    category: '13 - Network Monitoring and Defense',
    title: 'Deploy a Host-Based Intrusion Prevention Solution',
    description: 'Deploy a host-based intrusion prevention solution on enterprise assets where appropriate.',
    evidenceSources: ['datto_edr_alerts'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.8', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [13, 8],
    category: '13 - Network Monitoring and Defense',
    title: 'Deploy a Network Intrusion Prevention Solution',
    description: 'Deploy a network intrusion prevention solution where appropriate.',
    evidenceSources: ['ubiquiti_network'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.9', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [13, 9],
    category: '13 - Network Monitoring and Defense',
    title: 'Deploy Port-Level Access Control',
    description: 'Deploy port-level access control. Port-level access control utilizes 802.1X, or similar network access control protocols, such as certificates, and may incorporate user and/or device authentication.',
    evidenceSources: ['ubiquiti_network'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.10', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [13, 10],
    category: '13 - Network Monitoring and Defense',
    title: 'Perform Application Layer Filtering',
    description: 'Perform application layer filtering. Example implementations include a filtering proxy, application layer firewall, or gateway.',
    evidenceSources: ['dnsfilter_dns'],
    evaluationType: 'semi-auto' },
  { controlId: 'cis-v8-13.11', frameworkId: 'cis-v8', tier: 'IG3', sortKey: [13, 11],
    category: '13 - Network Monitoring and Defense',
    title: 'Tune Security Event Alerting Thresholds',
    description: 'Tune security event alerting thresholds monthly, or more frequently.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual' },

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
export { applyPolicyCoverage }

export function getFramework(): FrameworkDefinition {
  return CIS_V8_FRAMEWORK
}
