/**
 * Policy Generation System — AI Generation Engine
 *
 * Generates complete, company-specific policies using Claude API.
 * Uses the policy catalog, framework mappings, org profile, and
 * policy-specific questionnaire answers to construct detailed prompts.
 *
 * Supports multiple generation modes:
 *   - new: Generate a fresh policy from scratch
 *   - improve: Enhance an existing policy
 *   - update-framework: Align existing policy with framework requirements
 *   - standardize: Reformat to match standard structure
 *   - fill-missing: Add only missing sections
 */

import type { GenerationMode, PolicyDocumentMetadata } from './types'
import { getCatalogItem } from './catalog'
import { FRAMEWORK_POLICY_MAPPINGS } from './framework-mappings'

// ---------------------------------------------------------------------------
// Prompt Construction
// ---------------------------------------------------------------------------

interface GenerationInput {
  policySlug: string
  companyName: string
  orgProfile: Record<string, string | string[] | boolean>
  policyAnswers: Record<string, string | string[] | boolean>
  selectedFrameworks: string[]
  mode: GenerationMode
  existingContent?: string
  userInstructions?: string
}

function buildSystemPrompt(): string {
  return `You are an expert compliance policy writer for Managed Service Providers (MSPs). You generate complete, professional, company-specific IT security and compliance policies.

Your policies must be:
- Written in clear, professional business language
- Specific to the company (use their name, industry, roles, and context throughout)
- Complete and standalone — each policy should be ready to print, sign, and enforce
- Structured with proper sections, numbering, and formatting
- Aligned with the specified compliance frameworks
- Actionable — avoid vague statements like "appropriate measures should be taken"
- Consistent in tone: authoritative but readable, not overly legalistic

Format your output as clean Markdown with:
- A clear title (# heading)
- Policy metadata section at the top (company, effective date, version, owner, etc.)
- Numbered sections (## 1. Purpose, ## 2. Scope, etc.)
- Bullet points for lists
- Bold for key terms on first use
- No placeholder text — fill everything with specific content based on provided answers

IMPORTANT: Generate the FULL policy. Do not abbreviate, truncate, or use "[continue...]" placeholders. Every section must be complete.`
}

function buildGenerationPrompt(input: GenerationInput): string {
  const catalog = getCatalogItem(input.policySlug)

  // Handle gap-remediation-policy (dynamically generated, not in catalog)
  if (!catalog && input.policySlug === 'gap-remediation-policy') {
    return buildGapRemediationPrompt(input)
  }

  if (!catalog) {
    throw new Error(`Unknown policy slug: ${input.policySlug}`)
  }

  // Get framework controls this policy maps to
  const relevantMappings = FRAMEWORK_POLICY_MAPPINGS.filter(
    (m) => m.policySlug === input.policySlug && input.selectedFrameworks.includes(m.frameworkId)
  )

  const frameworkSection = relevantMappings.length > 0
    ? `\n\nThis policy must address the following framework controls:\n${relevantMappings.map(
        (m) => `- [${m.frameworkId}] ${m.controlId}: ${m.controlTitle} (${m.coverageType} coverage)`
      ).join('\n')}`
    : ''

  // Build org context from profile answers
  const orgContext = buildOrgContext(input.orgProfile)

  // Build policy-specific context, injecting org profile data where needed
  const enrichedPolicyAnswers = { ...input.policyAnswers }

  // Incident Response: inject org_incident_contacts as escalation contacts
  // (removed ir_escalation_contacts duplicate — org profile is the single source)
  if (input.policySlug === 'incident-response-policy' && input.orgProfile.org_incident_contacts) {
    enrichedPolicyAnswers['escalation_contacts'] = input.orgProfile.org_incident_contacts
  }

  const policyContext = buildPolicyContext(enrichedPolicyAnswers)

  // Mode-specific instructions
  const modeInstructions = getModeInstructions(input.mode, input.existingContent)

  const today = new Date().toISOString().split('T')[0]
  const reviewDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return `Generate a complete "${catalog.name}" for ${input.companyName}.

## Policy Type Information
- Name: ${catalog.name}
- Description: ${catalog.description}
- Category: ${catalog.category}
- Expected sections: ${catalog.expectedSections.join(', ')}
${frameworkSection}

## Company Context
${orgContext}

## Policy-Specific Answers
${policyContext || 'No additional policy-specific answers provided.'}

## Document Metadata
- Company Name: ${input.companyName}
- Effective Date: ${today}
- Next Review Date: ${reviewDate}
- Version: 1.0
- Policy Owner: ${String(input.orgProfile.org_policy_owner || input.orgProfile.org_security_officer || 'IT Director')}
- Approved By: ${String(input.orgProfile.org_policy_owner || 'Management')}

${modeInstructions}

${input.userInstructions ? `\n## Additional Instructions from User\n${input.userInstructions}` : ''}

Generate the COMPLETE policy now. Include ALL sections listed above. Do not skip, truncate, or abbreviate any section.`
}

function buildGapRemediationPrompt(input: GenerationInput): string {
  const orgContext = buildOrgContext(input.orgProfile)
  const today = new Date().toISOString().split('T')[0]
  const reviewDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return `Generate a comprehensive "Gap Remediation Policy" for ${input.companyName}.

## Purpose
This policy addresses specific compliance control gaps that are NOT covered by the customer's existing policies.
It should complement (not duplicate) existing policies and provide concrete, actionable requirements for each uncovered control.

## Company Context
${orgContext}

## Document Metadata
- Company Name: ${input.companyName}
- Effective Date: ${today}
- Next Review Date: ${reviewDate}
- Version: 1.0
- Policy Owner: ${String(input.orgProfile.org_policy_owner || input.orgProfile.org_security_officer || 'IT Director')}
- Approved By: ${String(input.orgProfile.org_policy_owner || 'Management')}

## Expected Structure
- Title: "Gap Remediation Policy" or "Supplemental Security Controls Policy"
- Section per control area (group related controls into logical sections)
- For each control: requirement statement, implementation guidance, responsible party, verification method
- Enforcement and exceptions section
- Review schedule

${input.userInstructions ? `\n## Specific Controls to Address\n${input.userInstructions}` : ''}

Generate the COMPLETE policy. Each uncovered control must have a dedicated subsection with specific, implementable requirements.`
}

function buildOrgContext(profile: Record<string, string | string[] | boolean>): string {
  const lines: string[] = []
  const add = (label: string, key: string) => {
    const val = profile[key]
    if (val !== undefined && val !== null && val !== '') {
      lines.push(`- ${label}: ${Array.isArray(val) ? val.join(', ') : String(val)}`)
    }
  }

  // Company identity (from questionnaire)
  add('Legal Name', 'org_legal_name')
  add('Headquarters', 'org_address')
  add('States/Countries', 'org_states')
  add('Industry', 'org_industry')
  add('Employee Count', 'org_employee_count')

  // Regulatory scope (from questionnaire)
  add('Handles PHI', 'org_handles_phi')
  add('Handles PII', 'org_handles_pii')
  add('Handles CUI', 'org_handles_cui')

  // Operational context (from questionnaire)
  add('Remote Work', 'org_remote_work')
  add('BYOD Policy', 'org_byod_allowed')
  add('Uses Contractors', 'org_contractors')

  // Security posture (derived from platform mappings — verified by tool integrations)
  add('EDR Deployed', 'org_edr_deployed')
  add('Full-Disk Encryption', 'org_encryption_at_rest')
  add('MDM Deployed', 'org_mdm_deployed')
  add('DNS Filtering', 'org_dns_filtering')
  add('SIEM/SOC Monitoring', 'org_siem_deployed')
  add('MFA Status', 'org_mfa_status')
  add('Backup Type', 'org_backup_type')

  // Governance (from questionnaire)
  add('Security Officer', 'org_security_officer')
  add('Policy Owner', 'org_policy_owner')
  add('Policy Review Cycle', 'org_policy_review_cycle')
  add('Risk Assessment Cadence', 'org_risk_assessment_cadence')
  add('Training Cadence', 'org_training_cadence')
  add('Access Review Cadence', 'org_access_review_cadence')
  add('Incident Contacts', 'org_incident_contacts')
  add('Disciplinary Process', 'org_disciplinary_process')
  add('Exception Process', 'org_exception_process')
  add('AI Tools Usage', 'org_ai_tools_used')
  add('Vendor Review Process', 'org_vendor_review_process')
  add('Data Retention', 'org_data_retention_years')

  return lines.length > 0 ? lines.join('\n') : 'No organization profile data provided.'
}

function buildPolicyContext(answers: Record<string, string | string[] | boolean>): string {
  const entries = Object.entries(answers).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  )
  if (entries.length === 0) return ''
  return entries
    .map(([key, val]) => `- ${key}: ${Array.isArray(val) ? val.join(', ') : String(val)}`)
    .join('\n')
}

function getModeInstructions(mode: GenerationMode, existingContent?: string): string {
  switch (mode) {
    case 'new':
      return '## Mode: Generate New Policy\nCreate a complete new policy from scratch based on the information provided above.'
    case 'improve':
      return `## Mode: Improve Existing Policy\nThe following existing policy needs improvement. Enhance it while preserving the core intent. Add missing sections, strengthen weak areas, and ensure framework alignment.\n\n### Existing Policy Content:\n${existingContent?.substring(0, 10000) ?? '(none provided)'}`
    case 'update-framework':
      return `## Mode: Update for Framework Alignment\nUpdate the following existing policy to better align with the specified framework controls. Add sections or language needed for compliance.\n\n### Existing Policy Content:\n${existingContent?.substring(0, 10000) ?? '(none provided)'}`
    case 'standardize':
      return `## Mode: Standardize Formatting\nReformat the following policy to match the standard structure and expected sections listed above. Preserve all content but reorganize for consistency.\n\n### Existing Policy Content:\n${existingContent?.substring(0, 10000) ?? '(none provided)'}`
    case 'fill-missing':
      return `## Mode: Fill Missing Sections\nReview the following policy and add ONLY the missing sections. Do not rewrite existing sections.\n\n### Existing Policy Content:\n${existingContent?.substring(0, 10000) ?? '(none provided)'}`
    default:
      return '## Mode: Generate New Policy\nCreate a complete new policy from scratch.'
  }
}

// ---------------------------------------------------------------------------
// Generation Function
// ---------------------------------------------------------------------------

export interface GenerateResult {
  content: string
  metadata: PolicyDocumentMetadata
  inputHash: string
}

/**
 * Generate a policy document using Claude API.
 * Returns the generated Markdown content and metadata.
 */
export async function generatePolicy(input: GenerationInput): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildGenerationPrompt(input)

  // Compute input hash for change detection
  const inputHash = computeInputHash(input)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Anthropic API error: ${res.status} ${errBody.substring(0, 200)}`)
  }

  const data = (await res.json()) as { content: Array<{ type: string; text: string }> }
  const content = data.content?.[0]?.text ?? ''

  if (!content || content.length < 500) {
    throw new Error('Generated policy content is too short — generation may have failed')
  }

  const catalogForMeta = getCatalogItem(input.policySlug)
  const today = new Date().toISOString().split('T')[0]
  const reviewDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const metadata: PolicyDocumentMetadata = {
    policyTitle: catalogForMeta?.name ?? (input.policySlug === 'gap-remediation-policy' ? 'Gap Remediation Policy' : input.policySlug),
    companyName: input.companyName,
    effectiveDate: today,
    reviewDate,
    version: '1.0',
    owner: String(input.orgProfile.org_policy_owner || input.orgProfile.org_security_officer || 'IT Director'),
    approvedBy: String(input.orgProfile.org_policy_owner || 'Management'),
  }

  return { content, metadata, inputHash }
}

// ---------------------------------------------------------------------------
// Input hash for change detection
// ---------------------------------------------------------------------------

function computeInputHash(input: GenerationInput): string {
  const relevant = {
    slug: input.policySlug,
    org: input.orgProfile,
    policy: input.policyAnswers,
    frameworks: input.selectedFrameworks.sort(),
    mode: input.mode,
  }
  // Simple hash — sufficient for change detection
  const str = JSON.stringify(relevant)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
