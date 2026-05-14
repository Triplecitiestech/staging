/**
 * NIST SP 800-171 — Framework Definition + Evaluators
 *
 * Implements all 110 security requirements from NIST Special Publication
 * 800-171 Rev 2: "Protecting Controlled Unclassified Information in
 * Nonfederal Systems and Organizations."
 *
 * Source of truth:
 *   NIST SP 800-171 Rev 2 (Feb 2020) — https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final
 *
 * The 110 controls span 14 families:
 *   3.1  Access Control                       (22)
 *   3.2  Awareness and Training                (3)
 *   3.3  Audit and Accountability              (9)
 *   3.4  Configuration Management              (9)
 *   3.5  Identification and Authentication    (11)
 *   3.6  Incident Response                     (3)
 *   3.7  Maintenance                           (6)
 *   3.8  Media Protection                      (9)
 *   3.9  Personnel Security                    (2)
 *   3.10 Physical Protection                   (6)
 *   3.11 Risk Assessment                       (3)
 *   3.12 Security Assessment                   (4)
 *   3.13 System and Communications Protection (16)
 *   3.14 System and Information Integrity      (7)
 *
 * Same delegation pattern as cmmc-l1.ts and hipaa.ts: where the
 * underlying technical check is identical to a CIS v8 safeguard, the
 * evaluator delegates via delegateTo() and re-stamps the reasoning
 * with the NIST 800-171 citation. Pure policy/organizational controls
 * (system security plans, risk assessments, personnel screening,
 * physical protection of facilities) are marked `evaluationType: 'manual'`
 * and surface as needs_review for engineer attestation.
 *
 * CMMC Level 2 = NIST SP 800-171 verbatim, so cmmc-l2.ts re-exports
 * these evaluators under cmmc-l2-prefixed ids. No duplicate domain
 * content.
 */

import type {
  ControlDefinition,
  ControlEvaluator,
  EvaluationContext,
  EvaluationResult,
  FrameworkDefinition,
} from '../types'
import { CIS_V8_EVALUATORS } from './cis-v8'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function result(
  controlId: string,
  ctx: EvaluationContext,
  status: EvaluationResult['status'],
  confidence: EvaluationResult['confidence'],
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

function delegate(
  cisControlId: string,
  nistControlId: string,
  citation: string,
  ctx: EvaluationContext
): EvaluationResult {
  const evaluator = CIS_V8_EVALUATORS[cisControlId]
  if (!evaluator) {
    return result(nistControlId, ctx, 'not_assessed', 'none',
      `No evaluator wired up for delegate target ${cisControlId}.`, [], [])
  }
  const cisResult = evaluator(ctx)
  return {
    ...cisResult,
    controlId: nistControlId,
    reasoning: `[${citation}] ${cisResult.reasoning}`,
  }
}

function manual(
  nistControlId: string,
  citation: string,
  policyExpected: string,
  ctx: EvaluationContext
): EvaluationResult {
  return result(
    nistControlId,
    ctx,
    'needs_review',
    'low',
    `[${citation}] Policy / organizational control. Verify by reviewing the customer's ${policyExpected} (upload via /admin/compliance Policy Analysis).`,
    ['it_glue_documentation', 'manual_upload'],
    [`Documented ${policyExpected.toLowerCase()}`],
    `Confirm the customer has a documented ${policyExpected.toLowerCase()} and that it is reviewed on their declared cadence.`
  )
}

// ---------------------------------------------------------------------------
// Control catalog
// ---------------------------------------------------------------------------

const C: ControlDefinition[] = [
  // ===== 3.1 Access Control (22) =====
  ctl('3.1.1', [1, 1], 'Access Control', 'Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems).', 'semi-auto', ['microsoft_users', 'microsoft_conditional_access', 'datto_rmm_devices']),
  ctl('3.1.2', [1, 2], 'Access Control', 'Limit system access to the types of transactions and functions that authorized users are permitted to execute.', 'semi-auto', ['microsoft_users', 'microsoft_conditional_access']),
  ctl('3.1.3', [1, 3], 'Access Control', 'Control the flow of CUI in accordance with approved authorizations.', 'manual', ['manual_upload']),
  ctl('3.1.4', [1, 4], 'Access Control', 'Separate the duties of individuals to reduce the risk of malevolent activity without collusion.', 'manual', ['manual_upload']),
  ctl('3.1.5', [1, 5], 'Access Control', 'Employ the principle of least privilege, including for specific security functions and privileged accounts.', 'semi-auto', ['microsoft_users']),
  ctl('3.1.6', [1, 6], 'Access Control', 'Use non-privileged accounts or roles when accessing nonsecurity functions.', 'semi-auto', ['microsoft_users']),
  ctl('3.1.7', [1, 7], 'Access Control', 'Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.', 'semi-auto', ['microsoft_audit_log']),
  ctl('3.1.8', [1, 8], 'Access Control', 'Limit unsuccessful logon attempts.', 'semi-auto', ['microsoft_conditional_access', 'microsoft_intune_config']),
  ctl('3.1.9', [1, 9], 'Access Control', 'Provide privacy and security notices consistent with applicable CUI rules.', 'manual', ['manual_upload']),
  ctl('3.1.10', [1, 10], 'Access Control', 'Use session lock with pattern-hiding displays to prevent access and viewing of data after a period of inactivity.', 'semi-auto', ['microsoft_intune_config']),
  ctl('3.1.11', [1, 11], 'Access Control', 'Terminate (automatically) a user session after a defined condition.', 'semi-auto', ['microsoft_conditional_access']),
  ctl('3.1.12', [1, 12], 'Access Control', 'Monitor and control remote access sessions.', 'semi-auto', ['microsoft_conditional_access', 'saas_alerts_monitoring']),
  ctl('3.1.13', [1, 13], 'Access Control', 'Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.', 'semi-auto', ['microsoft_conditional_access']),
  ctl('3.1.14', [1, 14], 'Access Control', 'Route remote access via managed access control points.', 'manual', ['manual_upload']),
  ctl('3.1.15', [1, 15], 'Access Control', 'Authorize remote execution of privileged commands and remote access to security-relevant information.', 'manual', ['manual_upload']),
  ctl('3.1.16', [1, 16], 'Access Control', 'Authorize wireless access prior to allowing such connections.', 'semi-auto', ['ubiquiti_network']),
  ctl('3.1.17', [1, 17], 'Access Control', 'Protect wireless access using authentication and encryption.', 'semi-auto', ['ubiquiti_network']),
  ctl('3.1.18', [1, 18], 'Access Control', 'Control connection of mobile devices.', 'semi-auto', ['microsoft_intune_config', 'microsoft_device_compliance']),
  ctl('3.1.19', [1, 19], 'Access Control', 'Encrypt CUI on mobile devices and mobile computing platforms.', 'semi-auto', ['microsoft_bitlocker', 'microsoft_intune_config']),
  ctl('3.1.20', [1, 20], 'Access Control', 'Verify and control/limit connections to and use of external systems.', 'semi-auto', ['dnsfilter_dns', 'microsoft_conditional_access']),
  ctl('3.1.21', [1, 21], 'Access Control', 'Limit use of organizational portable storage devices on external systems.', 'manual', ['manual_upload']),
  ctl('3.1.22', [1, 22], 'Access Control', 'Control CUI posted or processed on publicly accessible systems.', 'manual', ['manual_upload']),

  // ===== 3.2 Awareness and Training (3) =====
  ctl('3.2.1', [2, 1], 'Awareness and Training', 'Ensure that managers, system administrators, and users are made aware of the security risks associated with their activities and applicable policies, standards, and procedures related to the security of those systems.', 'manual', ['manual_upload']),
  ctl('3.2.2', [2, 2], 'Awareness and Training', 'Ensure that personnel are trained to carry out their assigned information security-related duties and responsibilities.', 'manual', ['manual_upload']),
  ctl('3.2.3', [2, 3], 'Awareness and Training', 'Provide security awareness training on recognizing and reporting potential indicators of insider threat.', 'manual', ['manual_upload']),

  // ===== 3.3 Audit and Accountability (9) =====
  ctl('3.3.1', [3, 1], 'Audit and Accountability', 'Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.', 'semi-auto', ['microsoft_audit_log']),
  ctl('3.3.2', [3, 2], 'Audit and Accountability', 'Ensure that the actions of individual system users can be uniquely traced to those users, so they can be held accountable for their actions.', 'semi-auto', ['microsoft_audit_log', 'microsoft_users']),
  ctl('3.3.3', [3, 3], 'Audit and Accountability', 'Review and update logged events.', 'manual', ['manual_upload']),
  ctl('3.3.4', [3, 4], 'Audit and Accountability', 'Alert in the event of an audit logging process failure.', 'semi-auto', ['saas_alerts_monitoring']),
  ctl('3.3.5', [3, 5], 'Audit and Accountability', 'Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.', 'semi-auto', ['saas_alerts_monitoring']),
  ctl('3.3.6', [3, 6], 'Audit and Accountability', 'Provide audit record reduction and report generation to support on-demand analysis and reporting.', 'manual', ['manual_upload']),
  ctl('3.3.7', [3, 7], 'Audit and Accountability', 'Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.', 'manual', ['manual_upload']),
  ctl('3.3.8', [3, 8], 'Audit and Accountability', 'Protect audit information and audit logging tools from unauthorized access, modification, and deletion.', 'semi-auto', ['microsoft_audit_log']),
  ctl('3.3.9', [3, 9], 'Audit and Accountability', 'Limit management of audit logging functionality to a subset of privileged users.', 'manual', ['manual_upload']),

  // ===== 3.4 Configuration Management (9) =====
  ctl('3.4.1', [4, 1], 'Configuration Management', 'Establish and maintain baseline configurations and inventories of organizational systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.', 'semi-auto', ['microsoft_intune_config', 'datto_rmm_devices']),
  ctl('3.4.2', [4, 2], 'Configuration Management', 'Establish and enforce security configuration settings for information technology products employed in organizational systems.', 'semi-auto', ['microsoft_intune_config']),
  ctl('3.4.3', [4, 3], 'Configuration Management', 'Track, review, approve or disapprove, and log changes to organizational systems.', 'manual', ['manual_upload']),
  ctl('3.4.4', [4, 4], 'Configuration Management', 'Analyze the security impact of changes prior to implementation.', 'manual', ['manual_upload']),
  ctl('3.4.5', [4, 5], 'Configuration Management', 'Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems.', 'manual', ['manual_upload']),
  ctl('3.4.6', [4, 6], 'Configuration Management', 'Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.', 'semi-auto', ['microsoft_intune_config']),
  ctl('3.4.7', [4, 7], 'Configuration Management', 'Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.', 'semi-auto', ['microsoft_intune_config']),
  ctl('3.4.8', [4, 8], 'Configuration Management', 'Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software.', 'manual', ['manual_upload']),
  ctl('3.4.9', [4, 9], 'Configuration Management', 'Control and monitor user-installed software.', 'semi-auto', ['microsoft_intune_config']),

  // ===== 3.5 Identification and Authentication (11) =====
  ctl('3.5.1', [5, 1], 'Identification and Authentication', 'Identify system users, processes acting on behalf of users, and devices.', 'semi-auto', ['microsoft_users']),
  ctl('3.5.2', [5, 2], 'Identification and Authentication', 'Authenticate (or verify) the identities of users, processes, or devices, as a prerequisite to allowing access to organizational systems.', 'auto', ['microsoft_mfa', 'microsoft_conditional_access']),
  ctl('3.5.3', [5, 3], 'Identification and Authentication', 'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.', 'auto', ['microsoft_mfa', 'microsoft_conditional_access']),
  ctl('3.5.4', [5, 4], 'Identification and Authentication', 'Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.', 'semi-auto', ['microsoft_conditional_access']),
  ctl('3.5.5', [5, 5], 'Identification and Authentication', 'Prevent reuse of identifiers for a defined period.', 'manual', ['manual_upload']),
  ctl('3.5.6', [5, 6], 'Identification and Authentication', 'Disable identifiers after a defined period of inactivity.', 'semi-auto', ['microsoft_users']),
  ctl('3.5.7', [5, 7], 'Identification and Authentication', 'Enforce a minimum password complexity and change of characters when new passwords are created.', 'semi-auto', ['microsoft_conditional_access']),
  ctl('3.5.8', [5, 8], 'Identification and Authentication', 'Prohibit password reuse for a specified number of generations.', 'semi-auto', ['microsoft_conditional_access']),
  ctl('3.5.9', [5, 9], 'Identification and Authentication', 'Allow temporary password use for system logons with an immediate change to a permanent password.', 'manual', ['manual_upload']),
  ctl('3.5.10', [5, 10], 'Identification and Authentication', 'Store and transmit only cryptographically-protected passwords.', 'manual', ['manual_upload']),
  ctl('3.5.11', [5, 11], 'Identification and Authentication', 'Obscure feedback of authentication information.', 'manual', ['manual_upload']),

  // ===== 3.6 Incident Response (3) =====
  ctl('3.6.1', [6, 1], 'Incident Response', 'Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user response activities.', 'semi-auto', ['saas_alerts_monitoring', 'datto_edr_alerts', 'manual_upload']),
  ctl('3.6.2', [6, 2], 'Incident Response', 'Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization.', 'manual', ['manual_upload']),
  ctl('3.6.3', [6, 3], 'Incident Response', 'Test the organizational incident response capability.', 'manual', ['manual_upload']),

  // ===== 3.7 Maintenance (6) =====
  ctl('3.7.1', [7, 1], 'Maintenance', 'Perform maintenance on organizational systems.', 'manual', ['manual_upload']),
  ctl('3.7.2', [7, 2], 'Maintenance', 'Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance.', 'manual', ['manual_upload']),
  ctl('3.7.3', [7, 3], 'Maintenance', 'Ensure equipment removed for off-site maintenance is sanitized of any CUI.', 'manual', ['manual_upload']),
  ctl('3.7.4', [7, 4], 'Maintenance', 'Check media containing diagnostic and test programs for malicious code before the media are used in organizational systems.', 'manual', ['manual_upload']),
  ctl('3.7.5', [7, 5], 'Maintenance', 'Require multifactor authentication to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete.', 'semi-auto', ['microsoft_mfa']),
  ctl('3.7.6', [7, 6], 'Maintenance', 'Supervise the maintenance activities of maintenance personnel without required access authorization.', 'manual', ['manual_upload']),

  // ===== 3.8 Media Protection (9) =====
  ctl('3.8.1', [8, 1], 'Media Protection', 'Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital.', 'manual', ['manual_upload']),
  ctl('3.8.2', [8, 2], 'Media Protection', 'Limit access to CUI on system media to authorized users.', 'manual', ['manual_upload']),
  ctl('3.8.3', [8, 3], 'Media Protection', 'Sanitize or destroy system media containing CUI before disposal or release for reuse.', 'manual', ['manual_upload']),
  ctl('3.8.4', [8, 4], 'Media Protection', 'Mark media with necessary CUI markings and distribution limitations.', 'manual', ['manual_upload']),
  ctl('3.8.5', [8, 5], 'Media Protection', 'Control access to media containing CUI and maintain accountability for media during transport outside of controlled areas.', 'manual', ['manual_upload']),
  ctl('3.8.6', [8, 6], 'Media Protection', 'Implement cryptographic mechanisms to protect the confidentiality of CUI stored on digital media during transport unless otherwise protected by alternative physical safeguards.', 'semi-auto', ['microsoft_bitlocker']),
  ctl('3.8.7', [8, 7], 'Media Protection', 'Control the use of removable media on system components.', 'semi-auto', ['microsoft_intune_config']),
  ctl('3.8.8', [8, 8], 'Media Protection', 'Prohibit the use of portable storage devices when such devices have no identifiable owner.', 'manual', ['manual_upload']),
  ctl('3.8.9', [8, 9], 'Media Protection', 'Protect the confidentiality of backup CUI at storage locations.', 'semi-auto', ['datto_bcdr_backup']),

  // ===== 3.9 Personnel Security (2) =====
  ctl('3.9.1', [9, 1], 'Personnel Security', 'Screen individuals prior to authorizing access to organizational systems containing CUI.', 'manual', ['manual_upload']),
  ctl('3.9.2', [9, 2], 'Personnel Security', 'Ensure that organizational systems containing CUI are protected during and after personnel actions such as terminations and transfers.', 'semi-auto', ['microsoft_users']),

  // ===== 3.10 Physical Protection (6) =====
  ctl('3.10.1', [10, 1], 'Physical Protection', 'Limit physical access to organizational systems, equipment, and the respective operating environments to authorized individuals.', 'manual', ['manual_upload']),
  ctl('3.10.2', [10, 2], 'Physical Protection', 'Protect and monitor the physical facility and support infrastructure for organizational systems.', 'manual', ['manual_upload']),
  ctl('3.10.3', [10, 3], 'Physical Protection', 'Escort visitors and monitor visitor activity.', 'manual', ['manual_upload']),
  ctl('3.10.4', [10, 4], 'Physical Protection', 'Maintain audit logs of physical access.', 'manual', ['manual_upload']),
  ctl('3.10.5', [10, 5], 'Physical Protection', 'Control and manage physical access devices.', 'manual', ['manual_upload']),
  ctl('3.10.6', [10, 6], 'Physical Protection', 'Enforce safeguarding measures for CUI at alternate work sites.', 'manual', ['manual_upload']),

  // ===== 3.11 Risk Assessment (3) =====
  ctl('3.11.1', [11, 1], 'Risk Assessment', 'Periodically assess the risk to organizational operations, organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.', 'manual', ['manual_upload']),
  ctl('3.11.2', [11, 2], 'Risk Assessment', 'Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems and applications are identified.', 'semi-auto', ['datto_rmm_patches']),
  ctl('3.11.3', [11, 3], 'Risk Assessment', 'Remediate vulnerabilities in accordance with risk assessments.', 'semi-auto', ['datto_rmm_patches']),

  // ===== 3.12 Security Assessment (4) =====
  ctl('3.12.1', [12, 1], 'Security Assessment', 'Periodically assess the security controls in organizational systems to determine if the controls are effective in their application.', 'manual', ['manual_upload']),
  ctl('3.12.2', [12, 2], 'Security Assessment', 'Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.', 'manual', ['manual_upload']),
  ctl('3.12.3', [12, 3], 'Security Assessment', 'Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.', 'manual', ['manual_upload']),
  ctl('3.12.4', [12, 4], 'Security Assessment', 'Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.', 'manual', ['manual_upload']),

  // ===== 3.13 System and Communications Protection (16) =====
  ctl('3.13.1', [13, 1], 'System and Communications Protection', 'Monitor, control, and protect communications (i.e., information transmitted or received by organizational systems) at the external boundaries and key internal boundaries of organizational systems.', 'semi-auto', ['dnsfilter_dns', 'ubiquiti_network']),
  ctl('3.13.2', [13, 2], 'System and Communications Protection', 'Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security within organizational systems.', 'manual', ['manual_upload']),
  ctl('3.13.3', [13, 3], 'System and Communications Protection', 'Separate user functionality from system management functionality.', 'manual', ['manual_upload']),
  ctl('3.13.4', [13, 4], 'System and Communications Protection', 'Prevent unauthorized and unintended information transfer via shared system resources.', 'manual', ['manual_upload']),
  ctl('3.13.5', [13, 5], 'System and Communications Protection', 'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.', 'manual', ['manual_upload']),
  ctl('3.13.6', [13, 6], 'System and Communications Protection', 'Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).', 'semi-auto', ['ubiquiti_network']),
  ctl('3.13.7', [13, 7], 'System and Communications Protection', 'Prevent remote devices from simultaneously establishing non-remote connections with organizational systems and communicating via some other connection to resources in external networks (i.e., split tunneling).', 'manual', ['manual_upload']),
  ctl('3.13.8', [13, 8], 'System and Communications Protection', 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards.', 'semi-auto', ['microsoft_mail_transport']),
  ctl('3.13.9', [13, 9], 'System and Communications Protection', 'Terminate network connections associated with communications sessions at the end of the sessions or after a defined period of inactivity.', 'semi-auto', ['microsoft_conditional_access']),
  ctl('3.13.10', [13, 10], 'System and Communications Protection', 'Establish and manage cryptographic keys for cryptography employed in organizational systems.', 'manual', ['manual_upload']),
  ctl('3.13.11', [13, 11], 'System and Communications Protection', 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.', 'manual', ['manual_upload']),
  ctl('3.13.12', [13, 12], 'System and Communications Protection', 'Prohibit remote activation of collaborative computing devices and provide indication of devices in use to users present at the device.', 'manual', ['manual_upload']),
  ctl('3.13.13', [13, 13], 'System and Communications Protection', 'Control and monitor the use of mobile code.', 'manual', ['manual_upload']),
  ctl('3.13.14', [13, 14], 'System and Communications Protection', 'Control and monitor the use of Voice over Internet Protocol (VoIP) technologies.', 'manual', ['manual_upload']),
  ctl('3.13.15', [13, 15], 'System and Communications Protection', 'Protect the authenticity of communications sessions.', 'manual', ['manual_upload']),
  ctl('3.13.16', [13, 16], 'System and Communications Protection', 'Protect the confidentiality of CUI at rest.', 'semi-auto', ['microsoft_bitlocker']),

  // ===== 3.14 System and Information Integrity (7) =====
  ctl('3.14.1', [14, 1], 'System and Information Integrity', 'Identify, report, and correct system flaws in a timely manner.', 'semi-auto', ['datto_rmm_patches']),
  ctl('3.14.2', [14, 2], 'System and Information Integrity', 'Provide protection from malicious code at designated locations within organizational systems.', 'semi-auto', ['datto_edr_alerts', 'microsoft_defender']),
  ctl('3.14.3', [14, 3], 'System and Information Integrity', 'Monitor system security alerts and advisories and take action in response.', 'manual', ['manual_upload']),
  ctl('3.14.4', [14, 4], 'System and Information Integrity', 'Update malicious code protection mechanisms when new releases are available.', 'semi-auto', ['datto_edr_alerts', 'microsoft_defender']),
  ctl('3.14.5', [14, 5], 'System and Information Integrity', 'Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.', 'semi-auto', ['microsoft_defender']),
  ctl('3.14.6', [14, 6], 'System and Information Integrity', 'Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.', 'semi-auto', ['saas_alerts_monitoring', 'dnsfilter_dns']),
  ctl('3.14.7', [14, 7], 'System and Information Integrity', 'Identify unauthorized use of organizational systems.', 'semi-auto', ['saas_alerts_monitoring']),
]

function ctl(
  num: string,
  sortKey: [number, number],
  category: string,
  description: string,
  evalType: 'auto' | 'semi-auto' | 'manual',
  sources: string[]
): ControlDefinition {
  return {
    controlId: `nist-${num}`,
    frameworkId: 'nist-800-171',
    tier: 'Basic',
    category: `3.${sortKey[0]} ${category}`,
    title: `${num} [NIST SP 800-171 §3.${sortKey[0]}.${sortKey[1]}]`,
    description,
    evidenceSources: sources as ControlDefinition['evidenceSources'],
    evaluationType: evalType,
    sortKey: [3, sortKey[0], sortKey[1]],
  }
}

export const NIST_800_171_FRAMEWORK: FrameworkDefinition = {
  id: 'nist-800-171',
  name: 'NIST SP 800-171',
  version: 'Rev 2',
  description:
    'NIST Special Publication 800-171 Rev 2 — 110 security requirements for protecting Controlled Unclassified Information (CUI) in nonfederal systems. Required for DoD contractors and aligned with CMMC Level 2.',
  controls: C,
}

// ---------------------------------------------------------------------------
// Evaluators
// ---------------------------------------------------------------------------

const e: Record<string, ControlEvaluator> = {}

// === 3.1 Access Control ===
e['nist-3.1.1']  = (ctx) => delegate('6.1', 'nist-3.1.1', '§3.1.1', ctx)
e['nist-3.1.2']  = (ctx) => delegate('6.7', 'nist-3.1.2', '§3.1.2', ctx)
e['nist-3.1.3']  = (ctx) => manual('nist-3.1.3', '§3.1.3', 'CUI flow control policy', ctx)
e['nist-3.1.4']  = (ctx) => manual('nist-3.1.4', '§3.1.4', 'separation of duties matrix', ctx)
e['nist-3.1.5']  = (ctx) => delegate('5.4', 'nist-3.1.5', '§3.1.5', ctx)
e['nist-3.1.6']  = (ctx) => delegate('5.4', 'nist-3.1.6', '§3.1.6', ctx)
e['nist-3.1.7']  = (ctx) => delegate('8.2', 'nist-3.1.7', '§3.1.7', ctx)
e['nist-3.1.8']  = (ctx) => delegate('6.3', 'nist-3.1.8', '§3.1.8', ctx)
e['nist-3.1.9']  = (ctx) => manual('nist-3.1.9', '§3.1.9', 'system-access banners / notices', ctx)
e['nist-3.1.10'] = (ctx) => delegate('4.3', 'nist-3.1.10', '§3.1.10', ctx)
e['nist-3.1.11'] = (ctx) => delegate('4.3', 'nist-3.1.11', '§3.1.11', ctx)
e['nist-3.1.12'] = (ctx) => delegate('12.6', 'nist-3.1.12', '§3.1.12', ctx)
e['nist-3.1.13'] = (ctx) => delegate('3.10', 'nist-3.1.13', '§3.1.13', ctx)
e['nist-3.1.14'] = (ctx) => manual('nist-3.1.14', '§3.1.14', 'managed access control points design', ctx)
e['nist-3.1.15'] = (ctx) => manual('nist-3.1.15', '§3.1.15', 'privileged-command remote authorization policy', ctx)
e['nist-3.1.16'] = (ctx) => manual('nist-3.1.16', '§3.1.16', 'wireless access authorization policy', ctx)
e['nist-3.1.17'] = (ctx) => manual('nist-3.1.17', '§3.1.17', 'wireless network security configuration', ctx)
e['nist-3.1.18'] = (ctx) => delegate('4.6', 'nist-3.1.18', '§3.1.18', ctx)
e['nist-3.1.19'] = (ctx) => delegate('3.6', 'nist-3.1.19', '§3.1.19', ctx)
e['nist-3.1.20'] = (ctx) => delegate('12.2', 'nist-3.1.20', '§3.1.20', ctx)
e['nist-3.1.21'] = (ctx) => manual('nist-3.1.21', '§3.1.21', 'portable storage device usage policy', ctx)
e['nist-3.1.22'] = (ctx) => manual('nist-3.1.22', '§3.1.22', 'public-facing CUI review process', ctx)

// === 3.2 Awareness and Training ===
e['nist-3.2.1'] = (ctx) => manual('nist-3.2.1', '§3.2.1', 'security awareness training program', ctx)
e['nist-3.2.2'] = (ctx) => manual('nist-3.2.2', '§3.2.2', 'role-based security training records', ctx)
e['nist-3.2.3'] = (ctx) => manual('nist-3.2.3', '§3.2.3', 'insider-threat training materials', ctx)

// === 3.3 Audit and Accountability ===
e['nist-3.3.1'] = (ctx) => delegate('8.2', 'nist-3.3.1', '§3.3.1', ctx)
e['nist-3.3.2'] = (ctx) => delegate('8.5', 'nist-3.3.2', '§3.3.2', ctx)
e['nist-3.3.3'] = (ctx) => manual('nist-3.3.3', '§3.3.3', 'audit-event review process', ctx)
e['nist-3.3.4'] = (ctx) => delegate('8.11', 'nist-3.3.4', '§3.3.4', ctx)
e['nist-3.3.5'] = (ctx) => delegate('8.11', 'nist-3.3.5', '§3.3.5', ctx)
e['nist-3.3.6'] = (ctx) => manual('nist-3.3.6', '§3.3.6', 'log analysis tooling documentation', ctx)
e['nist-3.3.7'] = (ctx) => manual('nist-3.3.7', '§3.3.7', 'system clock synchronization documentation', ctx)
e['nist-3.3.8'] = (ctx) => delegate('8.3', 'nist-3.3.8', '§3.3.8', ctx)
e['nist-3.3.9'] = (ctx) => manual('nist-3.3.9', '§3.3.9', 'audit logging access-control policy', ctx)

// === 3.4 Configuration Management ===
e['nist-3.4.1'] = (ctx) => delegate('1.1', 'nist-3.4.1', '§3.4.1', ctx)
e['nist-3.4.2'] = (ctx) => delegate('4.1', 'nist-3.4.2', '§3.4.2', ctx)
e['nist-3.4.3'] = (ctx) => manual('nist-3.4.3', '§3.4.3', 'change management process', ctx)
e['nist-3.4.4'] = (ctx) => manual('nist-3.4.4', '§3.4.4', 'security impact analysis procedure', ctx)
e['nist-3.4.5'] = (ctx) => manual('nist-3.4.5', '§3.4.5', 'access restrictions for change documentation', ctx)
e['nist-3.4.6'] = (ctx) => delegate('4.8', 'nist-3.4.6', '§3.4.6', ctx)
e['nist-3.4.7'] = (ctx) => delegate('4.8', 'nist-3.4.7', '§3.4.7', ctx)
e['nist-3.4.8'] = (ctx) => manual('nist-3.4.8', '§3.4.8', 'application allow/deny list policy', ctx)
e['nist-3.4.9'] = (ctx) => delegate('2.5', 'nist-3.4.9', '§3.4.9', ctx)

// === 3.5 Identification and Authentication ===
e['nist-3.5.1']  = (ctx) => delegate('5.1', 'nist-3.5.1', '§3.5.1', ctx)
e['nist-3.5.2']  = (ctx) => delegate('6.3', 'nist-3.5.2', '§3.5.2', ctx)
e['nist-3.5.3']  = (ctx) => delegate('6.5', 'nist-3.5.3', '§3.5.3', ctx)
e['nist-3.5.4']  = (ctx) => delegate('6.3', 'nist-3.5.4', '§3.5.4', ctx)
e['nist-3.5.5']  = (ctx) => manual('nist-3.5.5', '§3.5.5', 'identifier reuse policy', ctx)
e['nist-3.5.6']  = (ctx) => delegate('5.3', 'nist-3.5.6', '§3.5.6', ctx)
e['nist-3.5.7']  = (ctx) => delegate('5.2', 'nist-3.5.7', '§3.5.7', ctx)
e['nist-3.5.8']  = (ctx) => delegate('5.2', 'nist-3.5.8', '§3.5.8', ctx)
e['nist-3.5.9']  = (ctx) => manual('nist-3.5.9', '§3.5.9', 'temporary password procedure', ctx)
e['nist-3.5.10'] = (ctx) => manual('nist-3.5.10', '§3.5.10', 'password storage / transmission policy', ctx)
e['nist-3.5.11'] = (ctx) => manual('nist-3.5.11', '§3.5.11', 'authentication feedback obscuring (default behavior in modern OSes)', ctx)

// === 3.6 Incident Response ===
e['nist-3.6.1'] = (ctx) => delegate('17.5', 'nist-3.6.1', '§3.6.1', ctx)
e['nist-3.6.2'] = (ctx) => manual('nist-3.6.2', '§3.6.2', 'incident reporting procedure', ctx)
e['nist-3.6.3'] = (ctx) => manual('nist-3.6.3', '§3.6.3', 'incident response testing records', ctx)

// === 3.7 Maintenance ===
e['nist-3.7.1'] = (ctx) => manual('nist-3.7.1', '§3.7.1', 'system maintenance schedule', ctx)
e['nist-3.7.2'] = (ctx) => manual('nist-3.7.2', '§3.7.2', 'maintenance personnel access controls', ctx)
e['nist-3.7.3'] = (ctx) => manual('nist-3.7.3', '§3.7.3', 'off-site equipment sanitization procedure', ctx)
e['nist-3.7.4'] = (ctx) => manual('nist-3.7.4', '§3.7.4', 'diagnostic media scan procedure', ctx)
e['nist-3.7.5'] = (ctx) => delegate('6.3', 'nist-3.7.5', '§3.7.5', ctx)
e['nist-3.7.6'] = (ctx) => manual('nist-3.7.6', '§3.7.6', 'maintenance escort policy', ctx)

// === 3.8 Media Protection ===
e['nist-3.8.1'] = (ctx) => manual('nist-3.8.1', '§3.8.1', 'media storage controls', ctx)
e['nist-3.8.2'] = (ctx) => manual('nist-3.8.2', '§3.8.2', 'media access policy', ctx)
e['nist-3.8.3'] = (ctx) => manual('nist-3.8.3', '§3.8.3', 'media sanitization / destruction procedure', ctx)
e['nist-3.8.4'] = (ctx) => manual('nist-3.8.4', '§3.8.4', 'CUI marking procedure', ctx)
e['nist-3.8.5'] = (ctx) => manual('nist-3.8.5', '§3.8.5', 'media transport tracking', ctx)
e['nist-3.8.6'] = (ctx) => delegate('3.6', 'nist-3.8.6', '§3.8.6', ctx)
e['nist-3.8.7'] = (ctx) => manual('nist-3.8.7', '§3.8.7', 'removable media policy (USB blocking)', ctx)
e['nist-3.8.8'] = (ctx) => manual('nist-3.8.8', '§3.8.8', 'portable storage ownership policy', ctx)
e['nist-3.8.9'] = (ctx) => delegate('11.3', 'nist-3.8.9', '§3.8.9', ctx)

// === 3.9 Personnel Security ===
e['nist-3.9.1'] = (ctx) => manual('nist-3.9.1', '§3.9.1', 'personnel screening / background check policy', ctx)
e['nist-3.9.2'] = (ctx) => delegate('6.2', 'nist-3.9.2', '§3.9.2', ctx)

// === 3.10 Physical Protection ===
e['nist-3.10.1'] = (ctx) => manual('nist-3.10.1', '§3.10.1', 'physical access policy', ctx)
e['nist-3.10.2'] = (ctx) => manual('nist-3.10.2', '§3.10.2', 'facility monitoring policy', ctx)
e['nist-3.10.3'] = (ctx) => manual('nist-3.10.3', '§3.10.3', 'visitor escort policy', ctx)
e['nist-3.10.4'] = (ctx) => manual('nist-3.10.4', '§3.10.4', 'physical access logs', ctx)
e['nist-3.10.5'] = (ctx) => manual('nist-3.10.5', '§3.10.5', 'access device inventory', ctx)
e['nist-3.10.6'] = (ctx) => manual('nist-3.10.6', '§3.10.6', 'remote-work safeguards documentation', ctx)

// === 3.11 Risk Assessment ===
e['nist-3.11.1'] = (ctx) => manual('nist-3.11.1', '§3.11.1', 'risk assessment report', ctx)
e['nist-3.11.2'] = (ctx) => delegate('7.5', 'nist-3.11.2', '§3.11.2', ctx)
e['nist-3.11.3'] = (ctx) => delegate('7.7', 'nist-3.11.3', '§3.11.3', ctx)

// === 3.12 Security Assessment ===
e['nist-3.12.1'] = (ctx) => manual('nist-3.12.1', '§3.12.1', 'security control assessment report', ctx)
e['nist-3.12.2'] = (ctx) => manual('nist-3.12.2', '§3.12.2', 'Plan of Action & Milestones (POA&M)', ctx)
e['nist-3.12.3'] = (ctx) => manual('nist-3.12.3', '§3.12.3', 'continuous monitoring strategy', ctx)
e['nist-3.12.4'] = (ctx) => manual('nist-3.12.4', '§3.12.4', 'System Security Plan (SSP)', ctx)

// === 3.13 System and Communications Protection ===
e['nist-3.13.1']  = (ctx) => delegate('12.2', 'nist-3.13.1', '§3.13.1', ctx)
e['nist-3.13.2']  = (ctx) => manual('nist-3.13.2', '§3.13.2', 'secure engineering principles documentation', ctx)
e['nist-3.13.3']  = (ctx) => manual('nist-3.13.3', '§3.13.3', 'user/admin separation policy', ctx)
e['nist-3.13.4']  = (ctx) => manual('nist-3.13.4', '§3.13.4', 'shared-resource information flow controls', ctx)
e['nist-3.13.5']  = (ctx) => manual('nist-3.13.5', '§3.13.5', 'DMZ / network segmentation architecture', ctx)
e['nist-3.13.6']  = (ctx) => manual('nist-3.13.6', '§3.13.6', 'default-deny firewall policy', ctx)
e['nist-3.13.7']  = (ctx) => manual('nist-3.13.7', '§3.13.7', 'VPN split-tunnel policy', ctx)
e['nist-3.13.8']  = (ctx) => delegate('3.10', 'nist-3.13.8', '§3.13.8', ctx)
e['nist-3.13.9']  = (ctx) => delegate('4.3', 'nist-3.13.9', '§3.13.9', ctx)
e['nist-3.13.10'] = (ctx) => manual('nist-3.13.10', '§3.13.10', 'cryptographic key management procedure', ctx)
e['nist-3.13.11'] = (ctx) => manual('nist-3.13.11', '§3.13.11', 'FIPS 140 compliance attestation', ctx)
e['nist-3.13.12'] = (ctx) => manual('nist-3.13.12', '§3.13.12', 'collaborative device usage policy', ctx)
e['nist-3.13.13'] = (ctx) => manual('nist-3.13.13', '§3.13.13', 'mobile code policy', ctx)
e['nist-3.13.14'] = (ctx) => manual('nist-3.13.14', '§3.13.14', 'VoIP security policy', ctx)
e['nist-3.13.15'] = (ctx) => manual('nist-3.13.15', '§3.13.15', 'session authenticity controls', ctx)
e['nist-3.13.16'] = (ctx) => delegate('3.6', 'nist-3.13.16', '§3.13.16', ctx)

// === 3.14 System and Information Integrity ===
e['nist-3.14.1'] = (ctx) => delegate('7.7', 'nist-3.14.1', '§3.14.1', ctx)
e['nist-3.14.2'] = (ctx) => delegate('10.1', 'nist-3.14.2', '§3.14.2', ctx)
e['nist-3.14.3'] = (ctx) => manual('nist-3.14.3', '§3.14.3', 'security advisory monitoring process', ctx)
e['nist-3.14.4'] = (ctx) => delegate('10.2', 'nist-3.14.4', '§3.14.4', ctx)
e['nist-3.14.5'] = (ctx) => delegate('10.5', 'nist-3.14.5', '§3.14.5', ctx)
e['nist-3.14.6'] = (ctx) => delegate('13.1', 'nist-3.14.6', '§3.14.6', ctx)
e['nist-3.14.7'] = (ctx) => delegate('13.1', 'nist-3.14.7', '§3.14.7', ctx)

export const NIST_800_171_EVALUATORS: Record<string, ControlEvaluator> = e
