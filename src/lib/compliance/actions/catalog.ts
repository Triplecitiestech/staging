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
    preconditions: [{ kind: 'connector_verified', connectorType: 'microsoft_graph' }],
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
    preconditions: [{ kind: 'connector_verified', connectorType: 'microsoft_graph' }],
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
    preconditions: [{ kind: 'connector_verified', connectorType: 'microsoft_graph' }],
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
    preconditions: [{ kind: 'connector_verified', connectorType: 'microsoft_graph' }],
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
    preconditions: [{ kind: 'connector_verified', connectorType: 'microsoft_graph' }],
    executor: { kind: 'automated', handler: 'graph.removeIntuneConfigProfile.defenderRealtime' },
    verification: { evaluatorIds: ['cis-v8.10.1'], delaySecondsBeforeVerify: 300 },
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

/** Lookup: id → action. Sealed at module load. */
export const REMEDIATION_ACTIONS_BY_ID: ReadonlyMap<string, RemediationAction> = new Map(
  REMEDIATION_ACTIONS.map((a) => [a.id, a])
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
  return REMEDIATION_ACTIONS.filter((a) =>
    a.satisfiesControls.some((c) => c.frameworkId === frameworkId && c.controlId === controlId)
  ).sort((a, b) => {
    const aCov = a.satisfiesControls.find((c) => c.frameworkId === frameworkId && c.controlId === controlId)?.coverage
    const bCov = b.satisfiesControls.find((c) => c.frameworkId === frameworkId && c.controlId === controlId)?.coverage
    if (aCov === bCov) return 0
    return aCov === 'full' ? -1 : 1
  })
}
