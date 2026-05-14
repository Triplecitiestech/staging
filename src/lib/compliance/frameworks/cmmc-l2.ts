/**
 * CMMC Level 2 — Framework Definition + Evaluators
 *
 * CMMC 2.0 Level 2 ("Advanced") aligns verbatim with the 110 security
 * requirements of NIST SP 800-171 Rev 2. Required for DoD contractors
 * handling Controlled Unclassified Information (CUI). Triennial
 * third-party assessment for prioritized acquisitions; self-assessment
 * with annual affirmation for non-prioritized.
 *
 * Source of truth:
 *   - DoD CMMC 2.0 Program rule, 32 CFR Part 170
 *   - NIST SP 800-171 Rev 2
 *
 * Implementation strategy: re-export the NIST 800-171 framework + evaluators
 * under the cmmc-l2 framework id. Each NIST control row is remapped:
 *   nist-3.X.Y → cmmc-l2-3.X.Y
 * Evaluators delegate to the NIST_800_171_EVALUATORS map so domain logic
 * is authored once and the two frameworks stay in lock-step automatically.
 */

import type {
  ControlDefinition,
  ControlEvaluator,
  FrameworkDefinition,
} from '../types'
import { NIST_800_171_FRAMEWORK, NIST_800_171_EVALUATORS } from './nist-800-171'

function nistIdToCmmcId(nistId: string): string {
  return nistId.replace(/^nist-/, 'cmmc-l2-')
}

const CMMC_L2_CONTROLS: ControlDefinition[] = NIST_800_171_FRAMEWORK.controls.map((c) => ({
  ...c,
  controlId: nistIdToCmmcId(c.controlId),
  frameworkId: 'cmmc-l2',
  tier: 'L2',
  // Re-title with the CMMC practice identifier convention while keeping the
  // NIST citation visible — staff reading the assessment report sees both.
  title: `${c.controlId.replace(/^nist-/, '')} [CMMC L2 / NIST 800-171 §${c.controlId.replace(/^nist-/, '')}]`,
}))

export const CMMC_L2_FRAMEWORK: FrameworkDefinition = {
  id: 'cmmc-l2',
  name: 'CMMC Level 2 (Advanced)',
  version: '2.0',
  description:
    'Cybersecurity Maturity Model Certification 2.0 Level 2 — verbatim alignment with the 110 NIST SP 800-171 Rev 2 requirements for protecting Controlled Unclassified Information (CUI) in DoD contractor environments.',
  controls: CMMC_L2_CONTROLS,
}

// Evaluators: thin wrapper that re-dispatches cmmc-l2-* lookups to the
// underlying nist-* evaluator and re-stamps the result with the CMMC
// controlId for the audit/report rendering.
const CMMC_L2_EVALUATORS: Record<string, ControlEvaluator> = {}
for (const [nistId, evaluator] of Object.entries(NIST_800_171_EVALUATORS)) {
  const cmmcId = nistIdToCmmcId(nistId)
  CMMC_L2_EVALUATORS[cmmcId] = (ctx) => {
    const r = evaluator(ctx)
    return { ...r, controlId: cmmcId }
  }
}

export { CMMC_L2_EVALUATORS }
