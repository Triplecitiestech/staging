/**
 * AI discovery question set — the SINGLE source of truth shared by:
 *   • the staff-filled discovery form (/admin/documents/ai-playbook/discovery)
 *   • the read-only worksheet rendered in Phase 0 of the playbook
 *
 * Structure follows the AI Growth & Profit Assessment (AIGPA) methodology: six
 * "profit zones" where work piles up and money leaks, plus a readiness/gates
 * group and a platform-direction group. On the call, pick 2–3 questions per
 * zone (don't ask all of them) and listen for "manual", "copy-paste", "I do
 * it", "we forget" — that's a Red zone. Each zone captures an estimated
 * monthly $ waste (the "Follow-Up Multiplier" number that anchors the report).
 *
 * Keep questions here so the form and the doc never drift. Each question has a
 * stable `id` (the answer key in saved JSON), so you can add or reword without
 * breaking previously-saved assessments.
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
  /** One of the six AIGPA profit zones. */
  zone?: boolean
  /** The platform-direction group — the doc/form flag it and tally leans. */
  platform?: boolean
  questions: DiscoveryQuestion[]
}

// Shared building blocks for the six zones.
const SEVERITY: DiscoveryChoice[] = [
  { label: 'Heavy — mostly manual' },
  { label: 'Moderate' },
  { label: 'Dialed in' },
]
const severityQ = (id: string, prompt: string): DiscoveryQuestion => ({
  id, theme: 'Zone score', kind: 'choice', choices: SEVERITY, prompt,
  tells: 'Red / Yellow / Green. "Manual / copy-paste / I do it / we forget" = Red.',
})
const wasteQ = (id: string): DiscoveryQuestion => ({
  id, theme: 'Monthly waste', kind: 'text', prompt: 'Estimated monthly waste in this zone ($)',
  tells: 'Follow-Up Multiplier: hours/week × loaded payroll → $/month. Goes on the report.',
})

export const DISCOVERY_GROUPS: DiscoveryGroup[] = [
  {
    id: 'acquisition', zone: true, title: 'Acquisition — Marketing 📢',
    blurb: 'How much time/money is wasted generating and capturing leads. Pick 2–3.',
    questions: [
      severityQ('acq_score', 'Overall, how manual is lead generation & capture?'),
      { id: 'acq_content', theme: 'Content Creation', kind: 'longtext', prompt: 'How many hours/week does your team spend writing copy, creating social posts, or formatting emails?', tells: 'Content-creation automation play.' },
      { id: 'acq_capture', theme: 'Lead Capture', kind: 'longtext', prompt: 'When a new lead clicks an ad or fills out a form, walk me through the exact manual steps to get them tagged in your system.', tells: 'Lead-capture automation.' },
      { id: 'acq_outbound', theme: 'Outbound Friction', kind: 'text', prompt: 'Is outbound outreach personalized at scale, or done manually one by one?', tells: 'Outbound automation.' },
      { id: 'acq_data', theme: 'Data Blindness', kind: 'text', prompt: 'How do you track which channels drive the highest-quality leads — a manual spreadsheet?', tells: 'Attribution / reporting automation.' },
      { id: 'acq_graveyard', theme: 'The Graveyard', kind: 'longtext', prompt: "What happens to leads that opt in but don't book or buy? Who nurtures them, and how often does it actually happen?", tells: 'Nurture-sequence automation.' },
      wasteQ('acq_waste'),
    ],
  },
  {
    id: 'conversion', zone: true, title: 'Conversion — Sales 🤝',
    blurb: 'Where deals stall and reps do admin instead of selling.',
    questions: [
      severityQ('con_score', 'Overall, how much of the sales motion is manual admin?'),
      { id: 'con_speed', theme: 'Speed to Lead', kind: 'text', prompt: 'What is your average response time when a new inquiry comes in — minutes, hours, days?', tells: 'Speed-to-lead automation.' },
      { id: 'con_admin', theme: 'Admin Bloat', kind: 'longtext', prompt: "What % of the sales team's day is admin (CRM updates, follow-ups, quotes) vs. actually talking to prospects?", tells: 'Sales-admin automation.' },
      { id: 'con_ghost', theme: 'Ghosting Protocol', kind: 'longtext', prompt: 'Walk me through your follow-up for prospects who ghost after a proposal — automated, or reliant on a rep remembering?', tells: 'Follow-up sequence automation.' },
      { id: 'con_qualify', theme: 'Qualification', kind: 'text', prompt: "Any system to instantly qualify/disqualify leads before they take a salesperson's calendar slot?", tells: 'Lead-qualification bot.' },
      { id: 'con_calls', theme: 'Call Analytics', kind: 'text', prompt: 'How are sales calls reviewed — is someone manually listening to tape to find out why deals are lost?', tells: 'Call-analytics automation.' },
      wasteQ('con_waste'),
    ],
  },
  {
    id: 'fulfillment', zone: true, title: 'Fulfillment — Delivery 📦',
    blurb: 'Bottlenecks that slow delivery and eat gross margin.',
    questions: [
      severityQ('ful_score', 'Overall, how manual/bottlenecked is delivery?'),
      { id: 'ful_48', theme: '48-Hour Window', kind: 'longtext', prompt: 'Walk me through the first 48 hours after a client pays — what manual steps, emails, and setup tasks happen to onboard them?', tells: 'Onboarding automation.' },
      { id: 'ful_break', theme: 'Breaking Point', kind: 'text', prompt: 'If you doubled client volume tomorrow, which part of delivery breaks first?', tells: 'Scalability bottleneck → priority play.' },
      { id: 'ful_report', theme: 'Reporting Drag', kind: 'text', prompt: 'How much time is spent manually pulling data to generate client reports or status updates?', tells: 'Reporting automation.' },
      { id: 'ful_sop', theme: 'SOP Adherence', kind: 'text', prompt: 'Are SOPs easily accessible and strictly followed, or does the team rely on tribal knowledge?', tells: 'SOP / knowledge-base build.' },
      { id: 'ful_margin', theme: 'Margin Killers', kind: 'text', prompt: 'Where does fulfillment spend the most time on repetitive, low-value click-work?', tells: 'Margin-killer automation.' },
      wasteQ('ful_waste'),
    ],
  },
  {
    id: 'retention', zone: true, title: 'Retention — Support ❤️',
    blurb: 'Time wasted answering repetitive questions and managing churn.',
    questions: [
      severityQ('ret_score', 'Overall, how manual/reactive is support & retention?'),
      { id: 'ret_faq', theme: 'FAQ Drain', kind: 'longtext', prompt: 'What are the top 3 most repetitive questions your support team (or you) answer every week?', tells: 'FAQ / support-deflection bot.' },
      { id: 'ret_offhours', theme: 'Off-Hours Support', kind: 'text', prompt: 'How long does a client wait for a resolution on a weekend or after 5 PM?', tells: 'Off-hours AI support.' },
      { id: 'ret_founder', theme: 'Founder Dependency', kind: 'text', prompt: 'How much leadership time is still spent putting out client fires or answering routine questions?', tells: 'Founder-dependency reduction.' },
      { id: 'ret_churn', theme: 'Churn Reactivity', kind: 'text', prompt: 'Do you proactively reach out to at-risk clients, or only find out when they ask to cancel?', tells: 'Churn-risk detection.' },
      { id: 'ret_knowledge', theme: 'Knowledge Access', kind: 'text', prompt: 'Do clients have a smart, searchable way to get instant answers, or must they wait for a human?', tells: 'Self-serve knowledge base.' },
      wasteQ('ret_waste'),
    ],
  },
  {
    id: 'administration', zone: true, title: 'Administration — Finance/HR 💼',
    blurb: 'The silent profit killers: back-office admin, HR, finance.',
    questions: [
      severityQ('adm_score', 'Overall, how manual is back-office admin?'),
      { id: 'adm_cash', theme: 'Cash-Flow Friction', kind: 'longtext', prompt: 'How much time/month is spent manually generating invoices, chasing late payments, or reconciling accounts?', tells: 'AP/AR automation.' },
      { id: 'adm_calendar', theme: 'Calendar Tetris', kind: 'text', prompt: 'How much time/week is wasted on back-and-forth scheduling emails?', tells: 'Scheduling automation.' },
      { id: 'adm_onboard', theme: 'Onboarding Drag', kind: 'longtext', prompt: 'Walk me through hiring & employee onboarding — how much is manual paperwork, setup, and repetitive training?', tells: 'HR onboarding automation.' },
      { id: 'adm_data', theme: 'Data Entry', kind: 'text', prompt: 'How do expenses, receipts, and timesheets get into your accounting software — is someone typing them in?', tells: 'Data-entry automation.' },
      { id: 'adm_silos', theme: 'Information Silos', kind: 'text', prompt: 'If a team member needs a policy, an asset, or a login, how long does it take to find?', tells: 'Knowledge base / search.' },
      wasteQ('adm_waste'),
    ],
  },
  {
    id: 'strategy', zone: true, title: 'Strategy — Leadership ♟️',
    blurb: "The owner's lack of time and real-time visibility.",
    questions: [
      severityQ('str_score', 'Overall, how much is the owner stuck in the weeds?'),
      { id: 'str_dashboard', theme: 'Dashboard Test', kind: 'text', prompt: 'Can you pull up a real-time dashboard of profit margins & KPI health right now, or does that take days?', tells: 'BI / reporting automation.' },
      { id: 'str_weeds', theme: 'The Weeds', kind: 'text', prompt: "What % of your week (as owner) is spent in the weeds vs. on high-level growth?", tells: 'Owner time leverage.' },
      { id: 'str_decisions', theme: 'Decision Making', kind: 'text', prompt: 'Strategic decisions — real-time data, or gut feeling and lagging indicators?', tells: 'Decision-support tooling.' },
      { id: 'str_15hr', theme: 'The $15/hr Task', kind: 'text', prompt: 'Honestly — what is the most repetitive, low-value task you personally still do every week?', tells: 'Highest-empathy quick win.' },
      { id: 'str_vacation', theme: 'Vacation Test', kind: 'text', prompt: 'If you stepped away from the business for 30 days, what is the first thing that would fall apart?', tells: 'Key-person / process risk.' },
      wasteQ('str_waste'),
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
      { id: 'ai_state', theme: 'Current AI Use', kind: 'choice', prompt: 'Is anyone already using AI — and is it governed (policies, corporate accounts)?', tells: 'Shadow-AI risk + adoption maturity.', choices: [{ label: 'None yet' }, { label: 'Some, ungoverned' }, { label: 'Some, governed' }, { label: 'Widespread' }] },
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
      const choice = q.choices.find((c) => c.label === answers[q.id])
      if (!choice?.lean) continue
      if (choice.lean === 'openai') openai++
      else if (choice.lean === 'anthropic') anthropic++
      else both++
    }
  }
  const oScore = openai + both
  const aScore = anthropic + both
  if (oScore === 0 && aScore === 0) return { lean: null, openai, anthropic, both }
  if (both > 0 && Math.abs(oScore - aScore) <= 1) return { lean: 'both', openai, anthropic, both }
  if (oScore === aScore) return { lean: 'both', openai, anthropic, both }
  return { lean: oScore > aScore ? 'openai' : 'anthropic', openai, anthropic, both }
}

/** Sum the per-zone "estimated monthly waste" fields into a single number. */
export function sumMonthlyWaste(answers: Record<string, string>): number {
  let total = 0
  for (const group of DISCOVERY_GROUPS) {
    for (const q of group.questions) {
      if (!q.id.endsWith('_waste')) continue
      const n = parseFloat((answers[q.id] ?? '').replace(/[^0-9.]/g, ''))
      if (!isNaN(n)) total += n
    }
  }
  return total
}
