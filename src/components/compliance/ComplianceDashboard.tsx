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

import { useState, useCallback, useRef, lazy, Suspense } from 'react'
import type {
  Assessment,
  Finding,
  ConnectorState,
  EvidenceRecord,
  AssessmentComparison,
} from '@/lib/compliance/types'

const PolicyManager = lazy(() => import('./PolicyManager'))

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
  const [selectedFramework, setSelectedFramework] = useState('cis-v8-ig1')
  const [activeTab, setActiveTab] = useState<'assessments' | 'policies'>('assessments')

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
        body: JSON.stringify({ companyId: selectedCompany, frameworkId: selectedFramework }),
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

  const deleteAssessmentById = async (assessmentId: string) => {
    if (!confirm('Delete this assessment and all its evidence/findings? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/compliance/assessments/${assessmentId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      if (activeAssessment?.assessment.id === assessmentId) setActiveAssessment(null)
      if (selectedCompany) loadDashboard(selectedCompany)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assessment')
    }
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

      {/* Tab Navigation — only show when a company is selected */}
      {selectedCompany && dashboard && !loading && (
        <div className="flex gap-1 bg-slate-800/30 border border-white/5 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('assessments')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'assessments'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Assessments & Evidence
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'policies'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Policy Analysis
          </button>
        </div>
      )}

      {/* Policy Manager Tab */}
      {selectedCompany && dashboard && !loading && activeTab === 'policies' && (
        <Suspense fallback={<div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" /></div>}>
          <PolicyManager companyId={selectedCompany} companyName={dashboard.companyName} />
        </Suspense>
      )}

      {dashboard && !loading && activeTab === 'assessments' && (
        <>
          {/* Connector Status */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Integration Connectors</h2>
            <a href="/admin/compliance/tools" className="text-xs text-cyan-400 hover:text-cyan-300">
              View Tool Capability Map &rarr;
            </a>
          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ConnectorCard name="Microsoft 365 / Graph" type="microsoft_graph" connectors={dashboard.connectors} />
              <ConnectorCard name="Autotask PSA" type="autotask" connectors={dashboard.connectors} />
              <ConnectorCard name="Datto RMM" type="datto_rmm" connectors={dashboard.connectors} />
              <ConnectorCard name="Datto EDR" type="datto_edr" connectors={dashboard.connectors} />
              <ConnectorCard name="Datto BCDR / SaaS Protect" type="datto_bcdr" connectors={dashboard.connectors} />
              <ConnectorCard name="DNSFilter" type="dnsfilter" connectors={dashboard.connectors} />
              <ConnectorCard name="Domotz" type="domotz" connectors={dashboard.connectors} />
              <ConnectorCard name="IT Glue" type="it_glue" connectors={dashboard.connectors} />
              <ConnectorCard name="SaaS Alerts" type="saas_alerts" connectors={dashboard.connectors} />
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
              <div className="flex items-center gap-2">
                <select
                  value={selectedFramework}
                  onChange={(e) => setSelectedFramework(e.target.value)}
                  className="bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <optgroup label="CIS Controls v8">
                    <option value="cis-v8-ig1">CIS v8 — IG1 (Essential Hygiene)</option>
                    <option value="cis-v8-ig2">CIS v8 — IG2 (includes IG1)</option>
                    <option value="cis-v8-ig3">CIS v8 — IG3 (includes IG1 + IG2)</option>
                  </optgroup>
                  <optgroup label="Coming Soon">
                    <option value="cmmc-l1" disabled>CMMC Level 1</option>
                    <option value="cmmc-l2" disabled>CMMC Level 2</option>
                    <option value="nist-800-171" disabled>NIST 800-171</option>
                    <option value="hipaa" disabled>HIPAA</option>
                  </optgroup>
                </select>
                <button
                  onClick={createAndRunAssessment}
                  disabled={running}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                >
                  {running ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Running...
                    </>
                  ) : 'Run Assessment'}
                </button>
              </div>
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
                        <p className="text-sm font-medium text-white">{getFrameworkLabel(a.frameworkId)}</p>
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
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteAssessmentById(a.id) }}
                        className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1 rounded"
                        title="Delete assessment"
                      >Delete</button>
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
              onUpdated={() => loadAssessment(activeAssessment.assessment.id)}
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

function AssessmentResults({ detail, onExport, onUpdated }: { detail: AssessmentDetail; onExport: () => void; onUpdated: () => void }) {
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set())
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
        {technicalPart && <p className="text-sm text-slate-300">{technicalPart}</p>}
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

  // Fallback: just handle newlines
  return (
    <div className="space-y-1">
      {text.split('\n').filter(Boolean).map((line, i) => (
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

function getFrameworkLabel(frameworkId: string): string {
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
// Control metadata
// ---------------------------------------------------------------------------

const CONTROL_TITLES: Record<string, string> = {
  // 1 - Asset Inventory
  'cis-v8-1.1': 'Establish and Maintain Detailed Enterprise Asset Inventory',
  'cis-v8-1.2': 'Address Unauthorized Assets',
  'cis-v8-1.3': 'Utilize an Active Discovery Tool',
  'cis-v8-1.4': 'Use DHCP Logging',
  'cis-v8-1.5': 'Use a Passive Asset Discovery Tool',
  // 2 - Software Inventory
  'cis-v8-2.1': 'Establish and Maintain a Software Inventory',
  'cis-v8-2.2': 'Ensure Authorized Software is Currently Supported',
  'cis-v8-2.3': 'Address Unauthorized Software',
  // 3 - Data Protection
  'cis-v8-3.1': 'Establish and Maintain a Data Management Process',
  'cis-v8-3.2': 'Establish and Maintain a Data Inventory',
  'cis-v8-3.3': 'Configure Data Access Control Lists',
  'cis-v8-3.4': 'Enforce Data Retention',
  'cis-v8-3.5': 'Securely Dispose of Data',
  'cis-v8-3.6': 'Encrypt Data on End-User Devices',
  // 4 - Secure Configuration
  'cis-v8-4.1': 'Establish and Maintain a Secure Configuration Process',
  'cis-v8-4.2': 'Secure Configuration for Network Infrastructure',
  'cis-v8-4.3': 'Configure Automatic Session Locking',
  'cis-v8-4.4': 'Implement and Manage a Firewall on Servers',
  'cis-v8-4.5': 'Implement and Manage a Firewall on End-User Devices',
  'cis-v8-4.6': 'Securely Manage Enterprise Assets (Encryption at Rest)',
  'cis-v8-4.7': 'Manage Default Accounts',
  // 5 - Account Management
  'cis-v8-5.1': 'Establish and Maintain an Inventory of Accounts',
  'cis-v8-5.2': 'Use Unique Passwords',
  'cis-v8-5.3': 'Disable Dormant Accounts',
  'cis-v8-5.4': 'Restrict Administrator Privileges to Dedicated Accounts',
  // 6 - Access Control
  'cis-v8-6.1': 'Establish an Access Granting Process',
  'cis-v8-6.2': 'Establish an Access Revoking Process',
  'cis-v8-6.3': 'Require MFA for Externally-Exposed Applications',
  'cis-v8-6.4': 'Require MFA for Remote Network Access',
  'cis-v8-6.5': 'Require MFA for Administrative Access',
  // 7 - Vulnerability Management
  'cis-v8-7.1': 'Establish and Maintain a Vulnerability Management Process',
  'cis-v8-7.2': 'Establish and Maintain a Remediation Process',
  'cis-v8-7.3': 'Perform Automated Operating System Patch Management',
  'cis-v8-7.4': 'Perform Automated Application Patch Management',
  // 8 - Audit Log Management
  'cis-v8-8.1': 'Establish and Maintain an Audit Log Management Process',
  'cis-v8-8.2': 'Collect Audit Logs',
  'cis-v8-8.3': 'Ensure Adequate Audit Log Storage',
  'cis-v8-8.5': 'Collect Detailed Audit Logs',
  // 9 - Email and Web Browser
  'cis-v8-9.1': 'Ensure Use of Only Fully Supported Browsers and Email Clients',
  'cis-v8-9.2': 'Use DNS Filtering Services',
  // 10 - Malware Defenses
  'cis-v8-10.1': 'Deploy and Maintain Anti-Malware Software',
  'cis-v8-10.2': 'Configure Automatic Anti-Malware Signature Updates',
  'cis-v8-10.3': 'Disable Autorun and Autoplay for Removable Media',
  // 11 - Data Recovery
  'cis-v8-11.1': 'Establish and Maintain a Data Recovery Practice',
  'cis-v8-11.2': 'Perform Automated Backups',
  'cis-v8-11.3': 'Protect Recovery Data',
  'cis-v8-11.4': 'Establish and Maintain an Isolated Instance of Recovery Data',
  // 12 - Network Infrastructure
  'cis-v8-12.1': 'Ensure Network Infrastructure is Up-to-Date',
  'cis-v8-12.6': 'Use of Encryption for Data in Transit',
  // 13 - Network Monitoring
  'cis-v8-13.1': 'Centralize Security Event Alerting',
  // 14 - Security Awareness
  'cis-v8-14.1': 'Establish and Maintain a Security Awareness Program',
  'cis-v8-14.2': 'Train Workforce to Recognize Social Engineering Attacks',
  'cis-v8-14.3': 'Train Workforce on Authentication Best Practices',
  'cis-v8-14.4': 'Train Workforce on Data Handling Best Practices',
  'cis-v8-14.5': 'Train Workforce on Causes of Unintentional Data Exposure',
  'cis-v8-14.6': 'Train Workforce on Recognizing and Reporting Security Incidents',
  'cis-v8-14.7': 'Train Workforce on Identifying Missing Security Updates',
  'cis-v8-14.8': 'Train Workforce on Dangers of Insecure Networks',
  // 15 - Service Provider Management
  'cis-v8-15.1': 'Establish and Maintain an Inventory of Service Providers',
  'cis-v8-15.2': 'Establish and Maintain a Service Provider Management Policy',
  'cis-v8-15.7': 'Securely Decommission Service Providers',
  // 16 - Application Software Security
  'cis-v8-16.1': 'Establish and Maintain a Secure Application Development Process',
  // 17 - Incident Response
  'cis-v8-17.1': 'Designate Personnel to Manage Incident Handling',
  'cis-v8-17.2': 'Establish Contact Information for Reporting Security Incidents',
  'cis-v8-17.3': 'Establish Enterprise Process for Reporting Incidents',
}

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
  return controlId.replace('cis-v8-', '').split('.')[0]
}

const CONTROL_DESCRIPTIONS: Record<string, string> = {
  'cis-v8-1.1': 'Establish and maintain an accurate, detailed, and up-to-date inventory of all enterprise assets with the potential to store or process data, including end-user devices, network devices, IoT devices, and servers.',
  'cis-v8-1.2': 'Ensure that a process exists to address unauthorized assets on a weekly basis. The enterprise may choose to remove the asset from the network, deny the asset from connecting remotely, or quarantine the asset.',
  'cis-v8-1.3': 'Utilize an active discovery tool to identify assets connected to the enterprise network. Configure the active discovery tool to execute daily, or more frequently.',
  'cis-v8-1.4': 'Use DHCP logging on all DHCP servers or IP address management tools to update the enterprise asset inventory.',
  'cis-v8-1.5': 'Use a passive discovery tool to identify assets connected to the enterprise network.',
  'cis-v8-2.1': 'Establish and maintain a detailed inventory of all licensed software installed on enterprise assets.',
  'cis-v8-2.2': 'Ensure that only currently supported software is designated as authorized in the software inventory for enterprise assets.',
  'cis-v8-2.3': 'Ensure that unauthorized software is either removed from use on enterprise assets or receives a documented exception.',
  'cis-v8-3.1': 'Establish and maintain a data management process including data sensitivity levels, data owner, handling requirements, data retention limits, and disposal requirements.',
  'cis-v8-3.2': 'Establish and maintain a data inventory based on the enterprise\'s data management process. At a minimum, inventory sensitive data.',
  'cis-v8-3.3': 'Configure data access control lists based on a user\'s need to know. Apply data access control lists to local and remote file systems, databases, and applications.',
  'cis-v8-3.4': 'Retain data according to the enterprise\'s data management process. Data retention must include both minimum and maximum timelines.',
  'cis-v8-3.5': 'Securely dispose of data as outlined in the enterprise\'s data management process. Ensure the disposal process and method are commensurate with the data sensitivity.',
  'cis-v8-3.6': 'Encrypt data on end-user devices containing sensitive data. Example implementations can include Windows BitLocker, Apple FileVault, Linux dm-crypt.',
  'cis-v8-4.1': 'Establish and maintain a secure configuration process for enterprise assets (end-user devices, including portable and mobile; network devices; non-computing/IoT devices; and servers) and software (operating systems and applications).',
  'cis-v8-4.2': 'Establish and maintain a secure configuration process for network infrastructure including firewalls, routers, and switches.',
  'cis-v8-4.3': 'Configure automatic session locking on enterprise assets after a defined period of inactivity. For general purpose operating systems, the period must not exceed 15 minutes. For mobile end-user devices, the period must not exceed 2 minutes.',
  'cis-v8-4.4': 'Implement and manage a firewall on servers, where supported. Example implementations include a virtual firewall, operating system firewall, or a third-party firewall agent.',
  'cis-v8-4.5': 'Implement and manage a host-based firewall or port-filtering tool on end-user devices, with a default-deny rule that drops all traffic except those services and ports that are explicitly allowed.',
  'cis-v8-4.6': 'Securely manage enterprise assets and software. Use encryption for data at rest on enterprise assets containing sensitive data.',
  'cis-v8-4.7': 'Manage default accounts on enterprise assets and software, such as root, administrator, and other pre-configured vendor default accounts. Example implementations can include disabling default accounts or making them unusable.',
  'cis-v8-5.1': 'Establish and maintain an inventory of all accounts managed in the enterprise. The inventory must include both user and administrator accounts.',
  'cis-v8-5.2': 'Use unique passwords for all enterprise assets. Best practice implementation includes, at a minimum, an 8-character password for accounts using MFA and a 14-character password for accounts not using MFA.',
  'cis-v8-5.3': 'Delete or disable any dormant accounts after a period of 45 days of inactivity, where supported.',
  'cis-v8-5.4': 'Restrict administrator privileges to dedicated administrator accounts on enterprise assets. Conduct general computing activities, such as internet browsing, email, and productivity suite use, from the user\'s primary, non-privileged account.',
  'cis-v8-6.1': 'Establish and follow a process, preferably automated, for granting access to enterprise assets upon new hire, rights grant, or role change of a user.',
  'cis-v8-6.2': 'Establish and follow a process, preferably automated, for revoking access to enterprise assets, through disabling accounts immediately upon termination, rights revocation, or role change of a user.',
  'cis-v8-6.3': 'Require all externally-exposed enterprise or third-party applications to enforce multi-factor authentication, where supported. Enforcing MFA through a directory service or SSO provider is a satisfactory implementation of this safeguard.',
  'cis-v8-6.4': 'Require MFA for remote network access.',
  'cis-v8-6.5': 'Require MFA for all administrative access accounts, where supported, on all enterprise assets, whether managed on-site or through a third-party provider.',
  'cis-v8-7.1': 'Establish and maintain a documented vulnerability management process for enterprise assets. Review and update documentation annually, or when significant enterprise changes occur that could impact this safeguard.',
  'cis-v8-7.2': 'Establish and maintain a risk-based remediation strategy documented in a remediation process, with monthly, or more frequent, parsec of vulnerabilities, as review cadence.',
  'cis-v8-7.3': 'Perform operating system updates on enterprise assets through automated patch management on a monthly, or more frequent, basis.',
  'cis-v8-7.4': 'Perform application updates on enterprise assets through automated patch management on a monthly, or more frequent, basis.',
  'cis-v8-8.1': 'Establish and maintain an audit log management process that defines the enterprise\'s logging requirements. At a minimum, address the collection, review, and retention of audit logs for enterprise assets.',
  'cis-v8-8.2': 'Collect audit logs. Ensure that logging, per the enterprise\'s audit log management process, has been enabled across enterprise assets.',
  'cis-v8-8.3': 'Ensure that logging destinations maintain adequate storage to comply with the enterprise\'s audit log management process.',
  'cis-v8-8.5': 'Configure detailed audit logging for enterprise assets containing sensitive data. Include event source, date, username, timestamp, source addresses, destination addresses, and other useful elements that could assist in a forensic investigation.',
  'cis-v8-9.1': 'Ensure only fully supported browsers and email clients are allowed to execute in the enterprise, only using the latest version of browsers and email clients provided through the vendor.',
  'cis-v8-9.2': 'Use DNS filtering services on all enterprise assets to block access to known malicious domains.',
  'cis-v8-10.1': 'Deploy and maintain anti-malware software on all enterprise assets.',
  'cis-v8-10.2': 'Configure automatic updates for anti-malware signature files on all enterprise assets.',
  'cis-v8-10.3': 'Disable autorun and autoplay auto-execute functionality for removable media.',
  'cis-v8-11.1': 'Establish and maintain a data recovery practice. In the practice, address the scope, prioritization, and testing of recovery procedures for in-scope enterprise software and data.',
  'cis-v8-11.2': 'Perform automated backups of in-scope enterprise assets. Run backups weekly, or more frequently, based on the sensitivity of the data.',
  'cis-v8-11.3': 'Protect recovery data with equivalent controls to the original data. Reference encryption or data separation, based on requirements.',
  'cis-v8-11.4': 'Establish and maintain an isolated instance of recovery data using versioning or an offline/air-gapped destination.',
  'cis-v8-12.1': 'Ensure network infrastructure is kept up-to-date. Example implementations include running the latest stable release of software and/or using currently-supported network-as-a-service (NaaS) offerings.',
  'cis-v8-12.6': 'Ensure all data in transit is encrypted using TLS 1.2+ for web traffic, encrypted email, and encrypted VPN connections.',
  'cis-v8-13.1': 'Centralize security event alerting across enterprise assets for log correlation and analysis. Best practice implementation requires the use of a SIEM.',
  'cis-v8-14.1': 'Establish and maintain a security awareness program. The purpose of a security awareness program is to educate the enterprise\'s workforce on how to interact with enterprise assets and data in a secure manner.',
  'cis-v8-14.2': 'Train workforce members to recognize social engineering attacks, such as phishing, pre-texting, and tailgating.',
  'cis-v8-14.3': 'Train workforce members on authentication best practices. Example topics include MFA, password composition, and credential management.',
  'cis-v8-14.4': 'Train workforce members on how to identify and properly store, transfer, archive, and destroy sensitive data.',
  'cis-v8-14.5': 'Train workforce members to be aware of causes for unintentional data exposure. Example topics include mis-delivery of sensitive data, losing a portable end-user device, or publishing data to unintended audiences.',
  'cis-v8-14.6': 'Train workforce members to be able to recognize a potential incident and be able to report such an incident.',
  'cis-v8-14.7': 'Train workforce to understand how to verify and report out-of-date software patches or any failures in automated processes and tools. Part of this training should include notifying IT personnel of any failures in automated processes and tools.',
  'cis-v8-14.8': 'Train workforce members on the dangers of connecting to, and transmitting data over, insecure networks for enterprise activities.',
  'cis-v8-15.1': 'Establish and maintain an inventory of service providers. The inventory is to list all known service providers, include classification(s), and designate an enterprise contact for each service provider.',
  'cis-v8-15.2': 'Establish and maintain a service provider management policy. Ensure the policy addresses the classification, inventory, assessment, monitoring, and decommissioning of service providers.',
  'cis-v8-15.7': 'Securely decommission service providers. Example considerations include user and service account deactivation, termination of data flows, and secure disposal of enterprise data within service provider systems.',
  'cis-v8-16.1': 'Establish and maintain a documented secure application development process. In the process, address such items as: secure application design standards, secure coding practices, developer training, vulnerability management, security of third-party code, and application security testing procedures.',
  'cis-v8-17.1': 'Designate one key person, and at least one backup, who will manage the enterprise\'s incident handling process. Management personnel are responsible for the coordination and documentation of incident response and recovery efforts.',
  'cis-v8-17.2': 'Establish and maintain contact information for parties that need to be informed of security incidents. Contacts may include internal staff, third-party vendors, law enforcement, cyber insurance providers, relevant government agencies, ISAC partners, or other stakeholders.',
  'cis-v8-17.3': 'Establish and maintain an enterprise process for the workforce to report security incidents. The process includes reporting timeframe, personnel to report to, mechanism for reporting, and the minimum information to be reported.',
}
