/**
 * Hand-curated allowlist of controls where a WRITTEN DOCUMENTATION
 * POLICY is the primary remediation — not a technical fix.
 *
 * Operator caught a real flaw: the original logic surfaced the
 * `policy.generate_for_control` Remediate option for every control
 * that had any FRAMEWORK_POLICY_MAPPINGS entry. That over-fired
 * badly. Example: CIS v8 control 2.3 "Address Unauthorized Software"
 * needs an Intune compliance policy (technical), but the policy
 * catalog has a "Software Management Policy" doc that nominally
 * "covers" it — so Remediate showed "Generate Software Management
 * Policy" as the fix. It isn't. The doc is supplementary at best;
 * the actual control is satisfied by Intune blocking non-compliant
 * devices.
 *
 * This allowlist lists controls where the AI evaluator's "suggested
 * remediation" actually IS "write/maintain a documented policy or
 * procedure" — accounts management process, incident response plan,
 * security awareness program, etc. For everything else, the
 * `policy.generate_for_control` action is hidden from the Remediate
 * picker (the operator can still create the supplementary doc
 * manually on step 4 if they want).
 *
 * Curation rule: include only when "the operator publishing a written
 * policy alone WOULD satisfy this control without any technical
 * tenant changes." Skip when a technical change is required even
 * with the policy in place.
 *
 * Keys use `${baseFramework}::${shortControlId}` format. The lookup
 * (`isDocumentationPrimaryControl`) accepts either the raw or
 * prefixed control id and tries both forms against this set, so
 * curation entries can use the shorter framework-native form.
 *
 * Curated forms per framework:
 *   cis-v8         — '1.1', '14.2', '17.4'
 *   hipaa          — '164.308-a1', '164.502'        (full CFR section)
 *   nist-800-171   — '3.1.1', '3.6.1'              (NIST control id)
 *   cmmc-l1        — 'AC.L1-b.1.i'                  (CMMC practice id)
 *   cmmc-l2        — 'AC.L2-3.1.1'                  (CMMC practice id)
 *   pci-dss-v4     — no mappings exist yet; framework is marked curated
 *                    so the suppression is a no-op (the doc-primary set
 *                    just doesn't have entries to match).
 */

export const DOC_PRIMARY_CONTROL_KEYS: ReadonlySet<string> = new Set([
  // =====================================================================
  // CIS Controls v8
  // =====================================================================
  // 3.x Data Protection — process documentation is the primary fix
  'cis-v8::3.1', // Establish and Maintain a Data Management Process
  'cis-v8::3.5', // Securely Dispose of Data (procedure docs the primary fix)

  // 14.x Security Awareness — training PROGRAM is the policy
  'cis-v8::14.1', // Establish and Maintain a Security Awareness Program
  'cis-v8::14.2', // Train Workforce — Social Engineering
  'cis-v8::14.3', // Train Workforce — Authentication Best Practices
  'cis-v8::14.4', // Train Workforce — Data Handling
  'cis-v8::14.5', // Train Workforce — Unintentional Exposure
  'cis-v8::14.6', // Train Workforce — Recognizing & Reporting Incidents
  'cis-v8::14.7', // Train Workforce — Identify Sensitive Info
  'cis-v8::14.8', // Train Workforce — Threat Recognition
  'cis-v8::14.9', // Role-Specific Security Awareness

  // 15.x Service Provider Management — policy + contracts ARE the control
  'cis-v8::15.2', // Establish a Service Provider Management Policy
  'cis-v8::15.4', // Ensure Service Provider Contracts Address Requirements

  // 16.x Application Security
  'cis-v8::16.1', // Establish and Maintain a Secure Application Development Process

  // 17.x Incident Response Management — IR plan IS the control
  'cis-v8::17.1', // Designate Personnel for Incident Handling
  'cis-v8::17.2', // Establish Contacts for Incident Reporting
  'cis-v8::17.3', // Establish an Enterprise Process for Reporting Incidents
  'cis-v8::17.4', // Establish and Maintain an Incident Response Process
  'cis-v8::17.5', // Assign Key Roles and Responsibilities (IR)
  'cis-v8::17.6', // Define Mechanisms for Communicating During Incidents
  'cis-v8::17.7', // Conduct Routine Incident Response Exercises
  'cis-v8::17.8', // Conduct Post-Incident Reviews
  'cis-v8::17.9', // Establish and Maintain Security Incident Thresholds

  // =====================================================================
  // HIPAA Security Rule
  //
  // HIPAA is policy-and-procedure heavy by design. The Security Rule's
  // Administrative Safeguards (§164.308) are almost entirely process
  // mandates; Technical Safeguards (§164.312) are the opposite —
  // they call for technical enforcement (encryption, MFA, audit logs).
  // Privacy + breach-notification rules are again policy mandates.
  // =====================================================================

  // Administrative Safeguards — process / policy mandates
  'hipaa::164.308-a1', // Security Management Process (incl. risk analysis)
  'hipaa::164.308-a2', // Assigned Security Responsibility
  'hipaa::164.308-a3', // Workforce Security
  'hipaa::164.308-a4', // Information Access Management
  'hipaa::164.308-a5', // Security Awareness and Training (program IS the control)
  'hipaa::164.308-a6', // Security Incident Procedures (IR plan IS the control)
  'hipaa::164.308-a7', // Contingency Plan (DR plan IS the control)
  'hipaa::164.308-a8', // Evaluation
  'hipaa::164.308-b1', // Business Associate Contracts (templates ARE the control)

  // Physical Safeguards — workforce procedures with technical assists.
  // The procedure mandate is the primary deliverable; lock + camera
  // installs are operational follow-through.
  'hipaa::164.310-a1', // Facility Access Controls
  'hipaa::164.310-d1', // Device and Media Controls

  // §164.312 Technical Safeguards intentionally OMITTED — these require
  // tenant configuration (encryption, audit logging, MFA, TLS) that the
  // policy text alone cannot effect.
  //
  //   164.312-a1   Access Control          — technical (RBAC / account lock)
  //   164.312-b    Audit Controls          — technical (log collection)
  //   164.312-a2iv Encryption + Decryption — technical (BitLocker / TLS)
  //   164.312-d    Person/Entity Auth      — technical (MFA)
  //   164.312-e1   Transmission Security   — technical (TLS)

  // Privacy Rule — notice + use-and-disclosure procedure mandates
  'hipaa::164.502', // Uses and Disclosures of PHI
  'hipaa::164.514', // Minimum Necessary
  'hipaa::164.520', // Notice of Privacy Practices (the notice IS the doc)

  // Breach Notification Rule — process mandate
  'hipaa::164.404', // Breach Notification to Individuals

  // =====================================================================
  // NIST SP 800-171
  //
  // 800-171 weighs heavier toward technical enforcement than HIPAA. The
  // doc-primary slice is awareness (3.2.x), incident response (3.6.x),
  // configuration baselining (3.4.1 / 3.4.3), media handling (3.8.x
  // procedural pieces), risk assessment (3.11.1), and the SSP / POA&M
  // (3.12.1 / 3.12.4). Access control, crypto, audit, scanning, and
  // boundary protection are all technical and excluded.
  // =====================================================================
  'nist-800-171::3.2.1', // Security awareness — risks personnel face
  'nist-800-171::3.2.2', // Train personnel to carry out duties
  'nist-800-171::3.2.3', // Insider threat awareness
  'nist-800-171::3.4.1', // Establish baseline configurations (process)
  'nist-800-171::3.4.3', // Track / review / approve changes (change-mgmt process)
  'nist-800-171::3.6.1', // Operational incident-handling capability (IR plan)
  'nist-800-171::3.6.2', // Track / document / report incidents
  'nist-800-171::3.7.1', // Maintenance procedure
  'nist-800-171::3.8.1', // Protect system media (handling procedure)
  'nist-800-171::3.8.3', // Sanitize media before disposal (procedure)
  'nist-800-171::3.9.2', // CUI protection during personnel actions (offboarding procedure)
  'nist-800-171::3.11.1', // Periodically assess risk (risk assessment IS the doc)
  'nist-800-171::3.12.1', // Periodically assess security controls (assessment process)
  'nist-800-171::3.12.4', // Plans of action and milestones (POA&M doc)

  // 800-171 technical controls intentionally OMITTED:
  //   3.1.* access control / remote access / mobile encryption — technical
  //   3.3.* audit log creation + traceability                   — technical
  //   3.4.6 least functionality                                 — technical (CIS hardening)
  //   3.5.* identification / authentication / MFA                — technical
  //   3.8.6 cryptographic mechanisms for portable storage        — technical
  //   3.10.* physical access (mostly facility + technical)       — technical/physical
  //   3.11.2 vulnerability scanning                              — technical (scanner)
  //   3.13.* boundary protection / cryptographic mechanisms      — technical
  //   3.14.* malicious code / monitoring                         — technical (EDR / SIEM)

  // =====================================================================
  // CMMC Level 1 (basic safeguarding)
  //
  // L1 is small — five mapped practices. Physical access and media
  // disposal are procedure-led; the other three are technical.
  // =====================================================================
  'cmmc-l1::PE.L1-b.1.iii', // Physical Access (procedure + facility controls)
  'cmmc-l1::MP.L1-b.1.iv',  // Media Disposal (procedure IS the control)

  // L1 technical controls intentionally OMITTED:
  //   AC.L1-b.1.i   Authorized Access Control   — technical (RBAC)
  //   IA.L1-b.1.v   Identification              — technical
  //   SI.L1-b.1.vi  Malicious Code Protection   — technical (AV/EDR)

  // =====================================================================
  // CMMC Level 2
  //
  // L2 mirrors the NIST 800-171 split: awareness, incident response,
  // baselining, maintenance, media sanitization, risk assessment,
  // and security control assessment are doc-primary. Access control,
  // auditing, MFA, encryption, boundary protection, malware
  // defenses, and patching are technical.
  // =====================================================================
  'cmmc-l2::AT.L2-3.2.1',   // Role-Based Risk Awareness (training plan)
  'cmmc-l2::CM.L2-3.4.1',   // System Baselining (process)
  'cmmc-l2::IR.L2-3.6.1',   // Incident Handling (IR plan)
  'cmmc-l2::MA.L2-3.7.1',   // System Maintenance (process)
  'cmmc-l2::MP.L2-3.8.3',   // Media Sanitization (procedure)
  'cmmc-l2::RA.L2-3.11.1',  // Risk Assessments
  'cmmc-l2::CA.L2-3.12.1',  // Security Control Assessment

  // L2 technical controls intentionally OMITTED:
  //   AC.L2-3.1.1    Authorized Access Control     — technical
  //   AC.L2-3.1.12   Remote Access Control         — technical
  //   AU.L2-3.3.1    System Auditing               — technical
  //   IA.L2-3.5.3    MFA                            — technical
  //   PE.L2-3.10.1   Physical Access Limitation    — technical/physical
  //   SC.L2-3.13.1   Boundary Protection           — technical
  //   SC.L2-3.13.8   CUI Encryption                — technical
  //   SC.L2-3.13.16  CUI at Rest                   — technical
  //   SI.L2-3.14.1   Flaw Remediation              — technical (patching)
  //   SI.L2-3.14.2   Malicious Code Protection     — technical (EDR)

  // =====================================================================
  // PCI DSS v4
  //
  // No PCI mappings exist in framework-mappings.ts yet — adding pci-dss-v4
  // here so the suppression is opt-in for the framework even though
  // there are no entries to match against right now. When PCI mappings
  // land, curate them here using the same rule: doc-primary = policy
  // alone satisfies the requirement without technical change.
  // =====================================================================
])

/**
 * Frameworks whose doc-primary curation has been hand-reviewed.
 * When a framework is NOT in this set, the lookup fails-open and
 * returns true for every control so the Remediate picker doesn't
 * silently hide options during the rollout.
 *
 * Promote a framework here only after walking every entry in
 * framework-mappings.ts for it and deciding doc-primary vs technical.
 */
const CURATED_FRAMEWORKS = new Set<string>([
  'cis-v8',
  'hipaa',
  'nist-800-171',
  'cmmc-l1',
  'cmmc-l2',
  'pci-dss-v4',
])

/**
 * The framework→control-id-prefix relationship isn't 1:1. The
 * `framework-mappings.ts` file stores ids like `cis-v8-1.1`, `hipaa-164.308-a1`,
 * `nist-3.1.1` (NOT `nist-800-171-3.1.1`!), `cmmc-AC.L2-3.1.1`. The
 * findings page's regex-strip only works for the CIS form; for HIPAA /
 * NIST / CMMC it returns the input unchanged, which breaks short-form
 * lookup. So we run the lookup against both the raw and a list of
 * explicit prefix-strip candidates.
 */
const STRIP_PREFIXES_BY_FRAMEWORK: Record<string, readonly string[]> = {
  'cis-v8': ['cis-v8-'],
  'hipaa': ['hipaa-'],
  'nist-800-171': ['nist-800-171-', 'nist-'],
  'cmmc-l1': ['cmmc-l1-', 'cmmc-'],
  'cmmc-l2': ['cmmc-l2-', 'cmmc-'],
  'pci-dss-v4': ['pci-dss-v4-', 'pci-dss-', 'pci-'],
}

/**
 * Whether the policy.generate_for_control Remediate option should
 * surface for a given control. Returns true when documentation IS
 * the primary fix for this control, or when the framework hasn't
 * been curated yet (fail-open during the rollout — better to over-
 * offer than to hide a valid option). IG suffix is stripped from
 * the framework id since IG variants reuse the base framework's
 * control ids.
 */
export function isDocumentationPrimaryControl(frameworkId: string, controlId: string): boolean {
  const baseFramework = frameworkId.replace(/-ig\d+$/, '')
  if (!CURATED_FRAMEWORKS.has(baseFramework)) {
    // Framework not yet curated — preserve over-offering behavior so
    // we don't silently hide options.
    return true
  }

  // Direct match on the id as the caller passed it.
  if (DOC_PRIMARY_CONTROL_KEYS.has(`${baseFramework}::${controlId}`)) return true

  // Try the controlId with each known framework prefix stripped. This
  // handles findings stored in the prefixed form (`hipaa-164.308-a1`)
  // while curation uses the short form (`164.308-a1`).
  const prefixes = STRIP_PREFIXES_BY_FRAMEWORK[baseFramework] ?? [`${baseFramework}-`]
  for (const prefix of prefixes) {
    if (controlId.startsWith(prefix)) {
      const stripped = controlId.slice(prefix.length)
      if (DOC_PRIMARY_CONTROL_KEYS.has(`${baseFramework}::${stripped}`)) return true
      // Only consume the longest matching prefix to keep the logic
      // deterministic — later prefixes are shorter fallbacks.
      break
    }
  }

  return false
}
