'use client'

/**
 * ComplianceWorkflow — 6-step guided compliance stepper
 *
 * Replaces the tab-based ComplianceDashboard UI with a linear guided flow:
 *   Step 1: Prerequisites (M365 + Autotask verification)
 *   Step 2: Tool Configuration (toggle active tools per customer)
 *   Step 3: Platform Mapping (map active tools to customer instances)
 *   Step 4: Initial Assessment (run CIS assessment, view results)
 *   Step 5: Policy Generation (org profile + policy catalog)
 *   Step 6: Final Assessment (re-run, show improvement delta)
 *
 * Composes existing components (PlatformMappingPanel, PolicyGenerationDashboard)
 * and reuses the stepper pattern from TechOnboardingWizard.
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import Link from 'next/link'

const PlatformMappingPanel = lazy(() => import('./PlatformMappingPanel'))
const PolicyGenerationDashboard = lazy(() => import('./PolicyGenerationDashboard'))
const PolicyManager = lazy(() => import('./PolicyManager'))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Company {
  id: string
  name: string
  slug: string
  m365SetupStatus: string | null
  autotaskCompanyId: string | null
}

interface WorkflowStepData {
  complete: boolean
  label: string
  toolCount?: number
  mappingCount?: number
  assessmentCount?: number
  hasOrgProfile?: boolean
  policyCount?: number
}

interface WorkflowStatus {
  companyId: string
  prerequisites: { m365Ready: boolean; autotaskReady: boolean }
  steps: Record<number, WorkflowStepData>
}

interface Tool {
  toolId: string
  name: string
  vendor: string
  category: string
  integrationStatus: string
  description: string
  capabilityCount: number
}

interface CompanyToolStatus {
  toolId: string
  deployed: boolean
  notes: string | null
}

interface Assessment {
  id: string
  frameworkId: string
  status: string
  passedControls: number
  totalControls: number
  createdAt: string
  completedAt: string | null
  createdBy: string
}

type StepStatus = 'pending' | 'active' | 'complete'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { num: 1, label: 'Prerequisites', description: 'Verify M365 & Autotask connections' },
  { num: 2, label: 'Tool Configuration', description: 'Select active tools for this customer' },
  { num: 3, label: 'Platform Mapping', description: 'Map tools to customer instances' },
  { num: 4, label: 'Initial Assessment', description: 'Run compliance assessment' },
  { num: 5, label: 'Policy Generation', description: 'Generate compliance policies' },
  { num: 6, label: 'Final Assessment', description: 'Re-assess with policies' },
]

// ---------------------------------------------------------------------------
// StepIndicator (reused pattern from TechOnboardingWizard)
// ---------------------------------------------------------------------------

function StepIndicator({
  number,
  label,
  description,
  status,
  active,
  onClick,
  disabled,
}: {
  number: number
  label: string
  description: string
  status: StepStatus
  active: boolean
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-3 w-full text-left p-3 rounded-lg transition-colors ${
        active
          ? 'bg-cyan-500/10 border border-cyan-500/30'
          : disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-white/5 cursor-pointer'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border-2 transition-colors ${
          status === 'complete'
            ? 'bg-teal-500 border-teal-500 text-white'
            : active
            ? 'border-cyan-400 text-cyan-400 bg-transparent'
            : 'border-gray-600 text-gray-500 bg-transparent'
        }`}
      >
        {status === 'complete' ? '✓' : number}
      </div>
      <div className="min-w-0">
        <span className={`text-sm font-medium block ${active ? 'text-white' : status === 'complete' ? 'text-teal-300' : 'text-gray-500'}`}>
          {label}
        </span>
        <span className={`text-xs block mt-0.5 ${active ? 'text-slate-400' : 'text-slate-600'}`}>
          {description}
        </span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ text }: { text?: string }) {
  return (
    <div className="text-center py-12">
      <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
      {text && <p className="text-slate-400 mt-3 text-sm">{text}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Workflow Component
// ---------------------------------------------------------------------------

export default function ComplianceWorkflow({ companies }: { companies: Company[] }) {
  const [selectedCompany, setSelectedCompany] = useState<string>('')
  const [currentStep, setCurrentStep] = useState(1)
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2 state (tool config)
  const [tools, setTools] = useState<Tool[]>([])
  const [companyTools, setCompanyTools] = useState<CompanyToolStatus[]>([])
  const [toolsLoading, setToolsLoading] = useState(false)

  // Step 4 & 6 state (assessments)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [selectedFramework, setSelectedFramework] = useState('cis-v8-ig1')
  const [running, setRunning] = useState(false)
  const [latestScore, setLatestScore] = useState<number | null>(null)

  // Track which sub-view the PolicyGenerationDashboard is showing so Step 5
  // can hide sibling content (uploaded-policy management, Continue button)
  // when the tech drills into a specific policy.
  const [policyView, setPolicyView] = useState<'overview' | 'org-profile' | 'policy-detail'>('overview')

  const selectedCompanyObj = companies.find((c) => c.id === selectedCompany)

  // -----------------------------------------------------------------------
  // Load workflow status for selected company
  // -----------------------------------------------------------------------

  const loadWorkflowStatus = useCallback(async (companyId: string, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/compliance/workflow-status?companyId=${companyId}`, { signal })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setWorkflowStatus(json.data)

      // Auto-advance to first incomplete step
      const steps = json.data.steps as Record<number, WorkflowStepData>
      for (let i = 1; i <= 6; i++) {
        if (!steps[i]?.complete) {
          setCurrentStep(i)
          return
        }
      }
      setCurrentStep(6) // all complete, show final
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load workflow status')
    } finally {
      setLoading(false)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Load tools for Step 2
  // -----------------------------------------------------------------------

  const loadTools = useCallback(async (companyId: string, signal?: AbortSignal) => {
    setToolsLoading(true)
    try {
      const [registryRes, companyToolsRes] = await Promise.all([
        fetch(`/api/compliance/registry?companyId=${companyId}&frameworkId=cis-v8-ig1`, { signal }),
        fetch(`/api/compliance/registry/company-tools?companyId=${companyId}`, { signal }),
      ])
      const registryJson = await registryRes.json()
      const companyToolsJson = await companyToolsRes.json()
      if (registryJson.success) setTools(registryJson.data.tools)
      if (companyToolsJson.success) setCompanyTools(companyToolsJson.data)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    } finally {
      setToolsLoading(false)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Load assessments for Step 4 & 6
  // -----------------------------------------------------------------------

  const loadAssessments = useCallback(async (companyId: string, signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/compliance?companyId=${companyId}`, { signal })
      const json = await res.json()
      if (json.success && json.data) {
        setAssessments(json.data.assessments ?? [])
        setLatestScore(json.data.latestScorePercent)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }, [])

  // -----------------------------------------------------------------------
  // Company change handler
  // -----------------------------------------------------------------------

  const handleCompanyChange = useCallback((companyId: string) => {
    setSelectedCompany(companyId)
    setWorkflowStatus(null)
    setCurrentStep(1)
    setTools([])
    setCompanyTools([])
    setAssessments([])
    setLatestScore(null)
    setError(null)
    if (companyId) {
      loadWorkflowStatus(companyId)
    }
  }, [loadWorkflowStatus])

  // Load step-specific data when step changes
  useEffect(() => {
    if (!selectedCompany) return
    const controller = new AbortController()

    if (currentStep === 2) {
      loadTools(selectedCompany, controller.signal)
    } else if (currentStep === 4 || currentStep === 6) {
      loadAssessments(selectedCompany, controller.signal)
    }

    return () => controller.abort()
  }, [currentStep, selectedCompany, loadTools, loadAssessments])

  // -----------------------------------------------------------------------
  // Tool toggle handler (Step 2)
  // -----------------------------------------------------------------------

  const toggleTool = async (toolId: string, deployed: boolean) => {
    if (!selectedCompany) return
    try {
      await fetch('/api/compliance/registry/company-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany, toolId, deployed }),
      })
      // Reload company tools
      const res = await fetch(`/api/compliance/registry/company-tools?companyId=${selectedCompany}`)
      const json = await res.json()
      if (json.success) setCompanyTools(json.data)
    } catch { /* ignore */ }
  }

  // -----------------------------------------------------------------------
  // Run assessment handler (Step 4 & 6)
  // -----------------------------------------------------------------------

  const runAssessment = async () => {
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

      // Reload assessments and workflow status
      await Promise.all([
        loadAssessments(selectedCompany),
        loadWorkflowStatus(selectedCompany),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assessment failed')
    } finally {
      setRunning(false)
    }
  }

  // -----------------------------------------------------------------------
  // Step navigation helpers
  // -----------------------------------------------------------------------

  const getStepStatus = (stepNum: number): StepStatus => {
    if (!workflowStatus) return 'pending'
    if (workflowStatus.steps[stepNum]?.complete) return 'complete'
    if (stepNum === currentStep) return 'active'
    return 'pending'
  }

  const canAccessStep = (stepNum: number): boolean => {
    if (!workflowStatus) return stepNum === 1
    // Can always go back to completed steps
    if (workflowStatus.steps[stepNum]?.complete) return true
    // Can access current step
    if (stepNum === currentStep) return true
    // Can access next step if previous is complete
    if (stepNum > 1 && workflowStatus.steps[stepNum - 1]?.complete) return true
    return false
  }

  const goToNextStep = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1)
      // Refresh workflow status
      if (selectedCompany) loadWorkflowStatus(selectedCompany)
    }
  }

  // -----------------------------------------------------------------------
  // Get score color
  // -----------------------------------------------------------------------

  const getScoreColor = (pct: number): string => {
    if (pct >= 80) return 'text-green-400'
    if (pct >= 50) return 'text-cyan-400'
    return 'text-red-400'
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

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
              {c.name}
              {c.m365SetupStatus === 'verified' ? ' (M365 verified)' : c.m365SetupStatus === 'configured' ? ' (M365 configured)' : ''}
              {c.autotaskCompanyId ? '' : ' (no Autotask)'}
            </option>
          ))}
        </select>
      </div>

      {loading && <Spinner text="Loading compliance workflow..." />}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Stepper Layout */}
      {selectedCompany && workflowStatus && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar — step indicators */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 lg:sticky lg:top-8">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">Workflow Steps</h3>
              {STEPS.map((s) => (
                <StepIndicator
                  key={s.num}
                  number={s.num}
                  label={s.label}
                  description={s.description}
                  status={getStepStatus(s.num)}
                  active={currentStep === s.num}
                  onClick={() => canAccessStep(s.num) && setCurrentStep(s.num)}
                  disabled={!canAccessStep(s.num)}
                />
              ))}

              {/* Overall progress */}
              <div className="mt-4 pt-4 border-t border-white/10 px-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Progress</span>
                  <span>{Object.values(workflowStatus.steps).filter((s) => s.complete).length}/6</span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-teal-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(Object.values(workflowStatus.steps).filter((s) => s.complete).length / 6) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main content area */}
          <div className="lg:col-span-3 space-y-6">
            {/* ============================================================= */}
            {/* STEP 1: Prerequisites                                          */}
            {/* ============================================================= */}
            {currentStep === 1 && (
              <StepCard title="Prerequisites" subtitle="Verify integrations before starting compliance workflow">
                <div className="space-y-4">
                  {/* M365 Check */}
                  <div className={`flex items-center gap-4 p-4 rounded-lg border ${
                    workflowStatus.prerequisites.m365Ready
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-slate-800/50 border-white/10'
                  }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      workflowStatus.prerequisites.m365Ready ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-500'
                    }`}>
                      {workflowStatus.prerequisites.m365Ready ? '✓' : '!'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Microsoft 365 Connection</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {workflowStatus.prerequisites.m365Ready
                          ? 'M365 credentials configured and ready'
                          : 'M365 app registration required for Graph API evidence collection'}
                      </p>
                    </div>
                    {!workflowStatus.prerequisites.m365Ready && selectedCompanyObj && (
                      <Link
                        href={`/admin/companies/${selectedCompanyObj.id}/onboard`}
                        className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
                      >
                        Set up M365 &rarr;
                      </Link>
                    )}
                  </div>

                  {/* Autotask Check */}
                  <div className={`flex items-center gap-4 p-4 rounded-lg border ${
                    workflowStatus.prerequisites.autotaskReady
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-slate-800/50 border-white/10'
                  }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      workflowStatus.prerequisites.autotaskReady ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-500'
                    }`}>
                      {workflowStatus.prerequisites.autotaskReady ? '✓' : '!'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">Autotask PSA Sync</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {workflowStatus.prerequisites.autotaskReady
                          ? 'Company synced from Autotask'
                          : 'Company must be synced from Autotask for ticket and project data'}
                      </p>
                    </div>
                    {!workflowStatus.prerequisites.autotaskReady && selectedCompanyObj && (
                      <Link
                        href={`/admin/companies/${selectedCompanyObj.id}/onboard`}
                        className="text-xs text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
                      >
                        Sync from Autotask &rarr;
                      </Link>
                    )}
                  </div>

                  {/* Continue button */}
                  {workflowStatus.steps[1]?.complete ? (
                    <div className="flex justify-end pt-4">
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm transition-all"
                      >
                        Continue to Tool Configuration &rarr;
                      </button>
                    </div>
                  ) : (
                    <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200">
                      Both M365 and Autotask must be configured before proceeding. Use the onboarding wizard to set them up.
                    </div>
                  )}
                </div>
              </StepCard>
            )}

            {/* ============================================================= */}
            {/* STEP 2: Tool Configuration                                     */}
            {/* ============================================================= */}
            {currentStep === 2 && (
              <StepCard title="Tool Configuration" subtitle="Select which tools from the MSP stack are active for this customer">
                {toolsLoading ? (
                  <Spinner text="Loading tool registry..." />
                ) : (
                  <div className="space-y-6">
                    <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200">
                      Toggle ON the tools that are deployed for this customer. Tools not deployed will be excluded from evidence collection.
                      The MSP standard stack is shown below — adjust per customer as needed.
                    </div>

                    {/* Integrated tools */}
                    {tools.filter((t) => t.integrationStatus === 'integrated').length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">
                          Integrated Tools ({tools.filter((t) => t.integrationStatus === 'integrated').length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {tools
                            .filter((t) => t.integrationStatus === 'integrated')
                            .map((tool) => {
                              const ct = companyTools.find((ct) => ct.toolId === tool.toolId)
                              const deployed = ct?.deployed ?? false
                              return (
                                <ToolToggleCard
                                  key={tool.toolId}
                                  tool={tool}
                                  deployed={deployed}
                                  onToggle={(d) => toggleTool(tool.toolId, d)}
                                />
                              )
                            })}
                        </div>
                      </div>
                    )}

                    {/* Known/Planned tools */}
                    {tools.filter((t) => t.integrationStatus !== 'integrated').length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                          Other Known Tools ({tools.filter((t) => t.integrationStatus !== 'integrated').length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {tools
                            .filter((t) => t.integrationStatus !== 'integrated')
                            .map((tool) => {
                              const ct = companyTools.find((ct) => ct.toolId === tool.toolId)
                              const deployed = ct?.deployed ?? false
                              return (
                                <ToolToggleCard
                                  key={tool.toolId}
                                  tool={tool}
                                  deployed={deployed}
                                  onToggle={(d) => toggleTool(tool.toolId, d)}
                                />
                              )
                            })}
                        </div>
                      </div>
                    )}

                    {/* Summary + Continue */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <p className="text-sm text-slate-400">
                        {companyTools.filter((t) => t.deployed).length} tool{companyTools.filter((t) => t.deployed).length !== 1 ? 's' : ''} deployed for this customer
                      </p>
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm transition-all"
                      >
                        Continue to Platform Mapping &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </StepCard>
            )}

            {/* ============================================================= */}
            {/* STEP 3: Platform Mapping                                       */}
            {/* ============================================================= */}
            {currentStep === 3 && selectedCompanyObj && (
              <StepCard title="Platform Mapping" subtitle="Map active tools to this customer's specific sites and instances">
                <div className="space-y-4">
                  <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200">
                    For each tool that is deployed, select the specific site or organization that belongs to this customer.
                    This enables the evidence engine to pull the correct data during assessments.
                  </div>
                  <Suspense fallback={<Spinner text="Loading platform mapping..." />}>
                    <PlatformMappingPanel
                      companyId={selectedCompany}
                      companyName={selectedCompanyObj.name}
                    />
                  </Suspense>
                  <div className="flex justify-end pt-4 border-t border-white/10">
                    <button
                      onClick={goToNextStep}
                      className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm transition-all"
                    >
                      Continue to Initial Assessment &rarr;
                    </button>
                  </div>
                </div>
              </StepCard>
            )}

            {/* ============================================================= */}
            {/* STEP 4: Initial Assessment                                     */}
            {/* ============================================================= */}
            {currentStep === 4 && (
              <StepCard title="Initial Assessment" subtitle="Run a compliance assessment to establish a baseline">
                <div className="space-y-6">
                  {/* Run Assessment */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
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
                    </select>
                    <button
                      onClick={runAssessment}
                      disabled={running}
                      className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {running ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Running Assessment...
                        </>
                      ) : 'Run Assessment'}
                    </button>
                  </div>

                  {/* Results */}
                  {assessments.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-white">Assessment History</h3>
                      {assessments.map((a) => (
                        <AssessmentRow key={a.id} assessment={a} getScoreColor={getScoreColor} />
                      ))}
                    </div>
                  )}

                  {/* Latest score summary */}
                  {latestScore !== null && (
                    <div className="bg-slate-800/50 border border-white/10 rounded-lg p-6 text-center">
                      <p className="text-sm text-slate-400 mb-1">Baseline Compliance Score</p>
                      <p className={`text-4xl font-bold ${getScoreColor(latestScore)}`}>{latestScore}%</p>
                    </div>
                  )}

                  {workflowStatus.steps[4]?.complete && (
                    <div className="flex justify-end pt-4 border-t border-white/10">
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm transition-all"
                      >
                        Continue to Policy Generation &rarr;
                      </button>
                    </div>
                  )}
                </div>
              </StepCard>
            )}

            {/* ============================================================= */}
            {/* STEP 5: Policies                                                */}
            {/* ============================================================= */}
            {currentStep === 5 && selectedCompanyObj && (
              <StepCard title="Policies" subtitle="The Policy Generation view below cross-references uploaded policies against the catalog. Items already covered by customer content are flagged so you don't regenerate them.">
                {/* Policy Generation dashboard is the primary view — it now
                    includes uploaded-policy coverage, so a separate section for
                    PolicyManager is redundant. Uploaded policies are managed
                    from the main /admin/compliance dashboard's "Policy
                    Analysis" tab. */}
                <Suspense fallback={<Spinner text="Loading policies..." />}>
                  <PolicyGenerationDashboard
                    companyId={selectedCompany}
                    companyName={selectedCompanyObj.name}
                    onViewChange={setPolicyView}
                  />
                </Suspense>

                {/* Hide sibling sections when the user is drilled into a specific
                    policy, so the detail page stays focused on just that policy. */}
                {policyView === 'overview' && (
                  <>
                    <details className="mt-6 border border-white/10 rounded-lg">
                      <summary className="px-4 py-3 cursor-pointer text-sm text-slate-400 hover:text-white hover:bg-white/5">
                        View / manage uploaded customer policies
                      </summary>
                      <div className="p-4 border-t border-white/10">
                        <Suspense fallback={<Spinner text="Loading uploaded policies..." />}>
                          <PolicyManager companyId={selectedCompany} companyName={selectedCompanyObj.name} />
                        </Suspense>
                      </div>
                    </details>

                    <div className="flex justify-end pt-4 border-t border-white/10 mt-6">
                      <button
                        onClick={goToNextStep}
                        className="inline-flex items-center justify-center px-4 sm:px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm transition-all max-w-full"
                      >
                        <span className="truncate">Continue to Final Assessment</span> <span className="ml-1">&rarr;</span>
                      </button>
                    </div>
                  </>
                )}
              </StepCard>
            )}

            {/* ============================================================= */}
            {/* STEP 6: Final Assessment                                       */}
            {/* ============================================================= */}
            {currentStep === 6 && (
              <StepCard title="Final Assessment" subtitle="Re-run assessment with policies in place to measure improvement">
                <div className="space-y-6">
                  {/* Improvement comparison */}
                  {assessments.length >= 2 && (
                    <ImprovementBanner assessments={assessments} getScoreColor={getScoreColor} />
                  )}

                  {/* Run final assessment */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
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
                    </select>
                    <button
                      onClick={runAssessment}
                      disabled={running}
                      className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {running ? (
                        <>
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                          Running Final Assessment...
                        </>
                      ) : 'Run Final Assessment'}
                    </button>
                  </div>

                  {/* Assessment history */}
                  {assessments.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-white">All Assessments</h3>
                      {assessments.map((a) => (
                        <AssessmentRow key={a.id} assessment={a} getScoreColor={getScoreColor} />
                      ))}
                    </div>
                  )}

                  {/* Export */}
                  {assessments.length > 0 && (
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <p className="text-sm text-slate-400">
                        {assessments.filter((a) => a.status === 'complete').length} completed assessment{assessments.filter((a) => a.status === 'complete').length !== 1 ? 's' : ''}
                      </p>
                      <button
                        onClick={() => {
                          const latest = assessments.find((a) => a.status === 'complete')
                          if (latest) window.open(`/api/compliance/export?assessmentId=${latest.id}`, '_blank')
                        }}
                        className="inline-flex items-center px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
                      >
                        Export Latest CSV
                      </button>
                    </div>
                  )}
                </div>
              </StepCard>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 sm:p-6 min-w-0 overflow-hidden">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function ToolToggleCard({ tool, deployed, onToggle }: { tool: Tool; deployed: boolean; onToggle: (d: boolean) => void }) {
  return (
    <div className={`bg-slate-900/30 border rounded-lg p-4 ${deployed ? 'border-green-500/30' : 'border-white/10'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-white">{tool.name}</h4>
          <p className="text-xs text-slate-500">{tool.vendor} — {tool.category}</p>
        </div>
        <button
          onClick={() => onToggle(!deployed)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${deployed ? 'bg-green-500' : 'bg-slate-600'}`}
          title={deployed ? 'Deployed for this customer' : 'Not deployed for this customer'}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${deployed ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">{tool.description}</p>
      {deployed && tool.integrationStatus !== 'integrated' && (
        <p className="text-xs text-green-400/80 mt-2">Deployed (attestation-based evidence)</p>
      )}
      {deployed && tool.integrationStatus === 'integrated' && (
        <p className="text-xs text-green-400/80 mt-2">Deployed (live data collection)</p>
      )}
    </div>
  )
}

function AssessmentRow({ assessment, getScoreColor }: { assessment: Assessment; getScoreColor: (pct: number) => string }) {
  const pct = assessment.totalControls > 0 ? Math.round((assessment.passedControls / assessment.totalControls) * 100) : 0
  const frameworkLabels: Record<string, string> = {
    'cis-v8-ig1': 'CIS v8 — IG1',
    'cis-v8-ig2': 'CIS v8 — IG2',
    'cis-v8-ig3': 'CIS v8 — IG3',
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/30 border border-white/5">
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          assessment.status === 'complete' ? 'bg-green-500/20 text-green-300' : 'bg-slate-500/20 text-slate-400'
        }`}>
          {assessment.status}
        </span>
        <div>
          <p className="text-sm font-medium text-white">{frameworkLabels[assessment.frameworkId] ?? assessment.frameworkId}</p>
          <p className="text-xs text-slate-400">{new Date(assessment.createdAt).toLocaleString()}</p>
        </div>
      </div>
      {assessment.status === 'complete' && (
        <span className={`text-sm font-semibold ${getScoreColor(pct)}`}>
          {assessment.passedControls}/{assessment.totalControls} ({pct}%)
        </span>
      )}
    </div>
  )
}

function ImprovementBanner({ assessments, getScoreColor }: { assessments: Assessment[]; getScoreColor: (pct: number) => string }) {
  const completed = assessments.filter((a) => a.status === 'complete')
  if (completed.length < 2) return null

  const latest = completed[0]
  const first = completed[completed.length - 1]
  const latestPct = latest.totalControls > 0 ? Math.round((latest.passedControls / latest.totalControls) * 100) : 0
  const firstPct = first.totalControls > 0 ? Math.round((first.passedControls / first.totalControls) * 100) : 0
  const delta = latestPct - firstPct

  if (delta === 0) return null

  return (
    <div className={`p-4 rounded-lg border ${delta > 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
      <p className={`text-sm font-medium ${delta > 0 ? 'text-green-300' : 'text-red-300'}`}>
        {delta > 0 ? '+' : ''}{delta}% since initial assessment
      </p>
      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
        <span>Initial: <span className={getScoreColor(firstPct)}>{firstPct}%</span></span>
        <span>&rarr;</span>
        <span>Latest: <span className={getScoreColor(latestPct)}>{latestPct}%</span></span>
      </div>
    </div>
  )
}
