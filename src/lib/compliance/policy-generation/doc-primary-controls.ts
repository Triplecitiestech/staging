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
 * Keys use `${frameworkId}::${shortControlId}` format. Framework ids
 * use the base form (cis-v8, hipaa, etc.) — IG variants are stripped
 * before lookup.
 *
 * Curation rule: include only when "the operator publishing a written
 * policy alone WOULD satisfy this control without any technical
 * tenant changes." Skip when a technical change is required even
 * with the policy in place.
 *
 * Not-yet-curated frameworks (hipaa, nist-800-171, cmmc-*, pci):
 * the suppression is a no-op for those, so policy-generate keeps
 * its existing behavior. Promote them into the allowlist when
 * we've done the per-control review.
 */

export const DOC_PRIMARY_CONTROL_KEYS: ReadonlySet<string> = new Set([
  // ============ CIS Controls v8 ============
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
])

/**
 * Whether the policy.generate_for_control Remediate option should
 * surface for a given control. Returns true when documentation IS
 * the primary fix for this control, or when the framework hasn't
 * been curated yet (fail-open during the rollout — better to over-
 * offer than to hide a valid option). Strip the IG suffix on the
 * framework before lookup since IG variants reuse the base framework's
 * control ids.
 */
export function isDocumentationPrimaryControl(frameworkId: string, shortControlId: string): boolean {
  const baseFramework = frameworkId.replace(/-ig\d+$/, '')
  const CURATED_FRAMEWORKS = new Set(['cis-v8'])
  if (!CURATED_FRAMEWORKS.has(baseFramework)) {
    // Framework not yet curated — preserve existing behavior so we
    // don't silently hide options for HIPAA / NIST / CMMC / PCI.
    return true
  }
  return DOC_PRIMARY_CONTROL_KEYS.has(`${baseFramework}::${shortControlId}`)
}
