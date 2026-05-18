'use client'

/**
 * FindingsResultsList — AssessmentResults-shaped list for the
 * /admin/compliance/[companyId]/findings page.
 *
 * Per operator feedback: drop the disposition-form-per-row default
 * layout (it was confusing). Use the legacy AssessmentResults shape:
 *   - Findings grouped by control family (1.x, 2.x, …)
 *   - Each row: status badge (YES/NO/PARTIAL/REVIEW/N/A) + control id
 *     + control title + confidence dot + expand chevron
 *   - Expanded: control requirement, assessment result (reasoning),
 *     suggested remediation, missing evidence, Remediate button (if
 *     the catalog has a matching action), and "Set disposition" link
 *     (lazy-loads the disposition form on click).
 *
 * The Remediate button is the primary action on fail/partial controls.
 * The disposition button is the secondary path for accept-risk /
 * customer-declined / scheduled-for-later cases. They're side-by-side
 * but visually distinct so the operator's eye lands on Remediate first.
 */

import { useMemo, useState } from 'react'
import RemediateButton, { type RemediateAction } from './RemediateButton'
import DispositionToggleButton from './DispositionToggleButton'
import FindingOverrideInline from './FindingOverrideInline'
import AssessmentReasoning from './AssessmentReasoning'

export interface FindingRowData {
  id: string
  controlId: string
  controlTitle: string
  controlDescription: string
  controlCategory: string
  status: string
  effectiveStatus: string
  confidence: string
  reasoning: string
  remediation: string | null
  missingEvidence: string[]
  overrideStatus: string | null
  overrideReason: string | null
  overrideBy: string | null
  overrideAt: string | null
  /** Catalog actions that satisfy this control. Sorted full-first. */
  remediationActions: RemediateAction[]
  disposition: {
    lifecycleStatus: string | null
    assignedTo: string | null
    dueDate: string | null
    acceptedRiskRationale: string | null
    customerImpactSummary: string | null
    internalNotes: string | null
  }
}

type StatusFilter = 'all' | 'open' | 'pass' | 'not_applicable' | 'with_disposition'

interface Props {
  companyId: string
  frameworkId: string
  findings: FindingRowData[]
}

export default function FindingsResultsList({ companyId, frameworkId, findings }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => filterFindings(findings, filter), [findings, filter])
  const grouped = useMemo(() => groupByControlFamily(filtered), [filtered])

  // Counter rows: clickable shortcuts into the filter. Click a card →
  // filter list to that status. Click the active card → clear filter.
  // The narrow set of FilterChips below stays as an alternate input.
  const passCount = findings.filter((f) => f.effectiveStatus === 'pass').length
  const failCount = findings.filter((f) => f.effectiveStatus === 'fail').length
  const reviewCount = findings.filter((f) => f.effectiveStatus === 'needs_review' || f.effectiveStatus === 'partial').length
  const naCount = findings.filter((f) => f.effectiveStatus === 'not_applicable').length
  const dispoCount = findings.filter((f) => Boolean(f.disposition.lifecycleStatus)).length

  function setOrToggle(target: StatusFilter) {
    setFilter((curr) => (curr === target ? 'all' : target))
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <CounterCard label="Total" value={findings.length} tone="slate"
          active={filter === 'all'} onClick={() => setFilter('all')} />
        <CounterCard label="Passed" value={passCount} tone="emerald"
          active={filter === 'pass'} onClick={() => setOrToggle('pass')} />
        <CounterCard label="Needs review" value={reviewCount} tone="cyan"
          active={filter === 'open'} onClick={() => setOrToggle('open')}
          hint="Click to show open (fail / review / partial) findings" />
        <CounterCard label="Failed" value={failCount} tone="rose"
          active={filter === 'open'} onClick={() => setOrToggle('open')}
          hint="Click to show open (fail / review / partial) findings" />
        <CounterCard label="Not applicable" value={naCount} tone="slate"
          active={filter === 'not_applicable'} onClick={() => setOrToggle('not_applicable')} />
        <CounterCard label="With disposition" value={dispoCount} tone="violet"
          active={filter === 'with_disposition'} onClick={() => setOrToggle('with_disposition')} />
      </section>

      <FilterChips
        current={filter}
        onChange={setFilter}
        counts={{
          all: findings.length,
          open: findings.filter((f) => isOpen(f.effectiveStatus)).length,
          pass: passCount,
          not_applicable: naCount,
          with_disposition: dispoCount,
        }}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (expanded.size === filtered.length) setExpanded(new Set())
            else setExpanded(new Set(filtered.map((f) => f.controlId)))
          }}
          className="text-xs text-slate-400 hover:text-cyan-300 underline"
        >
          {expanded.size === filtered.length ? 'Collapse all' : 'Expand all'}
        </button>
        <span className="text-[11px] text-slate-500">
          {filtered.length} of {findings.length} controls
        </span>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-400">No controls match this filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([family, rows]) => (
            <section key={family} className="border border-white/5 rounded-lg overflow-hidden">
              <header className="bg-slate-900/50 px-4 py-2 border-b border-white/5">
                <h3 className="text-sm font-semibold text-slate-300">
                  {family}.x &mdash; {humanizeFamily(rows[0])}
                </h3>
              </header>
              <ul className="divide-y divide-white/5">
                {rows.map((f) => (
                  <FindingItem
                    key={f.id}
                    finding={f}
                    expanded={expanded.has(f.controlId)}
                    onToggle={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(f.controlId)) next.delete(f.controlId)
                        else next.add(f.controlId)
                        return next
                      })
                    }
                    companyId={companyId}
                    frameworkId={frameworkId}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function FindingItem({ finding, expanded, onToggle, companyId, frameworkId }: {
  finding: FindingRowData
  expanded: boolean
  onToggle: () => void
  companyId: string
  frameworkId: string
}) {
  const status = STATUS_CONFIG[finding.effectiveStatus] ?? STATUS_CONFIG.not_assessed
  const isFailOrPartial = finding.effectiveStatus === 'fail' || finding.effectiveStatus === 'partial' || finding.effectiveStatus === 'needs_review'

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`inline-flex items-center justify-center w-16 py-0.5 rounded text-xs font-bold flex-shrink-0 ${status.bg} ${status.color}`}>
            {status.label}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm text-white font-mono flex-shrink-0">
                {finding.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')}
              </span>
              <span className="text-sm text-slate-400 truncate">{finding.controlTitle}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {finding.overrideStatus && (
            <span className="hidden sm:inline-flex text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded">
              Override
            </span>
          )}
          <ConfidenceDot confidence={finding.confidence} />
          <span className="text-slate-500 text-sm">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 bg-slate-900/20">
          <div className="bg-slate-800/30 border border-white/5 rounded p-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Control requirement
            </p>
            <p className="text-sm text-slate-200">{finding.controlDescription}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              Assessment result
            </p>
            <AssessmentReasoning reasoning={finding.reasoning} />
          </div>

          {finding.remediation && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                Suggested remediation
              </p>
              <p className="text-sm text-cyan-300">{finding.remediation}</p>
            </div>
          )}

          {finding.missingEvidence.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                Missing evidence
              </p>
              <div className="flex flex-wrap gap-1">
                {finding.missingEvidence.map((m) => (
                  <span key={m} className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Primary action: Remediate (only on fail/partial/review) */}
          {isFailOrPartial && (
            <div className="pt-2 border-t border-white/10">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Apply a fix
              </p>
              <RemediateButton
                companyId={companyId}
                frameworkId={frameworkId}
                controlId={finding.controlId}
                findingId={finding.id}
                actions={finding.remediationActions}
              />
            </div>
          )}

          {/* Analyst Attestation — replaces / sets the engine's status
              with a human-vouched answer + justification. Always
              rendered so the operator can attest a different status on
              passing controls too (e.g. evidence was misleading) and
              can clear an existing attestation. */}
          <div className="pt-2 border-t border-white/10">
            <FindingOverrideInline
              findingId={finding.id}
              engineStatus={finding.status}
              currentOverrideStatus={finding.overrideStatus}
              currentOverrideReason={finding.overrideReason}
              currentOverrideBy={finding.overrideBy}
              currentOverrideAt={finding.overrideAt}
            />
          </div>

          {/* Disposition — workflow state ("what are we doing about this?")
              kept distinct from override ("what IS the status?"). Lazy
              mount keeps the row light when the operator only wanted to
              read the assessment. */}
          <div className="pt-2 border-t border-white/10">
            <DispositionToggleButton
              companyId={companyId}
              frameworkId={frameworkId}
              controlId={finding.controlId}
              disposition={finding.disposition}
            />
          </div>
        </div>
      )}
    </li>
  )
}

function CounterCard({ label, value, tone, active, onClick, hint }: {
  label: string
  value: number
  tone: 'emerald' | 'cyan' | 'rose' | 'slate' | 'violet'
  active: boolean
  onClick: () => void
  hint?: string
}) {
  const baseCls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'cyan'    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    tone === 'rose'    ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
    tone === 'violet'  ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
                         'bg-slate-800/40 text-slate-300 border-white/10'
  const activeRing = active ? 'ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-slate-950' : 'hover:brightness-125'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={`rounded-lg border p-3 text-center transition-all ${baseCls} ${activeRing}`}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </button>
  )
}

function FilterChips({ current, onChange, counts }: {
  current: StatusFilter
  onChange: (f: StatusFilter) => void
  counts: Record<StatusFilter, number>
}) {
  const chips: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open (fail / review)' },
    { key: 'pass', label: 'Passed' },
    { key: 'not_applicable', label: 'Not applicable' },
    { key: 'with_disposition', label: 'With disposition' },
  ]
  return (
    <nav className="flex flex-wrap gap-2">
      {chips.map((c) => {
        const active = c.key === current
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              active
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-100'
                : 'bg-slate-800/40 border-white/10 text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            {c.label} <span className="opacity-70">({counts[c.key]})</span>
          </button>
        )
      })}
    </nav>
  )
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const cls =
    confidence === 'high'   ? 'bg-emerald-400' :
    confidence === 'medium' ? 'bg-cyan-400' :
    confidence === 'low'    ? 'bg-slate-500' :
                              'bg-slate-700'
  return <span className={`w-2 h-2 rounded-full ${cls}`} title={`confidence: ${confidence}`} />
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pass:              { label: 'YES',     color: 'text-green-400', bg: 'bg-green-500/20' },
  fail:              { label: 'NO',      color: 'text-red-400', bg: 'bg-red-500/20' },
  partial:           { label: 'PARTIAL', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  needs_review:      { label: 'REVIEW',  color: 'text-violet-400', bg: 'bg-violet-500/20' },
  not_assessed:      { label: 'N/A',     color: 'text-slate-400', bg: 'bg-slate-500/20' },
  not_applicable:    { label: 'N/A',     color: 'text-slate-400', bg: 'bg-slate-500/20' },
  collection_failed: { label: 'ERROR',   color: 'text-red-400', bg: 'bg-red-500/10' },
}

function isOpen(status: string): boolean {
  return status === 'fail' || status === 'needs_review' || status === 'partial' || status === 'collection_failed'
}

function filterFindings(findings: FindingRowData[], filter: StatusFilter): FindingRowData[] {
  switch (filter) {
    case 'all': return findings
    case 'open': return findings.filter((f) => isOpen(f.effectiveStatus))
    case 'pass': return findings.filter((f) => f.effectiveStatus === 'pass')
    case 'not_applicable': return findings.filter((f) => f.effectiveStatus === 'not_applicable')
    case 'with_disposition': return findings.filter((f) => Boolean(f.disposition.lifecycleStatus))
  }
}

function groupByControlFamily(findings: FindingRowData[]): Array<[string, FindingRowData[]]> {
  const map = new Map<string, FindingRowData[]>()
  for (const f of findings) {
    const tail = f.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '')
    const family = tail.split('.')[0]
    if (!map.has(family)) map.set(family, [])
    map.get(family)!.push(f)
  }
  // Sort families numerically, controls within family numerically.
  const families = Array.from(map.entries()).sort((a, b) => Number(a[0]) - Number(b[0]))
  for (const [, rows] of families) {
    rows.sort((a, b) => {
      const na = a.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
      const nb = b.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
      for (let i = 0; i < Math.max(na.length, nb.length); i++) {
        const diff = (na[i] ?? 0) - (nb[i] ?? 0)
        if (diff !== 0) return diff
      }
      return 0
    })
  }
  return families
}

function humanizeFamily(first: FindingRowData): string {
  // The first finding in each family is sorted as the lowest-numbered
  // control; use its category as a stand-in for the family name.
  return first.controlCategory || 'Controls'
}
