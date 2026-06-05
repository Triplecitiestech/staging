/**
 * Case-study data for the AI playbook one-pagers. Add an entry here and a
 * printable page is available at /admin/documents/ai-playbook/case-studies/<slug>.
 *
 * [Bracketed] values are placeholders the team fills with the client's real
 * numbers before sharing — kept honest rather than invented.
 */

export interface CaseStudy {
  slug: string
  client: string
  industry: string
  category: 'Managed Services' | 'AI Development'
  headline: string
  summary: string
  challenge: string[]
  approach: string[]
  results: string[]
  stack: string[]
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'brooms-over-broome',
    client: 'Brooms Over Broome',
    industry: 'Residential & commercial cleaning',
    category: 'AI Development',
    headline: 'Stopped losing business to missed and unreturned calls',
    summary:
      'We turned a manual, leaky phone process into an automated call-intelligence pipeline — so no caller falls through the cracks and the team stops doing data entry.',
    challenge: [
      'Inbound calls are the lifeblood of the business, but missed calls, calls that were never returned, and first-time callers were slipping through.',
      'Tracking who called, who was new, and who still needed a callback was manual and inconsistent.',
      'Every lost call was a lost job — with no visibility into how much it was costing.',
    ],
    approach: [
      'Analyzed the call logs to surface the leak: missed calls, no-callback calls, and new vs. returning callers.',
      'Built automatic ingestion of the call data and routing of each call to the right next action.',
      'Eliminated the manual data entry that was eating staff time and causing dropped follow-ups.',
      'Rode on the managed AI environment — no new systems for the team to babysit.',
    ],
    results: [
      'No caller falls through the cracks — every missed call is captured and routed for callback.',
      'Manual call-log data entry eliminated.',
      '[X missed calls / month] now recovered → an estimated [$X / month] in recovered business.',
      'Zero new headcount — the automation does the tracking.',
    ],
    stack: ['Call-log data', 'AI ingestion & routing', 'Managed AI environment'],
  },
]

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return CASE_STUDIES.find((c) => c.slug === slug)
}
