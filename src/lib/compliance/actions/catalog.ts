/**
 * Remediation Action Catalog — Seed
 *
 * Ten high-value actions covering the most common CIS v8 / CMMC L1 gaps
 * we see in MSP customer assessments. Mix of automated (Microsoft Graph)
 * and manual (vendor admin console / training program) executors.
 *
 * Adding an action here is a code change — review in PR, validate via
 * scripts/validate-action-catalog.ts. Bump version when impact text or
 * executor changes. Removing an action requires a deprecation flag plus
 * a transition window because in-flight pending_changes reference (id, version).
 *
 * Conventions:
 *   id        — '<platform>.<verb>_<object>' (snake_case after the dot)
 *   version   — semver-ish ('1.0.0'). Bump major if the behavior changes
 *               in a way that invalidates customer-impact assumptions.
 *   impact.userFacing — plain English. No vendor names, no Graph method
 *                       names. CI will fail if jargon leaks in.
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §3 for the design.
 */

import type { RemediationAction } from './types'
import { FRAMEWORK_POLICY_MAPPINGS } from '../policy-generation/framework-mappings'

export const REMEDIATION_ACTIONS: readonly RemediationAction[] = [
  // --------------------------------------------------------------------------
  // M365 / Entra
  // --------------------------------------------------------------------------
  {
    id: 'm365.enforce_mfa_all_users',
    name: 'Enforce MFA for all users',
    version: '1.0.0',
    satisfiesControls: [
      { frameworkId: 'cis-v8', controlId: '6.3', coverage: 'full' },
      { frameworkId: 'cis-v8', controlId: '6.5', coverage: 'partial' },
      { frameworkId: 'cmmc-l1', controlId: 'IA.L1-3.5.3', coverage: 'full' },
    ],
    capabilityId: 'mfa_enforcement',
    reversible: true,
    rollbackActionId: 'm365.revert_mfa_all_users',
    impact: {
      userFacing:
        'Every employee signing in to Microsoft 365 will be asked to set up the Microsoft Authenticator app on their phone the next time they log in. After enrollment, they will be asked for a code from the app when signing in from a new device. Sign-ins from trusted devices may not always prompt. Setup takes about five minutes per person.',
      operational:
        'Creates Conditional Access policy "Require MFA — All Users". Applies to all cloud apps; excludes break-glass accounts via security group.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 5,
      sessionDisruptive: false,
      requiresEndUserAction: true,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      { kind: 'break_glass_accounts_excluded' },
      // CA policies require Entra ID P1 (included in M365 Business Premium,
      // M365 E3/E5, Office 365 E5 add-on, or the standalone Entra ID P1 SKU).
      { kind: 'license_required', anyOf: ['entra_id_p1', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.applyConditionalAccessPolicy.mfaAll' },
    verification: { evaluatorIds: ['cis-v8.6.3', 'cis-v8.6.5'], delaySecondsBeforeVerify: 60 },
  },
  {
    id: 'm365.revert_mfa_all_users',
    name: 'Rollback: remove "Require MFA — All Users" CA policy',
    version: '1.0.0',
    satisfiesControls: [{ frameworkId: 'cis-v8', controlId: '6.3', coverage: 'full' }],
    capabilityId: 'mfa_enforcement',
    reversible: false,
    impact: {
      userFacing:
        'Users will no longer be prompted for a second factor when signing in. Existing authenticator-app setups remain, but they are no longer required.',
      operational: 'Deletes Conditional Access policy "Require MFA — All Users".',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      { kind: 'license_required', anyOf: ['entra_id_p1', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.removeConditionalAccessPolicy.mfaAll' },
    verification: { evaluatorIds: ['cis-v8.6.3'], delaySecondsBeforeVerify: 30 },
  },
  {
    id: 'm365.block_legacy_authentication',
    name: 'Block legacy authentication protocols',
    version: '1.0.0',
    satisfiesControls: [
      { frameworkId: 'cis-v8', controlId: '6.5', coverage: 'partial' },
      { frameworkId: 'cis-v8', controlId: '4.6', coverage: 'partial' },
    ],
    capabilityId: 'modern_auth',
    reversible: true,
    rollbackActionId: 'm365.allow_legacy_authentication',
    impact: {
      userFacing:
        'Older mail clients (Outlook 2010 and earlier, some phone setups configured years ago) will stop working. Modern Outlook, Outlook on the web, and the Outlook mobile app continue working normally. Any device that breaks will need to be reconfigured with a new mailbox profile — usually a five-minute task per device.',
      operational:
        'Creates Conditional Access policy "Block Legacy Authentication" targeting Exchange ActiveSync, IMAP, POP, and other legacy protocols.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 5,
      sessionDisruptive: true,
      requiresEndUserAction: true,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      { kind: 'license_required', anyOf: ['entra_id_p1', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.applyConditionalAccessPolicy.blockLegacyAuth' },
    verification: { evaluatorIds: ['cis-v8.6.5'], delaySecondsBeforeVerify: 60 },
  },
  {
    id: 'm365.allow_legacy_authentication',
    name: 'Rollback: allow legacy authentication',
    version: '1.0.0',
    satisfiesControls: [{ frameworkId: 'cis-v8', controlId: '6.5', coverage: 'partial' }],
    capabilityId: 'modern_auth',
    reversible: false,
    impact: {
      userFacing: 'Older mail clients can connect again. No end-user action required.',
      operational: 'Removes the "Block Legacy Authentication" CA policy.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      { kind: 'license_required', anyOf: ['entra_id_p1', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.removeConditionalAccessPolicy.blockLegacyAuth' },
    verification: { evaluatorIds: ['cis-v8.6.5'], delaySecondsBeforeVerify: 30 },
  },
  {
    id: 'm365.enable_password_protection',
    name: 'Turn on password protection (banned-password list)',
    version: '1.0.0',
    satisfiesControls: [{ frameworkId: 'cis-v8', controlId: '5.2', coverage: 'partial' }],
    capabilityId: 'password_protection',
    reversible: true,
    rollbackActionId: 'm365.disable_password_protection',
    impact: {
      userFacing:
        'When employees change their password, common weak passwords and words related to your company name will be rejected. They will be asked to pick a stronger one. No effect on existing passwords until the next password change.',
      operational: 'Enables Entra ID password protection with default banned-word list plus tenant-specific terms.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 1,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [{ kind: 'connector_verified', connectorType: 'microsoft_graph' }],
    executor: { kind: 'automated', handler: 'graph.enablePasswordProtection' },
    verification: { evaluatorIds: ['cis-v8.5.2'], delaySecondsBeforeVerify: 60 },
  },
  {
    id: 'm365.disable_password_protection',
    name: 'Rollback: disable banned-password protection',
    version: '1.0.0',
    satisfiesControls: [{ frameworkId: 'cis-v8', controlId: '5.2', coverage: 'partial' }],
    capabilityId: 'password_protection',
    reversible: false,
    impact: {
      userFacing: 'Password changes will no longer reject common weak passwords.',
      operational: 'Disables Entra ID password protection.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [{ kind: 'connector_verified', connectorType: 'microsoft_graph' }],
    executor: { kind: 'automated', handler: 'graph.disablePasswordProtection' },
    verification: { evaluatorIds: ['cis-v8.5.2'], delaySecondsBeforeVerify: 30 },
  },

  // --------------------------------------------------------------------------
  // Defender / endpoint
  // --------------------------------------------------------------------------
  {
    id: 'defender.enable_real_time_protection',
    name: 'Enable Microsoft Defender real-time protection',
    version: '1.0.0',
    satisfiesControls: [
      { frameworkId: 'cis-v8', controlId: '10.1', coverage: 'partial' },
      { frameworkId: 'cis-v8', controlId: '10.2', coverage: 'partial' },
    ],
    capabilityId: 'edr_realtime',
    reversible: true,
    rollbackActionId: 'defender.disable_real_time_protection',
    impact: {
      userFacing:
        'Each company laptop will continuously scan files for malware as they are opened. Performance impact is minimal on modern machines. End users may occasionally see a notification if a suspicious file is blocked.',
      operational:
        'Pushes Intune device configuration profile to enable Defender real-time protection on all enrolled Windows endpoints.',
      blastRadius: 'per_device',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      // Pushing Defender config via an Intune device profile requires the
      // Intune service (standalone, M365 Business Premium, M365 E3, or M365 E5).
      { kind: 'license_required', anyOf: ['intune', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.applyIntuneConfigProfile.defenderRealtime' },
    verification: { evaluatorIds: ['cis-v8.10.1', 'cis-v8.10.2'], delaySecondsBeforeVerify: 300 },
  },
  {
    id: 'defender.disable_real_time_protection',
    name: 'Rollback: disable Defender real-time protection',
    version: '1.0.0',
    satisfiesControls: [{ frameworkId: 'cis-v8', controlId: '10.1', coverage: 'partial' }],
    capabilityId: 'edr_realtime',
    reversible: false,
    impact: {
      userFacing: 'Laptops will no longer scan files in real time. Scheduled scans still run.',
      operational: 'Removes the Intune device configuration profile that enables Defender real-time protection.',
      blastRadius: 'per_device',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      { kind: 'license_required', anyOf: ['intune', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.removeIntuneConfigProfile.defenderRealtime' },
    verification: { evaluatorIds: ['cis-v8.10.1'], delaySecondsBeforeVerify: 300 },
  },

  // --------------------------------------------------------------------------
  // Intune compliance policy — Windows 10 baseline
  //
  // Compliance policies are the enforcement mechanism for "address
  // unauthorized" controls (CIS v8 1.2, 2.3, 2.5, 4.1). A device that
  // doesn't meet the baseline (no Defender, no BitLocker, etc.) gets
  // marked non-compliant in Intune; downstream Conditional Access can
  // then block its access. Documentation alone (the policy.generate_for_control
  // path) does NOT enforce any of this — that's the bug the operator
  // hit on CIS 2.3.
  // --------------------------------------------------------------------------
  {
    id: 'intune.create_windows_baseline_compliance_policy',
    name: 'Create Windows 10 baseline compliance policy',
    version: '1.0.0',
    satisfiesControls: [
      // 1.2 Address Unauthorized Assets — a Windows device that doesn't
      //     meet the baseline is flagged so it can be blocked.
      { frameworkId: 'cis-v8', controlId: '1.2', coverage: 'partial' },
      // 2.3 Address Unauthorized Software — Defender + signature checks
      //     are part of the baseline; a device without them is flagged.
      { frameworkId: 'cis-v8', controlId: '2.3', coverage: 'partial' },
      // 2.5 Allowlisted Software — paired with code-integrity checks
      //     enforced by the policy.
      { frameworkId: 'cis-v8', controlId: '2.5', coverage: 'partial' },
      // 4.1 Secure Configuration Process — the policy IS the documented
      //     enforced configuration.
      { frameworkId: 'cis-v8', controlId: '4.1', coverage: 'partial' },
      // 10.1 Anti-Malware — Defender required + active.
      { frameworkId: 'cis-v8', controlId: '10.1', coverage: 'partial' },
    ],
    capabilityId: 'device_compliance_enforcement',
    reversible: true,
    rollbackActionId: 'intune.remove_windows_baseline_compliance_policy',
    impact: {
      userFacing:
        'Company Windows laptops will be evaluated against a security baseline (antivirus on, disk encrypted, secure boot enabled). Devices that don\'t meet the baseline will be flagged in the IT console. If a downstream access policy is also in place, non-compliant devices will be blocked from corporate cloud apps until they are remediated. Most end users will not notice anything if their laptop is set up correctly.',
      operational:
        'Creates a Windows 10 compliance policy via Intune that requires Defender + real-time protection + BitLocker + secure boot + active firewall. Assigns to All Devices. Existing devices are evaluated within ~30 min of next Intune check-in.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      { kind: 'license_required', anyOf: ['intune', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.applyIntuneCompliancePolicy.windowsBaseline' },
    verification: { evaluatorIds: ['cis-v8.2.3', 'cis-v8.4.1'], delaySecondsBeforeVerify: 600 },
  },
  {
    id: 'intune.remove_windows_baseline_compliance_policy',
    name: 'Rollback: remove Windows 10 baseline compliance policy',
    version: '1.0.0',
    satisfiesControls: [{ frameworkId: 'cis-v8', controlId: '4.1', coverage: 'partial' }],
    capabilityId: 'device_compliance_enforcement',
    reversible: false,
    impact: {
      userFacing: 'Company Windows laptops will no longer be checked against the security baseline. Any device-block based on compliance status will be lifted at the next check-in.',
      operational: 'Deletes the TCT-managed Windows 10 compliance policy from Intune. Assignments cascade.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [
      { kind: 'connector_verified', connectorType: 'microsoft_graph' },
      { kind: 'license_required', anyOf: ['intune', 'm365_business_premium', 'm365_e3', 'm365_e5'] },
    ],
    executor: { kind: 'automated', handler: 'graph.removeIntuneCompliancePolicy.windowsBaseline' },
    verification: { evaluatorIds: ['cis-v8.4.1'], delaySecondsBeforeVerify: 300 },
  },

  // --------------------------------------------------------------------------
  // Manual / vendor-console actions
  // --------------------------------------------------------------------------
  {
    id: 'manual.deploy_security_awareness_training',
    name: 'Deploy monthly security awareness training',
    version: '1.0.0',
    satisfiesControls: [
      { frameworkId: 'cis-v8', controlId: '14.1', coverage: 'full' },
      { frameworkId: 'cis-v8', controlId: '14.2', coverage: 'partial' },
    ],
    capabilityId: 'security_awareness_training',
    reversible: false,
    impact: {
      userFacing:
        'Your team will receive a short five-minute training video each month on common security topics like phishing and password hygiene. Anyone who does not complete it will get reminders. Reports are available to leadership on a quarterly basis.',
      operational:
        'Configure BullPhish monthly campaign. Assign all licensed users. Set notification cadence to weekly reminders.',
      blastRadius: 'per_user',
      estimatedDisruptionMinutes: 5,
      sessionDisruptive: false,
      requiresEndUserAction: true,
    },
    preconditions: [{ kind: 'tool_deployed', toolId: 'bullphish' }],
    executor: {
      kind: 'manual',
      instructions:
        '1. Log in to the BullPhish portal.\n2. Create a monthly training campaign.\n3. Assign all licensed users.\n4. Set notification cadence to weekly reminders.\n5. Return here and mark this change as deployed.',
    },
    verification: { evaluatorIds: ['cis-v8.14.1'], delaySecondsBeforeVerify: 0 },
  },
  {
    id: 'manual.enable_dnsfilter_threat_protection',
    name: 'Turn on DNSFilter threat protection',
    version: '1.0.0',
    satisfiesControls: [
      { frameworkId: 'cis-v8', controlId: '9.2', coverage: 'full' },
      { frameworkId: 'cis-v8', controlId: '9.3', coverage: 'partial' },
    ],
    capabilityId: 'dns_filtering',
    reversible: false,
    impact: {
      userFacing:
        'Web browsing on company devices will block access to known malicious websites (phishing, malware, command-and-control). Most users will not notice any change in everyday browsing. Occasionally a legitimate site is blocked by mistake — your IT contact can request an exception.',
      operational:
        'In the DNSFilter dashboard, enable the Threat Protection category on the policy applied to all customer sites.',
      blastRadius: 'tenant_wide',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [{ kind: 'tool_deployed', toolId: 'dnsfilter' }],
    executor: {
      kind: 'manual',
      instructions:
        '1. Log in to the DNSFilter admin console.\n2. Open the policy applied to this customer\'s sites.\n3. Enable the Threat Protection category (Malware, Phishing, Command & Control).\n4. Save the policy.\n5. Return here and mark this change as deployed.',
    },
    verification: { evaluatorIds: ['cis-v8.9.2'], delaySecondsBeforeVerify: 60 },
  },
] as const

/**
 * Generic "generate a documented policy for this control" action. Single
 * catalog entry; the `satisfiesControls` list is computed at module load
 * from FRAMEWORK_POLICY_MAPPINGS so every (framework, control) pair that
 * has a mapped policy is automatically covered. The executor receives the
 * originating control via ExecutorContext.metadata and resolves which
 * specific policy slug to generate.
 *
 * This is what makes the Findings page's Remediate button work for
 * documentation-shaped controls (3.5 Securely Dispose of Data, 14.1
 * Security Awareness, etc.) where the right "fix" is a written policy
 * rather than an M365 setting change.
 */
const POLICY_GENERATE_ACTION: RemediationAction = (() => {
  // Build the satisfiesControls list. Use the short control id (matches
  // the rest of the catalog's convention, e.g. '3.5' not 'cis-v8-3.5').
  // Dedupe and prefer 'full' coverage over 'partial' when both exist.
  const byKey = new Map<string, { frameworkId: string; controlId: string; coverage: 'full' | 'partial' }>()
  for (const m of FRAMEWORK_POLICY_MAPPINGS) {
    if (m.coverageType === 'supporting') continue
    const shortControl = m.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')
    const key = `${m.frameworkId}::${shortControl}`
    const cov = m.coverageType === 'full' ? 'full' : 'partial'
    const existing = byKey.get(key)
    if (!existing || (existing.coverage === 'partial' && cov === 'full')) {
      byKey.set(key, { frameworkId: m.frameworkId, controlId: shortControl, coverage: cov })
    }
  }
  const satisfiesControls = Array.from(byKey.values()) as RemediationAction['satisfiesControls']

  return {
    id: 'policy.generate_for_control',
    name: 'Generate / revise the documented policy for this control',
    version: '1.0.0',
    satisfiesControls,
    capabilityId: 'policy_generation',
    reversible: false,
    impact: {
      userFacing:
        'TCT will generate a draft of the policy document that covers this control, using the customer\'s profile (industry, frameworks, operational context) as input. The draft lands in the compliance library for review — nothing is sent to the customer or pushed to their SharePoint / IT Glue / other storage until you approve it in a follow-up step.',
      operational:
        'Calls policy-generation/generator.ts (Claude API). If a policy with the same catalog name already exists, generates in mode=improve using the existing content as base; otherwise mode=new. Writes a row to compliance_policies (source=generated) and fires applyPolicyPresenceHook to update the customer profile.',
      blastRadius: 'none',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    },
    preconditions: [],
    executor: { kind: 'automated', handler: 'policy.generate_for_control' },
    verification: { evaluatorIds: [], delaySecondsBeforeVerify: 0 },
  } satisfies RemediationAction
})()

/**
 * Re-export the catalog with the computed policy-generation action
 * folded in. Public consumers see one combined list; the underlying
 * `as const` array stays type-safe for the hand-authored entries.
 */
const PUBLISH_TO_SHAREPOINT_ACTION: RemediationAction = {
  id: 'policy.publish_to_sharepoint',
  name: 'Publish policy to customer SharePoint',
  version: '1.0.0',
  satisfiesControls: [],
  capabilityId: 'policy_publish',
  reversible: false,
  impact: {
    userFacing:
      'TCT will upload the approved policy document to the customer\'s SharePoint document library. The customer\'s users will see the new file at the folder you choose; existing copies are preserved (the upload auto-suffixes "v2", "v3", etc.). This action only runs after the customer-approval checkbox is ticked in the publish modal.',
    operational:
      'Calls Graph PUT /drives/{driveId}/root:/<path>:/content with the policy rendered to .docx (renderPolicyDocx). Idempotency: uses a v2/v3 suffix on the filename so we never silently overwrite an approved earlier version. Refuses cleanly when metadata.customerApproved !== true.',
    blastRadius: 'tenant_wide',
    estimatedDisruptionMinutes: 0,
    sessionDisruptive: false,
    requiresEndUserAction: false,
  },
  preconditions: [
    { kind: 'connector_verified', connectorType: 'microsoft_graph' },
  ],
  executor: { kind: 'automated', handler: 'policy.publish_to_sharepoint' },
  verification: { evaluatorIds: [], delaySecondsBeforeVerify: 0 },
}

const ALL_REMEDIATION_ACTIONS: readonly RemediationAction[] = [
  ...REMEDIATION_ACTIONS,
  POLICY_GENERATE_ACTION,
  PUBLISH_TO_SHAREPOINT_ACTION,
]

/** Lookup: id → action. Sealed at module load. */
export const REMEDIATION_ACTIONS_BY_ID: ReadonlyMap<string, RemediationAction> = new Map(
  ALL_REMEDIATION_ACTIONS.map((a) => [a.id, a])
)

/** Convenience: get an action by id, or undefined. */
export function getRemediationAction(id: string): RemediationAction | undefined {
  return REMEDIATION_ACTIONS_BY_ID.get(id)
}

/** Suggest actions that satisfy a given (frameworkId, controlId). Sorted with 'full' coverage first. */
export function suggestActionsForControl(
  frameworkId: string,
  controlId: string
): RemediationAction[] {
  return ALL_REMEDIATION_ACTIONS.filter((a) =>
    a.satisfiesControls.some((c) => c.frameworkId === frameworkId && c.controlId === controlId)
  ).sort((a, b) => {
    const aCov = a.satisfiesControls.find((c) => c.frameworkId === frameworkId && c.controlId === controlId)?.coverage
    const bCov = b.satisfiesControls.find((c) => c.frameworkId === frameworkId && c.controlId === controlId)?.coverage
    if (aCov === bCov) return 0
    return aCov === 'full' ? -1 : 1
  })
}
