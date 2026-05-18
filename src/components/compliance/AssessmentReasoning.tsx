'use client'

/**
 * AssessmentReasoning — render a finding.reasoning string with the
 * "Additionally supported by uploaded policy documentation:" block
 * pulled out into a clean per-policy list instead of one wall of
 * **markdown** noise. Resolves the operator's "big mess of words"
 * complaint without restructuring the data shape.
 *
 * Input shape from the engine looks like:
 *   <engine reasoning paragraph>
 *
 *   Additionally supported by uploaded policy documentation:
 *   **Policy Name** (Section): reasoning text — "quote"
 *   **Other Policy** (Section): reasoning text — "quote"
 *
 * We split on the literal "Additionally supported by uploaded policy
 * documentation:" header. Anything before stays as the engine sentence;
 * anything after is parsed line-by-line into structured citations.
 */

import { useMemo } from 'react'

interface Props {
  reasoning: string
}

interface PolicyCitation {
  title: string
  section: string | null
  reasoning: string | null
  quote: string | null
}

const SUPPORT_HEADER = 'Additionally supported by uploaded policy documentation:'

export default function AssessmentReasoning({ reasoning }: Props) {
  const parsed = useMemo(() => parseReasoning(reasoning), [reasoning])

  if (parsed.citations.length === 0) {
    // No policy block — render the unchanged reasoning.
    return <p className="text-sm text-slate-200 whitespace-pre-line">{reasoning}</p>
  }

  return (
    <div className="space-y-3">
      {parsed.body.trim().length > 0 && (
        <p className="text-sm text-slate-200 whitespace-pre-line">{parsed.body.trim()}</p>
      )}
      <div className="rounded border border-violet-500/15 bg-violet-500/[0.04] p-3 space-y-3">
        <p className="text-[11px] uppercase tracking-wider text-violet-300">
          Additionally supported by uploaded policies
        </p>
        <ul className="space-y-3">
          {parsed.citations.map((c, i) => (
            <li key={i} className="space-y-1">
              <p className="text-xs font-semibold text-slate-100">
                {c.title}
                {c.section && <span className="text-slate-400 font-normal"> · {c.section}</span>}
              </p>
              {c.reasoning && (
                <p className="text-xs text-slate-300">{c.reasoning}</p>
              )}
              {c.quote && (
                <p className="text-xs text-slate-400 italic border-l-2 border-violet-500/30 pl-2">
                  &ldquo;{c.quote}&rdquo;
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function parseReasoning(reasoning: string): { body: string; citations: PolicyCitation[] } {
  const headerIdx = reasoning.indexOf(SUPPORT_HEADER)
  if (headerIdx === -1) {
    return { body: reasoning, citations: [] }
  }
  const body = reasoning.slice(0, headerIdx)
  const tail = reasoning.slice(headerIdx + SUPPORT_HEADER.length)
  const lines = tail.split('\n').map((l) => l.trim()).filter(Boolean)
  const citations = lines.map(parseCitationLine).filter((c): c is PolicyCitation => c !== null)
  return { body, citations }
}

/**
 * Parse a single citation line. Expected shape (built in cis-v8.ts):
 *   "**Policy Title** (Section): reasoning — \"quote\""
 * Any of the optional parts may be missing.
 */
function parseCitationLine(line: string): PolicyCitation | null {
  // **Title**
  const boldMatch = line.match(/^\*\*(.+?)\*\*\s*(.*)$/)
  if (!boldMatch) {
    // Not the expected shape — render verbatim as a one-off citation.
    return { title: line, section: null, reasoning: null, quote: null }
  }
  const title = boldMatch[1].trim()
  let rest = boldMatch[2]

  // Optional (Section) — only if it appears right after the title and
  // BEFORE the colon. Otherwise it's part of the reasoning.
  let section: string | null = null
  const sectionMatch = rest.match(/^\((.+?)\)\s*(.*)$/)
  if (sectionMatch) {
    section = sectionMatch[1].trim()
    rest = sectionMatch[2]
  }

  // Strip a leading ": " separator before the reasoning.
  rest = rest.replace(/^:\s*/, '')

  // Optional quote at the end: " — \"...\""  or  " - \"...\""
  let quote: string | null = null
  const quoteMatch = rest.match(/^(.*?)\s*[—–-]\s*["“](.+?)["”]\s*$/)
  if (quoteMatch) {
    rest = quoteMatch[1].trim()
    quote = quoteMatch[2].trim()
  }

  const reasoning = rest.trim() || null
  return { title, section, reasoning, quote }
}
