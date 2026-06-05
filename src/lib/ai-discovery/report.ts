/**
 * AIGPA report generator. Turns a saved discovery assessment into the
 * client-facing AI Growth & Profit Assessment report — the paid deliverable
 * presented on the Review Call.
 *
 * Reuses the project's Anthropic client conventions (claude-sonnet-4-6 +
 * trackAnthropicCall for usage metering). The big framework/system prompt is
 * prompt-cached so repeated generations are cheap.
 */

import Anthropic from '@anthropic-ai/sdk'
import { trackAnthropicCall } from '@/lib/api-usage-tracker'
import { DISCOVERY_GROUPS, PLATFORM_LABELS, sumMonthlyWaste, type PlatformLean } from './questions'
import { formatIntakeSummary } from './intake'
import type { DiscoveryAssessment } from './store'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const MODEL = 'claude-sonnet-4-6'

export interface AigpaReportZone {
  name: string
  severity: string
  monthlyWaste: number | null
  pains: string[]
  plays: { play: string; impact: string }[]
}

export interface AigpaRoadmapPhase {
  window: string
  focus: string
  items: string[]
}

export interface AigpaReport {
  companyName: string
  generatedAt: string
  executiveSummary: string
  profitGap: { monthlyWaste: number | null; annualWaste: number | null; narrative: string }
  zones: AigpaReportZone[]
  readiness: { band: string; summary: string }
  platform: { recommendation: string; rationale: string }
  roadmap: AigpaRoadmapPhase[]
  paths: { diy: string; consult: string; doneForYou: string }
  nextStep: string
}

const SYSTEM_PROMPT = `You are a senior AI strategy consultant at Triple Cities Tech (TCT), an IT managed-services provider that sells and delivers AI as a managed service. You write the client-facing "AI Profit & Readiness Assessment" report after a discovery call. The report has two distinct parts: (A) the Profit Gap Analysis — where AI adds profit / cuts waste (the opportunity), and (B) the Readiness Assessment — whether the foundations exist to implement and what must happen first (the feasibility). They are independent: a client can have a large profit gap and still not be ready; in that case the roadmap opens with foundation/cleanup work, then the AI plays.

METHODOLOGY — the six profit zones where small/mid businesses leak time and money:
- Acquisition (Marketing), Conversion (Sales), Fulfillment (Delivery), Retention (Support), Administration (Finance/HR), Strategy (Leadership).
Each zone is scored Red (mostly manual / lots of waste), Yellow (moderate), or Green (dialed in).

THE AI PLAY CATALOG (map each pain to one of these; every play also implies an IT/security need):
AI email automation; AI customer intake & support; AI sales prospecting engine; AI SOP / documentation builder; AI meeting capture + follow-up; AI lead-qualification bot; AI project-management automation; AI finance workflow automation; AI content-repurposing engine; custom GPTs/agents; data cleanup; native Microsoft/SharePoint connectors.

PLATFORM GUIDANCE: ChatGPT (OpenAI) for everyday employee enablement and chat; Claude (Anthropic) for custom builds, integrations, automations, and development-grade work. Most businesses need both.

THREE PATHS FORWARD (always close with these): DIY (client runs the roadmap), Consult (TCT advises and coaches), Done-For-You (TCT builds and manages — the managed-services + development motions).

TONE: Direct, confident, plain-English, ROI-focused. No hype, no hedging, no fearmongering. Quantify waste in real dollars. Honest about where AI is today ("AOL stage — powerful, evolving fast").

OUTPUT: Return ONLY a single JSON object, no markdown fences, no prose around it, matching exactly this TypeScript shape:
{
  "executiveSummary": string,                       // 2-4 sentences, CEO-level
  "profitGap": { "monthlyWaste": number|null, "annualWaste": number|null, "narrative": string },
  "zones": [ { "name": string, "severity": "Red"|"Yellow"|"Green", "monthlyWaste": number|null, "pains": string[], "plays": [ { "play": string, "impact": string } ] } ],
  "readiness": { "band": string, "summary": string },
  "platform": { "recommendation": string, "rationale": string },
  "roadmap": [ { "window": string, "focus": string, "items": string[] } ],   // e.g. windows "Days 0-30", "Days 31-60", "Days 61-90"
  "paths": { "diy": string, "consult": string, "doneForYou": string },
  "nextStep": string
}
Rules: Only include zones that have meaningful signal from the input. annualWaste = monthlyWaste * 12 when known. Keep arrays concise (2-5 items). If a field is unknown, infer conservatively or use null — never invent specific client facts not implied by the input.`

function buildUserInput(a: DiscoveryAssessment): string {
  const lines: string[] = []
  lines.push(`Company: ${a.companyName}`)
  const total = sumMonthlyWaste(a.answers)
  if (total > 0) lines.push(`Total estimated monthly waste captured on the call: $${total.toLocaleString()}`)
  if (a.platformRecommendation && a.platformRecommendation !== 'undecided') {
    const label = PLATFORM_LABELS[a.platformRecommendation as PlatformLean] ?? a.platformRecommendation
    lines.push(`Platform recommendation (set by the rep): ${label}`)
  }
  if (a.notes) lines.push(`Rep notes: ${a.notes}`)
  if (a.intake && Object.keys(a.intake).length > 0) {
    lines.push('', 'CLIENT PRE-CALL INTAKE (Business Snapshot):', formatIntakeSummary(a.intake))
  }
  lines.push('')
  lines.push('DISCOVERY ANSWERS (blank = not asked; skip blanks):')

  for (const group of DISCOVERY_GROUPS) {
    const answered = group.questions.filter((q) => (a.answers[q.id] ?? '').trim() !== '')
    if (answered.length === 0) continue
    lines.push('')
    lines.push(`## ${group.title}`)
    for (const q of answered) {
      lines.push(`- ${q.theme} — ${q.prompt}\n  Answer: ${a.answers[q.id]}`)
    }
  }
  return lines.join('\n')
}

function extractJson<T>(text: string): T {
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1)
  return JSON.parse(s) as T
}

export async function generateAigpaReport(assessment: DiscoveryAssessment): Promise<AigpaReport> {
  const response = await trackAnthropicCall('aigpa-report', MODEL, () =>
    anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserInput(assessment) }],
      },
      { timeout: 110_000 }
    )
  )

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Report generation hit max_tokens (response truncated). Try again or trim the assessment.')
  }
  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  if (!text) throw new Error('Empty response from the model.')

  const parsed = extractJson<Omit<AigpaReport, 'companyName' | 'generatedAt'>>(text)
  return {
    companyName: assessment.companyName,
    generatedAt: new Date().toISOString(),
    ...parsed,
  }
}
