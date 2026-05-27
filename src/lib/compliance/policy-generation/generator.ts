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
import { trackApiUsage } from '@/lib/api-usage-tracker'

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

  // Generation strategy (model + token budgeting):
  //   Attempt 1 \u2014 Haiku 4.5 (fast primary). 4000 max_tokens with STREAMING.
  //     Streaming means our deadline is "no tokens for 20s" rather than
  //     "must finish within 32s" \u2014 so a long but actively-streaming
  //     generation no longer aborts at exactly 32s the way the previous
  //     non-streaming implementation did.
  //   Attempt 2 (on timeout/transient failure) \u2014 Sonnet 4.6 (quality
  //     fallback), also streaming, smaller token budget.
  //
  // Total wall-clock budget: ~55s, leaving ~5s for DB writes within
  // Vercel's 60s function timeout. Idle timeouts (20s/15s) catch genuinely
  // stuck connections without killing slow-but-progressing generations.
  //
  // Errors are captured with enough detail (model, status, elapsed ms,
  // error class) so when both fail the tech sees *why*.
  type AttemptFailure = {
    model: string
    kind: 'timeout' | 'http_error' | 'network' | 'other'
    message: string
    elapsedMs: number
    status?: number
  }

  // Streaming Anthropic call.
  //
  // Two timeouts cooperate:
  //   - wallClockMs: absolute max from start of fetch (Vercel function cap)
  //   - idleTimeoutMs: max gap between SSE chunks (catches stuck connections)
  //
  // Streaming matters here because long policy prompts can take 25-40s of
  // wall-clock time at Anthropic \u2014 well within their normal SLA, but past
  // any reasonable single-shot AbortSignal.timeout(). With streaming we
  // see tokens arrive every ~50-200ms; as long as they keep flowing, we
  // wait. The hard wall-clock cap exists only to respect Vercel's 60s
  // function limit.
  const callAnthropic = async (
    model: string,
    wallClockMs: number,
    idleTimeoutMs: number,
    maxTokens: number,
  ): Promise<string> => {
    const started = Date.now()
    const controller = new AbortController()

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let wallTimer: ReturnType<typeof setTimeout> | null = null
    let abortReason: 'idle' | 'wall' | null = null

    const cleanupTimers = () => {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
      if (wallTimer) { clearTimeout(wallTimer); wallTimer = null }
    }
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { abortReason = 'idle'; controller.abort() }, idleTimeoutMs)
    }

    wallTimer = setTimeout(() => { abortReason = 'wall'; controller.abort() }, wallClockMs)
    resetIdleTimer()

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: controller.signal,
      })

      if (!r.ok) {
        const errBody = await r.text().catch(() => '')
        cleanupTimers()
        const failure: AttemptFailure = {
          model,
          kind: 'http_error',
          status: r.status,
          message: `HTTP ${r.status}: ${errBody.substring(0, 300)}`,
          elapsedMs: Date.now() - started,
        }
        console.error('[compliance/generator] Anthropic HTTP error', failure)
        throw Object.assign(new Error(failure.message), { failure })
      }
      if (!r.body) {
        cleanupTimers()
        const failure: AttemptFailure = {
          model, kind: 'other', message: 'No response body from Anthropic', elapsedMs: Date.now() - started,
        }
        throw Object.assign(new Error(failure.message), { failure })
      }

      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      // Capture usage from message_start (input_tokens + cache_*) and
      // message_delta (final cumulative output_tokens). Without this the
      // policy generator silently burned tokens with no row in
      // api_usage_logs \u2014 accounting for the bulk of the $100/mo Anthropic
      // bill before the meter was honest.
      let inputTokens = 0
      let outputTokens = 0

      // Parse Anthropic SSE stream. Events look like:
      //   event: content_block_delta
      //   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resetIdleTimer()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try {
            const event = JSON.parse(data) as {
              type?: string
              delta?: { type?: string; text?: string }
              message?: {
                usage?: {
                  input_tokens?: number
                  output_tokens?: number
                  cache_creation_input_tokens?: number
                  cache_read_input_tokens?: number
                }
              }
              usage?: { output_tokens?: number }
            }
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
              content += event.delta.text
            } else if (event.type === 'message_start' && event.message?.usage) {
              const u = event.message.usage
              inputTokens =
                (u.input_tokens ?? 0) +
                (u.cache_creation_input_tokens ?? 0) +
                (u.cache_read_input_tokens ?? 0)
              outputTokens = u.output_tokens ?? 0
            } else if (event.type === 'message_delta' && event.usage?.output_tokens != null) {
              outputTokens = event.usage.output_tokens
            }
          } catch {
            // Anthropic occasionally emits partial JSON lines on chunk
            // boundaries \u2014 ignore parse errors, the next chunk will
            // contain the rest.
          }
        }
      }
      cleanupTimers()
      await trackApiUsage({
        provider: 'anthropic',
        feature: 'compliance_policy_generation',
        model,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - started,
        statusCode: 200,
      })
      return content
    } catch (err) {
      cleanupTimers()
      const existingFailure = (err as { failure?: AttemptFailure }).failure
      const elapsedMs = Date.now() - started
      const isTimeout = abortReason !== null
        || (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError'))
      const failure: AttemptFailure = existingFailure ?? {
        model,
        kind: isTimeout ? 'timeout' : (err instanceof TypeError ? 'network' : 'other'),
        message: abortReason === 'wall'
          ? `Hit wall-clock timeout (${wallClockMs}ms) \u2014 generation took longer than the Vercel function budget allows.`
          : abortReason === 'idle'
            ? `Hit idle timeout (${idleTimeoutMs}ms) \u2014 Anthropic stopped streaming chunks.`
            : (err instanceof Error ? err.message : String(err)),
        elapsedMs,
      }
      await trackApiUsage({
        provider: 'anthropic',
        feature: 'compliance_policy_generation',
        model,
        durationMs: elapsedMs,
        statusCode: failure.kind === 'http_error' ? (failure.status ?? 500) : 500,
        error: failure.message,
      })
      if (existingFailure) throw err
      console.error('[compliance/generator] Anthropic call failed', failure)
      throw Object.assign(new Error(failure.message), { failure })
    }
  }

  let content = ''
  let usedFallback = false
  const failures: AttemptFailure[] = []

  // Attempt 1: Haiku 4.5 (fast primary).
  // 55s wall-clock leaves 5s headroom under Vercel's 60s function cap.
  // 20s idle timeout catches actually-stuck connections without killing
  // slow-but-streaming generations.
  try {
    content = await callAnthropic('claude-haiku-4-5-20251001', 55_000, 20_000, 4000)
    // Guard against an empty/truncated response \u2014 treat as failure so the
    // Sonnet fallback runs.
    if (!content || content.length < 500) {
      throw Object.assign(new Error('Haiku returned a very short response'), {
        failure: { model: 'claude-haiku-4-5-20251001', kind: 'other', message: 'short_response', elapsedMs: 0 },
      })
    }
  } catch (err) {
    const primaryFailure = (err as { failure?: AttemptFailure }).failure
    if (primaryFailure) failures.push(primaryFailure)

    // Only fall back on transient issues. Hard errors (401/404) surface directly.
    const shouldFallback = !primaryFailure
      || primaryFailure.kind === 'timeout'
      || primaryFailure.kind === 'network'
      || primaryFailure.kind === 'other'
      || (primaryFailure.kind === 'http_error' && (primaryFailure.status === 429 || (primaryFailure.status ?? 0) >= 500))

    if (!shouldFallback && primaryFailure) {
      throw new Error(
        `Policy generation failed (${primaryFailure.model}): ${primaryFailure.message}. ` +
        `Check that ANTHROPIC_API_KEY is valid and the model is available.`
      )
    }

    // If Haiku timed out on the WALL clock, retrying Sonnet won't help —
    // we're already at ~55s and the function will die before Sonnet gets
    // a chance to finish. Skip straight to error reporting in that case.
    const haikuHitWallClock = primaryFailure?.kind === 'timeout' && (primaryFailure.elapsedMs ?? 0) > 50_000
    if (haikuHitWallClock) {
      throw new Error(
        `AI generation timed out: Haiku hit the wall-clock limit (${primaryFailure?.elapsedMs}ms). ` +
        `The prompt may be too large for a single 60s function invocation. Reduce framework count or split the policy generation.`
      )
    }

    console.warn('[compliance/generator] Haiku primary failed, trying Sonnet fallback', primaryFailure)
    // Attempt 2: Sonnet 4.6 (quality fallback). Budget is whatever's left
    // of our 55s wall-clock cap — be conservative with max_tokens so we
    // don't run out of time mid-generation.
    const remainingWallClock = Math.max(15_000, 55_000 - (primaryFailure?.elapsedMs ?? 0))
    try {
      content = await callAnthropic('claude-sonnet-4-6', remainingWallClock, 15_000, 2500)
      usedFallback = true
    } catch (err2) {
      const fallbackFailure = (err2 as { failure?: AttemptFailure }).failure
      if (fallbackFailure) failures.push(fallbackFailure)

      const anyAuthError = failures.some((f) => f.kind === 'http_error' && f.status === 401)
      const anyBadModel = failures.some((f) => f.kind === 'http_error' && f.status === 404)
      const anyRateLimited = failures.some((f) => f.kind === 'http_error' && f.status === 429)
      const allTimedOut = failures.every((f) => f.kind === 'timeout')

      if (anyAuthError) {
        throw new Error('Policy generation failed: Anthropic API key is invalid or unauthorized (401). Verify ANTHROPIC_API_KEY in Vercel environment variables.')
      }
      if (anyBadModel) {
        throw new Error(`Policy generation failed: one of the Anthropic model IDs is no longer available (404). Failures: ${failures.map((f) => `${f.model} -> ${f.message}`).join(' | ')}`)
      }
      if (anyRateLimited) {
        throw new Error('Policy generation failed: Anthropic API is rate-limiting requests (429). Wait a minute and try again, or generate policies one at a time instead of in batches.')
      }
      if (allTimedOut) {
        throw new Error(`AI generation timed out on both models (Haiku ${failures[0]?.elapsedMs}ms, Sonnet ${failures[1]?.elapsedMs}ms). Anthropic API may be experiencing high latency. Please try again in a minute.`)
      }
      throw new Error(`Policy generation failed on both models. ${failures.map((f) => `[${f.model}] ${f.message}`).join(' \u2014 ')}`)
    }
  }

  if (!content || content.length < 500) {
    throw new Error('Generated policy content is too short \u2014 generation may have failed')
  }

  if (usedFallback) {
    content = `${content}\n\n<!-- Note: Haiku (the fast primary model) failed; this draft was produced by Sonnet as a fallback. Content is high quality but may be slightly shorter than a typical Haiku draft. -->`
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
