/**
 * Policy Generation System — Questionnaire / Intake Engine
 *
 * Two-tier question system:
 * 1. Organization Profile — global answers shared across all policies
 * 2. Policy-Specific Questions — only asked when generating a specific policy
 *
 * Questions are adaptive: some are conditional on previous answers.
 * Answers from the org profile auto-fill into policy-specific prompts.
 */

import type { QuestionDefinition } from './types'

// ---------------------------------------------------------------------------
// Organization Profile Questions (asked once, reused across all policies)
// ---------------------------------------------------------------------------

export const ORG_PROFILE_QUESTIONS: QuestionDefinition[] = [
  // --- Company Identity ---
  { id: 'org_legal_name', section: 'org-profile', label: 'Company Legal Name', type: 'text', required: true, sortOrder: 1 },
  { id: 'org_dba', section: 'org-profile', label: 'DBA / Trade Name(s)', helpText: 'If different from legal name', type: 'text', required: false, sortOrder: 2 },
  { id: 'org_address', section: 'org-profile', label: 'Headquarters Address', type: 'text', required: true, sortOrder: 3 },
  { id: 'org_states', section: 'org-profile', label: 'States/Countries of Operation', type: 'text', required: false, sortOrder: 4 },
  { id: 'org_industry', section: 'org-profile', label: 'Industry', type: 'select', required: true, sortOrder: 5, options: [
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
  { id: 'org_employee_count', section: 'org-profile', label: 'Approximate Employee Count', type: 'select', required: true, sortOrder: 6, options: [
    { value: '1-25', label: '1-25' },
    { value: '26-100', label: '26-100' },
    { value: '101-500', label: '101-500' },
    { value: '501-1000', label: '501-1,000' },
    { value: '1000+', label: '1,000+' },
  ]},

  // --- Regulatory Scope ---
  { id: 'org_handles_phi', section: 'org-profile', label: 'Does the organization handle Protected Health Information (PHI)?', type: 'boolean', required: true, sortOrder: 10 },
  { id: 'org_handles_pii', section: 'org-profile', label: 'Does the organization handle Personally Identifiable Information (PII)?', type: 'boolean', required: true, sortOrder: 11 },
  { id: 'org_handles_cui', section: 'org-profile', label: 'Does the organization handle Controlled Unclassified Information (CUI)?', type: 'boolean', required: true, sortOrder: 12 },
  { id: 'org_handles_credit_cards', section: 'org-profile', label: 'Does the organization process credit card payments?', type: 'boolean', required: false, sortOrder: 13 },

  // --- Operational Context ---
  { id: 'org_remote_work', section: 'org-profile', label: 'Is remote work allowed?', type: 'select', required: true, sortOrder: 20, options: [
    { value: 'no', label: 'No — all onsite' },
    { value: 'hybrid', label: 'Hybrid (some remote, some onsite)' },
    { value: 'full_remote', label: 'Fully remote' },
  ]},
  { id: 'org_byod_allowed', section: 'org-profile', label: 'Are personal devices (BYOD) allowed for work?', type: 'select', required: true, sortOrder: 21, options: [
    { value: 'no', label: 'No — company-issued devices only' },
    { value: 'yes_managed', label: 'Yes — with MDM/management required' },
    { value: 'yes_unmanaged', label: 'Yes — no management required' },
  ]},
  { id: 'org_contractors', section: 'org-profile', label: 'Does the organization use contractors or temporary workers?', type: 'boolean', required: true, sortOrder: 22 },
  { id: 'org_mdm_deployed', section: 'org-profile', label: 'Is a Mobile Device Management (MDM) solution deployed?', type: 'boolean', required: false, sortOrder: 23, conditional: { questionId: 'org_byod_allowed', value: 'yes_managed' } },

  // --- Security Posture ---
  { id: 'org_backup_type', section: 'org-profile', label: 'What backup solution is in place?', type: 'select', required: false, sortOrder: 30, options: [
    { value: 'cloud', label: 'Cloud-only backups (e.g., Datto SaaS Protection)' },
    { value: 'hybrid', label: 'Hybrid (cloud + local/BCDR appliance)' },
    { value: 'local', label: 'Local backups only' },
    { value: 'none', label: 'No formal backup solution' },
  ]},
  { id: 'org_edr_deployed', section: 'org-profile', label: 'Is Endpoint Detection and Response (EDR) deployed?', type: 'boolean', required: false, sortOrder: 31 },
  { id: 'org_dns_filtering', section: 'org-profile', label: 'Is DNS filtering deployed?', type: 'boolean', required: false, sortOrder: 32 },
  { id: 'org_siem_deployed', section: 'org-profile', label: 'Is a SIEM or security monitoring platform deployed?', type: 'boolean', required: false, sortOrder: 33 },
  { id: 'org_mfa_status', section: 'org-profile', label: 'MFA deployment status', type: 'select', required: true, sortOrder: 34, options: [
    { value: 'full', label: 'MFA enabled for all users' },
    { value: 'admins', label: 'MFA enabled for admins only' },
    { value: 'partial', label: 'MFA partially deployed' },
    { value: 'none', label: 'No MFA' },
  ]},
  { id: 'org_encryption_at_rest', section: 'org-profile', label: 'Is full-disk encryption deployed on endpoints?', type: 'boolean', required: false, sortOrder: 35 },

  // --- Governance ---
  { id: 'org_security_officer', section: 'org-profile', label: 'Security Officer / CISO name or role', helpText: 'Person or role responsible for information security', type: 'text', required: false, sortOrder: 40 },
  { id: 'org_policy_owner', section: 'org-profile', label: 'Default Policy Owner', helpText: 'Person or role who owns and approves policies', type: 'text', required: false, sortOrder: 41 },
  { id: 'org_policy_review_cycle', section: 'org-profile', label: 'Policy Review Cycle', type: 'select', required: false, sortOrder: 42, options: [
    { value: 'annual', label: 'Annual' },
    { value: 'semi-annual', label: 'Semi-Annual' },
    { value: 'quarterly', label: 'Quarterly' },
  ]},
  { id: 'org_risk_assessment_cadence', section: 'org-profile', label: 'How often are risk assessments conducted?', type: 'select', required: false, sortOrder: 43, options: [
    { value: 'annual', label: 'Annual' },
    { value: 'semi-annual', label: 'Semi-Annual' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'never', label: 'Not currently conducted' },
  ]},
  { id: 'org_training_cadence', section: 'org-profile', label: 'How often is security awareness training conducted?', type: 'select', required: false, sortOrder: 44, options: [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
    { value: 'onboarding_only', label: 'During onboarding only' },
    { value: 'never', label: 'Not currently conducted' },
  ]},
  { id: 'org_access_review_cadence', section: 'org-profile', label: 'How often are user access reviews conducted?', type: 'select', required: false, sortOrder: 45, options: [
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'semi-annual', label: 'Semi-Annual' },
    { value: 'annual', label: 'Annual' },
    { value: 'never', label: 'Not currently conducted' },
  ]},
  { id: 'org_incident_contacts', section: 'org-profile', label: 'Primary Incident Response Contact(s)', helpText: 'Name, role, phone — for incident response plans', type: 'textarea', required: false, sortOrder: 46 },
  { id: 'org_disciplinary_process', section: 'org-profile', label: 'How are policy violations handled?', type: 'select', required: false, sortOrder: 47, options: [
    { value: 'progressive', label: 'Progressive discipline (warning → write-up → termination)' },
    { value: 'hr_referral', label: 'Referred to HR on case-by-case basis' },
    { value: 'not_defined', label: 'Not currently defined' },
  ]},
  { id: 'org_exception_process', section: 'org-profile', label: 'Is there a formal policy exception process?', type: 'boolean', required: false, sortOrder: 48 },

  // --- AI / Technology ---
  { id: 'org_ai_tools_used', section: 'org-profile', label: 'Does the organization use AI tools (ChatGPT, Copilot, etc.)?', type: 'select', required: false, sortOrder: 50, options: [
    { value: 'yes_approved', label: 'Yes — approved tools only' },
    { value: 'yes_uncontrolled', label: 'Yes — no formal controls' },
    { value: 'no', label: 'No' },
    { value: 'evaluating', label: 'Currently evaluating' },
  ]},

  // --- Vendor / Third-Party ---
  { id: 'org_vendor_review_process', section: 'org-profile', label: 'Is there a vendor security review process?', type: 'boolean', required: false, sortOrder: 55 },
  { id: 'org_data_retention_years', section: 'org-profile', label: 'Default data retention period', type: 'select', required: false, sortOrder: 56, options: [
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
  { id: 'ir_escalation_contacts', section: 'incident-response-policy', label: 'Incident escalation contacts (name, role, phone)', type: 'textarea', required: true, sortOrder: 1, prefillKey: 'org_incident_contacts' },
  { id: 'ir_notification_requirements', section: 'incident-response-policy', label: 'Are there regulatory breach notification requirements?', type: 'multi-select', required: false, sortOrder: 2, options: [
    { value: 'hipaa', label: 'HIPAA (60 days)' },
    { value: 'state', label: 'State breach notification laws' },
    { value: 'dfars', label: 'DFARS/CMMC (72 hours DoD)' },
    { value: 'none', label: 'No specific requirements' },
  ]},
  { id: 'ir_forensics_partner', section: 'incident-response-policy', label: 'Is there a contracted forensics/IR partner?', type: 'text', required: false, sortOrder: 3 },
  { id: 'ir_cyber_insurance', section: 'incident-response-policy', label: 'Does the company have cyber insurance?', type: 'boolean', required: false, sortOrder: 4 },

  // --- Backup / DR ---
  { id: 'bdr_rto', section: 'backup-disaster-recovery-policy', label: 'Target Recovery Time Objective (RTO)', type: 'select', required: false, sortOrder: 1, options: [
    { value: '1h', label: '1 hour' },
    { value: '4h', label: '4 hours' },
    { value: '8h', label: '8 hours (business day)' },
    { value: '24h', label: '24 hours' },
    { value: '72h', label: '72 hours' },
  ]},
  { id: 'bdr_rpo', section: 'backup-disaster-recovery-policy', label: 'Target Recovery Point Objective (RPO)', type: 'select', required: false, sortOrder: 2, options: [
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
  { id: 'hipaa_phi_systems', section: 'hipaa-security-policy', label: 'List systems that store/process ePHI', type: 'textarea', required: true, sortOrder: 1 },
  { id: 'hipaa_ba_count', section: 'hipaa-security-policy', label: 'Approximate number of Business Associates', type: 'text', required: false, sortOrder: 2 },

  // --- Remote Access ---
  { id: 'ra_vpn_type', section: 'remote-access-policy', label: 'VPN solution in use', type: 'text', required: false, sortOrder: 1 },
  { id: 'ra_third_party_access', section: 'remote-access-policy', label: 'Do third-party vendors have remote access?', type: 'boolean', required: true, sortOrder: 2 },
  { id: 'ra_split_tunnel', section: 'remote-access-policy', label: 'Is split-tunnel VPN allowed?', type: 'boolean', required: false, sortOrder: 3 },

  // --- Password ---
  { id: 'pw_min_length', section: 'password-policy', label: 'Minimum password length', type: 'select', required: false, sortOrder: 1, options: [
    { value: '8', label: '8 characters' },
    { value: '12', label: '12 characters' },
    { value: '14', label: '14 characters' },
    { value: '16', label: '16 characters' },
  ]},
  { id: 'pw_password_manager', section: 'password-policy', label: 'Is a password manager provided/required?', type: 'boolean', required: false, sortOrder: 2 },

  // --- AI Usage ---
  { id: 'ai_approved_tools', section: 'ai-usage-policy', label: 'List approved AI tools (if any)', type: 'textarea', required: false, sortOrder: 1, prefillKey: 'org_ai_tools_used' },
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
  { id: 'cui_categories', section: 'cui-handling-policy', label: 'CUI categories handled', type: 'textarea', required: true, sortOrder: 1 },
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
