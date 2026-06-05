/**
 * Client-facing "Business Snapshot" intake — filled by the prospect before the
 * discovery call via a tokenized link, then surfaced to the rep alongside the
 * assessment. Shared schema so the public form and the rep's read-only view
 * stay in sync. Answers are stored as a flat Record<string,string>.
 */

export type IntakeKind = 'text' | 'longtext' | 'yesno'

export interface IntakeField {
  id: string
  label: string
  kind: IntakeKind
  hint?: string
}

export interface IntakeSection {
  id: string
  title: string
  blurb?: string
  fields: IntakeField[]
}

export const SYSTEM_AREAS = [
  'Marketing / Lead Gen',
  'Sales / CRM',
  'Customer Support',
  'Internal Ops / Admin',
  'Finance / Invoicing',
  'Compliance / Security',
] as const

export const WORKFLOW_COUNT = 3

// Plain field sections (systems + workflows are rendered specially).
export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: 'contact',
    title: 'Your details',
    fields: [
      { id: 'contact_name', label: 'Your name', kind: 'text' },
      { id: 'contact_role', label: 'Your role', kind: 'text' },
      { id: 'contact_email', label: 'Email', kind: 'text' },
      { id: 'website', label: 'Company website', kind: 'text' },
    ],
  },
  {
    id: 'team',
    title: 'Time & team',
    blurb: 'Roughly how the owner’s week splits.',
    fields: [
      { id: 'owner_hours', label: 'Hours per week the owner works', kind: 'text' },
      { id: 'pct_strategy', label: '% of time in Strategy', kind: 'text' },
      { id: 'pct_sales', label: '% of time in Sales', kind: 'text' },
      { id: 'pct_admin', label: '% of time in Admin', kind: 'text' },
      { id: 'pct_delivery', label: '% of time in Delivery', kind: 'text' },
      { id: 'key_roles', label: 'Key roles — title + main responsibility', kind: 'longtext' },
      { id: 'outsourced', label: 'Any roles fully outsourced / offshore? Which?', kind: 'text' },
    ],
  },
  {
    id: 'pain',
    title: 'Current pain & growth priorities',
    fields: [
      { id: 'top_problems', label: 'Top 3 problems you’re actively trying to solve', kind: 'longtext' },
      { id: 'tried_failed', label: 'What have you already tried that didn’t work?', kind: 'longtext' },
      { id: 'top_goals', label: 'Top 3 goals for the next 12 months', kind: 'longtext' },
      { id: 'if_not_hit', label: 'What happens if you don’t hit those goals?', kind: 'text' },
      { id: 'wasting_most', label: 'Where do you feel you’re wasting the most time or money?', kind: 'longtext' },
    ],
  },
  {
    id: 'ai_state',
    title: 'AI & automation — current state',
    fields: [
      { id: 'used_ai', label: 'Have you used AI in your business yet?', kind: 'yesno' },
      { id: 'used_ai_detail', label: 'If yes: what tools, and for what purposes?', kind: 'text' },
      { id: 'ungoverned', label: 'Are team members using AI without formal oversight?', kind: 'yesno' },
      { id: 'policies', label: 'Have you created any AI usage policies?', kind: 'yesno' },
      { id: 'measure', label: 'Do you measure AI impact (time saved / money made)?', kind: 'yesno' },
      { id: 'fear', label: 'Your biggest fear about using AI?', kind: 'text' },
      { id: 'hope', label: 'Your biggest hope for using AI?', kind: 'text' },
    ],
  },
]

export const sysKey = (i: number, part: 'tools' | 'manual' | 'notes') => `sys_${i}_${part}`
export const wfKey = (n: number, part: 'name' | 'freq' | 'time') => `wf${n}_${part}`

/** Readable plain-text summary of a submitted intake (rep view + report input). */
export function formatIntakeSummary(data: Record<string, string>): string {
  const lines: string[] = ['CLIENT INTAKE — Business Snapshot', '']
  for (const section of INTAKE_SECTIONS) {
    const answered = section.fields.filter((f) => (data[f.id] ?? '').trim() !== '')
    if (answered.length === 0) continue
    lines.push(`## ${section.title}`)
    for (const f of answered) lines.push(`- ${f.label}: ${data[f.id]}`)
    lines.push('')
  }
  const sysRows = SYSTEM_AREAS.map((area, i) => {
    const tools = data[sysKey(i, 'tools')] ?? ''
    const manual = data[sysKey(i, 'manual')] ?? ''
    const notes = data[sysKey(i, 'notes')] ?? ''
    if (!tools && !manual && !notes) return null
    return `- ${area}: ${tools || '—'}${manual ? ` · manual: ${manual}` : ''}${notes ? ` · ${notes}` : ''}`
  }).filter(Boolean) as string[]
  if (sysRows.length) { lines.push('## Current systems & tools', ...sysRows, '') }

  const wfRows: string[] = []
  for (let n = 1; n <= WORKFLOW_COUNT; n++) {
    const name = data[wfKey(n, 'name')] ?? ''
    if (!name) continue
    const freq = data[wfKey(n, 'freq')] ?? ''
    const time = data[wfKey(n, 'time')] ?? ''
    wfRows.push(`- ${name}${freq ? ` · ${freq}/wk` : ''}${time ? ` · ${time} each` : ''}`)
  }
  if (wfRows.length) { lines.push('## Top workflows to automate', ...wfRows, '') }

  return lines.join('\n').trim()
}
