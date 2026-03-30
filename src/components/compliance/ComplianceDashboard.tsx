'use client'

/**
 * Compliance Evidence Engine — Main Dashboard Component
 *
 * Features:
 *   - Company selector
 *   - Connector status display
 *   - Assessment creation and history
 *   - Score trend chart
 *   - Historical comparison (newly passed/failed/improved/regressed)
 *   - Control-by-control results with proper numeric ordering
 *   - Evidence viewer
 *   - CSV export
 */

import { useState, useCallback } from 'react'
import type {
  Assessment,
  Finding,
  ConnectorState,
  EvidenceRecord,
  AssessmentComparison,
} from '@/lib/compliance/types'

interface Company {
  id: string
  name: string
  slug: string
  m365SetupStatus: string | null
}

type DashboardData = {
  companyId: string
  companyName: string
  connectors: ConnectorState[]
  assessments: Assessment[]
  latestScorePercent: number | null
  scoreTrend: Array<{ date: string; score: number; passed: number; failed: number; total: number }>
}

type AssessmentDetail = {
  assessment: Assessment
  findings: Finding[]
  frameworkName: string
  evidence: EvidenceRecord[] | null
  comparison?: AssessmentComparison | null
}

export default function ComplianceDashboard({ companies }: { companies: Company[] }) {
  const [selectedCompany, setSelectedCompany] = useState<string>('')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [activeAssessment, setActiveAssessment] = useState<AssessmentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async (companyId: string) => {
    setLoading(true)
    setError(null)
    setActiveAssessment(null)
    try {
      const res = await fetch(`/api/compliance?companyId=${companyId}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setDashboard(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompany(companyId)
    if (companyId) loadDashboard(companyId)
    else { setDashboard(null); setActiveAssessment(null) }
  }

  const createAndRunAssessment = async () => {
    if (!selectedCompany) return
    setRunning(true)
    setError(null)
    try {
      const createRes = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany, frameworkId: 'cis-v8' }),
      })
      const createJson = await createRes.json()
      if (!createJson.success) throw new Error(createJson.error)

      const runRes = await fetch(`/api/compliance/assessments/${createJson.assessmentId}`, { method: 'POST' })
      const runJson = await runRes.json()
      if (!runJson.success) throw new Error(runJson.error || runJson.data?.errors?.join('; '))

      await loadDashboard(selectedCompany)
      await loadAssessment(createJson.assessmentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assessment failed')
    } finally {
      setRunning(false)
    }
  }

  const loadAssessment = async (assessmentId: string) => {
    try {
      const res = await fetch(`/api/compliance/assessments/${assessmentId}?evidence=true`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setActiveAssessment(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessment')
    }
  }

  const exportCsv = (assessmentId: string) => {
    window.open(`/api/compliance/export?assessmentId=${assessmentId}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Company Selector */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">Select Customer</label>
        <select
          value={selectedCompany}
          onChange={(e) => handleCompanyChange(e.target.value)}
          className="w-full max-w-md bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        >
          <option value="">Choose a company...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.m365SetupStatus === 'verified' ? '(M365 verified)' : c.m365SetupStatus === 'configured' ? '(M365 configured)' : ''}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
          <p className="text-slate-400 mt-3">Loading compliance data...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">{error}</div>
      )}

      {dashboard && !loading && (
        <>
          {/* Connector Status */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Integration Connectors</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ConnectorCard name="Microsoft 365 / Graph" type="microsoft_graph" connectors={dashboard.connectors} />
              <ConnectorCard name="Autotask PSA" type="autotask" connectors={dashboard.connectors} />
              <ConnectorCard name="Datto RMM" type="datto_rmm" connectors={dashboard.connectors} />
              <ConnectorCard name="Datto EDR" type="datto_edr" connectors={dashboard.connectors} />
              <ConnectorCard name="Datto BCDR / SaaS Protect" type="datto_bcdr" connectors={dashboard.connectors} />
              <ConnectorCard name="DNSFilter" type="dnsfilter" connectors={dashboard.connectors} />
            </div>
          </div>

          {/* Score Trend */}
          {dashboard.scoreTrend.length > 1 && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Compliance Score Trend</h2>
              <div className="flex items-end gap-2 h-32">
                {dashboard.scoreTrend.map((point, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-xs font-semibold ${getScoreColor(point.score)}`}>{point.score}%</span>
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-cyan-600 to-cyan-400 min-h-[4px]"
                      style={{ height: `${Math.max(point.score, 4)}%` }}
                    />
                    <span className="text-xs text-slate-500 truncate w-full text-center">
                      {new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assessment Actions */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Assessments</h2>
                {dashboard.latestScorePercent !== null && (
                  <p className="text-slate-400 text-sm mt-1">
                    Latest score: <span className={getScoreColor(dashboard.latestScorePercent)}>
                      {dashboard.latestScorePercent}%
                    </span>
                  </p>
                )}
              </div>
              <button
                onClick={createAndRunAssessment}
                disabled={running}
                className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {running ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Running Assessment...
                  </>
                ) : 'Run CIS v8 Assessment'}
              </button>
            </div>

            {dashboard.assessments.length > 0 ? (
              <div className="space-y-2">
                {dashboard.assessments.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => loadAssessment(a.id)}
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                      activeAssessment?.assessment.id === a.id
                        ? 'bg-cyan-500/10 border border-cyan-500/30'
                        : 'bg-slate-900/30 hover:bg-slate-700/30 border border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={a.status} />
                      <div>
                        <p className="text-sm font-medium text-white">CIS Controls v8</p>
                        <p className="text-xs text-slate-400">
                          {new Date(a.createdAt).toLocaleString()} by {a.createdBy}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {a.status === 'complete' && (
                        <>
                          <ScorePill passed={a.passedControls} total={a.totalControls} />
                          <button
                            onClick={(e) => { e.stopPropagation(); exportCsv(a.id) }}
                            className="text-xs bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 px-3 py-1 rounded"
                          >CSV</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No assessments yet. Run one to get started.</p>
            )}
          </div>

          {/* Assessment Detail */}
          {activeAssessment && (
            <AssessmentResults
              detail={activeAssessment}
              onExport={() => exportCsv(activeAssessment.assessment.id)}
            />
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectorCard({ name, type, connectors }: { name: string; type: string; connectors: ConnectorState[] }) {
  const connector = connectors.find((c) => c.connectorType === type)
  const status = connector?.status ?? 'not_configured'

  const statusColors: Record<string, string> = {
    verified: 'bg-green-500/20 text-green-300 border-green-500/30',
    configured: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    available: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    error: 'bg-red-500/20 text-red-300 border-red-500/30',
    not_configured: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }
  const statusLabels: Record<string, string> = {
    verified: 'Connected', configured: 'Configured', available: 'Available',
    error: 'Error', not_configured: 'Not Configured',
  }

  return (
    <div className="bg-slate-900/30 border border-white/5 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{name}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>
      {status === 'available' && (
        <p className="text-xs text-slate-500 mt-2">MSP integration active — customer matched by name</p>
      )}
      {connector?.lastCollectedAt && (
        <p className="text-xs text-slate-500 mt-2">
          Last collected: {new Date(connector.lastCollectedAt).toLocaleString()}
        </p>
      )}
      {connector?.errorMessage && status !== 'available' && (
        <p className="text-xs text-red-400 mt-1 truncate">{connector.errorMessage}</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    complete: 'bg-green-500/20 text-green-300',
    collecting: 'bg-cyan-500/20 text-cyan-300',
    evaluating: 'bg-violet-500/20 text-violet-300',
    draft: 'bg-slate-500/20 text-slate-400',
    error: 'bg-red-500/20 text-red-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? colors.draft}`}>
      {status}
    </span>
  )
}

function ScorePill({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0
  return <span className={`text-sm font-semibold ${getScoreColor(pct)}`}>{passed}/{total} ({pct}%)</span>
}

function getScoreColor(pct: number): string {
  if (pct >= 80) return 'text-green-400'
  if (pct >= 50) return 'text-cyan-400'
  return 'text-red-400'
}

// ---------------------------------------------------------------------------
// Assessment Results with comparison
// ---------------------------------------------------------------------------

function AssessmentResults({ detail, onExport }: { detail: AssessmentDetail; onExport: () => void }) {
  const [expandedControl, setExpandedControl] = useState<string | null>(null)
  const [evidenceView, setEvidenceView] = useState<string | null>(null)

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
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">{frameworkName} Results</h2>
          <p className="text-sm text-slate-400">
            {assessment.status === 'complete'
              ? `Completed ${new Date(assessment.completedAt ?? '').toLocaleString()}`
              : `Status: ${assessment.status}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onExport} className="inline-flex items-center px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors">
            Export CSV
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

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Passed" value={assessment.passedControls} color="text-green-400" />
        <StatCard label="Failed" value={assessment.failedControls} color="text-red-400" />
        <StatCard label="Needs Review" value={assessment.manualReviewControls} color="text-slate-400" />
        <StatCard label="Total" value={assessment.totalControls} color="text-white" />
      </div>

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

      {/* Control findings by category — numerically sorted */}
      <div className="space-y-4">
        {sortedCategories.map(([category, catFindings]) => (
          <div key={category} className="border border-white/5 rounded-lg overflow-hidden">
            <div className="bg-slate-900/50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-300">{CONTROL_CATEGORIES[category] ?? `Category ${category}`}</h3>
            </div>
            <div className="divide-y divide-white/5">
              {catFindings.map((f) => (
                <FindingRow
                  key={f.controlId}
                  finding={f}
                  change={changeMap.get(f.controlId)}
                  expanded={expandedControl === f.controlId}
                  onToggle={() => setExpandedControl(expandedControl === f.controlId ? null : f.controlId)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900/30 border border-white/5 rounded-lg p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  )
}

function FindingRow({ finding, change, expanded, onToggle }: {
  finding: Finding; change?: string; expanded: boolean; onToggle: () => void
}) {
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

  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`inline-flex items-center justify-center w-16 py-0.5 rounded text-xs font-bold ${config.bg} ${config.color}`}>
            {config.label}
          </span>
          <div className="min-w-0">
            <span className="text-sm text-white font-mono">{finding.controlId.replace('cis-v8-', '')}</span>
            <span className="text-sm text-slate-400 ml-2 truncate">{getControlTitle(finding.controlId)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {change && changeIndicators[change] && (
            <span className={`text-sm font-bold ${changeIndicators[change].color}`}>
              {changeIndicators[change].icon}
            </span>
          )}
          {finding.overrideStatus && (
            <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded">Override</span>
          )}
          <ConfidenceDot confidence={finding.confidence} />
          <span className="text-slate-500 text-sm">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 bg-slate-900/20">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Reasoning</p>
            <p className="text-sm text-slate-300">{finding.reasoning}</p>
          </div>
          {finding.remediation && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Remediation</p>
              <p className="text-sm text-cyan-300">{finding.remediation}</p>
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
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Confidence: {finding.confidence}</span>
            {finding.evaluatedAt && <span>Evaluated: {new Date(finding.evaluatedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = { high: 'bg-green-400', medium: 'bg-cyan-400', low: 'bg-slate-400', none: 'bg-slate-600' }
  const labels: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence', none: 'No evidence' }
  return <span title={labels[confidence] ?? 'Unknown'} className={`w-2 h-2 rounded-full ${colors[confidence] ?? colors.none}`} />
}

// ---------------------------------------------------------------------------
// Control metadata
// ---------------------------------------------------------------------------

const CONTROL_TITLES: Record<string, string> = {
  'cis-v8-1.1': 'Enterprise Asset Inventory',
  'cis-v8-3.3': 'Data Access Control Lists',
  'cis-v8-4.1': 'Secure Configuration Process',
  'cis-v8-4.6': 'Encryption at Rest (BitLocker)',
  'cis-v8-4.7': 'Manage Default Accounts',
  'cis-v8-5.2': 'Use Unique Passwords (MFA)',
  'cis-v8-5.3': 'Disable Dormant Accounts',
  'cis-v8-6.1': 'Access Granting Process',
  'cis-v8-6.2': 'Access Revoking Process',
  'cis-v8-6.3': 'MFA for External Apps',
  'cis-v8-6.5': 'MFA for Admin Access',
  'cis-v8-8.2': 'Collect Audit Logs',
  'cis-v8-8.5': 'Collect Detailed Audit Logs',
  'cis-v8-9.2': 'DNS Filtering Services',
  'cis-v8-10.1': 'Anti-Malware Software',
  'cis-v8-11.1': 'Data Recovery Practice',
  'cis-v8-12.6': 'Encryption in Transit',
  'cis-v8-14.1': 'Security Awareness Program',
  'cis-v8-15.7': 'Decommission Service Providers',
}

const CONTROL_CATEGORIES: Record<string, string> = {
  '1': '1 - Inventory and Control of Enterprise Assets',
  '3': '3 - Data Protection',
  '4': '4 - Secure Configuration',
  '5': '5 - Account Management',
  '6': '6 - Access Control Management',
  '8': '8 - Audit Log Management',
  '9': '9 - Email and Web Browser Protections',
  '10': '10 - Malware Defenses',
  '11': '11 - Data Recovery',
  '12': '12 - Network Infrastructure Management',
  '14': '14 - Security Awareness',
  '15': '15 - Service Provider Management',
}

function getControlTitle(controlId: string): string {
  return CONTROL_TITLES[controlId] ?? controlId
}

function getCategoryForControl(controlId: string): string {
  return controlId.replace('cis-v8-', '').split('.')[0]
}
