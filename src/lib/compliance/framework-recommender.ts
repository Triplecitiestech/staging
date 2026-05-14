/**
 * Framework Auto-Detect (FR5)
 *
 * Maps Customer Profile answers → recommended compliance frameworks.
 * The cockpit calls this when surfacing "frameworks you should assess
 * this customer against" — combining explicit selection (the
 * org_target_frameworks multi-select) with inferred recommendations
 * (handles PHI → HIPAA, handles CUI → CMMC/NIST 800-171, etc.).
 *
 * Pure-function logic over `CustomerProfileAnswers`. No DB calls; no
 * I/O. Easy to unit-test and easy to extend when new frameworks land.
 */

import {
  getCustomerProfileAnswers,
  getStringAnswer,
  getMultiAnswer,
  getBooleanAnswer,
  type CustomerProfileAnswers,
} from './customer-profile-schema'
import type { FrameworkId } from './types'

export interface RecommendedFramework {
  frameworkId: FrameworkId
  /** 'explicit' = customer ticked it in org_target_frameworks; 'inferred' = derived. */
  source: 'explicit' | 'inferred'
  /** Plain-English reason — surfaced in the cockpit so staff knows WHY. */
  reason: string
  /** Whether the framework has working evaluators today, or is type-stubbed. */
  hasEvaluators: boolean
}

/** Frameworks that have full evaluator coverage (engine produces real findings). */
const IMPLEMENTED_FRAMEWORKS: ReadonlySet<FrameworkId> = new Set<FrameworkId>([
  'cis-v8',
  'cis-v8-ig1',
  'cis-v8-ig2',
  'cis-v8-ig3',
  'cmmc-l1',
  'cmmc-l2',
  'hipaa',
  'nist-800-171',
])

/**
 * Recommend frameworks for a customer based on their profile.
 *
 * Resolution order:
 *   1. Explicit picks (org_target_frameworks) — always returned, marked 'explicit'.
 *   2. Inferred from data-type flags (PHI / PII / CUI) and industry.
 *      Inferred entries that duplicate an explicit pick are suppressed.
 *
 * CIS v8 is always recommended (the recommended baseline for everyone).
 */
export function recommendFrameworks(answers: CustomerProfileAnswers): RecommendedFramework[] {
  const out: RecommendedFramework[] = []
  const seen = new Set<FrameworkId>()

  function add(rec: RecommendedFramework) {
    if (seen.has(rec.frameworkId)) return
    seen.add(rec.frameworkId)
    out.push(rec)
  }

  // 1. Explicit picks from org_target_frameworks multi-select.
  const explicit = getMultiAnswer(answers, 'org_target_frameworks')
  for (const e of explicit) {
    if (!isFrameworkId(e)) continue
    add({
      frameworkId: e,
      source: 'explicit',
      reason: 'Customer profile lists this framework as a target.',
      hasEvaluators: IMPLEMENTED_FRAMEWORKS.has(e),
    })
  }

  // 2. Inferred recommendations.
  // CIS v8 is always recommended.
  add({
    frameworkId: 'cis-v8',
    source: 'inferred',
    reason: 'CIS Controls v8 is the recommended security baseline for every customer.',
    hasEvaluators: true,
  })

  // PHI → HIPAA.
  if (getBooleanAnswer(answers, 'org_handles_phi')) {
    add({
      frameworkId: 'hipaa',
      source: 'inferred',
      reason: 'Customer handles Protected Health Information (PHI) — HIPAA Security Rule applies.',
      hasEvaluators: true,
    })
  }

  // CUI → CMMC L2 (= NIST 800-171). Default to CMMC L2 because it's the more
  // common framing for DoD contractors; staff can also pick NIST 800-171
  // explicitly in the profile if they want that label.
  if (getBooleanAnswer(answers, 'org_handles_cui')) {
    add({
      frameworkId: 'cmmc-l2',
      source: 'inferred',
      reason: 'Customer handles Controlled Unclassified Information (CUI) — CMMC Level 2 (= NIST 800-171) applies.',
      hasEvaluators: IMPLEMENTED_FRAMEWORKS.has('cmmc-l2'),
    })
    add({
      frameworkId: 'nist-800-171',
      source: 'inferred',
      reason: 'Customer handles CUI — NIST SP 800-171 requirements apply. Often paired with CMMC L2.',
      hasEvaluators: IMPLEMENTED_FRAMEWORKS.has('nist-800-171'),
    })
  }

  // Industry hints (catch customers who haven't filled the regulatory flags).
  const industry = getStringAnswer(answers, 'org_industry')
  if (industry === 'healthcare' && !seen.has('hipaa')) {
    add({
      frameworkId: 'hipaa',
      source: 'inferred',
      reason: 'Customer industry is healthcare — HIPAA likely applies. Confirm by ticking org_handles_phi if PHI is in scope.',
      hasEvaluators: true,
    })
  }
  if ((industry === 'defense' || industry === 'government') && !seen.has('cmmc-l2')) {
    add({
      frameworkId: 'cmmc-l2',
      source: 'inferred',
      reason: 'Customer industry is defense/government — CMMC L2 likely applies for DoD contracts handling CUI.',
      hasEvaluators: IMPLEMENTED_FRAMEWORKS.has('cmmc-l2'),
    })
  }

  return out
}

/**
 * Convenience wrapper that loads the profile and recommends in one call.
 * Returns empty array when the company has no profile yet.
 */
export async function recommendFrameworksForCompany(companyId: string): Promise<RecommendedFramework[]> {
  const answers = await getCustomerProfileAnswers(companyId)
  return recommendFrameworks(answers)
}

const VALID_FRAMEWORK_IDS: ReadonlySet<string> = new Set([
  'cis-v8',
  'cis-v8-ig1',
  'cis-v8-ig2',
  'cis-v8-ig3',
  'cmmc-l1',
  'cmmc-l2',
  'nist-800-171',
  'hipaa',
  'pci',
])

function isFrameworkId(s: string): s is FrameworkId {
  return VALID_FRAMEWORK_IDS.has(s)
}
