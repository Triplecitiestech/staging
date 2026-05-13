/**
 * Customer Profile Schema (W3 — COMPLIANCE_WORKFLOW_REDESIGN.md)
 *
 * The single Customer-Profile authoring surface that consolidates three
 * historical intake stores into one question-engine schema:
 *
 *   1. policy_org_profiles.answers (JSONB)           ← org profile (70+ Qs)
 *   2. compliance_customer_context.answers (JSONB)   ← env / scope / access / physical
 *   3. ComplianceSetupWizard.tsx in-page state       ← duplicates of the above
 *
 * Today (pre-consolidation):
 *   - This module is the SCHEMA-of-record. Answer storage is still split across
 *     the two legacy tables; getCustomerProfileAnswers() reads from BOTH and
 *     merges them so callers can switch to this module immediately.
 *   - The HR-style seed (form_schemas / form_sections / form_questions rows)
 *     is built by getCustomerProfileSeedSql() but is NOT applied automatically.
 *     The seed lands when the question-engine authoring UI is built (W7+).
 *
 * After consolidation:
 *   - Backfill (W4) copies answers from both legacy stores into form_responses
 *     keyed by (companyId, schemaType='customer_profile').
 *   - Engine N/A logic (W5) and policy generator (W6) read exclusively via
 *     this module — they don't know about the legacy stores.
 *   - Wave 4: ComplianceSetupWizard.tsx is deleted; legacy intake UIs removed.
 *   - Wave 5: legacy tables dropped.
 *
 * Key preservation rule:
 *   Every question here uses the SAME key it had in the legacy store so that
 *   a copy of the JSONB into form_responses is sufficient — no key rewriting
 *   is required. New questions added in the future may use fresh keys.
 *
 * See:
 *   docs/plans/COMPLIANCE_ARCHITECTURE.md       — overall design
 *   docs/plans/COMPLIANCE_WORKFLOW_REDESIGN.md  — consolidation plan
 *   docs/plans/QUESTION_ENGINE_ARCHITECTURE.md  — engine this schema plugs into
 *   docs/COMPLIANCE_PLAYBOOK.md                 — how engine reads these answers
 */

import { getPool } from '@/lib/db-pool'
import type { QueryResultRow } from 'pg'

// ============================================================================
// Constants
// ============================================================================

/** Form schema `type` discriminator. */
export const CUSTOMER_PROFILE_TYPE = 'customer_profile' as const

/** Stable UUID for the Customer Profile schema row in `form_schemas`. */
export const CUSTOMER_PROFILE_SCHEMA_ID = '00000000-0000-4000-8000-000000000003'

/** Schema version. Bump when introducing breaking changes (key renames, removed Qs). */
export const CUSTOMER_PROFILE_SCHEMA_VERSION = 1

/** Stable UUIDs per section so per-customer overrides survive schema edits. */
export const CUSTOMER_PROFILE_SECTION_IDS = {
  identity: '00000000-0000-4000-8003-000000000001',
  regulatory: '00000000-0000-4000-8003-000000000002',
  operational: '00000000-0000-4000-8003-000000000003',
  scope: '00000000-0000-4000-8003-000000000004',
  access: '00000000-0000-4000-8003-000000000005',
  physical: '00000000-0000-4000-8003-000000000006',
  people: '00000000-0000-4000-8003-000000000007',
  cadences: '00000000-0000-4000-8003-000000000008',
  processes: '00000000-0000-4000-8003-000000000009',
} as const

// ============================================================================
// Types
// ============================================================================

/**
 * Question types supported by the form_questions table. See
 * docs/plans/QUESTION_ENGINE_ARCHITECTURE.md §1 for the full list.
 *
 * `boolean` is NOT a native type — yes/no answers use `radio` with
 * static options [{value:'yes'},{value:'no'}] so they render uniformly.
 */
export type QuestionType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox'

export interface QuestionOption {
  value: string
  label: string
}

export interface CustomerProfileQuestion {
  /** Stable key — must match the legacy store's key for the backfill to be 1:1. */
  key: string
  label: string
  type: QuestionType
  helpText?: string
  placeholder?: string
  required?: boolean
  /** Static options for select / multi_select / radio. */
  staticOptions?: QuestionOption[]
  /** Sort order within the section. */
  sortOrder: number
  /**
   * Which legacy store this question's answer is read from until
   * backfill (W4) lands. The reader merges both stores into one
   * answer map, so downstream code never branches on this.
   */
  legacyStore: 'policy_org_profiles' | 'compliance_customer_context'
}

export interface CustomerProfileSection {
  id: string
  key: string
  title: string
  description?: string
  sortOrder: number
  questions: CustomerProfileQuestion[]
}

// ============================================================================
// Reusable option sets
// ============================================================================

const YES_NO: QuestionOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

// ============================================================================
// Schema declaration
// ============================================================================

export const CUSTOMER_PROFILE_SECTIONS: readonly CustomerProfileSection[] = [
  // --------------------------------------------------------------------------
  // 1. Identity
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.identity,
    key: 'identity',
    title: 'Company Identity',
    description: 'Basics about the customer. Appears in policy headers and assessment reports.',
    sortOrder: 0,
    questions: [
      { key: 'org_legal_name', label: 'Company Legal Name', type: 'text', required: true, sortOrder: 0, legacyStore: 'policy_org_profiles' },
      { key: 'org_address', label: 'Headquarters Address', type: 'text', required: true, sortOrder: 1, legacyStore: 'policy_org_profiles' },
      {
        key: 'org_states',
        label: 'States / Countries of Operation',
        helpText: 'One per line. Affects breach notification requirements.',
        type: 'textarea',
        sortOrder: 2,
        legacyStore: 'policy_org_profiles',
      },
      {
        key: 'org_industry',
        label: 'Industry',
        type: 'select',
        required: true,
        sortOrder: 3,
        staticOptions: [
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
        ],
        legacyStore: 'policy_org_profiles',
      },
      {
        key: 'org_employee_count',
        label: 'Approximate Employee Count',
        type: 'select',
        required: true,
        sortOrder: 4,
        staticOptions: [
          { value: '1-25', label: '1–25' },
          { value: '26-100', label: '26–100' },
          { value: '101-500', label: '101–500' },
          { value: '501-1000', label: '501–1,000' },
          { value: '1000+', label: '1,000+' },
        ],
        legacyStore: 'policy_org_profiles',
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 2. Compliance & Regulatory Scope
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.regulatory,
    key: 'regulatory',
    title: 'Compliance & Regulatory Scope',
    description: 'Which frameworks apply, and which sensitive data categories the customer handles.',
    sortOrder: 1,
    questions: [
      {
        key: 'org_target_frameworks',
        label: 'Compliance frameworks this customer adheres to',
        helpText: 'Determines which controls, policies, and assessments are required. CIS v8 is recommended for all.',
        type: 'multi_select',
        required: true,
        sortOrder: 0,
        staticOptions: [
          { value: 'cis-v8', label: 'CIS Controls v8 (recommended for all)' },
          { value: 'hipaa', label: 'HIPAA (healthcare / PHI)' },
          { value: 'nist-800-171', label: 'NIST 800-171 (government contractors)' },
          { value: 'cmmc-l1', label: 'CMMC Level 1 (DoD basic)' },
          { value: 'cmmc-l2', label: 'CMMC Level 2 (DoD advanced)' },
          { value: 'pci', label: 'PCI DSS (card processing)' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      { key: 'org_handles_phi', label: 'Does this customer handle Protected Health Information (PHI)?', type: 'radio', required: true, staticOptions: YES_NO, sortOrder: 1, legacyStore: 'policy_org_profiles' },
      { key: 'org_handles_pii', label: 'Does this customer handle Personally Identifiable Information (PII)?', type: 'radio', required: true, staticOptions: YES_NO, sortOrder: 2, legacyStore: 'policy_org_profiles' },
      { key: 'org_handles_cui', label: 'Does this customer handle Controlled Unclassified Information (CUI)?', type: 'radio', required: true, staticOptions: YES_NO, sortOrder: 3, legacyStore: 'policy_org_profiles' },
    ],
  },

  // --------------------------------------------------------------------------
  // 3. Operational Context — drives engine N/A logic + policy content
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.operational,
    key: 'operational',
    title: 'Operational Context',
    description:
      'How this customer actually operates. These answers drive environment-aware N/A logic in the assessment engine (e.g., a customer with no on-prem servers is correctly marked N/A on server-firewall controls instead of failing them).',
    sortOrder: 2,
    questions: [
      {
        key: 'remote_access',
        label: 'How does this customer access corporate resources remotely?',
        type: 'radio',
        required: true,
        sortOrder: 0,
        staticOptions: [
          { value: 'cloud_only', label: 'Cloud-only — no VPN needed' },
          { value: 'vpn_required', label: 'VPN required for on-prem resources' },
          { value: 'hybrid', label: 'Hybrid — some cloud, some VPN' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'on_prem_servers',
        label: 'Does this customer have on-premises servers?',
        type: 'radio',
        required: true,
        sortOrder: 1,
        staticOptions: [
          { value: 'no_servers', label: 'No — fully cloud, no on-prem servers' },
          { value: 'yes_bcdr', label: 'Yes — dedicated server(s) with BCDR backup' },
          { value: 'yes_mixed', label: 'Yes — dedicated server(s) with mixed/other backup' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'workstation_as_server',
        label: 'Workstations acting as servers or storing critical local data?',
        type: 'radio',
        sortOrder: 2,
        staticOptions: [
          { value: 'none', label: 'No — all data is cloud-based or on dedicated servers' },
          { value: 'yes_backed_up', label: 'Yes — backed up via Datto Endpoint Backup' },
          { value: 'yes_not_backed_up', label: 'Yes — NOT currently backed up' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'critical_local_apps',
        label: 'Critical applications that run locally (not cloud/SaaS)',
        type: 'select',
        sortOrder: 3,
        staticOptions: [
          { value: 'none', label: 'None — all applications are cloud/SaaS' },
          { value: 'quickbooks', label: 'QuickBooks Desktop' },
          { value: 'accounting_other', label: 'Other desktop accounting/ERP (Sage, Peachtree, etc.)' },
          { value: 'database', label: 'Local database (Access, SQL Express, FileMaker)' },
          { value: 'cad_engineering', label: 'CAD / engineering (AutoCAD, SolidWorks, etc.)' },
          { value: 'custom', label: 'Custom line-of-business application' },
          { value: 'multiple', label: 'Multiple critical local apps' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'org_remote_work',
        label: 'Is remote work allowed (employees working from home)?',
        type: 'select',
        required: true,
        sortOrder: 4,
        staticOptions: [
          { value: 'no', label: 'No — all onsite' },
          { value: 'hybrid', label: 'Hybrid (some remote, some onsite)' },
          { value: 'full_remote', label: 'Fully remote' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      {
        key: 'org_byod_allowed',
        label: 'Are personal devices (BYOD) allowed for work?',
        type: 'select',
        required: true,
        sortOrder: 5,
        staticOptions: [
          { value: 'no', label: 'No — company-issued devices only' },
          { value: 'yes_managed', label: 'Yes — with MDM / device management required' },
          { value: 'yes_unmanaged', label: 'Yes — no management required' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      {
        key: 'custom_apps',
        label: 'Does this customer develop custom software?',
        type: 'radio',
        sortOrder: 6,
        staticOptions: YES_NO,
        legacyStore: 'compliance_customer_context',
      },
      { key: 'org_contractors', label: 'Does this customer use contractors or temporary workers?', type: 'radio', required: true, staticOptions: YES_NO, sortOrder: 7, legacyStore: 'policy_org_profiles' },
    ],
  },

  // --------------------------------------------------------------------------
  // 4. Compliance Scope — what's in scope for the assessment
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.scope,
    key: 'scope',
    title: 'Compliance Scope',
    description: 'What systems, users, and data are inside the compliance boundary.',
    sortOrder: 3,
    questions: [
      {
        key: 'scope_endpoints',
        label: 'What endpoints are in scope?',
        type: 'select',
        sortOrder: 0,
        staticOptions: [
          { value: 'all_managed', label: 'All managed endpoints' },
          { value: 'workstations_only', label: 'Workstations only' },
          { value: 'workstations_servers', label: 'Workstations + servers' },
          { value: 'custom', label: 'Custom scope' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'scope_users',
        label: 'Which user accounts are in scope?',
        type: 'select',
        sortOrder: 1,
        staticOptions: [
          { value: 'all_licensed', label: 'All licensed M365 users' },
          { value: 'employees_only', label: 'Full-time employees only' },
          { value: 'all_including_shared', label: 'All including shared / service accounts' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'scope_backup',
        label: 'What data is in scope for backup compliance?',
        type: 'select',
        sortOrder: 2,
        staticOptions: [
          { value: 'servers_m365', label: 'Servers + M365 data' },
          { value: 'm365_only', label: 'M365 data only (cloud-only)' },
          { value: 'servers_only', label: 'Servers only' },
          { value: 'all_data', label: 'All data including endpoint backup' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'scope_incident_response',
        label: 'Who handles incident response for this customer?',
        type: 'select',
        sortOrder: 3,
        staticOptions: [
          { value: 'tct_handles', label: 'TCT handles all IR' },
          { value: 'shared', label: 'Shared responsibility' },
          { value: 'customer_internal', label: 'Customer has internal IR team' },
        ],
        legacyStore: 'compliance_customer_context',
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 5. Access & Authorization (CMMC AC.1.2)
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.access,
    key: 'access',
    title: 'Access & Authorization',
    description: 'How access to business apps and devices is partitioned.',
    sortOrder: 4,
    questions: [
      {
        key: 'access_role_based',
        label: 'Is access to business applications restricted by role / job function?',
        type: 'radio',
        sortOrder: 0,
        staticOptions: [
          { value: 'role_restricted', label: 'Role-based — restricted by job function' },
          { value: 'partial', label: 'Some apps role-restricted, others open' },
          { value: 'all_equal', label: 'All users have equal access' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'restricted_apps',
        label: 'Which key business applications have role-restricted access?',
        helpText: 'Accounting, ERP, HR systems, etc.',
        type: 'radio',
        sortOrder: 1,
        staticOptions: [
          { value: 'noted', label: 'Restricted apps noted in tech-support follow-up notes' },
          { value: 'none', label: 'None — all users have equal access to all apps' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'standard_user_admin_rights',
        label: 'Do standard (non-IT) employees have local administrator privileges?',
        type: 'radio',
        sortOrder: 2,
        staticOptions: [
          { value: 'no', label: 'No — admin rights restricted to IT staff' },
          { value: 'mixed', label: 'Mixed — some users have local admin' },
          { value: 'yes', label: 'Yes — most users have local admin' },
        ],
        legacyStore: 'compliance_customer_context',
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 6. Physical Security (CMMC PE.1, PE.2)
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.physical,
    key: 'physical',
    title: 'Physical Security',
    description: 'Physical access controls and visitor handling.',
    sortOrder: 5,
    questions: [
      {
        key: 'physical_access_control',
        label: 'Is physical access to your office, server room, and IT equipment restricted to authorized personnel?',
        type: 'radio',
        sortOrder: 0,
        staticOptions: [
          { value: 'restricted_locked', label: 'Yes — locked office + locked server room / cabinet' },
          { value: 'restricted_partial', label: 'Office locked, but network equipment in shared area' },
          { value: 'open', label: 'Open office — minimal physical restrictions' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'physical_access_method',
        label: 'How is physical access controlled?',
        type: 'select',
        sortOrder: 1,
        staticOptions: [
          { value: 'badge_keycard', label: 'Badge / keycard system' },
          { value: 'key_locks', label: 'Key locks (physical keys)' },
          { value: 'combination', label: 'Combination locks' },
          { value: 'mixed', label: 'Mixed — different methods for different areas' },
          { value: 'none', label: 'No formal access control' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      {
        key: 'visitor_escort',
        label: 'Are visitors escorted by an employee at all times?',
        type: 'radio',
        sortOrder: 2,
        staticOptions: [
          { value: 'always', label: 'Yes — visitors always escorted' },
          { value: 'restricted_areas', label: 'Escorted in restricted areas only' },
          { value: 'no', label: 'No formal escort policy' },
        ],
        legacyStore: 'compliance_customer_context',
      },
      { key: 'visitor_log', label: 'Do you maintain a visitor log?', type: 'radio', staticOptions: YES_NO, sortOrder: 3, legacyStore: 'compliance_customer_context' },
    ],
  },

  // --------------------------------------------------------------------------
  // 7. People & Roles — appear in policy headers + IR escalation
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.people,
    key: 'people',
    title: 'People & Roles',
    description: 'Names and contacts that get embedded in generated policies and the IR escalation chain.',
    sortOrder: 6,
    questions: [
      { key: 'org_security_officer', label: 'Security Officer / CISO', helpText: 'Person or role responsible for information security. Appears in policy headers.', type: 'text', sortOrder: 0, legacyStore: 'policy_org_profiles' },
      { key: 'org_policy_owner', label: 'Default Policy Owner', helpText: 'Person or role who owns and approves policies. Leave blank if same as Security Officer.', type: 'text', sortOrder: 1, legacyStore: 'policy_org_profiles' },
      { key: 'org_incident_contacts', label: 'Incident Response Contacts', helpText: 'Name, role, phone — one per line. Used in IR policy escalation chain.', type: 'textarea', sortOrder: 2, legacyStore: 'policy_org_profiles' },
    ],
  },

  // --------------------------------------------------------------------------
  // 8. Review Cadences — drive scheduled-reminder rules + policy text
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.cadences,
    key: 'cadences',
    title: 'Review Cadences',
    description: 'How often things get reviewed. Drives reminder schedules and policy commitments.',
    sortOrder: 7,
    questions: [
      {
        key: 'org_policy_review_cycle',
        label: 'Policy review cycle',
        helpText: 'How often are written policies formally reviewed and updated?',
        type: 'select',
        sortOrder: 0,
        staticOptions: [
          { value: 'annual', label: 'Annual' },
          { value: 'semi-annual', label: 'Semi-Annual' },
          { value: 'quarterly', label: 'Quarterly' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      {
        key: 'org_risk_assessment_cadence',
        label: 'Risk assessment cadence',
        helpText: 'How often does the company formally assess security risks?',
        type: 'select',
        sortOrder: 1,
        staticOptions: [
          { value: 'annual', label: 'Annual' },
          { value: 'semi-annual', label: 'Semi-Annual' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'never', label: 'Not currently conducted' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      {
        key: 'org_training_cadence',
        label: 'Security awareness training cadence',
        type: 'select',
        sortOrder: 2,
        staticOptions: [
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'annual', label: 'Annual' },
          { value: 'onboarding_only', label: 'During onboarding only' },
          { value: 'never', label: 'Not currently conducted' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      {
        key: 'org_access_review_cadence',
        label: 'User access review cadence',
        type: 'select',
        sortOrder: 3,
        staticOptions: [
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'semi-annual', label: 'Semi-Annual' },
          { value: 'annual', label: 'Annual' },
          { value: 'never', label: 'Not currently conducted' },
        ],
        legacyStore: 'policy_org_profiles',
      },
    ],
  },

  // --------------------------------------------------------------------------
  // 9. Processes — disciplinary / exception / vendor / retention / AI
  // --------------------------------------------------------------------------
  {
    id: CUSTOMER_PROFILE_SECTION_IDS.processes,
    key: 'processes',
    title: 'Processes',
    description: 'Formal processes that show up in generated policy text.',
    sortOrder: 8,
    questions: [
      {
        key: 'org_disciplinary_process',
        label: 'How are policy violations handled?',
        type: 'select',
        sortOrder: 0,
        staticOptions: [
          { value: 'progressive', label: 'Progressive discipline (warning → write-up → termination)' },
          { value: 'hr_referral', label: 'Referred to HR on case-by-case basis' },
          { value: 'not_defined', label: 'Not currently defined' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      { key: 'org_exception_process', label: 'Is there a formal policy exception process?', helpText: 'When someone needs an exception, is there a documented approval process?', type: 'radio', staticOptions: YES_NO, sortOrder: 1, legacyStore: 'policy_org_profiles' },
      {
        key: 'org_ai_tools_used',
        label: 'Are AI tools (ChatGPT, Copilot, etc.) in use?',
        type: 'select',
        sortOrder: 2,
        staticOptions: [
          { value: 'yes_approved', label: 'Yes — approved tools only' },
          { value: 'yes_uncontrolled', label: 'Yes — no formal controls' },
          { value: 'no', label: 'No' },
          { value: 'evaluating', label: 'Currently evaluating' },
        ],
        legacyStore: 'policy_org_profiles',
      },
      { key: 'org_vendor_review_process', label: 'Is there a vendor security review process?', type: 'radio', staticOptions: YES_NO, sortOrder: 3, legacyStore: 'policy_org_profiles' },
      {
        key: 'org_data_retention_years',
        label: 'Default data retention period',
        type: 'select',
        sortOrder: 4,
        staticOptions: [
          { value: '1', label: '1 year' },
          { value: '3', label: '3 years' },
          { value: '5', label: '5 years' },
          { value: '7', label: '7 years' },
          { value: '10', label: '10 years' },
          { value: 'varies', label: 'Varies by data type' },
        ],
        legacyStore: 'policy_org_profiles',
      },
    ],
  },
] as const

// ============================================================================
// Key index for typed reads
// ============================================================================

/**
 * Flat list of every question in the schema. Useful for iteration,
 * completion calculations, and migration tooling.
 */
export const CUSTOMER_PROFILE_QUESTIONS: readonly CustomerProfileQuestion[] =
  CUSTOMER_PROFILE_SECTIONS.flatMap((s) => s.questions)

/**
 * A typed string-literal union of every question key. Use this for typed
 * reads via getAnswer(answers, key) so the compiler catches typos.
 */
export type CustomerProfileKey = (typeof CUSTOMER_PROFILE_QUESTIONS)[number]['key']

/**
 * Key set for fast membership checks (e.g., "is this key part of the
 * customer profile schema, or some policy-specific extra?").
 */
export const CUSTOMER_PROFILE_KEY_SET: ReadonlySet<string> = new Set(
  CUSTOMER_PROFILE_QUESTIONS.map((q) => q.key)
)

// ============================================================================
// Reader helpers — interim bridge to legacy stores
// ============================================================================

/**
 * Submitted-answer shape (READ).
 *
 * Values returned by getCustomerProfileAnswers() are always strings,
 * string arrays, or null/undefined. Booleans / numbers / other JSON
 * scalars are coerced to strings on the way out via normalizeAnswer.
 */
export type CustomerProfileAnswers = Record<string, string | string[] | null | undefined>

/**
 * Submitted-answer shape (WRITE input).
 *
 * Permissive superset that accepts what callers actually have:
 * boolean radios from legacy questionnaire data, numeric coercions,
 * etc. Coerced to the strict read shape by normalizeAnswer.
 */
export type CustomerProfileWriteInput = Record<
  string,
  string | string[] | boolean | number | null | undefined
>

/**
 * Read the customer's full profile answers.
 *
 * Resolution order:
 *   1. form_responses where schema_type='customer_profile' (canonical store)
 *   2. Merge of the two legacy stores (policy_org_profiles + compliance_customer_context)
 *      for customers not yet backfilled. Keys from the legacy stores that
 *      aren't in the customer-profile schema are dropped silently.
 *
 * Callers do not need to know about this layering; getCustomerProfileAnswers
 * is the single read API. When the backfill is verified for every customer,
 * step 2 can be removed.
 *
 * Returns an empty object (not null) when the customer has no profile yet,
 * so callers can chain `.org_legal_name` without null checks. Use
 * isProfileEmpty(answers) to distinguish "no profile" from "empty answers".
 */
export async function getCustomerProfileAnswers(
  companyId: string
): Promise<CustomerProfileAnswers> {
  if (!companyId) return {}

  const pool = getPool()
  const client = await pool.connect()
  try {
    // Canonical store: form_responses. If a row exists with non-empty
    // answers, use it as-is — no merge with legacy.
    try {
      const r = await client.query<{ answers: Record<string, unknown> | null }>(
        `SELECT answers FROM form_responses WHERE company_id = $1 AND schema_type = $2`,
        [companyId, CUSTOMER_PROFILE_TYPE]
      )
      const stored = r.rows[0]?.answers
      if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
        const out: CustomerProfileAnswers = {}
        for (const [k, v] of Object.entries(stored)) {
          if (CUSTOMER_PROFILE_KEY_SET.has(k)) {
            out[k] = normalizeAnswer(v)
          }
        }
        return out
      }
    } catch {
      // form_responses may not exist on a very old install — fall through to
      // the legacy merge so we never hide existing data.
    }

    // Fallback: merge of legacy stores. Same shape as before.
    return await readLegacyProfileMerge(client, companyId)
  } finally {
    client.release()
  }
}

/** Merge of the two legacy stores. Public for use by the one-time backfill. */
export async function readLegacyProfileMerge(
  client: { query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  companyId: string
): Promise<CustomerProfileAnswers> {
  const merged: CustomerProfileAnswers = {}

  // policy_org_profiles.answers — JSONB keyed by question id
  try {
    const r = await client.query<{ answers: Record<string, unknown> | null }>(
      `SELECT answers FROM policy_org_profiles WHERE "companyId" = $1`,
      [companyId]
    )
    const orgAnswers = r.rows[0]?.answers
    if (orgAnswers && typeof orgAnswers === 'object') {
      for (const [k, v] of Object.entries(orgAnswers)) {
        if (CUSTOMER_PROFILE_KEY_SET.has(k)) {
          merged[k] = normalizeAnswer(v)
        }
      }
    }
  } catch {
    // Legacy table may not exist on a fresh dev DB — fall through.
  }

  // compliance_customer_context.answers — JSONB array of {questionId, value}
  try {
    const r = await client.query<{ answers: Array<{ questionId: string; value: string }> | null }>(
      `SELECT answers FROM compliance_customer_context WHERE "companyId" = $1`,
      [companyId]
    )
    const ctxAnswers = r.rows[0]?.answers
    if (Array.isArray(ctxAnswers)) {
      for (const entry of ctxAnswers) {
        if (entry && typeof entry === 'object' && typeof entry.questionId === 'string') {
          if (CUSTOMER_PROFILE_KEY_SET.has(entry.questionId)) {
            merged[entry.questionId] = entry.value
          }
        }
      }
    }
  } catch {
    // Same — be defensive.
  }

  return merged
}

function normalizeAnswer(v: unknown): string | string[] | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    return v.filter((x) => x !== null && x !== undefined).map((x) => (typeof x === 'string' ? x : String(x)))
  }
  // Unknown shape (object?) — drop rather than poison the answer map.
  return null
}

/**
 * Typed reader for a single answer. Returns null when the key is unanswered
 * or when the stored value is empty.
 */
export function getAnswer(
  answers: CustomerProfileAnswers,
  key: CustomerProfileKey
): string | string[] | null {
  const v = answers[key]
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return v === '' ? null : v
  if (Array.isArray(v)) return v.length === 0 ? null : v
  return null
}

/** Convenience: read a single-value (non-multi) answer as a string or null. */
export function getStringAnswer(
  answers: CustomerProfileAnswers,
  key: CustomerProfileKey
): string | null {
  const v = getAnswer(answers, key)
  return typeof v === 'string' ? v : null
}

/** Convenience: read a multi_select answer as a string[] (empty when unanswered). */
export function getMultiAnswer(
  answers: CustomerProfileAnswers,
  key: CustomerProfileKey
): string[] {
  const v = getAnswer(answers, key)
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v !== '') return [v]
  return []
}

/** Convenience: read a yes/no radio as a boolean (null = unanswered). */
export function getBooleanAnswer(
  answers: CustomerProfileAnswers,
  key: CustomerProfileKey
): boolean | null {
  const v = getStringAnswer(answers, key)
  if (v === null) return null
  return v === 'yes' || v === 'true'
}

/** Whether the profile is effectively unanswered (zero non-null keys). */
export function isProfileEmpty(answers: CustomerProfileAnswers): boolean {
  return CUSTOMER_PROFILE_QUESTIONS.every(
    (q) => getAnswer(answers, q.key as CustomerProfileKey) === null
  )
}

/**
 * Percentage of REQUIRED questions answered. Used by the cockpit to surface
 * profile freshness and by Step A of the bootstrap stepper. 0–100.
 */
export function computeProfileCompletion(answers: CustomerProfileAnswers): number {
  const required = CUSTOMER_PROFILE_QUESTIONS.filter((q) => q.required)
  if (required.length === 0) return 100
  const filled = required.filter((q) => getAnswer(answers, q.key as CustomerProfileKey) !== null).length
  return Math.round((filled / required.length) * 100)
}

// ============================================================================
// Seed SQL — applied when the question-engine UI is wired up (W7+)
// ============================================================================

/**
 * Generates idempotent INSERT statements that seed this schema into
 * form_schemas / form_sections / form_questions. Mirrors the seed pattern
 * used by the HR onboarding/offboarding schemas in
 * /api/migrations/question-engine.
 *
 * NOT called automatically. The customer-facing form-rendering UI is part
 * of W7+ (Bootstrap + Cockpit). Until that lands, this function exists so
 * the migration endpoint can apply the seed in one go when ready.
 */
export function getCustomerProfileSeedSql(): string {
  const sectionInserts = CUSTOMER_PROFILE_SECTIONS.map(
    (s) =>
      `  ('${s.id}', '${CUSTOMER_PROFILE_SCHEMA_ID}', '${s.key}', ${sqlText(s.title)}, ${sqlText(
        s.description ?? null
      )}, ${s.sortOrder})`
  ).join(',\n')

  const questionInserts: string[] = []
  for (const section of CUSTOMER_PROFILE_SECTIONS) {
    for (const q of section.questions) {
      questionInserts.push(
        `  ('${CUSTOMER_PROFILE_SCHEMA_ID}', '${section.id}', ${sqlText(q.key)}, ${sqlText(q.type)}, ${sqlText(q.label)}, ${sqlText(
          q.helpText ?? null
        )}, ${sqlText(q.placeholder ?? null)}, ${q.required ? 'true' : 'false'}, ${q.sortOrder}, ${
          q.staticOptions ? sqlJson(q.staticOptions) : 'NULL'
        })`
      )
    }
  }

  return `
-- ============================================================
-- Customer Profile schema v${CUSTOMER_PROFILE_SCHEMA_VERSION}
-- Generated from src/lib/compliance/customer-profile-schema.ts
-- ============================================================
INSERT INTO form_schemas (id, type, version, status, name, description, published_at)
VALUES (
  '${CUSTOMER_PROFILE_SCHEMA_ID}',
  '${CUSTOMER_PROFILE_TYPE}',
  ${CUSTOMER_PROFILE_SCHEMA_VERSION},
  'published',
  'Customer Compliance Profile v${CUSTOMER_PROFILE_SCHEMA_VERSION}',
  'Consolidated org / environment / scope / process profile used by the compliance engine and policy generator.',
  NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO form_sections (id, schema_id, key, title, description, sort_order) VALUES
${sectionInserts}
ON CONFLICT (id) DO NOTHING;

INSERT INTO form_questions (schema_id, section_id, key, type, label, help_text, placeholder, is_required, sort_order, static_options) VALUES
${questionInserts.join(',\n')}
ON CONFLICT (schema_id, key) DO NOTHING;
`.trim()
}

function sqlText(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL'
  return `'${v.replace(/'/g, "''")}'`
}

function sqlJson(v: unknown): string {
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
}

// ============================================================================
// Writer
// ============================================================================

/**
 * Upsert Customer Profile answers to form_responses. The legacy stores are
 * NOT updated here — write paths that historically wrote to policy_org_profiles
 * or compliance_customer_context continue to do so (dual-write) until the
 * legacy stores are retired (W16, operator-gated).
 *
 * The merge semantics: existing answers are preserved; only the provided keys
 * are overwritten. To delete an answer, pass null/undefined for that key.
 */
export async function saveCustomerProfileAnswers(
  companyId: string,
  answers: CustomerProfileWriteInput,
  updatedBy: string
): Promise<void> {
  if (!companyId) return

  // Drop keys not in the schema and normalize values.
  const sanitized: CustomerProfileAnswers = {}
  for (const [k, v] of Object.entries(answers)) {
    if (CUSTOMER_PROFILE_KEY_SET.has(k)) {
      const norm = normalizeAnswer(v)
      // Preserve nulls so callers can explicitly clear an answer via the merge.
      sanitized[k] = norm
    }
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    // Read-modify-write so partial updates don't overwrite untouched fields.
    const r = await client.query<{ answers: Record<string, unknown> | null }>(
      `SELECT answers FROM form_responses WHERE company_id = $1 AND schema_type = $2`,
      [companyId, CUSTOMER_PROFILE_TYPE]
    )
    const existing = (r.rows[0]?.answers && typeof r.rows[0].answers === 'object'
      ? (r.rows[0].answers as CustomerProfileAnswers)
      : {})
    const merged: CustomerProfileAnswers = { ...existing }
    for (const [k, v] of Object.entries(sanitized)) {
      if (v === null) delete merged[k]
      else merged[k] = v
    }

    await client.query(
      `INSERT INTO form_responses (company_id, schema_type, answers, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
       ON CONFLICT (company_id, schema_type)
       DO UPDATE SET answers = $3::jsonb, updated_by = $4, updated_at = NOW()`,
      [companyId, CUSTOMER_PROFILE_TYPE, JSON.stringify(merged), updatedBy]
    )
  } finally {
    client.release()
  }
}

// ============================================================================
// One-time backfill
// ============================================================================

export interface BackfillResult {
  companyId: string
  /** How many keys were copied from the legacy stores. */
  copiedKeyCount: number
  /** True when form_responses already had data and was skipped. */
  skippedAlreadyPopulated: boolean
}

/**
 * Copy legacy profile answers into form_responses for a single company.
 * Idempotent — skips when form_responses already has non-empty data.
 *
 * Used by the migration endpoint (`/api/migrations/customer-profile-backfill`)
 * to mass-migrate every customer in one pass. Safe to re-run.
 */
export async function backfillCustomerProfileFromLegacy(
  companyId: string,
  updatedBy = 'backfill'
): Promise<BackfillResult> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Skip if form_responses already has data for this customer.
    try {
      const existing = await client.query<{ answers: Record<string, unknown> | null }>(
        `SELECT answers FROM form_responses WHERE company_id = $1 AND schema_type = $2`,
        [companyId, CUSTOMER_PROFILE_TYPE]
      )
      const stored = existing.rows[0]?.answers
      if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) {
        return { companyId, copiedKeyCount: 0, skippedAlreadyPopulated: true }
      }
    } catch {
      // form_responses may not exist yet — proceed; ensure-tables will create it.
    }

    const merged = await readLegacyProfileMerge(client, companyId)
    const keyCount = Object.keys(merged).filter((k) => merged[k] !== null && merged[k] !== undefined).length
    if (keyCount === 0) {
      return { companyId, copiedKeyCount: 0, skippedAlreadyPopulated: false }
    }

    await client.query(
      `INSERT INTO form_responses (company_id, schema_type, answers, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
       ON CONFLICT (company_id, schema_type)
       DO UPDATE SET answers = $3::jsonb, updated_by = $4, updated_at = NOW()`,
      [companyId, CUSTOMER_PROFILE_TYPE, JSON.stringify(merged), updatedBy]
    )

    return { companyId, copiedKeyCount: keyCount, skippedAlreadyPopulated: false }
  } finally {
    client.release()
  }
}

/**
 * Run the backfill for every company that has data in either legacy store.
 * Returns a summary suitable for embedding in a migration response.
 */
export async function backfillAllCustomerProfiles(
  updatedBy = 'backfill'
): Promise<{
  attempted: number
  copied: number
  skipped: number
  empty: number
  results: BackfillResult[]
}> {
  const pool = getPool()
  const client = await pool.connect()
  let companyIds: string[] = []
  try {
    const r = await client.query<{ id: string }>(
      `SELECT DISTINCT id FROM (
         SELECT "companyId" AS id FROM policy_org_profiles
         UNION
         SELECT "companyId" AS id FROM compliance_customer_context
       ) src`
    )
    companyIds = r.rows.map((row) => row.id)
  } catch {
    // Legacy tables missing — nothing to backfill.
    return { attempted: 0, copied: 0, skipped: 0, empty: 0, results: [] }
  } finally {
    client.release()
  }

  const results: BackfillResult[] = []
  let copied = 0
  let skipped = 0
  let empty = 0
  for (const id of companyIds) {
    try {
      const res = await backfillCustomerProfileFromLegacy(id, updatedBy)
      results.push(res)
      if (res.skippedAlreadyPopulated) skipped++
      else if (res.copiedKeyCount === 0) empty++
      else copied++
    } catch (err) {
      console.error('[customer-profile-backfill] failed for', id, err)
    }
  }

  return { attempted: companyIds.length, copied, skipped, empty, results }
}
