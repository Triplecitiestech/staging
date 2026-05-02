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
import { AssessmentResults, getScoreColor, getFrameworkLabel } from './AssessmentResults'
import type { AssessmentDetail } from './AssessmentResults'

const PolicyManager = lazy(() => import('./PolicyManager'))
const PlatformMappingPanel = lazy(() => import('./PlatformMappingPanel'))
const PolicyGenerationDashboard = lazy(() => import('./PolicyGenerationDashboard'))

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

export default function ComplianceDashboard({ companies }: { companies: Company[] }) {
  const [selectedCompany, setSelectedCompany] = useState<string>('')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [activeAssessment, setActiveAssessment] = useState<AssessmentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFramework, setSelectedFramework] = useState('cis-v8-ig1')
  const [activeTab, setActiveTab] = useState<'assessments' | 'policies' | 'policy-gen' | 'mapping'>('assessments')
  const assessmentDetailRef = useRef<HTMLDivElement>(null)

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
      // Scroll to assessment detail on load (important for iPad/mobile where detail is below fold)
      setTimeout(() => {
        assessmentDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessment')
    }
  }

  const exportCsv = (assessmentId: string) => {
    window.open(`/api/compliance/export?assessmentId=${assessmentId}`, '_blank')
  }

  // Generates a Markdown worksheet keyed by CIS safeguard with pre-filled
  // answers + justifications. The engineer hands the file to Claude Cowork
  // (a browser agent) along with their MyITProcess URL; Cowork executes the
  // clicks/typing in the Alignment review since MyITProcess has no write API.
  const exportCoworkWorksheet = (assessmentId: string) => {
    window.open(`/api/compliance/assessments/${assessmentId}/cowork-worksheet`, '_blank')
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
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 sm:p-6">
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
          <button
            onClick={() => setActiveTab('policy-gen')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'policy-gen'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Policy Generation
          </button>
          <button
            onClick={() => setActiveTab('mapping')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'mapping'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            Platform Mapping
          </button>
        </div>
      )}

      {/* Policy Manager Tab */}
      {selectedCompany && dashboard && !loading && activeTab === 'policies' && (
        <Suspense fallback={<div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" /></div>}>
          <PolicyManager companyId={selectedCompany} companyName={dashboard.companyName} />
        </Suspense>
      )}

      {/* Policy Generation Tab */}
      {selectedCompany && dashboard && !loading && activeTab === 'policy-gen' && (
        <Suspense fallback={<div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" /></div>}>
          <PolicyGenerationDashboard companyId={selectedCompany} companyName={dashboard.companyName} />
        </Suspense>
      )}

      {/* Platform Mapping Tab */}
      {selectedCompany && dashboard && !loading && activeTab === 'mapping' && (
        <Suspense fallback={<div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" /></div>}>
          <PlatformMappingPanel companyId={selectedCompany} companyName={dashboard.companyName} />
        </Suspense>
      )}

      {dashboard && !loading && activeTab === 'assessments' && (
        <>
          {/* Connector Status */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 sm:p-6">
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
            <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Compliance Score Trend</h2>
              <div className="overflow-x-auto -mx-2 px-2">
                <div className="flex items-end gap-2 h-32" style={{ minWidth: `${dashboard.scoreTrend.length * 48}px` }}>
                  {dashboard.scoreTrend.map((point, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-[40px]">
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
            </div>
          )}

          {/* Assessment Actions */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 sm:p-6">
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <select
                  value={selectedFramework}
                  onChange={(e) => setSelectedFramework(e.target.value)}
                  className="bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 min-w-0"
                >
                  <optgroup label="CIS Controls v8">
                    <option value="cis-v8-ig1">CIS v8 — IG1 (Essential Hygiene)</option>
                    <option value="cis-v8-ig2">CIS v8 — IG2 (includes IG1)</option>
                    <option value="cis-v8-ig3">CIS v8 — IG3 (includes IG1 + IG2)</option>
                  </optgroup>
                  <optgroup label="CMMC">
                    <option value="cmmc-l1">CMMC Level 1 (Foundational, FAR 52.204-21)</option>
                  </optgroup>
                  <optgroup label="Coming Soon">
                    <option value="cmmc-l2" disabled>CMMC Level 2</option>
                    <option value="nist-800-171" disabled>NIST 800-171</option>
                    <option value="hipaa" disabled>HIPAA</option>
                  </optgroup>
                </select>
                <button
                  onClick={createAndRunAssessment}
                  disabled={running}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
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
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      activeAssessment?.assessment.id === a.id
                        ? 'bg-cyan-500/10 border border-cyan-500/30'
                        : 'bg-slate-900/30 hover:bg-slate-700/30 border border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <StatusBadge status={a.status} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{getFrameworkLabel(a.frameworkId)}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {new Date(a.createdAt).toLocaleString()} by {a.createdBy}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 flex-shrink-0">
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
            <div ref={assessmentDetailRef}>
            <AssessmentResults
              detail={activeAssessment}
              onExport={() => exportCsv(activeAssessment.assessment.id)}
              onCoworkWorksheet={() => exportCoworkWorksheet(activeAssessment.assessment.id)}
              onUpdated={() => loadAssessment(activeAssessment.assessment.id)}
            />
            </div>
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

