/**
 * HIPAA Security Rule — Framework Definition + Evaluators
 *
 * Implements the technical compliance checks that map to the HIPAA
 * Security Rule's Administrative, Physical, and Technical Safeguards
 * (45 CFR §§ 164.308, 164.310, 164.312, 164.314, 164.316).
 *
 * Source of truth: 45 CFR Part 164, Subpart C (HIPAA Security Rule),
 *                  and NIST SP 800-66r2 (HIPAA Security Rule implementation guide).
 *
 * Coverage approach
 * -----------------
 * The HIPAA Security Rule is largely policy-driven, but many of its
 * implementation specifications can be partially evaluated from the
 * same telemetry CIS v8 / CMMC L1 already collect (MFA, audit logs,
 * encryption, backup, account management, anti-malware). This file:
 *
 *   - Defines each implementation specification as its own control row
 *     with the official CFR citation as title.
 *   - Implements `auto` / `semi-auto` evaluators that DELEGATE to the
 *     equivalent CIS v8 evaluator where the underlying technical check
 *     is identical (encryption, audit, backup, MFA, anti-malware,
 *     account management). The reasoning text is re-stamped with the
 *     HIPAA citation so the assessment report reads cleanly.
 *   - Marks pure policy / organizational controls (risk analysis,
 *     sanction policy, BAAs, workforce clearance, facility security)
 *     as `evaluationType: 'manual'`. These surface as `needs_review`
 *     so the engineer can attest based on uploaded policies.
 *
 * Engagement scope assumption
 * ---------------------------
 * HIPAA only applies to Covered Entities and their Business Associates.
 * Customers who answered `org_handles_phi = no` in the Customer Profile
 * should not be assessed against HIPAA — the engine treats them as N/A.
 * That gating lives in the orchestrator (engine.ts), not here.
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
// Helpers — same shape as cmmc-l1.ts
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

/**
 * Delegate to a CIS v8 evaluator; re-stamp with the HIPAA control id and
 * prefix the reasoning with the CFR citation.
 */
function delegateTo(
  cisControlId: string,
  hipaaControlId: string,
  cfrCitation: string,
  ctx: EvaluationContext
): EvaluationResult {
  const evaluator = CIS_V8_EVALUATORS[cisControlId]
  if (!evaluator) {
    return result(hipaaControlId, ctx, 'not_assessed', 'none',
      `No evaluator wired up for delegate target ${cisControlId}.`, [], [])
  }
  const cisResult = evaluator(ctx)
  return {
    ...cisResult,
    controlId: hipaaControlId,
    reasoning: `[${cfrCitation}] ${cisResult.reasoning}`,
  }
}

/**
 * Manual evaluator stub — surfaces a needs_review result so the engineer
 * has to attest based on policy uploads. Used for purely organizational
 * controls (risk analysis, BAA, workforce clearance, etc.).
 */
function manualReview(
  hipaaControlId: string,
  cfrCitation: string,
  policyExpected: string,
  ctx: EvaluationContext
): EvaluationResult {
  return result(
    hipaaControlId,
    ctx,
    'needs_review',
    'low',
    `[${cfrCitation}] This is a policy / organizational control. Verify by reviewing the customer's ${policyExpected} (upload via /admin/compliance Policy Analysis).`,
    ['it_glue_documentation', 'manual_upload'],
    [`Documented ${policyExpected.toLowerCase()}`],
    `Confirm the customer has a documented ${policyExpected.toLowerCase()} and that it has been reviewed within their declared policy review cycle.`
  )
}

// ---------------------------------------------------------------------------
// Control catalog
// ---------------------------------------------------------------------------

const HIPAA_CONTROLS: ControlDefinition[] = [
  // === §164.308 Administrative Safeguards ===

  {
    controlId: 'hipaa-308.a.1.ii.A',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 1, 1],
    category: 'Administrative — Security Management Process',
    title: 'Risk Analysis [45 CFR §164.308(a)(1)(ii)(A)]',
    description:
      'Conduct an accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of electronic protected health information held by the covered entity or business associate.',
    evidenceSources: ['manual_upload', 'it_glue_documentation'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-308.a.1.ii.B',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 1, 2],
    category: 'Administrative — Security Management Process',
    title: 'Risk Management [45 CFR §164.308(a)(1)(ii)(B)]',
    description:
      'Implement security measures sufficient to reduce risks and vulnerabilities to a reasonable and appropriate level.',
    evidenceSources: ['manual_upload', 'it_glue_documentation'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-308.a.1.ii.C',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 1, 3],
    category: 'Administrative — Security Management Process',
    title: 'Sanction Policy [45 CFR §164.308(a)(1)(ii)(C)]',
    description:
      'Apply appropriate sanctions against workforce members who fail to comply with the security policies and procedures of the covered entity or business associate.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-308.a.1.ii.D',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 1, 4],
    category: 'Administrative — Security Management Process',
    title: 'Information System Activity Review [45 CFR §164.308(a)(1)(ii)(D)]',
    description:
      'Implement procedures to regularly review records of information system activity, such as audit logs, access reports, and security incident tracking reports.',
    evidenceSources: ['microsoft_audit_log', 'saas_alerts_monitoring'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.2',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 2, 0],
    category: 'Administrative — Assigned Security Responsibility',
    title: 'Assigned Security Responsibility [45 CFR §164.308(a)(2)]',
    description:
      'Identify the security official who is responsible for the development and implementation of the policies and procedures.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-308.a.3.ii.C',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 3, 3],
    category: 'Administrative — Workforce Security',
    title: 'Termination Procedures [45 CFR §164.308(a)(3)(ii)(C)]',
    description:
      'Implement procedures for terminating access to electronic protected health information when the employment of, or other arrangement with, a workforce member ends.',
    evidenceSources: ['microsoft_users', 'microsoft_audit_log'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.4.ii.B',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 4, 2],
    category: 'Administrative — Information Access Management',
    title: 'Access Authorization [45 CFR §164.308(a)(4)(ii)(B)]',
    description:
      'Implement policies and procedures for granting access to electronic protected health information, for example, through access to a workstation, transaction, program, process, or other mechanism.',
    evidenceSources: ['microsoft_users', 'microsoft_conditional_access'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.4.ii.C',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 4, 3],
    category: 'Administrative — Information Access Management',
    title: 'Access Establishment and Modification [45 CFR §164.308(a)(4)(ii)(C)]',
    description:
      'Implement policies and procedures that, based upon the covered entity\'s or the business associate\'s access authorization policies, establish, document, review, and modify a user\'s right of access to a workstation, transaction, program, or process.',
    evidenceSources: ['microsoft_users', 'microsoft_audit_log'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.5.ii.A',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 5, 1],
    category: 'Administrative — Security Awareness and Training',
    title: 'Security Reminders [45 CFR §164.308(a)(5)(ii)(A)]',
    description: 'Periodic security updates.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-308.a.5.ii.B',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 5, 2],
    category: 'Administrative — Security Awareness and Training',
    title: 'Protection from Malicious Software [45 CFR §164.308(a)(5)(ii)(B)]',
    description:
      'Procedures for guarding against, detecting, and reporting malicious software.',
    evidenceSources: ['datto_edr_alerts', 'microsoft_defender'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.5.ii.C',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 5, 3],
    category: 'Administrative — Security Awareness and Training',
    title: 'Log-in Monitoring [45 CFR §164.308(a)(5)(ii)(C)]',
    description:
      'Procedures for monitoring log-in attempts and reporting discrepancies.',
    evidenceSources: ['microsoft_audit_log', 'saas_alerts_monitoring'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.5.ii.D',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 5, 4],
    category: 'Administrative — Security Awareness and Training',
    title: 'Password Management [45 CFR §164.308(a)(5)(ii)(D)]',
    description:
      'Procedures for creating, changing, and safeguarding passwords.',
    evidenceSources: ['microsoft_conditional_access', 'microsoft_intune_config'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.6.ii',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 6, 1],
    category: 'Administrative — Security Incident Procedures',
    title: 'Response and Reporting [45 CFR §164.308(a)(6)(ii)]',
    description:
      'Identify and respond to suspected or known security incidents; mitigate, to the extent practicable, harmful effects of security incidents that are known to the covered entity or business associate; and document security incidents and their outcomes.',
    evidenceSources: ['saas_alerts_monitoring', 'datto_edr_alerts', 'manual_upload'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.7.ii.A',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 7, 1],
    category: 'Administrative — Contingency Plan',
    title: 'Data Backup Plan [45 CFR §164.308(a)(7)(ii)(A)]',
    description:
      'Establish and implement procedures to create and maintain retrievable exact copies of electronic protected health information.',
    evidenceSources: ['datto_bcdr_backup'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.7.ii.B',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 7, 2],
    category: 'Administrative — Contingency Plan',
    title: 'Disaster Recovery Plan [45 CFR §164.308(a)(7)(ii)(B)]',
    description:
      'Establish (and implement as needed) procedures to restore any loss of data.',
    evidenceSources: ['datto_bcdr_backup', 'manual_upload'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.7.ii.D',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [308, 7, 4],
    category: 'Administrative — Contingency Plan',
    title: 'Testing and Revision Procedures [45 CFR §164.308(a)(7)(ii)(D)]',
    description:
      'Implement procedures for periodic testing and revision of contingency plans.',
    evidenceSources: ['datto_bcdr_backup', 'manual_upload'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-308.a.8',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 8, 0],
    category: 'Administrative — Evaluation',
    title: 'Evaluation [45 CFR §164.308(a)(8)]',
    description:
      'Perform a periodic technical and nontechnical evaluation, based initially upon the standards implemented under this rule and, subsequently, in response to environmental or operational changes affecting the security of electronic protected health information.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-308.b.1',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [308, 99, 1],
    category: 'Administrative — Business Associate Contracts',
    title: 'Business Associate Contracts (BAAs) [45 CFR §164.308(b)(1)]',
    description:
      'A covered entity may permit a business associate to create, receive, maintain, or transmit electronic protected health information on the covered entity\'s behalf only if the covered entity obtains satisfactory assurances that the business associate will appropriately safeguard the information.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },

  // === §164.310 Physical Safeguards ===

  {
    controlId: 'hipaa-310.a.2.ii',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [310, 1, 2],
    category: 'Physical — Facility Access Controls',
    title: 'Facility Security Plan [45 CFR §164.310(a)(2)(ii)]',
    description:
      'Implement policies and procedures to safeguard the facility and the equipment therein from unauthorized physical access, tampering, and theft.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-310.b',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [310, 2, 0],
    category: 'Physical — Workstation Use',
    title: 'Workstation Use [45 CFR §164.310(b)]',
    description:
      'Implement policies and procedures that specify the proper functions to be performed, the manner in which those functions are to be performed, and the physical attributes of the surroundings of a specific workstation or class of workstation that can access electronic protected health information.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-310.c',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [310, 3, 0],
    category: 'Physical — Workstation Security',
    title: 'Workstation Security [45 CFR §164.310(c)]',
    description:
      'Implement physical safeguards for all workstations that access electronic protected health information, to restrict access to authorized users.',
    evidenceSources: ['microsoft_intune_config', 'microsoft_bitlocker'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-310.d.2.i',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [310, 4, 1],
    category: 'Physical — Device and Media Controls',
    title: 'Disposal [45 CFR §164.310(d)(2)(i)]',
    description:
      'Implement policies and procedures to address the final disposition of electronic protected health information, and/or the hardware or electronic media on which it is stored.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-310.d.2.ii',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [310, 4, 2],
    category: 'Physical — Device and Media Controls',
    title: 'Media Re-use [45 CFR §164.310(d)(2)(ii)]',
    description:
      'Implement procedures for removal of electronic protected health information from electronic media before the media are made available for re-use.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },

  // === §164.312 Technical Safeguards ===

  {
    controlId: 'hipaa-312.a.2.i',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [312, 1, 1],
    category: 'Technical — Access Control',
    title: 'Unique User Identification [45 CFR §164.312(a)(2)(i)]',
    description:
      'Assign a unique name and/or number for identifying and tracking user identity.',
    evidenceSources: ['microsoft_users'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-312.a.2.ii',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [312, 1, 2],
    category: 'Technical — Access Control',
    title: 'Emergency Access Procedure [45 CFR §164.312(a)(2)(ii)]',
    description:
      'Establish (and implement as needed) procedures for obtaining necessary electronic protected health information during an emergency.',
    evidenceSources: ['manual_upload'],
    evaluationType: 'manual',
  },
  {
    controlId: 'hipaa-312.a.2.iii',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [312, 1, 3],
    category: 'Technical — Access Control',
    title: 'Automatic Logoff [45 CFR §164.312(a)(2)(iii)]',
    description:
      'Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity.',
    evidenceSources: ['microsoft_intune_config', 'microsoft_conditional_access'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-312.a.2.iv',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [312, 1, 4],
    category: 'Technical — Access Control',
    title: 'Encryption and Decryption [45 CFR §164.312(a)(2)(iv)]',
    description:
      'Implement a mechanism to encrypt and decrypt electronic protected health information.',
    evidenceSources: ['microsoft_bitlocker', 'microsoft_intune_config'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-312.b',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [312, 2, 0],
    category: 'Technical — Audit Controls',
    title: 'Audit Controls [45 CFR §164.312(b)]',
    description:
      'Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use electronic protected health information.',
    evidenceSources: ['microsoft_audit_log', 'saas_alerts_monitoring'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-312.c.2',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [312, 3, 2],
    category: 'Technical — Integrity',
    title: 'Mechanism to Authenticate Electronic Protected Health Information [45 CFR §164.312(c)(2)]',
    description:
      'Implement electronic mechanisms to corroborate that electronic protected health information has not been altered or destroyed in an unauthorized manner.',
    evidenceSources: ['microsoft_defender', 'datto_edr_alerts'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-312.d',
    frameworkId: 'hipaa',
    tier: 'Required',
    sortKey: [312, 4, 0],
    category: 'Technical — Person or Entity Authentication',
    title: 'Person or Entity Authentication [45 CFR §164.312(d)]',
    description:
      'Implement procedures to verify that a person or entity seeking access to electronic protected health information is the one claimed.',
    evidenceSources: ['microsoft_mfa', 'microsoft_conditional_access'],
    evaluationType: 'auto',
  },
  {
    controlId: 'hipaa-312.e.2.i',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [312, 5, 1],
    category: 'Technical — Transmission Security',
    title: 'Integrity Controls [45 CFR §164.312(e)(2)(i)]',
    description:
      'Implement security measures to ensure that electronically transmitted electronic protected health information is not improperly modified without detection until disposed of.',
    evidenceSources: ['microsoft_mail_transport', 'dnsfilter_dns'],
    evaluationType: 'semi-auto',
  },
  {
    controlId: 'hipaa-312.e.2.ii',
    frameworkId: 'hipaa',
    tier: 'Addressable',
    sortKey: [312, 5, 2],
    category: 'Technical — Transmission Security',
    title: 'Encryption (Transmission) [45 CFR §164.312(e)(2)(ii)]',
    description:
      'Implement a mechanism to encrypt electronic protected health information whenever deemed appropriate.',
    evidenceSources: ['microsoft_mail_transport'],
    evaluationType: 'semi-auto',
  },
]

export const HIPAA_FRAMEWORK: FrameworkDefinition = {
  id: 'hipaa',
  name: 'HIPAA Security Rule',
  version: '2024',
  description:
    'HIPAA Security Rule (45 CFR Part 164, Subpart C) — Administrative, Physical, and Technical Safeguards for electronic protected health information. Applies to Covered Entities and Business Associates handling ePHI.',
  controls: HIPAA_CONTROLS,
}

// ---------------------------------------------------------------------------
// Evaluators — delegate to CIS v8 where the underlying check is the same
// ---------------------------------------------------------------------------

const evaluators: Record<string, ControlEvaluator> = {}

// --- Administrative ---

evaluators['hipaa-308.a.1.ii.A'] = (ctx) =>
  manualReview('hipaa-308.a.1.ii.A', '§164.308(a)(1)(ii)(A)', 'Risk Analysis report', ctx)

evaluators['hipaa-308.a.1.ii.B'] = (ctx) =>
  manualReview('hipaa-308.a.1.ii.B', '§164.308(a)(1)(ii)(B)', 'Risk Management policy', ctx)

evaluators['hipaa-308.a.1.ii.C'] = (ctx) =>
  manualReview('hipaa-308.a.1.ii.C', '§164.308(a)(1)(ii)(C)', 'Sanction Policy', ctx)

// Information System Activity Review — maps to CIS 8.x audit log management.
evaluators['hipaa-308.a.1.ii.D'] = (ctx) =>
  delegateTo('8.2', 'hipaa-308.a.1.ii.D', '§164.308(a)(1)(ii)(D)', ctx)

evaluators['hipaa-308.a.2'] = (ctx) =>
  manualReview('hipaa-308.a.2', '§164.308(a)(2)', 'designation of the Security Officer', ctx)

// Termination Procedures — maps to CIS 6.2 (access removal).
evaluators['hipaa-308.a.3.ii.C'] = (ctx) =>
  delegateTo('6.2', 'hipaa-308.a.3.ii.C', '§164.308(a)(3)(ii)(C)', ctx)

// Access Authorization — maps to CIS 6.1 (access grants).
evaluators['hipaa-308.a.4.ii.B'] = (ctx) =>
  delegateTo('6.1', 'hipaa-308.a.4.ii.B', '§164.308(a)(4)(ii)(B)', ctx)

// Access Establishment and Modification — maps to CIS 6.7 (centralized access).
evaluators['hipaa-308.a.4.ii.C'] = (ctx) =>
  delegateTo('6.7', 'hipaa-308.a.4.ii.C', '§164.308(a)(4)(ii)(C)', ctx)

evaluators['hipaa-308.a.5.ii.A'] = (ctx) =>
  manualReview('hipaa-308.a.5.ii.A', '§164.308(a)(5)(ii)(A)', 'security reminders program', ctx)

// Protection from Malicious Software — maps to CIS 10.1 (anti-malware deployed).
evaluators['hipaa-308.a.5.ii.B'] = (ctx) =>
  delegateTo('10.1', 'hipaa-308.a.5.ii.B', '§164.308(a)(5)(ii)(B)', ctx)

// Log-in Monitoring — maps to CIS 8.5 (collect detailed audit logs).
evaluators['hipaa-308.a.5.ii.C'] = (ctx) =>
  delegateTo('8.5', 'hipaa-308.a.5.ii.C', '§164.308(a)(5)(ii)(C)', ctx)

// Password Management — maps to CIS 5.2 (password policy).
evaluators['hipaa-308.a.5.ii.D'] = (ctx) =>
  delegateTo('5.2', 'hipaa-308.a.5.ii.D', '§164.308(a)(5)(ii)(D)', ctx)

// Security Incident Response — semi-auto from SaaS Alerts / EDR signal volume.
evaluators['hipaa-308.a.6.ii'] = (ctx) =>
  delegateTo('17.5', 'hipaa-308.a.6.ii', '§164.308(a)(6)(ii)', ctx)

// Data Backup Plan — maps to CIS 11.1 (establish backup process).
evaluators['hipaa-308.a.7.ii.A'] = (ctx) =>
  delegateTo('11.1', 'hipaa-308.a.7.ii.A', '§164.308(a)(7)(ii)(A)', ctx)

// Disaster Recovery Plan — maps to CIS 11.5 (test backup recovery).
evaluators['hipaa-308.a.7.ii.B'] = (ctx) =>
  delegateTo('11.5', 'hipaa-308.a.7.ii.B', '§164.308(a)(7)(ii)(B)', ctx)

// Contingency Testing — also CIS 11.5.
evaluators['hipaa-308.a.7.ii.D'] = (ctx) =>
  delegateTo('11.5', 'hipaa-308.a.7.ii.D', '§164.308(a)(7)(ii)(D)', ctx)

evaluators['hipaa-308.a.8'] = (ctx) =>
  manualReview('hipaa-308.a.8', '§164.308(a)(8)', 'periodic technical/nontechnical evaluation', ctx)

evaluators['hipaa-308.b.1'] = (ctx) =>
  manualReview('hipaa-308.b.1', '§164.308(b)(1)', 'Business Associate Agreements (BAAs)', ctx)

// --- Physical ---

evaluators['hipaa-310.a.2.ii'] = (ctx) =>
  manualReview('hipaa-310.a.2.ii', '§164.310(a)(2)(ii)', 'Facility Security Plan', ctx)

evaluators['hipaa-310.b'] = (ctx) =>
  manualReview('hipaa-310.b', '§164.310(b)', 'Workstation Use policy', ctx)

// Workstation Security — maps to CIS 4.x (secure configuration) + 3.6 (encrypt data on end-user devices).
evaluators['hipaa-310.c'] = (ctx) =>
  delegateTo('3.6', 'hipaa-310.c', '§164.310(c)', ctx)

evaluators['hipaa-310.d.2.i'] = (ctx) =>
  manualReview('hipaa-310.d.2.i', '§164.310(d)(2)(i)', 'data disposal procedure', ctx)

evaluators['hipaa-310.d.2.ii'] = (ctx) =>
  manualReview('hipaa-310.d.2.ii', '§164.310(d)(2)(ii)', 'media re-use sanitization procedure', ctx)

// --- Technical ---

// Unique User Identification — maps to CIS 5.1 (account inventory).
evaluators['hipaa-312.a.2.i'] = (ctx) =>
  delegateTo('5.1', 'hipaa-312.a.2.i', '§164.312(a)(2)(i)', ctx)

evaluators['hipaa-312.a.2.ii'] = (ctx) =>
  manualReview('hipaa-312.a.2.ii', '§164.312(a)(2)(ii)', 'emergency access procedure', ctx)

// Automatic Logoff — maps to CIS 4.3 (session lock).
evaluators['hipaa-312.a.2.iii'] = (ctx) =>
  delegateTo('4.3', 'hipaa-312.a.2.iii', '§164.312(a)(2)(iii)', ctx)

// Encryption and Decryption — maps to CIS 3.6 (encrypt data on end-user devices).
evaluators['hipaa-312.a.2.iv'] = (ctx) =>
  delegateTo('3.6', 'hipaa-312.a.2.iv', '§164.312(a)(2)(iv)', ctx)

// Audit Controls — maps to CIS 8.2 (collect audit logs).
evaluators['hipaa-312.b'] = (ctx) =>
  delegateTo('8.2', 'hipaa-312.b', '§164.312(b)', ctx)

// Integrity Mechanism — maps to CIS 10.x (malware defenses).
evaluators['hipaa-312.c.2'] = (ctx) =>
  delegateTo('10.1', 'hipaa-312.c.2', '§164.312(c)(2)', ctx)

// Person or Entity Authentication — maps to CIS 6.3 (MFA for externally exposed accounts).
evaluators['hipaa-312.d'] = (ctx) =>
  delegateTo('6.3', 'hipaa-312.d', '§164.312(d)', ctx)

// Transmission integrity — maps to CIS 9.6 (block unnecessary file types).
evaluators['hipaa-312.e.2.i'] = (ctx) =>
  delegateTo('9.6', 'hipaa-312.e.2.i', '§164.312(e)(2)(i)', ctx)

// Transmission encryption — maps to CIS 3.10 (encrypt sensitive data in transit).
evaluators['hipaa-312.e.2.ii'] = (ctx) =>
  delegateTo('3.10', 'hipaa-312.e.2.ii', '§164.312(e)(2)(ii)', ctx)

export const HIPAA_EVALUATORS: Record<string, ControlEvaluator> = evaluators
