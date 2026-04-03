/**
 * Policy Generation System — Questionnaire / Intake Engine
 *
 * Two-tier question system:
 * 1. Organization Profile — global answers shared across all policies
 * 2. Policy-Specific Questions — only asked when generating a specific policy
 *
 * Questions are adaptive: some are conditional on previous answers.
 * Answers from the org profile auto-fill into policy-specific prompts.
 *
 * Design principles:
 * - Every question must materially change the generated policy text
 * - Questions already answered by the compliance evidence engine (tool data)
 *   are tagged with `autoFillSource` for future auto-fill from collected evidence
 * - No duplicate questions — if data is captured in the org profile, the
 *   policy generator uses it directly (no re-asking in policy-specific section)
 * - Questions are grouped visually within sections for easier scanning
 */

import type { QuestionDefinition } from './types'

// ---------------------------------------------------------------------------
// Organization Profile Questions (asked once, reused across all policies)
// ---------------------------------------------------------------------------

export const ORG_PROFILE_QUESTIONS: QuestionDefinition[] = [
  // --- Company Identity ---
  { id: 'org_legal_name', section: 'org-profile', group: 'Company Identity', label: 'Company Legal Name', type: 'text', required: true, sortOrder: 1 },
  { id: 'org_address', section: 'org-profile', group: 'Company Identity', label: 'Headquarters Address', type: 'text', required: true, sortOrder: 2 },
  { id: 'org_states', section: 'org-profile', group: 'Company Identity', label: 'States/Countries of Operation', helpText: 'List all states or countries where the company operates, one per line. Affects breach notification requirements.', type: 'textarea', required: false, sortOrder: 3 },
  { id: 'org_industry', section: 'org-profile', group: 'Company Identity', label: 'Industry', type: 'select', required: true, sortOrder: 4, options: [
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'manufacturing', label: 'Manufacturing' },
    { value: 'finance', label: 'Financial Services' },
    { value: 'government', label: 'Government / Public Sector' },
    { value: 'defense', label: 'Defense / Aerospace' },
    { value: 'education', label: 'Education' },
    { value: 'legal', label: 'Legal Services' },
    { value: 'technology', label: 'Technology' },
    { value: 'retail', label: 'Retail' },
    { value: 'nonprofit', label: 'Non-Profit' },
    { value: 'other', label: 'Other' },
  ]},
  { id: 'org_employee_count', section: 'org-profile', group: 'Company Identity', label: 'Approximate Employee Count', type: 'select', required: true, sortOrder: 5, options: [
    { value: '1-25', label: '1-25' },
    { value: '26-100', label: '26-100' },
    { value: '101-500', label: '101-500' },
    { value: '501-1000', label: '501-1,000' },
    { value: '1000+', label: '1,000+' },
  ]},

  // --- Regulatory Scope ---
  { id: 'org_handles_phi', section: 'org-profile', group: 'Regulatory Scope', label: 'Does the organization handle Protected Health Information (PHI)?', type: 'boolean', required: true, sortOrder: 10 },
  { id: 'org_handles_pii', section: 'org-profile', group: 'Regulatory Scope', label: 'Does the organization handle Personally Identifiable Information (PII)?', type: 'boolean', required: true, sortOrder: 11 },
  { id: 'org_handles_cui', section: 'org-profile', group: 'Regulatory Scope', label: 'Does the organization handle Controlled Unclassified Information (CUI)?', type: 'boolean', required: true, sortOrder: 12 },

  // --- Operational Context ---
  { id: 'org_remote_work', section: 'org-profile', group: 'Operational Context', label: 'Is remote work allowed?', type: 'select', required: true, sortOrder: 20, options: [
    { value: 'no', label: 'No — all onsite' },
    { value: 'hybrid', label: 'Hybrid (some remote, some onsite)' },
    { value: 'full_remote', label: 'Fully remote' },
  ]},
  { id: 'org_byod_allowed', section: 'org-profile', group: 'Operational Context', label: 'Are personal devices (BYOD) allowed for work?', type: 'select', required: true, sortOrder: 21, options: [
    { value: 'no', label: 'No — company-issued devices only' },
    { value: 'yes_managed', label: 'Yes — with MDM/management required' },
    { value: 'yes_unmanaged', label: 'Yes — no management required' },
  ]},
  { id: 'org_contractors', section: 'org-profile', group: 'Operational Context', label: 'Does the organization use contractors or temporary workers?', type: 'boolean', required: true, sortOrder: 22 },

  // --- Security Posture: Endpoint Security ---
  { id: 'org_edr_deployed', section: 'org-profile', group: 'Endpoint Security', label: 'Is Endpoint Detection and Response (EDR) deployed?', type: 'boolean', required: false, sortOrder: 30, autoFillSource: 'datto_edr_alerts' },
  { id: 'org_encryption_at_rest', section: 'org-profile', group: 'Endpoint Security', label: 'Is full-disk encryption deployed on endpoints?', type: 'boolean', required: false, sortOrder: 31, autoFillSource: 'microsoft_bitlocker' },
  { id: 'org_mdm_deployed', section: 'org-profile', group: 'Endpoint Security', label: 'Is a Mobile Device Management (MDM) solution deployed?', helpText: 'Intune, JAMF, or similar. Used for BYOD and device compliance policies.', type: 'boolean', required: false, sortOrder: 32, autoFillSource: 'microsoft_device_compliance', conditional: { questionId: 'org_byod_allowed', value: 'yes_managed' } },

  // --- Security Posture: Network & Monitoring ---
  { id: 'org_dns_filtering', section: 'org-profile', group: 'Network & Monitoring', label: 'Is DNS filtering deployed?', type: 'boolean', required: false, sortOrder: 35, autoFillSource: 'dnsfilter_dns' },
  { id: 'org_siem_deployed', section: 'org-profile', group: 'Network & Monitoring', label: 'Is a SIEM or security monitoring platform deployed?', helpText: 'e.g., RocketCyber, Huntress, Blackpoint, SaaS Alerts — any tool providing centralized security event monitoring.', type: 'boolean', required: false, sortOrder: 36, autoFillSource: 'saas_alerts_monitoring' },
  { id: 'org_mfa_status', section: 'org-profile', group: 'Network & Monitoring', label: 'MFA deployment status', type: 'select', required: true, sortOrder: 37, autoFillSource: 'microsoft_mfa', options: [
    { value: 'full', label: 'MFA enabled for all users' },
    { value: 'admins', label: 'MFA enabled for admins only' },
    { value: 'partial', label: 'MFA partially deployed' },
    { value: 'none', label: 'No MFA' },
  ]},
  { id: 'org_backup_type', section: 'org-profile', group: 'Network & Monitoring', label: 'What backup solution is in place?', type: 'select', required: false, sortOrder: 38, autoFillSource: 'datto_bcdr_backup', options: [
    { value: 'cloud', label: 'Cloud-only backups (e.g., Datto SaaS Protection)' },
    { value: 'hybrid', label: 'Hybrid (cloud + local/BCDR appliance)' },
    { value: 'local', label: 'Local backups only' },
    { value: 'none', label: 'No formal backup solution' },
  ]},

  // --- Governance: People & Roles ---
  { id: 'org_security_officer', section: 'org-profile', group: 'People & Roles', label: 'Security Officer / CISO', helpText: 'Person or role responsible for information security. Appears in policy headers and responsibility sections.', type: 'text', required: false, sortOrder: 40 },
  { id: 'org_policy_owner', section: 'org-profile', group: 'People & Roles', label: 'Default Policy Owner', helpText: 'Person or role who owns and approves policies. Leave blank if same as Security Officer.', type: 'text', required: false, sortOrder: 41 },
  { id: 'org_incident_contacts', section: 'org-profile', group: 'People & Roles', label: 'Incident Response Contact(s)', helpText: 'Name, role, phone — used in the Incident Response Policy escalation chain. One contact per line.', type: 'textarea', required: false, sortOrder: 42 },

  // --- Governance: Review Cadences ---
  { id: 'org_policy_review_cycle', section: 'org-profile', group: 'Review Cadences', label: 'Policy Review Cycle', helpText: 'How often are written policies formally reviewed and updated?', type: 'select', required: false, sortOrder: 45, options: [
    { value: 'annual', label: 'Annual' },
    { value: 'semi-annual', label: 'Semi-Annual' },
    { value: 'quarterly', label: 'Quarterly' },
  ]},
  { id: 'org_risk_assessment_cadence', section: 'org-profile', group: 'Review Cadences', label: 'Risk Assessment Cadence', helpText: 'How often does the company formally assess security risks to its systems and data?', type: 'select', required: false, sortOrder: 46, options: [
    { value: 'annual', label: 'Annual' },
    { value: 'semi-annual', label: 'Semi-Annual' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'never', label: 'Not currently conducted' },
  ]},
  { id: 'org_training_cadence', section: 'org-profile', group: 'Review Cadences', label: 'Security Awareness Training Cadence', helpText: 'How often do employees complete security awareness training?', type: 'select', required: false, sortOrder: 47, options: [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
    { value: 'onboarding_only', label: 'During onboarding only' },
    { value: 'never', label: 'Not currently conducted' },
  ]},
  { id: 'org_access_review_cadence', section: 'org-profile', group: 'Review Cadences', label: 'User Access Review Cadence', helpText: 'How often are user accounts and permissions reviewed for appropriateness?', type: 'select', required: false, sortOrder: 48, options: [
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'semi-annual', label: 'Semi-Annual' },
    { value: 'annual', label: 'Annual' },
    { value: 'never', label: 'Not currently conducted' },
  ]},

  // --- Governance: Processes ---
  { id: 'org_disciplinary_process', section: 'org-profile', group: 'Processes', label: 'How are policy violations handled?', type: 'select', required: false, sortOrder: 50, options: [
    { value: 'progressive', label: 'Progressive discipline (warning → write-up → termination)' },
    { value: 'hr_referral', label: 'Referred to HR on case-by-case basis' },
    { value: 'not_defined', label: 'Not currently defined' },
  ]},
  { id: 'org_exception_process', section: 'org-profile', group: 'Processes', label: 'Is there a formal policy exception process?', helpText: 'When someone needs an exception to a security policy, is there a documented approval process?', type: 'boolean', required: false, sortOrder: 51 },

  // --- AI / Technology ---
  { id: 'org_ai_tools_used', section: 'org-profile', group: 'AI & Technology', label: 'Are AI tools (ChatGPT, Copilot, etc.) in use?', type: 'select', required: false, sortOrder: 55, options: [
    { value: 'yes_approved', label: 'Yes — approved tools only' },
    { value: 'yes_uncontrolled', label: 'Yes — no formal controls' },
    { value: 'no', label: 'No' },
    { value: 'evaluating', label: 'Currently evaluating' },
  ]},

  // --- Vendor / Third-Party ---
  { id: 'org_vendor_review_process', section: 'org-profile', group: 'Vendor & Data', label: 'Is there a vendor security review process?', type: 'boolean', required: false, sortOrder: 60 },
  { id: 'org_data_retention_years', section: 'org-profile', group: 'Vendor & Data', label: 'Default data retention period', type: 'select', required: false, sortOrder: 61, options: [
    { value: '1', label: '1 year' },
    { value: '3', label: '3 years' },
    { value: '5', label: '5 years' },
    { value: '7', label: '7 years' },
    { value: '10', label: '10 years' },
    { value: 'varies', label: 'Varies by data type' },
  ]},
]

// ---------------------------------------------------------------------------
// Policy-Specific Questions (asked only when generating that policy)
// ---------------------------------------------------------------------------

export const POLICY_SPECIFIC_QUESTIONS: QuestionDefinition[] = [
  // --- Acceptable Use ---
  { id: 'aup_personal_use_allowed', section: 'acceptable-use-policy', label: 'Is limited personal use of company equipment allowed?', type: 'boolean', required: true, sortOrder: 1 },
  { id: 'aup_social_media_allowed', section: 'acceptable-use-policy', label: 'Is social media access allowed during work?', type: 'select', required: false, sortOrder: 2, options: [
    { value: 'blocked', label: 'Blocked' },
    { value: 'limited', label: 'Limited / specific sites' },
    { value: 'unrestricted', label: 'Unrestricted' },
  ]},
  { id: 'aup_monitoring_notice', section: 'acceptable-use-policy', label: 'Does the company monitor employee internet/email activity?', type: 'boolean', required: true, sortOrder: 3 },

  // --- Incident Response ---
  // NOTE: Escalation contacts come from org_incident_contacts in the org profile.
  // No duplicate question needed here — the generator injects them automatically.
  { id: 'ir_notification_requirements', section: 'incident-response-policy', label: 'Are there regulatory breach notification requirements?', type: 'multi-select', required: false, sortOrder: 1, options: [
    { value: 'hipaa', label: 'HIPAA (60 days)' },
    { value: 'state', label: 'State breach notification laws' },
    { value: 'dfars', label: 'DFARS/CMMC (72 hours DoD)' },
    { value: 'none', label: 'No specific requirements' },
  ]},
  { id: 'ir_forensics_partner', section: 'incident-response-policy', label: 'Is there a contracted forensics/IR partner?', helpText: 'Company name, or leave blank if none', type: 'text', required: false, sortOrder: 2 },
  { id: 'ir_cyber_insurance', section: 'incident-response-policy', label: 'Does the company have cyber insurance?', type: 'boolean', required: false, sortOrder: 3 },

  // --- Backup / DR ---
  { id: 'bdr_rto', section: 'backup-disaster-recovery-policy', label: 'Target Recovery Time Objective (RTO)', helpText: 'Maximum acceptable downtime after a disaster', type: 'select', required: false, sortOrder: 1, options: [
    { value: '1h', label: '1 hour' },
    { value: '4h', label: '4 hours' },
    { value: '8h', label: '8 hours (business day)' },
    { value: '24h', label: '24 hours' },
    { value: '72h', label: '72 hours' },
  ]},
  { id: 'bdr_rpo', section: 'backup-disaster-recovery-policy', label: 'Target Recovery Point Objective (RPO)', helpText: 'Maximum acceptable data loss (how far back the last good backup is)', type: 'select', required: false, sortOrder: 2, options: [
    { value: '1h', label: '1 hour (no more than 1 hour of data loss)' },
    { value: '4h', label: '4 hours' },
    { value: '24h', label: '24 hours' },
  ]},
  { id: 'bdr_test_frequency', section: 'backup-disaster-recovery-policy', label: 'How often are backup restore tests performed?', type: 'select', required: false, sortOrder: 3, options: [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'semi-annual', label: 'Semi-Annual' },
    { value: 'annual', label: 'Annual' },
    { value: 'never', label: 'Not currently tested' },
  ]},

  // --- HIPAA-specific ---
  { id: 'hipaa_privacy_officer', section: 'hipaa-privacy-policy', label: 'HIPAA Privacy Officer name and contact', type: 'text', required: true, sortOrder: 1 },
  { id: 'hipaa_phi_systems', section: 'hipaa-security-policy', label: 'List systems that store/process ePHI', helpText: 'e.g., EHR, patient portal, billing system — one per line', type: 'textarea', required: true, sortOrder: 1 },
  { id: 'hipaa_ba_count', section: 'hipaa-security-policy', label: 'Approximate number of Business Associates', type: 'text', required: false, sortOrder: 2 },

  // --- Remote Access ---
  { id: 'ra_vpn_type', section: 'remote-access-policy', label: 'VPN solution in use', helpText: 'e.g., Cisco AnyConnect, WireGuard, Tailscale', type: 'text', required: false, sortOrder: 1 },
  { id: 'ra_third_party_access', section: 'remote-access-policy', label: 'Do third-party vendors have remote access?', type: 'boolean', required: true, sortOrder: 2 },
  { id: 'ra_split_tunnel', section: 'remote-access-policy', label: 'Is split-tunnel VPN allowed?', helpText: 'Split tunnel routes only corporate traffic through the VPN. Full tunnel routes all traffic.', type: 'boolean', required: false, sortOrder: 3 },

  // --- Password ---
  { id: 'pw_min_length', section: 'password-policy', label: 'Minimum password length', type: 'select', required: false, sortOrder: 1, options: [
    { value: '8', label: '8 characters' },
    { value: '12', label: '12 characters' },
    { value: '14', label: '14 characters' },
    { value: '16', label: '16 characters' },
  ]},
  { id: 'pw_password_manager', section: 'password-policy', label: 'Is a password manager provided/required?', type: 'boolean', required: false, sortOrder: 2 },

  // --- AI Usage ---
  { id: 'ai_approved_tools', section: 'ai-usage-policy', label: 'List specific approved AI tools', helpText: 'e.g., ChatGPT Enterprise, GitHub Copilot, Microsoft Copilot — one per line', type: 'textarea', required: false, sortOrder: 1, prefillKey: 'org_ai_tools_used' },
  { id: 'ai_confidential_data_restriction', section: 'ai-usage-policy', label: 'Is inputting confidential data into AI tools prohibited?', type: 'boolean', required: true, sortOrder: 2 },

  // --- Data Classification ---
  { id: 'dc_classification_levels', section: 'data-classification-policy', label: 'Classification levels to use', type: 'multi-select', required: false, sortOrder: 1, options: [
    { value: 'public', label: 'Public' },
    { value: 'internal', label: 'Internal' },
    { value: 'confidential', label: 'Confidential' },
    { value: 'restricted', label: 'Restricted / Highly Confidential' },
  ]},

  // --- Vendor Management ---
  { id: 'vm_risk_tiers', section: 'vendor-management-policy', label: 'Vendor risk classification tiers', type: 'multi-select', required: false, sortOrder: 1, options: [
    { value: 'critical', label: 'Critical (access to sensitive data/systems)' },
    { value: 'high', label: 'High (significant operational dependency)' },
    { value: 'medium', label: 'Medium (limited access)' },
    { value: 'low', label: 'Low (no data access)' },
  ]},

  // --- CUI Handling ---
  { id: 'cui_categories', section: 'cui-handling-policy', label: 'CUI categories handled', helpText: 'e.g., CTI (Controlled Technical Information), ITAR, Export Controlled', type: 'textarea', required: true, sortOrder: 1 },
  { id: 'cui_marking_method', section: 'cui-handling-policy', label: 'CUI marking method', type: 'select', required: false, sortOrder: 2, options: [
    { value: 'banner', label: 'Header/footer banner markings' },
    { value: 'classification', label: 'Document classification labels' },
    { value: 'both', label: 'Both banners and labels' },
    { value: 'none', label: 'Not currently marking' },
  ]},
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get org profile questions */
export function getOrgProfileQuestions(): QuestionDefinition[] {
  return ORG_PROFILE_QUESTIONS.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Get questions specific to a policy slug */
export function getPolicyQuestions(policySlug: string): QuestionDefinition[] {
  return POLICY_SPECIFIC_QUESTIONS
    .filter((q) => q.section === policySlug)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Check whether a conditional question should be shown */
export function shouldShowQuestion(
  question: QuestionDefinition,
  answers: Record<string, string | string[] | boolean>
): boolean {
  if (!question.conditional) return true
  const depValue = answers[question.conditional.questionId]
  return depValue === question.conditional.value
}

/** Compute completion percentage for a set of questions */
export function computeCompletionPct(
  questions: QuestionDefinition[],
  answers: Record<string, string | string[] | boolean>
): number {
  const visible = questions.filter((q) => shouldShowQuestion(q, answers))
  const required = visible.filter((q) => q.required)
  if (required.length === 0) return 100
  const answered = required.filter((q) => {
    const val = answers[q.id]
    if (val === undefined || val === null || val === '') return false
    if (Array.isArray(val) && val.length === 0) return false
    return true
  })
  return Math.round((answered.length / required.length) * 100)
}

/** Pre-fill policy-specific answers from org profile where prefillKey matches */
export function prefillFromOrgProfile(
  policySlug: string,
  orgAnswers: Record<string, string | string[] | boolean>
): Record<string, string | string[] | boolean> {
  const prefilled: Record<string, string | string[] | boolean> = {}
  const questions = getPolicyQuestions(policySlug)
  for (const q of questions) {
    if (q.prefillKey && orgAnswers[q.prefillKey] !== undefined) {
      prefilled[q.id] = orgAnswers[q.prefillKey]
    }
  }
  return prefilled
}

/** Get distinct group labels in order for a set of questions */
export function getQuestionGroups(questions: QuestionDefinition[]): string[] {
  const seen = new Set<string>()
  const groups: string[] = []
  for (const q of questions) {
    if (q.group && !seen.has(q.group)) {
      seen.add(q.group)
      groups.push(q.group)
    }
  }
  return groups
}
