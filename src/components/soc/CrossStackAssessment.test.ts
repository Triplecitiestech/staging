import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CrossStackAssessment from './CrossStackAssessment'

// The page must lead with the answer (T20260930.0005: the useful findings sat
// under a stack of repeated sections, with a stale "final recommendation").
describe('SOC assessment page order', () => {
  const assessment = {
    executiveSummary: 'x', finalRecommendation: 'Ask Ghenel what app or script they connected.', classification: 'suspicious_review', confidence: 0.5, riskLevel: 'medium',
    evidence: [], correlatedSources: [], knownBenignMatch: null, customerImpact: '', recommendedTechnicianActions: ['Ask Ghenel what app or script they connected.', 'Second step'],
    dataGaps: ['a gap'], tenantRootCause: null, internalNote: 'note', closureNote: '', customerMessageRequired: false, customerMessageDraft: null,
  }
  const enrichment = {
    visibility: [{ source: 'M365', state: 'connected', mappedTo: 'x', detail: 'y' }],
    alertFacts: [{ label: 'What happened', value: 'Admin privilege or app grant' }],
    accountChecks: [{ label: 'Sign-ins from the alert IP', value: '3 of 3' }],
    accountFindings: { summary: ['Most likely Ghenel Bacalla themself.'], nextStep: 'Ask Ghenel what app or script they connected.' },
    dataSources: [], dataGaps: [], knownBenignMatches: [],
  }
  const html = renderToStaticMarkup(createElement(CrossStackAssessment, { assessment: assessment as never, enrichment: enrichment as never }))
  const at = (t: string) => { const i = html.indexOf(t); expect(i, t).toBeGreaterThanOrEqual(0); return i }

  it('bottom line → next step → actions → what the alert says → what we checked → collapsed detail', () => {
    const order = ['Bottom Line', 'Next Step', 'Recommended Technician Actions', 'What the Alert Says', 'What We Checked', 'Supporting detail'].map(at)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('the computed findings are shown as the bottom line, not the AI summary', () => {
    expect(html).toContain('Most likely Ghenel Bacalla themself.')
    expect(html).toContain('Computed from the checks below — not AI-written')
  })

  it('visibility and data gaps live inside the collapsed detail', () => {
    const d = at('<details')
    expect(at('Visibility for This Client')).toBeGreaterThan(d)
    expect(at('Data Gaps')).toBeGreaterThan(d)
  })
})
