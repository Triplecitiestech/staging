/**
 * Policy Generation System — Type Definitions
 *
 * Types for the policy catalog, framework mappings, questionnaire engine,
 * AI generation workflow, and document export pipeline.
 */

// ---------------------------------------------------------------------------
// Policy Catalog
// ---------------------------------------------------------------------------

export interface PolicyCatalogItem {
  /** Unique slug, e.g. 'acceptable-use-policy' */
  slug: string
  /** Display name */
  name: string
  /** Short description of what this policy covers */
  description: string
  /** Broad category grouping */
  category: PolicyCategory
  /** Expected sections in a complete policy of this type */
  expectedSections: string[]
  /** Frameworks that require or recommend this policy */
  frameworkRelevance: PolicyFrameworkRelevance[]
  /** Sort order for display */
  sortOrder: number
}

export type PolicyCategory =
  | 'governance'
  | 'access-control'
  | 'data-protection'
  | 'operations'
  | 'incident-response'
  | 'human-resources'
  | 'vendor-management'
  | 'technical'
  | 'compliance-specific'

export interface PolicyFrameworkRelevance {
  frameworkId: string
  /** Which controls this policy supports */
  controlIds: string[]
  /** Whether this policy is required or recommended for the framework */
  requirement: 'required' | 'recommended' | 'supporting'
}

// ---------------------------------------------------------------------------
// Framework-to-Policy Mapping
// ---------------------------------------------------------------------------

export interface FrameworkPolicyMapping {
  frameworkId: string
  frameworkName: string
  policySlug: string
  controlId: string
  controlTitle: string
  /** How much of the control this policy covers */
  coverageType: 'full' | 'partial' | 'supporting'
}

// ---------------------------------------------------------------------------
// Organization Profile & Questionnaire
// ---------------------------------------------------------------------------

export interface OrgProfile {
  companyId: string
  answers: Record<string, string | string[] | boolean>
  updatedAt: string
  updatedBy: string
}

export interface QuestionDefinition {
  id: string
  /** Which section this belongs to: 'org-profile' or a policy slug */
  section: string
  /** Display label */
  label: string
  /** Help text / description */
  helpText?: string
  /** Input type */
  type: 'text' | 'textarea' | 'select' | 'multi-select' | 'boolean' | 'email' | 'date'
  /** Options for select/multi-select */
  options?: Array<{ value: string; label: string }>
  /** Whether this question is required */
  required: boolean
  /** Conditional: only show if another answer matches */
  conditional?: { questionId: string; value: string | boolean }
  /** Pre-fill key: if this matches an org profile key, auto-fill */
  prefillKey?: string
  /** Sort order within section */
  sortOrder: number
}

// ---------------------------------------------------------------------------
// Policy Generation
// ---------------------------------------------------------------------------

export type PolicyGenStatus =
  | 'missing'
  | 'intake_needed'
  | 'ready_to_generate'
  | 'generating'
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'exported'
  | 'synced'

export interface PolicyGenerationRecord {
  id: string
  companyId: string
  policySlug: string
  /** FK to compliance_policies table for the generated content */
  policyId: string | null
  status: PolicyGenStatus
  version: number
  /** JSON of the org profile + policy answers used to generate */
  inputSnapshot: Record<string, unknown>
  /** Hash of inputs for change detection */
  inputHash: string
  generatedAt: string | null
  generatedBy: string | null
  approvedAt: string | null
  approvedBy: string | null
  exportedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PolicyVersionRecord {
  id: string
  companyId: string
  policySlug: string
  version: number
  policyId: string
  content: string
  status: PolicyGenStatus
  inputSnapshot: Record<string, unknown>
  generatedAt: string
  generatedBy: string
  approvedAt: string | null
  approvedBy: string | null
}

// ---------------------------------------------------------------------------
// Generation Request / Response
// ---------------------------------------------------------------------------

export interface GeneratePolicyRequest {
  companyId: string
  policySlug: string
  /** 'new' | 'improve' | 'update-framework' | 'standardize' | 'fill-missing' */
  mode: GenerationMode
  /** Existing policy content to improve/update (optional) */
  existingContent?: string
  /** Specific instructions from user (optional) */
  userInstructions?: string
}

export type GenerationMode =
  | 'new'
  | 'improve'
  | 'update-framework'
  | 'standardize'
  | 'fill-missing'

export interface GeneratePolicyResult {
  policyId: string
  content: string
  title: string
  version: number
  metadata: PolicyDocumentMetadata
}

export interface PolicyDocumentMetadata {
  policyTitle: string
  companyName: string
  effectiveDate: string
  reviewDate: string
  version: string
  owner: string
  approvedBy: string
}

// ---------------------------------------------------------------------------
// Export / Download
// ---------------------------------------------------------------------------

export type ExportFormat = 'html' | 'markdown' | 'docx'

export interface ExportRequest {
  companyId: string
  /** Single policy or array for bundle */
  policySlugs: string[]
  format: ExportFormat
  /** If true, bundle all into a zip */
  bundle: boolean
}

// ---------------------------------------------------------------------------
// Needs Analysis
// ---------------------------------------------------------------------------

export interface PolicyNeedsAnalysis {
  companyId: string
  companyName: string
  selectedFrameworks: string[]
  /** All policies required/recommended across selected frameworks */
  requiredPolicies: PolicyNeedItem[]
  /** Summary stats */
  stats: {
    totalRequired: number
    existing: number
    missing: number
    drafts: number
    approved: number
    intakeNeeded: number
  }
}

export interface PolicyNeedItem {
  slug: string
  name: string
  category: PolicyCategory
  /** Highest requirement level across selected frameworks */
  requirement: 'required' | 'recommended' | 'supporting'
  /** Which frameworks need this */
  frameworks: string[]
  /** Current status for this company */
  status: PolicyGenStatus
  /** If existing, the policy record ID */
  existingPolicyId: string | null
  /** Number of controls this policy supports */
  controlCount: number
  /** Last updated date if exists */
  lastUpdated: string | null
}

// ---------------------------------------------------------------------------
// Document Storage Provider (future integration abstraction)
// ---------------------------------------------------------------------------

export interface DocumentStorageProvider {
  name: string
  /** Publish a policy document to external storage */
  publish(companyId: string, policySlug: string, content: string, metadata: PolicyDocumentMetadata): Promise<{ url: string }>
  /** Check if a document exists */
  exists(companyId: string, policySlug: string): Promise<boolean>
}
