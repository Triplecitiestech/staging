/**
 * PCI DSS v4.0.1 — Framework Definition + Evaluators
 *
 * Implements the most commonly assessed sub-requirements from PCI Data
 * Security Standard v4.0.1 (released June 2024; full enforcement deadline
 * March 2025). Scope is targeted at MSP customers who self-attest at the
 * SAQ-A-EP, SAQ-C, or SAQ-D level — not a full QSA-led assessment.
 *
 * Source of truth:
 *   PCI Security Standards Council — PCI DSS v4.0.1
 *   (https://www.pcisecuritystandards.org/)
 *
 * Coverage approach
 * -----------------
 * PCI DSS has 12 high-level requirements with ~300 sub-requirements at
 * v4.0.1. This file covers the most commonly tested sub-requirements
 * (~50 controls) — the ones a small/mid-market MSP customer is likely
 * to be asked about during a SAQ. Less common ones can be added as
 * additional rows over time.
 *
 * Same delegation pattern as cmmc-l1.ts / hipaa.ts / nist-800-171.ts:
 * technical controls delegate to CIS v8; pure policy / organizational
 * controls (cardholder data inventory, BAU process, role-based access
 * documentation, vendor management) use manualReview().
 *
 * Engagement scope assumption
 * ---------------------------
 * PCI DSS only applies to entities that store, process, or transmit
 * cardholder data. The Customer Profile's regulatory-scope answers
 * gate this: customers who don't indicate card processing should not
 * be assessed against PCI DSS — the engine treats them as N/A.
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
// Helpers (mirror the other framework files)
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
  pciControlId: string,
  citation: string,
  ctx: EvaluationContext
): EvaluationResult {
  const evaluator = CIS_V8_EVALUATORS[cisControlId]
  if (!evaluator) {
    return result(pciControlId, ctx, 'not_assessed', 'none',
      `No evaluator wired up for delegate target ${cisControlId}.`, [], [])
  }
  const cisResult = evaluator(ctx)
  return {
    ...cisResult,
    controlId: pciControlId,
    reasoning: `[${citation}] ${cisResult.reasoning}`,
  }
}

function manual(
  pciControlId: string,
  citation: string,
  policyExpected: string,
  ctx: EvaluationContext
): EvaluationResult {
  return result(
    pciControlId,
    ctx,
    'needs_review',
    'low',
    `[${citation}] Policy / organizational control. Verify by reviewing the customer's ${policyExpected}.`,
    ['it_glue_documentation', 'manual_upload'],
    [`Documented ${policyExpected.toLowerCase()}`],
    `Confirm the customer has a documented ${policyExpected.toLowerCase()} reviewed on their declared cadence.`
  )
}

// ---------------------------------------------------------------------------
// Control catalog — focused on the ~50 most commonly assessed sub-requirements
// ---------------------------------------------------------------------------

function pci(
  num: string,
  sortKey: [number, number],
  category: string,
  description: string,
  evalType: 'auto' | 'semi-auto' | 'manual',
  sources: string[]
): ControlDefinition {
  return {
    controlId: `pci-${num}`,
    frameworkId: 'pci',
    tier: 'PCI DSS',
    category: `Req ${sortKey[0]}: ${category}`,
    title: `${num} [PCI DSS v4.0.1 §${num}]`,
    description,
    evidenceSources: sources as ControlDefinition['evidenceSources'],
    evaluationType: evalType,
    sortKey: [sortKey[0], sortKey[1]],
  }
}

const C: ControlDefinition[] = [
  // ===== Requirement 1: Install and maintain network security controls =====
  pci('1.2.1', [1, 1], 'Network Security Controls', 'Configuration standards for NSC rulesets are: defined, implemented, and maintained.', 'manual', ['manual_upload']),
  pci('1.2.5', [1, 2], 'Network Security Controls', 'All services, protocols, and ports allowed are identified, approved, and have a defined business need.', 'manual', ['manual_upload']),
  pci('1.2.6', [1, 3], 'Network Security Controls', 'Security features are defined and implemented for all services, protocols, and ports that are in use and considered to be insecure.', 'semi-auto', ['ubiquiti_network']),
  pci('1.3.1', [1, 4], 'Network Security Controls', 'Inbound traffic to the cardholder data environment (CDE) is restricted to that which is necessary.', 'semi-auto', ['ubiquiti_network']),
  pci('1.3.2', [1, 5], 'Network Security Controls', 'Outbound traffic from the CDE is restricted to that which is necessary.', 'semi-auto', ['ubiquiti_network']),
  pci('1.4.2', [1, 6], 'Network Security Controls', 'Inbound traffic from untrusted networks to trusted networks is restricted.', 'semi-auto', ['ubiquiti_network']),
  pci('1.5.1', [1, 7], 'Network Security Controls', 'Security controls are implemented on any computing devices, including company-owned and employee-owned devices that connect to both untrusted networks and the CDE.', 'semi-auto', ['microsoft_intune_config']),

  // ===== Requirement 2: Apply secure configurations =====
  pci('2.2.1', [2, 1], 'Secure Configuration', 'Configuration standards are developed, implemented, and maintained for all system components.', 'semi-auto', ['microsoft_intune_config']),
  pci('2.2.2', [2, 2], 'Secure Configuration', 'Vendor default accounts are managed: removed/disabled if not used, or have passwords/credentials changed before being used.', 'manual', ['manual_upload']),
  pci('2.2.4', [2, 3], 'Secure Configuration', 'Only necessary services, protocols, daemons, and functions are enabled, and all unnecessary functionality is removed or disabled.', 'semi-auto', ['microsoft_intune_config']),
  pci('2.2.5', [2, 4], 'Secure Configuration', 'If any insecure services, protocols, or daemons are present, business justification is documented and additional security features are documented and implemented.', 'manual', ['manual_upload']),
  pci('2.2.7', [2, 5], 'Secure Configuration', 'All non-console administrative access is encrypted using strong cryptography.', 'manual', ['manual_upload']),
  pci('2.3.1', [2, 6], 'Secure Configuration', 'For wireless environments connected to the CDE or transmitting account data, all wireless vendor defaults are changed at installation or are confirmed to be secure.', 'semi-auto', ['ubiquiti_network']),

  // ===== Requirement 3: Protect stored account data =====
  pci('3.2.1', [3, 1], 'Stored Account Data', 'Account data storage is kept to a minimum.', 'manual', ['manual_upload']),
  pci('3.3.1', [3, 2], 'Stored Account Data', 'Sensitive authentication data is not retained after authorization, even if encrypted.', 'manual', ['manual_upload']),
  pci('3.4.1', [3, 3], 'Stored Account Data', 'PAN is masked when displayed so that only personnel with a legitimate business need can see more than the BIN and last four digits.', 'manual', ['manual_upload']),
  pci('3.5.1', [3, 4], 'Stored Account Data', 'PAN is rendered unreadable anywhere it is stored.', 'semi-auto', ['microsoft_bitlocker']),
  pci('3.6.1', [3, 5], 'Stored Account Data', 'Procedures are defined and implemented to protect cryptographic keys used to protect stored account data against disclosure and misuse.', 'manual', ['manual_upload']),
  pci('3.7.1', [3, 6], 'Stored Account Data', 'Key-management policies and procedures are implemented to include generation of strong cryptographic keys.', 'manual', ['manual_upload']),

  // ===== Requirement 4: Protect cardholder data with strong cryptography during transmission =====
  pci('4.2.1', [4, 1], 'Transmission Encryption', 'Strong cryptography and security protocols are implemented to safeguard PAN during transmission over open, public networks.', 'semi-auto', ['microsoft_mail_transport']),
  pci('4.2.2', [4, 2], 'Transmission Encryption', 'PAN is secured with strong cryptography whenever it is sent via end-user messaging technologies.', 'manual', ['manual_upload']),

  // ===== Requirement 5: Protect from malicious software =====
  pci('5.2.1', [5, 1], 'Malware Defenses', 'An anti-malware solution is deployed on all system components, except for those components identified in periodic evaluations.', 'semi-auto', ['datto_edr_alerts', 'microsoft_defender']),
  pci('5.2.2', [5, 2], 'Malware Defenses', 'The deployed anti-malware solution(s) detects all known types of malware, removes/blocks/contains them, and is kept current.', 'semi-auto', ['datto_edr_alerts', 'microsoft_defender']),
  pci('5.3.1', [5, 3], 'Malware Defenses', 'The anti-malware solution(s) is kept current via automatic updates.', 'semi-auto', ['datto_edr_alerts', 'microsoft_defender']),
  pci('5.3.2', [5, 4], 'Malware Defenses', 'The anti-malware solution(s) performs periodic scans and active or real-time scans.', 'semi-auto', ['microsoft_defender']),

  // ===== Requirement 6: Develop and maintain secure systems and software =====
  pci('6.2.1', [6, 1], 'Secure Development', 'Bespoke and custom software is developed securely.', 'manual', ['manual_upload']),
  pci('6.3.1', [6, 2], 'Vulnerability Management', 'Security vulnerabilities are identified and managed by establishing a process to identify security vulnerabilities, assigning a risk ranking, and using credible external sources.', 'semi-auto', ['datto_rmm_patches']),
  pci('6.3.3', [6, 3], 'Vulnerability Management', 'All system components are protected from known vulnerabilities by installing applicable security patches/updates within a defined timeframe.', 'semi-auto', ['datto_rmm_patches']),
  pci('6.4.1', [6, 4], 'Public-Facing Web Apps', 'For public-facing web applications, new threats and vulnerabilities are addressed on an ongoing basis.', 'manual', ['manual_upload']),

  // ===== Requirement 7: Restrict access by business need to know =====
  pci('7.2.1', [7, 1], 'Access Control', 'An access control model is defined and includes granting access based on business need.', 'semi-auto', ['microsoft_users']),
  pci('7.2.2', [7, 2], 'Access Control', 'Access is assigned to users, including privileged users, based on job classification and function and the least privileges necessary to perform job responsibilities.', 'semi-auto', ['microsoft_users']),
  pci('7.2.4', [7, 3], 'Access Control', 'All user accounts and related access privileges are reviewed at least once every six months.', 'manual', ['manual_upload']),
  pci('7.2.5', [7, 4], 'Access Control', 'All application and system accounts and related access privileges are assigned and managed.', 'manual', ['manual_upload']),
  pci('7.3.1', [7, 5], 'Access Control', 'An access control system(s) is in place to restrict access based on a user\'s need to know and is set to "deny all" by default.', 'semi-auto', ['microsoft_conditional_access']),

  // ===== Requirement 8: Identify users and authenticate access =====
  pci('8.2.1', [8, 1], 'Authentication', 'All users are assigned a unique ID before access to system components or cardholder data is allowed.', 'semi-auto', ['microsoft_users']),
  pci('8.2.4', [8, 2], 'Authentication', 'Addition, deletion, and modification of user IDs, authentication factors, and other identifier objects are managed.', 'semi-auto', ['microsoft_audit_log']),
  pci('8.2.5', [8, 3], 'Authentication', 'Access for terminated users is immediately revoked.', 'semi-auto', ['microsoft_users']),
  pci('8.3.1', [8, 4], 'Authentication', 'All user access to system components for users and administrators is authenticated via at least one authentication factor.', 'auto', ['microsoft_mfa']),
  pci('8.3.6', [8, 5], 'Authentication', 'If passwords/passphrases are used as the only authentication factor, they meet minimum length and complexity requirements.', 'semi-auto', ['microsoft_conditional_access']),
  pci('8.3.7', [8, 6], 'Authentication', 'Individuals are not allowed to submit a new password/passphrase that is the same as any of the last four passwords/passphrases used.', 'semi-auto', ['microsoft_conditional_access']),
  pci('8.4.2', [8, 7], 'Authentication', 'MFA is implemented for all non-console access into the CDE.', 'auto', ['microsoft_mfa', 'microsoft_conditional_access']),
  pci('8.4.3', [8, 8], 'Authentication', 'MFA is implemented for all remote network access originating from outside the entity\'s network.', 'auto', ['microsoft_mfa', 'microsoft_conditional_access']),

  // ===== Requirement 9: Restrict physical access =====
  pci('9.2.1', [9, 1], 'Physical Access', 'Appropriate facility entry controls are in place to restrict physical access to systems in the CDE.', 'manual', ['manual_upload']),
  pci('9.3.1', [9, 2], 'Physical Access', 'Procedures are implemented for authorizing and managing physical access of personnel to the CDE.', 'manual', ['manual_upload']),
  pci('9.4.1', [9, 3], 'Physical Access', 'All media with cardholder data is physically secured.', 'manual', ['manual_upload']),
  pci('9.4.6', [9, 4], 'Physical Access', 'Hard-copy materials with cardholder data are destroyed when no longer needed for business or legal reasons.', 'manual', ['manual_upload']),
  pci('9.5.1', [9, 5], 'Physical Access', 'POI devices that capture payment card data via direct physical interaction are protected from tampering and unauthorized substitution.', 'manual', ['manual_upload']),

  // ===== Requirement 10: Log and monitor =====
  pci('10.2.1', [10, 1], 'Logging & Monitoring', 'Audit logs are enabled and active for all system components and cardholder data.', 'semi-auto', ['microsoft_audit_log']),
  pci('10.2.2', [10, 2], 'Logging & Monitoring', 'Audit logs record details about each auditable event.', 'semi-auto', ['microsoft_audit_log']),
  pci('10.3.1', [10, 3], 'Logging & Monitoring', 'Read access to audit logs is limited to those with a job-related need.', 'manual', ['manual_upload']),
  pci('10.3.2', [10, 4], 'Logging & Monitoring', 'Audit log files are protected to prevent modifications by individuals.', 'manual', ['manual_upload']),
  pci('10.4.1', [10, 5], 'Logging & Monitoring', 'Audit logs are reviewed at least once daily for security events.', 'semi-auto', ['saas_alerts_monitoring']),
  pci('10.5.1', [10, 6], 'Logging & Monitoring', 'Audit log history is retained and available for analysis for at least 12 months.', 'manual', ['manual_upload']),
  pci('10.6.1', [10, 7], 'Logging & Monitoring', 'System clocks and time are synchronized using time-synchronization technology.', 'manual', ['manual_upload']),

  // ===== Requirement 11: Test security regularly =====
  pci('11.3.1', [11, 1], 'Security Testing', 'Internal vulnerability scans are performed at least once every three months.', 'semi-auto', ['datto_rmm_patches']),
  pci('11.3.2', [11, 2], 'Security Testing', 'External vulnerability scans are performed at least once every three months by a PCI SSC Approved Scanning Vendor (ASV).', 'manual', ['manual_upload']),
  pci('11.4.1', [11, 3], 'Security Testing', 'External and internal penetration testing is performed at least once every 12 months and after significant changes.', 'manual', ['manual_upload']),
  pci('11.5.1', [11, 4], 'Security Testing', 'Intrusion-detection and/or intrusion-prevention techniques are used to detect and/or prevent intrusions into the network.', 'semi-auto', ['saas_alerts_monitoring', 'dnsfilter_dns']),

  // ===== Requirement 12: Support information security with policies =====
  pci('12.1.1', [12, 1], 'Security Policies', 'A comprehensive information security policy is established, published, maintained, and disseminated to all relevant personnel.', 'manual', ['manual_upload']),
  pci('12.3.1', [12, 2], 'Security Policies', 'A targeted risk analysis is performed for each PCI DSS requirement that the entity meets with the customized approach.', 'manual', ['manual_upload']),
  pci('12.5.1', [12, 3], 'Security Policies', 'An inventory of system components in scope for PCI DSS is maintained.', 'manual', ['manual_upload']),
  pci('12.6.1', [12, 4], 'Security Policies', 'A formal security awareness program is implemented.', 'manual', ['manual_upload']),
  pci('12.8.1', [12, 5], 'Security Policies', 'A list of all third-party service providers (TPSPs) with which account data is shared is maintained.', 'manual', ['manual_upload']),
  pci('12.10.1', [12, 6], 'Security Policies', 'An incident response plan exists and is ready to be activated in the event of a suspected or confirmed security incident.', 'manual', ['manual_upload']),
]

export const PCI_FRAMEWORK: FrameworkDefinition = {
  id: 'pci',
  name: 'PCI DSS v4.0.1',
  version: '4.0.1',
  description:
    'Payment Card Industry Data Security Standard v4.0.1 — 12 requirements covering protection of cardholder data. This framework implements the most commonly assessed sub-requirements targeted at MSP customers self-attesting at SAQ-A-EP, SAQ-C, or SAQ-D level.',
  controls: C,
}

// ---------------------------------------------------------------------------
// Evaluators — delegate to CIS v8 where possible, manualReview otherwise
// ---------------------------------------------------------------------------

const e: Record<string, ControlEvaluator> = {}

// === Requirement 1: NSC ===
e['pci-1.2.1'] = (ctx) => manual('pci-1.2.1', '§1.2.1', 'firewall configuration standards', ctx)
e['pci-1.2.5'] = (ctx) => manual('pci-1.2.5', '§1.2.5', 'list of approved services, protocols, ports', ctx)
e['pci-1.2.6'] = (ctx) => delegate('12.8', 'pci-1.2.6', '§1.2.6', ctx)
e['pci-1.3.1'] = (ctx) => delegate('12.4', 'pci-1.3.1', '§1.3.1', ctx)
e['pci-1.3.2'] = (ctx) => delegate('12.4', 'pci-1.3.2', '§1.3.2', ctx)
e['pci-1.4.2'] = (ctx) => delegate('12.4', 'pci-1.4.2', '§1.4.2', ctx)
e['pci-1.5.1'] = (ctx) => delegate('4.6', 'pci-1.5.1', '§1.5.1', ctx)

// === Requirement 2: Secure configuration ===
e['pci-2.2.1'] = (ctx) => delegate('4.1', 'pci-2.2.1', '§2.2.1', ctx)
e['pci-2.2.2'] = (ctx) => manual('pci-2.2.2', '§2.2.2', 'vendor default credential management', ctx)
e['pci-2.2.4'] = (ctx) => delegate('4.8', 'pci-2.2.4', '§2.2.4', ctx)
e['pci-2.2.5'] = (ctx) => manual('pci-2.2.5', '§2.2.5', 'insecure protocol business justification', ctx)
e['pci-2.2.7'] = (ctx) => manual('pci-2.2.7', '§2.2.7', 'non-console admin access encryption documentation', ctx)
e['pci-2.3.1'] = (ctx) => manual('pci-2.3.1', '§2.3.1', 'wireless default credential audit', ctx)

// === Requirement 3: Stored data ===
e['pci-3.2.1'] = (ctx) => manual('pci-3.2.1', '§3.2.1', 'cardholder data retention policy', ctx)
e['pci-3.3.1'] = (ctx) => manual('pci-3.3.1', '§3.3.1', 'sensitive auth data deletion procedure', ctx)
e['pci-3.4.1'] = (ctx) => manual('pci-3.4.1', '§3.4.1', 'PAN masking policy', ctx)
e['pci-3.5.1'] = (ctx) => delegate('3.6', 'pci-3.5.1', '§3.5.1', ctx)
e['pci-3.6.1'] = (ctx) => manual('pci-3.6.1', '§3.6.1', 'cryptographic key protection procedure', ctx)
e['pci-3.7.1'] = (ctx) => manual('pci-3.7.1', '§3.7.1', 'key management policy', ctx)

// === Requirement 4: Transmission ===
e['pci-4.2.1'] = (ctx) => delegate('3.10', 'pci-4.2.1', '§4.2.1', ctx)
e['pci-4.2.2'] = (ctx) => manual('pci-4.2.2', '§4.2.2', 'end-user messaging encryption policy', ctx)

// === Requirement 5: Malware ===
e['pci-5.2.1'] = (ctx) => delegate('10.1', 'pci-5.2.1', '§5.2.1', ctx)
e['pci-5.2.2'] = (ctx) => delegate('10.2', 'pci-5.2.2', '§5.2.2', ctx)
e['pci-5.3.1'] = (ctx) => delegate('10.2', 'pci-5.3.1', '§5.3.1', ctx)
e['pci-5.3.2'] = (ctx) => delegate('10.5', 'pci-5.3.2', '§5.3.2', ctx)

// === Requirement 6: Secure systems ===
e['pci-6.2.1'] = (ctx) => manual('pci-6.2.1', '§6.2.1', 'secure software development policy', ctx)
e['pci-6.3.1'] = (ctx) => delegate('7.1', 'pci-6.3.1', '§6.3.1', ctx)
e['pci-6.3.3'] = (ctx) => delegate('7.7', 'pci-6.3.3', '§6.3.3', ctx)
e['pci-6.4.1'] = (ctx) => manual('pci-6.4.1', '§6.4.1', 'public-facing web app threat management', ctx)

// === Requirement 7: Access by need-to-know ===
e['pci-7.2.1'] = (ctx) => delegate('6.7', 'pci-7.2.1', '§7.2.1', ctx)
e['pci-7.2.2'] = (ctx) => delegate('5.4', 'pci-7.2.2', '§7.2.2', ctx)
e['pci-7.2.4'] = (ctx) => manual('pci-7.2.4', '§7.2.4', 'semiannual access review records', ctx)
e['pci-7.2.5'] = (ctx) => manual('pci-7.2.5', '§7.2.5', 'service account inventory', ctx)
e['pci-7.3.1'] = (ctx) => delegate('6.7', 'pci-7.3.1', '§7.3.1', ctx)

// === Requirement 8: Identification & authentication ===
e['pci-8.2.1'] = (ctx) => delegate('5.1', 'pci-8.2.1', '§8.2.1', ctx)
e['pci-8.2.4'] = (ctx) => delegate('6.1', 'pci-8.2.4', '§8.2.4', ctx)
e['pci-8.2.5'] = (ctx) => delegate('6.2', 'pci-8.2.5', '§8.2.5', ctx)
e['pci-8.3.1'] = (ctx) => delegate('6.3', 'pci-8.3.1', '§8.3.1', ctx)
e['pci-8.3.6'] = (ctx) => delegate('5.2', 'pci-8.3.6', '§8.3.6', ctx)
e['pci-8.3.7'] = (ctx) => delegate('5.2', 'pci-8.3.7', '§8.3.7', ctx)
e['pci-8.4.2'] = (ctx) => delegate('6.5', 'pci-8.4.2', '§8.4.2', ctx)
e['pci-8.4.3'] = (ctx) => delegate('6.4', 'pci-8.4.3', '§8.4.3', ctx)

// === Requirement 9: Physical access ===
e['pci-9.2.1'] = (ctx) => manual('pci-9.2.1', '§9.2.1', 'facility entry controls', ctx)
e['pci-9.3.1'] = (ctx) => manual('pci-9.3.1', '§9.3.1', 'physical access authorization procedure', ctx)
e['pci-9.4.1'] = (ctx) => manual('pci-9.4.1', '§9.4.1', 'media physical security policy', ctx)
e['pci-9.4.6'] = (ctx) => manual('pci-9.4.6', '§9.4.6', 'hard copy destruction procedure', ctx)
e['pci-9.5.1'] = (ctx) => manual('pci-9.5.1', '§9.5.1', 'POI device tamper-evident inspection program', ctx)

// === Requirement 10: Logging ===
e['pci-10.2.1'] = (ctx) => delegate('8.2', 'pci-10.2.1', '§10.2.1', ctx)
e['pci-10.2.2'] = (ctx) => delegate('8.5', 'pci-10.2.2', '§10.2.2', ctx)
e['pci-10.3.1'] = (ctx) => manual('pci-10.3.1', '§10.3.1', 'audit log access policy', ctx)
e['pci-10.3.2'] = (ctx) => delegate('8.3', 'pci-10.3.2', '§10.3.2', ctx)
e['pci-10.4.1'] = (ctx) => delegate('8.11', 'pci-10.4.1', '§10.4.1', ctx)
e['pci-10.5.1'] = (ctx) => manual('pci-10.5.1', '§10.5.1', '12-month log retention configuration', ctx)
e['pci-10.6.1'] = (ctx) => manual('pci-10.6.1', '§10.6.1', 'time synchronization (NTP) documentation', ctx)

// === Requirement 11: Security testing ===
e['pci-11.3.1'] = (ctx) => delegate('7.5', 'pci-11.3.1', '§11.3.1', ctx)
e['pci-11.3.2'] = (ctx) => manual('pci-11.3.2', '§11.3.2', 'external ASV scan reports', ctx)
e['pci-11.4.1'] = (ctx) => manual('pci-11.4.1', '§11.4.1', 'annual penetration test report', ctx)
e['pci-11.5.1'] = (ctx) => delegate('13.1', 'pci-11.5.1', '§11.5.1', ctx)

// === Requirement 12: Policies ===
e['pci-12.1.1'] = (ctx) => manual('pci-12.1.1', '§12.1.1', 'information security policy', ctx)
e['pci-12.3.1'] = (ctx) => manual('pci-12.3.1', '§12.3.1', 'targeted risk analysis for customized approach', ctx)
e['pci-12.5.1'] = (ctx) => manual('pci-12.5.1', '§12.5.1', 'PCI scope inventory', ctx)
e['pci-12.6.1'] = (ctx) => manual('pci-12.6.1', '§12.6.1', 'security awareness program', ctx)
e['pci-12.8.1'] = (ctx) => manual('pci-12.8.1', '§12.8.1', 'third-party service provider (TPSP) list', ctx)
e['pci-12.10.1'] = (ctx) => manual('pci-12.10.1', '§12.10.1', 'incident response plan', ctx)

export const PCI_EVALUATORS: Record<string, ControlEvaluator> = e
