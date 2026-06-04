/**
 * AI discovery question set — the SINGLE source of truth shared by:
 *   • the staff-filled discovery form (/admin/documents/ai-playbook/discovery)
 *   • the read-only worksheet rendered in Phase 0 of the playbook
 *
 * Keep questions here so the form and the doc never drift. Each question has a
 * stable `id` (used as the answer key in the saved JSON), so you can add or
 * reword questions without breaking previously-saved assessments.
 */

export type PlatformLean = 'openai' | 'anthropic' | 'both'

export interface DiscoveryChoice {
  label: string
  /** If set, selecting this choice nudges the platform recommendation. */
  lean?: PlatformLean
}

export interface DiscoveryQuestion {
  id: string
  theme: string
  prompt: string
  tells: string
  kind: 'text' | 'longtext' | 'choice'
  choices?: DiscoveryChoice[]
}

export interface DiscoveryGroup {
  id: string
  title: string
  blurb?: string
  /** True for the platform-direction group so the doc can flag it. */
  platform?: boolean
  questions: DiscoveryQuestion[]
}

export const DISCOVERY_GROUPS: DiscoveryGroup[] = [
  {
    id: 'business',
    title: 'Business & Opportunity',
    blurb: 'Open questions to surface where AI pays off and who the real buyer is.',
    questions: [
      { id: 'profit_leak', theme: 'Profit Leak', kind: 'longtext', prompt: 'Where do you feel the business wastes the most time or money right now?', tells: 'Targets the first automation / project.' },
      { id: 'manual_bottlenecks', theme: 'Manual Bottlenecks', kind: 'longtext', prompt: 'What are the top 2–3 things your team does manually that feel repetitive or outdated?', tells: 'Low-hanging fruit for custom GPTs / agents.' },
      { id: 'ai_awareness', theme: 'AI Awareness', kind: 'longtext', prompt: "Have you experimented with any AI tools yet — and if so, what's working or frustrating you?", tells: 'Maturity → office-hours depth.' },
      { id: 'revenue_targets', theme: 'Revenue Targets', kind: 'longtext', prompt: 'If you could add $10K/month without adding staff, where would it come from — more clients, higher ticket, or efficiency?', tells: 'Frames the ROI pitch.' },
      { id: 'decision_power', theme: 'Decision Power', kind: 'text', prompt: 'Who makes the final call on growth strategy or budget allocation?', tells: 'Identifies the real buyer.' },
      { id: 'speed_to_change', theme: 'Speed to Change', kind: 'text', prompt: 'When you see something that could improve profits, how fast do you typically move?', tells: 'Sets rollout pace expectations.' },
      { id: 'tech_tolerance', theme: 'Tech Tolerance', kind: 'text', prompt: 'Does your team lean into new tools easily, or does adoption need more hand-holding?', tells: 'Sizes the enablement / office-hours scope.' },
      { id: 'visibility', theme: 'Visibility & Reporting', kind: 'text', prompt: 'Do you have visibility into key metrics, or is it gut instinct and scattered reports?', tells: 'Data-readiness signal.' },
      { id: 'risk_reward', theme: 'Risk vs. Reward', kind: 'text', prompt: 'Are you more focused on top-line revenue, protecting margins, or reducing dependency on human effort?', tells: 'Tunes messaging emphasis.' },
      { id: 'future_vision', theme: 'Future Vision', kind: 'longtext', prompt: 'If we met 12 months from now, what would make you call this year a success?', tells: 'Anchors the roadmap & next TBR.' },
    ],
  },
  {
    id: 'readiness',
    title: 'Readiness & Foundations',
    blurb: 'The gates. These map directly to the decision forks below — answer honestly.',
    questions: [
      { id: 'ms_env', theme: 'Microsoft Foundation', kind: 'choice', prompt: 'Is your Microsoft environment set up and healthy?', tells: 'Foundation gate — full stop if no.', choices: [{ label: 'Healthy' }, { label: 'Partial / needs work' }, { label: 'Not set up' }, { label: 'Unknown' }] },
      { id: 'data_state', theme: 'Data Readiness', kind: 'choice', prompt: 'Where does your data live, and is it clean and connectable?', tells: 'Data gate — scope a cleanup project if messy.', choices: [{ label: 'Clean & connectable' }, { label: 'Some cleanup needed' }, { label: 'Messy / scattered' }, { label: 'Unknown' }] },
      { id: 'compliance', theme: 'Compliance', kind: 'choice', prompt: 'Do you handle CUI / CMMC-regulated data?', tells: 'Compliance fork — keep CUI out of cloud AI for now.', choices: [{ label: 'No' }, { label: 'Some' }, { label: 'Yes' }, { label: 'Unsure' }] },
      { id: 'buying_through', theme: 'Procurement', kind: 'choice', prompt: 'Will you buy AI through us, or do you already have / insist on your own?', tells: 'Scope fork — full managed vs. contract-only support.', choices: [{ label: 'Through TCT' }, { label: 'Already have it' }, { label: 'Insist on own' }, { label: 'Undecided' }] },
    ],
  },
  {
    id: 'platform',
    title: 'Platform Direction — ChatGPT, Claude, or both',
    blurb: 'These steer the platform recommendation. The form tallies the leans and suggests a direction; you confirm it.',
    platform: true,
    questions: [
      { id: 'use_case', theme: 'Primary Use Case', kind: 'choice', prompt: 'What is the main thing you want AI to do?', tells: 'Everyday chat → ChatGPT; custom/dev → Claude.', choices: [{ label: 'Everyday employee chat & enablement', lean: 'openai' }, { label: 'Custom builds, automations, integrations', lean: 'anthropic' }, { label: 'Both', lean: 'both' }] },
      { id: 'primary_users', theme: 'Primary Users', kind: 'choice', prompt: 'Who will use it most?', tells: 'General staff → ChatGPT; technical team → Claude.', choices: [{ label: 'General staff', lean: 'openai' }, { label: 'Developers / technical team', lean: 'anthropic' }, { label: 'A mix of both', lean: 'both' }] },
      { id: 'integrations', theme: 'Integration Needs', kind: 'choice', prompt: 'Do you need custom integrations into line-of-business systems (ERP / CRM / APIs)?', tells: 'Heavy integration → Claude (AI Development track).', choices: [{ label: 'No — mostly conversational', lean: 'openai' }, { label: 'Yes — several', lean: 'anthropic' }, { label: 'A few', lean: 'both' }] },
      { id: 'agentic', theme: 'API & Agents', kind: 'choice', prompt: 'Appetite for API-driven or agentic / automation workloads?', tells: 'High → Claude; mind metered tokens (see Token Economics).', choices: [{ label: 'Low — chat is enough', lean: 'openai' }, { label: 'High — automate workflows', lean: 'anthropic' }, { label: 'Medium', lean: 'both' }] },
      { id: 'm365', theme: 'Microsoft 365 Depth', kind: 'choice', prompt: 'How deep is your Microsoft 365 usage (SharePoint, Teams, Outlook)?', tells: 'Heavy M365 → ChatGPT native connectors are a fast win.', choices: [{ label: 'Heavy', lean: 'openai' }, { label: 'Medium' }, { label: 'Light' }] },
      { id: 'sensitivity', theme: 'Sensitivity', kind: 'choice', prompt: 'Any hard data-sensitivity that might require a local / private model?', tells: 'High → see Security & Risk; consider local Spark / private cloud.', choices: [{ label: 'Standard' }, { label: 'High — consider local / private' }] },
    ],
  },
]

export const PLATFORM_LABELS: Record<PlatformLean | 'undecided', string> = {
  openai: 'ChatGPT (OpenAI)',
  anthropic: 'Claude (Anthropic)',
  both: 'Both',
  undecided: 'Undecided',
}

/**
 * Tally the platform leans from the choice answers and suggest a direction.
 * Returns null when there isn't enough signal yet.
 */
export function suggestPlatform(answers: Record<string, string>): {
  lean: PlatformLean | null
  openai: number
  anthropic: number
  both: number
} {
  let openai = 0, anthropic = 0, both = 0
  for (const group of DISCOVERY_GROUPS) {
    for (const q of group.questions) {
      if (q.kind !== 'choice' || !q.choices) continue
      const selected = answers[q.id]
      const choice = q.choices.find((c) => c.label === selected)
      if (!choice?.lean) continue
      if (choice.lean === 'openai') openai++
      else if (choice.lean === 'anthropic') anthropic++
      else both++
    }
  }
  const oScore = openai + both
  const aScore = anthropic + both
  if (oScore === 0 && aScore === 0) return { lean: null, openai, anthropic, both }
  if (Math.abs(oScore - aScore) <= 1 && both > 0) return { lean: 'both', openai, anthropic, both }
  if (oScore === aScore) return { lean: 'both', openai, anthropic, both }
  return { lean: oScore > aScore ? 'openai' : 'anthropic', openai, anthropic, both }
}
