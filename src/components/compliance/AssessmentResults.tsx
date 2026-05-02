'use client'

import { useState, useRef } from 'react'
import type {
  Assessment,
  Finding,
  EvidenceRecord,
  AssessmentComparison,
} from '@/lib/compliance/types'

export type AssessmentDetail = {
  assessment: Assessment
  findings: Finding[]
  frameworkName: string
  evidence: EvidenceRecord[] | null
  comparison?: AssessmentComparison | null
}

export function getScoreColor(pct: number): string {
  if (pct >= 80) return 'text-green-400'
  if (pct >= 50) return 'text-cyan-400'
  return 'text-red-400'
}

export function AssessmentResults({ detail, onExport, onCoworkWorksheet, onUpdated }: { detail: AssessmentDetail; onExport: () => void; onCoworkWorksheet: () => void; onUpdated: () => void }) {
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set())
  const [evidenceView, setEvidenceView] = useState<string | null>(null)
  // Stat card filter — click a card to show only that status
  type StatusFilter = 'all' | 'pass' | 'fail' | 'needs_review'
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const { assessment, findings, frameworkName, comparison } = detail

  // Group findings by category — sort categories and controls numerically
  const categories = new Map<string, Finding[]>()
  const sortedFindings = [...findings].sort((a, b) => {
    const numA = a.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
    const numB = b.controlId.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
    for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
      const diff = (numA[i] ?? 0) - (numB[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })

  for (const f of sortedFindings) {
    const cat = getCategoryForControl(f.controlId)
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)!.push(f)
  }

  // Sort categories numerically
  const sortedCategories = Array.from(categories.entries()).sort((a, b) => {
    const numA = parseInt(a[0]) || 0
    const numB = parseInt(b[0]) || 0
    return numA - numB
  })

  // Build change map from comparison
  const changeMap = new Map<string, string>()
  if (comparison) {
    for (const c of comparison.newlyPassed) changeMap.set(c, 'newly_passed')
    for (const c of comparison.newlyFailed) changeMap.set(c, 'newly_failed')
    for (const c of comparison.improved) changeMap.set(c, 'improved')
    for (const c of comparison.regressed) changeMap.set(c, 'regressed')
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">{frameworkName} Results</h2>
          <p className="text-sm text-slate-400">
            {assessment.status === 'complete'
              ? `Completed ${new Date(assessment.completedAt ?? '').toLocaleString()}`
              : `Status: ${assessment.status}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              if (expandedControls.size === findings.length) {
                setExpandedControls(new Set())
              } else {
                setExpandedControls(new Set(findings.map((f) => f.controlId)))
              }
            }}
            className="inline-flex items-center px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
          >
            {expandedControls.size === findings.length ? 'Collapse All' : 'Expand All'}
          </button>
          <button onClick={onExport} className="inline-flex items-center px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors">
            Export CSV
          </button>
          <button
            onClick={onCoworkWorksheet}
            title="Download a Markdown worksheet with pre-filled MyITProcess Alignment answers and justifications, keyed by CIS safeguard. Hand the file to Claude Cowork along with your MyITProcess review URL — Cowork will fill in the answers in the browser for you, since MyITProcess has no write API."
            className="inline-flex items-center px-3 py-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 hover:text-white border border-violet-500/30 rounded-lg text-sm transition-colors"
          >
            Cowork Worksheet
          </button>
          {detail.evidence && detail.evidence.length > 0 && (
            <button
              onClick={() => setEvidenceView(evidenceView ? null : 'all')}
              className="inline-flex items-center px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
            >
              {evidenceView ? 'Hide Evidence' : 'View Evidence'}
            </button>
          )}
        </div>
      </div>

      {/* Comparison banner */}
      {comparison && comparison.scoreDelta !== 0 && (
        <div className={`mb-4 p-3 rounded-lg border ${comparison.scoreDelta > 0
          ? 'bg-green-500/10 border-green-500/20'
          : 'bg-red-500/10 border-red-500/20'}`}
        >
          <p className={`text-sm font-medium ${comparison.scoreDelta > 0 ? 'text-green-300' : 'text-red-300'}`}>
            {comparison.scoreDelta > 0 ? '+' : ''}{comparison.scoreDelta}% vs previous assessment
            ({comparison.previousScore}% → {comparison.currentScore}%)
          </p>
          <div className="flex flex-wrap gap-3 mt-2 text-xs">
            {comparison.newlyPassed.length > 0 && (
              <span className="text-green-400">{comparison.newlyPassed.length} newly passed</span>
            )}
            {comparison.newlyFailed.length > 0 && (
              <span className="text-red-400">{comparison.newlyFailed.length} newly failed</span>
            )}
            {comparison.improved.length > 0 && (
              <span className="text-cyan-400">{comparison.improved.length} improved</span>
            )}
            {comparison.regressed.length > 0 && (
              <span className="text-rose-400">{comparison.regressed.length} regressed</span>
            )}
          </div>
        </div>
      )}

      {/* Summary stats — clickable to filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        <StatCard label="Passed" value={assessment.passedControls} color="text-green-400"
          active={statusFilter === 'pass'} onClick={() => setStatusFilter((f) => f === 'pass' ? 'all' : 'pass')} />
        <StatCard label="Failed" value={assessment.failedControls} color="text-red-400"
          active={statusFilter === 'fail'} onClick={() => setStatusFilter((f) => f === 'fail' ? 'all' : 'fail')} />
        <StatCard label="Needs Review" value={assessment.manualReviewControls} color="text-slate-400"
          active={statusFilter === 'needs_review'} onClick={() => setStatusFilter((f) => f === 'needs_review' ? 'all' : 'needs_review')} />
        <StatCard label="Total" value={assessment.totalControls} color="text-white"
          active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
      </div>
      {statusFilter !== 'all' && (
        <div className="flex items-center justify-between bg-cyan-500/10 border border-cyan-500/30 rounded px-3 py-2 mb-6">
          <span className="text-xs text-cyan-300">
            Showing only <span className="font-semibold">{statusFilter === 'pass' ? 'passed' : statusFilter === 'fail' ? 'failed' : 'needs review'}</span> controls
          </span>
          <button onClick={() => setStatusFilter('all')} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
            Clear filter
          </button>
        </div>
      )}
      {statusFilter === 'all' && <div className="mb-6" />}

      {/* Evidence viewer */}
      {evidenceView && detail.evidence && (
        <div className="mb-6 bg-slate-900/50 border border-white/5 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Collected Evidence ({detail.evidence.length} sources)</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {detail.evidence.map((ev) => (
              <div key={ev.id} className="bg-slate-800/50 border border-white/5 rounded p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-cyan-400">{ev.sourceType}</span>
                  <span className="text-xs text-slate-500">{new Date(ev.collectedAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-300 mt-1">{ev.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Control findings by category — numerically sorted, filtered by status card */}
      <div className="space-y-4">
        {sortedCategories.map(([category, catFindings]) => {
          const filtered = statusFilter === 'all'
            ? catFindings
            : catFindings.filter((f) => {
                const effective = f.overrideStatus ?? f.status
                if (statusFilter === 'pass') return effective === 'pass'
                if (statusFilter === 'fail') return effective === 'fail'
                if (statusFilter === 'needs_review') return effective === 'needs_review' || effective === 'not_assessed' || effective === 'collection_failed' || effective === 'partial'
                return true
              })
          if (filtered.length === 0) return null
          return (
          <div key={category} className="border border-white/5 rounded-lg overflow-hidden">
            <div className="bg-slate-900/50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-300">{CONTROL_CATEGORIES[category] ?? category}</h3>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map((f) => (
                <FindingRow
                  key={f.controlId}
                  finding={f}
                  change={changeMap.get(f.controlId)}
                  expanded={expandedControls.has(f.controlId)}
                  onToggle={() => setExpandedControls((prev) => {
                    const next = new Set(prev)
                    if (next.has(f.controlId)) next.delete(f.controlId)
                    else next.add(f.controlId)
                    return next
                  })}
                  assessmentId={assessment.id}
                  onUpdated={onUpdated}
                  evidenceRecords={detail.evidence?.filter((e) =>
                    Array.isArray(f.evidenceIds) && (f.evidenceIds as string[]).includes(e.id)
                  ) ?? []}
                />
              ))}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, active, onClick }: {
  label: string; value: number; color: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={value === 0 && !active}
      className={`bg-slate-900/30 border rounded-lg p-3 text-center transition-all w-full
        ${active ? 'border-cyan-500/50 ring-2 ring-cyan-500/30 bg-cyan-500/10' : 'border-white/5 hover:border-white/15 hover:bg-white/5'}
        ${onClick ? 'cursor-pointer' : ''}
        disabled:cursor-default disabled:hover:bg-slate-900/30 disabled:hover:border-white/5`}
    >
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </button>
  )
}

function FindingRow({ finding, change, expanded, onToggle, assessmentId, onUpdated, evidenceRecords }: {
  finding: Finding; change?: string; expanded: boolean; onToggle: () => void
  assessmentId: string; onUpdated: () => void
  evidenceRecords: EvidenceRecord[]
}) {
  const [noteText, setNoteText] = useState('')
  const [overrideStatus, setOverrideStatus] = useState<string>('')
  const [aiProcessing, setAiProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isListening, setIsListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const effectiveStatus = finding.overrideStatus ?? finding.status

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    pass: { label: 'YES', color: 'text-green-400', bg: 'bg-green-500/20' },
    fail: { label: 'NO', color: 'text-red-400', bg: 'bg-red-500/20' },
    partial: { label: 'PARTIAL', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    needs_review: { label: 'REVIEW', color: 'text-violet-400', bg: 'bg-violet-500/20' },
    not_assessed: { label: 'N/A', color: 'text-slate-400', bg: 'bg-slate-500/20' },
    not_applicable: { label: 'N/A', color: 'text-slate-400', bg: 'bg-slate-500/20' },
    collection_failed: { label: 'ERROR', color: 'text-red-400', bg: 'bg-red-500/10' },
  }

  const config = statusConfig[effectiveStatus] ?? statusConfig.not_assessed

  const changeIndicators: Record<string, { icon: string; color: string }> = {
    newly_passed: { icon: '↑', color: 'text-green-400' },
    newly_failed: { icon: '↓', color: 'text-red-400' },
    improved: { icon: '↗', color: 'text-cyan-400' },
    regressed: { icon: '↘', color: 'text-rose-400' },
  }

  const toggleListening = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      setIsListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      alert('Speech recognition is not supported in this browser. Use Chrome or Edge.')
      return
    }

    try {
      const recognition = new SpeechRecognitionCtor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognitionRef.current = recognition

      let finalTranscript = ''

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' '
          } else {
            interim += result[0].transcript
          }
        }
        // Show final + interim in the textarea as user speaks
        setNoteText((prev: string) => {
          const base = prev.replace(/\[listening\.\.\.\].*$/, '').trim()
          const combined = ((base ? base + ' ' : '') + finalTranscript + (interim ? `[listening...] ${interim}` : '')).trim()
          return combined
        })
      }

      recognition.onerror = (e: { error: string }) => {
        console.error('[speech] Error:', e.error)
        if (e.error === 'not-allowed') {
          alert('Microphone blocked. Click the lock icon in the address bar → Site settings → Microphone → Allow. Then try again.')
        }
        recognitionRef.current = null
        setIsListening(false)
      }

      recognition.onend = () => {
        // Clean up interim markers
        setNoteText((prev: string) => prev.replace(/\[listening\.\.\.\].*$/, '').trim())
        recognitionRef.current = null
        setIsListening(false)
      }

      recognition.start()
      setIsListening(true)
    } catch (err) {
      console.error('[speech] Failed to start:', err)
      alert('Failed to start speech recognition. Make sure you are using Chrome or Edge and have allowed microphone access.')
      setIsListening(false)
    }
  }

  const handleAiAssist = async () => {
    const instruction = noteText.trim() || 'Review this control and suggest an appropriate status and note based on the current evidence.'
    setAiProcessing(true)
    try {
      const res = await fetch('/api/compliance/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          controlId: finding.controlId,
          controlTitle: getControlTitle(finding.controlId),
          currentStatus: effectiveStatus,
          currentReasoning: finding.reasoning,
          instruction,
        }),
      })
      const json = await res.json()
      if (json.success) {
        if (json.data.suggestedStatus) setOverrideStatus(json.data.suggestedStatus)
        if (json.data.note) setNoteText(json.data.note)
      }
    } catch { /* ignore */ }
    finally { setAiProcessing(false) }
  }

  const handleSave = async () => {
    if (!noteText.trim() && !overrideStatus) return
    setSaving(true)
    try {
      await fetch(`/api/compliance/assessments/${assessmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findingId: finding.id,
          overrideStatus: overrideStatus || effectiveStatus,
          overrideReason: noteText || 'Status updated by reviewer',
        }),
      })
      setNoteText('')
      setOverrideStatus('')
      onUpdated()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-white/5 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`inline-flex items-center justify-center w-16 py-0.5 rounded text-xs font-bold flex-shrink-0 ${config.bg} ${config.color}`}>
            {config.label}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm text-white font-mono flex-shrink-0">{finding.controlId.replace('cis-v8-', '')}</span>
              <span className="text-sm text-slate-400 truncate min-w-0">{getControlTitle(finding.controlId)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {change && changeIndicators[change] && (
            <span className={`text-sm font-bold ${changeIndicators[change].color}`}>
              {changeIndicators[change].icon}
            </span>
          )}
          {finding.overrideStatus && (
            <span className="hidden sm:inline-flex text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded">Override</span>
          )}
          <ConfidenceDot confidence={finding.confidence} />
          <span className="text-slate-500 text-sm">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 bg-slate-900/20">
          {/* Control description — the actual CIS requirement */}
          <div className="bg-slate-800/30 border border-white/5 rounded p-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Control Requirement</p>
            <p className="text-sm text-slate-200">{getControlDescription(finding.controlId)}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Assessment Result</p>
            <FormattedReasoning text={finding.reasoning} />
          </div>
          {finding.remediation && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Remediation</p>
              <p className="text-sm text-cyan-300">{finding.remediation}</p>
            </div>
          )}
          {/* Inline Evidence — show actual data that drove this result */}
          {evidenceRecords.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Supporting Evidence</p>
              <div className="space-y-2">
                {evidenceRecords.map((ev) => (
                  <div key={ev.id} className="bg-slate-800/60 border border-white/5 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-cyan-400">{ev.sourceType.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-slate-500">{new Date(ev.collectedAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-300 mb-2">{ev.summary}</p>
                    <EvidenceDataView rawData={ev.rawData} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(finding.missingEvidence) && finding.missingEvidence.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Missing Evidence</p>
              <div className="flex flex-wrap gap-1">
                {(finding.missingEvidence as string[]).map((m) => (
                  <span key={m} className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded">{m}</span>
                ))}
              </div>
            </div>
          )}
          {finding.overrideStatus && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded p-3">
              <p className="text-xs font-medium text-violet-400 mb-1">
                Override by {finding.overrideBy} on {finding.overrideAt ? new Date(finding.overrideAt).toLocaleString() : ''}
              </p>
              <p className="text-sm text-violet-300">{finding.overrideReason}</p>
            </div>
          )}

          {/* Reviewer Notes & Override Panel */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Reviewer Notes</p>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type or dictate a note, explanation, or instruction..."
                  rows={2}
                  className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                />
                <button
                  onClick={toggleListening}
                  className={`absolute right-2 top-2 p-1.5 rounded-full transition-colors ${
                    isListening
                      ? 'bg-red-500/30 text-red-300 animate-pulse'
                      : 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-white'
                  }`}
                  title={isListening ? 'Stop listening' : 'Dictate with microphone'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                  className="bg-slate-800/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="">Keep current status</option>
                  <option value="pass">Pass (YES)</option>
                  <option value="fail">Fail (NO)</option>
                  <option value="partial">Partial</option>
                  <option value="needs_review">Needs Review</option>
                  <option value="not_applicable">Not Applicable</option>
                </select>
                <button
                  onClick={handleAiAssist}
                  disabled={aiProcessing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 rounded text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {aiProcessing ? 'Processing...' : 'AI Assist'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || (!noteText.trim() && !overrideStatus)}
                  className="inline-flex items-center px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Confidence: {finding.confidence}</span>
            {finding.evaluatedAt && <span>Evaluated: {new Date(finding.evaluatedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Renders assessment reasoning with proper formatting.
 * Handles: **bold** → <strong>, newlines → line breaks,
 * "— quote" → styled quote blocks, policy documentation sections.
 */
function FormattedReasoning({ text }: { text: string }) {
  if (!text) return null

  // Split on the "Additionally supported by" or "Satisfied by" boundary
  const policyDivider = text.match(/\n\n(Additionally supported by uploaded policy documentation:|Satisfied by uploaded policy documentation:)/)

  if (policyDivider && policyDivider.index !== undefined) {
    const technicalPart = text.substring(0, policyDivider.index)
    const policyPart = text.substring(policyDivider.index + 2) // skip \n\n

    return (
      <div className="space-y-3">
        {technicalPart && <TechnicalReasoning text={technicalPart} />}
        <div className="border-l-2 border-violet-500/30 pl-3 space-y-2">
          <p className="text-xs font-medium text-violet-400">Policy Documentation</p>
          {renderPolicyLines(policyPart)}
        </div>
      </div>
    )
  }

  // Check if the whole thing is policy-satisfied (no technical part)
  const fullPolicyMatch = text.match(/^(Satisfied by uploaded policy documentation:|Partially addressed by uploaded policy documentation:)\n/)
  if (fullPolicyMatch) {
    return (
      <div className="border-l-2 border-emerald-500/30 pl-3 space-y-2">
        <p className="text-xs font-medium text-emerald-400">Satisfied by Policy Documentation</p>
        {renderPolicyLines(text.substring(fullPolicyMatch[0].length))}
      </div>
    )
  }

  // Fallback
  return <TechnicalReasoning text={text} />
}

/** Render technical reasoning — handles numbered lists like "1. Microsoft 365... 2. Datto RMM..." */
function TechnicalReasoning({ text }: { text: string }) {
  // Split numbered items: "Blah 1. Foo 2. Bar" → intro + list items
  const numberedMatch = text.match(/^(.*?)\s*(\d+\.\s)/)
  if (numberedMatch && numberedMatch.index !== undefined) {
    const intro = text.substring(0, numberedMatch.index + numberedMatch[1].length).trim()
    const listPart = text.substring(numberedMatch.index + numberedMatch[1].length).trim()

    // Split on numbered items
    const items: string[] = []
    const itemRegex = /(\d+)\.\s/g
    let match: RegExpExecArray | null
    const positions: number[] = []
    while ((match = itemRegex.exec(listPart)) !== null) {
      positions.push(match.index)
    }
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i]
      const end = i + 1 < positions.length ? positions[i + 1] : listPart.length
      items.push(listPart.substring(start).substring(0, end - start).trim())
    }

    if (items.length > 1) {
      return (
        <div className="space-y-1.5">
          {intro && <p className="text-sm text-slate-300">{intro}</p>}
          <div className="space-y-1 pl-1">
            {items.map((item, i) => (
              <p key={i} className="text-xs text-slate-400">{renderInlineFormatting(item)}</p>
            ))}
          </div>
        </div>
      )
    }
  }

  // No numbered list — just render with newline handling
  const lines = text.split('\n').filter(Boolean)
  if (lines.length <= 1) {
    return <p className="text-sm text-slate-300">{renderInlineFormatting(text)}</p>
  }
  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-slate-300">{renderInlineFormatting(line)}</p>
      ))}
    </div>
  )
}

/** Render policy lines with bold names, sections, and quoted text */
function renderPolicyLines(text: string) {
  const lines = text.split('\n').filter((l) => l.trim())
  // Skip the header line if it starts with "Additionally" or "Satisfied"
  const contentLines = lines.filter((l) => !l.startsWith('Additionally supported') && !l.startsWith('Satisfied by'))

  return (
    <div className="space-y-2">
      {contentLines.map((line, i) => {
        // Parse: **PolicyName** (Section): Reasoning — "Quote"
        const policyMatch = line.match(/^\*\*(.+?)\*\*\s*(?:\((.+?)\))?\s*:?\s*(.*)$/)
        if (policyMatch) {
          const [, policyName, section, rest] = policyMatch
          const quoteMatch = rest?.match(/^(.*?)\s*—\s*"(.+)"$/)
          const reasoning = quoteMatch ? quoteMatch[1] : rest
          const quote = quoteMatch ? quoteMatch[2] : null
          return (
            <div key={i} className="text-xs space-y-0.5">
              <div>
                <span className="font-semibold text-slate-200">{policyName}</span>
                {section && <span className="text-slate-500 ml-1">({section})</span>}
              </div>
              {reasoning && <p className="text-slate-400">{reasoning}</p>}
              {quote && (
                <p className="text-slate-500 italic pl-2 border-l border-slate-700">&ldquo;{quote}&rdquo;</p>
              )}
            </div>
          )
        }
        return <p key={i} className="text-xs text-slate-400">{renderInlineFormatting(line)}</p>
      })}
    </div>
  )
}

/** Render inline **bold** formatting */
function renderInlineFormatting(text: string) {
  const parts = text.split(/(\*\*.+?\*\*)/)
  if (parts.length === 1) return <>{text}</>
  return <>{parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-slate-200">{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })}</>
}

/** Renders key data points from evidence rawData in a readable format */
function EvidenceDataView({ rawData }: { rawData: Record<string, unknown> }) {
  // Extract the most useful fields for display
  const displayFields: Array<{ label: string; value: string }> = []

  const add = (label: string, val: unknown) => {
    if (val === null || val === undefined || val === '') return
    if (typeof val === 'object' && !Array.isArray(val)) return
    if (Array.isArray(val)) {
      if (val.length === 0) return
      displayFields.push({ label, value: val.length <= 5 ? val.join(', ') : `${val.length} items` })
      return
    }
    displayFields.push({ label, value: String(val) })
  }

  // Common evidence fields
  add('Total Devices', rawData.totalDevices ?? rawData.totalCount)
  add('Compliant Devices', rawData.compliantCount)
  add('Compliance Rate', rawData.complianceRate ? `${rawData.complianceRate}%` : null)
  add('Encrypted Devices', rawData.encryptedDevices)
  add('Encryption Rate', rawData.encryptionRate ? `${rawData.encryptionRate}%` : null)
  add('Total Users', rawData.totalUsers)
  add('MFA Registered', rawData.mfaRegisteredUsers)
  add('MFA Rate', rawData.mfaRate ? `${rawData.mfaRate}%` : null)
  add('Dormant Accounts', rawData.dormantCount)
  add('Disabled Accounts', rawData.disabledUsers)
  add('Current Score', rawData.currentScore)
  add('Max Score', rawData.maxScore)
  add('Score Percentage', rawData.percentage ? `${rawData.percentage}%` : null)
  add('Total Policies', rawData.totalPolicies)
  add('Enabled Policies', rawData.enabledPolicies)
  add('Patch Rate', rawData.patchRate ? `${rawData.patchRate}%` : null)
  add('AV Active Rate', rawData.avRate ? `${rawData.avRate}%` : null)
  add('Total Queries', rawData.totalQueries)
  add('Blocked Queries', rawData.blockedQueries)
  add('Block Rate', rawData.blockRate ? `${rawData.blockRate}%` : null)
  add('Total Events', rawData.totalEvents)
  add('Total Agents', rawData.agentCount)
  add('Discovery Active', rawData.discoveryActive)
  add('Unique MACs', rawData.uniqueMacAddresses)
  add('Unique IPs', rawData.uniqueIpAddresses)
  add('Matched', rawData.matched)
  add('Organization Count', rawData.organizationCount)
  add('Has Policies', rawData.hasDocumentedPolicies)
  add('Has Procedures', rawData.hasDocumentedProcedures)
  add('Customer Count', rawData.customerCount)
  add('Total Seats', rawData.totalSeats)
  add('Active Seats', rawData.activeSeats)
  add('Unprotected Seats', rawData.unprotectedSeats)
  add('Appliance Count', rawData.applianceCount)
  add('Total Alerts', rawData.totalAlerts)

  // Show device types breakdown if available
  const deviceTypes = rawData.deviceTypes as Record<string, number> | undefined
  if (deviceTypes && typeof deviceTypes === 'object') {
    const entries = Object.entries(deviceTypes).sort((a, b) => b[1] - a[1]).slice(0, 8)
    if (entries.length > 0) {
      displayFields.push({ label: 'Device Types', value: entries.map(([k, v]) => `${k}: ${v}`).join(', ') })
    }
  }

  // Show severity breakdown
  const severity = rawData.eventsBySeverity as Record<string, number> | undefined
  if (severity && typeof severity === 'object') {
    const entries = Object.entries(severity)
    if (entries.length > 0) {
      displayFields.push({ label: 'By Severity', value: entries.map(([k, v]) => `${k}: ${v}`).join(', ') })
    }
  }

  if (displayFields.length === 0) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
      {displayFields.map((f, i) => (
        <div key={i} className="flex items-baseline gap-1.5">
          <span className="text-[10px] text-slate-500 uppercase">{f.label}:</span>
          <span className="text-xs text-white font-medium">{f.value}</span>
        </div>
      ))}
    </div>
  )
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = { high: 'bg-green-400', medium: 'bg-cyan-400', low: 'bg-slate-400', none: 'bg-slate-600' }
  const labels: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence', none: 'No evidence' }
  return <span title={labels[confidence] ?? 'Unknown'} className={`w-2 h-2 rounded-full ${colors[confidence] ?? colors.none}`} />
}

// ---------------------------------------------------------------------------
// Framework labels
// ---------------------------------------------------------------------------

export function getFrameworkLabel(frameworkId: string): string {
  const labels: Record<string, string> = {
    'cis-v8': 'CIS Controls v8',
    'cis-v8-ig1': 'CIS v8 — IG1',
    'cis-v8-ig2': 'CIS v8 — IG2',
    'cis-v8-ig3': 'CIS v8 — IG3',
    'cmmc-l1': 'CMMC Level 1',
    'cmmc-l2': 'CMMC Level 2',
    'nist-800-171': 'NIST 800-171',
    'hipaa': 'HIPAA',
  }
  return labels[frameworkId] ?? frameworkId
}

// ---------------------------------------------------------------------------
// Control metadata — built dynamically from framework definitions so that
// every registered framework (CIS, CMMC, future NIST/HIPAA) automatically
// gets titles, descriptions, and category labels in the UI without needing
// a separate hardcoded lookup table.
// ---------------------------------------------------------------------------

import { CIS_V8_FRAMEWORK } from '@/lib/compliance/frameworks/cis-v8'
import { CMMC_L1_FRAMEWORK } from '@/lib/compliance/frameworks/cmmc-l1'

const ALL_FRAMEWORKS = [CIS_V8_FRAMEWORK, CMMC_L1_FRAMEWORK]

const CONTROL_TITLES: Record<string, string> = {}
const CONTROL_DESCRIPTIONS: Record<string, string> = {}
const CONTROL_CATEGORY_MAP: Record<string, string> = {}

for (const fw of ALL_FRAMEWORKS) {
  for (const c of fw.controls) {
    CONTROL_TITLES[c.controlId] = c.title
    CONTROL_DESCRIPTIONS[c.controlId] = c.description
    CONTROL_CATEGORY_MAP[c.controlId] = c.category
  }
}

// Legacy CIS category labels for display (used in category headers)
// CIS category number -> display label (used in category headers for CIS).
// CMMC categories use the full category string from the framework definition.
const CONTROL_CATEGORIES: Record<string, string> = {
  '1': '1 - Inventory and Control of Enterprise Assets',
  '2': '2 - Inventory and Control of Software Assets',
  '3': '3 - Data Protection',
  '4': '4 - Secure Configuration',
  '5': '5 - Account Management',
  '6': '6 - Access Control Management',
  '7': '7 - Continuous Vulnerability Management',
  '8': '8 - Audit Log Management',
  '9': '9 - Email and Web Browser Protections',
  '10': '10 - Malware Defenses',
  '11': '11 - Data Recovery',
  '12': '12 - Network Infrastructure Management',
  '13': '13 - Network Monitoring and Defense',
  '14': '14 - Security Awareness and Skills Training',
  '15': '15 - Service Provider Management',
  '16': '16 - Application Software Security',
  '17': '17 - Incident Response Management',
}

function getControlTitle(controlId: string): string {
  return CONTROL_TITLES[controlId] ?? controlId
}

function getControlDescription(controlId: string): string {
  return CONTROL_DESCRIPTIONS[controlId] ?? 'No description available for this control.'
}

function getCategoryForControl(controlId: string): string {
  // Use the framework definition's category if available
  if (CONTROL_CATEGORY_MAP[controlId]) return CONTROL_CATEGORY_MAP[controlId]
  // Fallback for CIS: parse category number from controlId
  return controlId.replace('cis-v8-', '').split('.')[0]
}
