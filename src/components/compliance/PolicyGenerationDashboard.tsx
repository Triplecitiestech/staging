'use client'

/**
 * Policy Generation Dashboard
 *
 * Full policy generation workflow UI:
 * 1. Framework selector → needs analysis overview
 * 2. Policy catalog with status badges
 * 3. Org profile questionnaire
 * 4. Per-policy intake + generation
 * 5. Review/edit/approve/download
 */

import { useState, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types (local to component — matches API responses)
// ---------------------------------------------------------------------------

interface PolicyNeedItem {
  slug: string
  name: string
  category: string
  requirement: 'required' | 'recommended' | 'supporting'
  frameworks: string[]
  status: string
  existingPolicyId: string | null
  controlCount: number
  lastUpdated: string | null
}

interface NeedsAnalysis {
  companyId: string
  companyName: string
  selectedFrameworks: string[]
  requiredPolicies: PolicyNeedItem[]
  stats: {
    totalRequired: number
    existing: number
    missing: number
    drafts: number
    approved: number
    intakeNeeded: number
  }
}

interface QuestionDef {
  id: string
  section: string
  label: string
  helpText?: string
  type: 'text' | 'textarea' | 'select' | 'multi-select' | 'boolean' | 'email' | 'date'
  options?: Array<{ value: string; label: string }>
  required: boolean
  conditional?: { questionId: string; value: string | boolean }
  prefillKey?: string
  sortOrder: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRAMEWORK_OPTIONS = [
  { id: 'cis-v8', label: 'CIS Controls v8' },
  { id: 'hipaa', label: 'HIPAA' },
  { id: 'nist-800-171', label: 'NIST 800-171' },
  { id: 'cmmc-l1', label: 'CMMC Level 1' },
  { id: 'cmmc-l2', label: 'CMMC Level 2' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  missing: { label: 'Missing', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  intake_needed: { label: 'Intake Needed', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  ready_to_generate: { label: 'Ready', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  generating: { label: 'Generating...', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  draft: { label: 'Draft', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  under_review: { label: 'Under Review', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  exported: { label: 'Exported', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  synced: { label: 'Synced', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
}

const CATEGORY_LABELS: Record<string, string> = {
  'governance': 'Governance & Program',
  'access-control': 'Access Control',
  'data-protection': 'Data Protection',
  'operations': 'Operations & Infrastructure',
  'incident-response': 'Incident Response',
  'human-resources': 'Human Resources',
  'vendor-management': 'Vendor Management',
  'technical': 'Technical Controls',
  'compliance-specific': 'Compliance-Specific',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PolicyGenerationDashboard({
  companyId,
  companyName,
}: {
  companyId: string
  companyName: string
}) {
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>(['cis-v8'])
  const [analysis, setAnalysis] = useState<NeedsAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Active view state
  const [view, setView] = useState<'overview' | 'org-profile' | 'policy-detail'>('overview')
  const [activePolicySlug, setActivePolicySlug] = useState<string | null>(null)

  // Org profile state
  const [orgQuestions, setOrgQuestions] = useState<QuestionDef[]>([])
  const [orgAnswers, setOrgAnswers] = useState<Record<string, string | string[] | boolean>>({})
  const [orgCompletion, setOrgCompletion] = useState(0)
  const [savingOrg, setSavingOrg] = useState(false)

  // Policy detail state
  const [policyQuestions, setPolicyQuestions] = useState<QuestionDef[]>([])
  const [policyAnswers, setPolicyAnswers] = useState<Record<string, string | string[] | boolean>>({})
  const [policyCompletion, setPolicyCompletion] = useState(0)
  const [generatedContent, setGeneratedContent] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)

  // Load catalog / needs analysis
  const loadAnalysis = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ companyId })
      if (selectedFrameworks.length > 0) {
        params.set('frameworks', selectedFrameworks.join(','))
      }
      const res = await fetch(`/api/compliance/policies/catalog?${params}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setAnalysis(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load policy catalog')
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedFrameworks])

  useEffect(() => { loadAnalysis() }, [loadAnalysis])

  // Load org profile questionnaire
  const loadOrgProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/compliance/policies/questionnaire?companyId=${companyId}`)
      const json = await res.json()
      if (!json.success) return
      setOrgQuestions(json.data.orgProfile.questions)
      setOrgAnswers(json.data.orgProfile.answers)
      setOrgCompletion(json.data.orgProfile.completionPct)
    } catch { /* ignore */ }
  }, [companyId])

  // Load policy-specific questionnaire
  const loadPolicyDetail = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/compliance/policies/questionnaire?companyId=${companyId}&policySlug=${slug}`)
      const json = await res.json()
      if (!json.success) return
      // Also refresh org data
      setOrgQuestions(json.data.orgProfile.questions)
      setOrgAnswers(json.data.orgProfile.answers)
      setOrgCompletion(json.data.orgProfile.completionPct)
      if (json.data.policyIntake) {
        setPolicyQuestions(json.data.policyIntake.questions)
        setPolicyAnswers(json.data.policyIntake.answers)
        setPolicyCompletion(json.data.policyIntake.completionPct)
      } else {
        setPolicyQuestions([])
        setPolicyAnswers({})
        setPolicyCompletion(100)
      }
    } catch { /* ignore */ }
  }, [companyId])

  // Save org profile
  const saveOrgProfile = async () => {
    setSavingOrg(true)
    try {
      await fetch('/api/compliance/policies/questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, type: 'org-profile', answers: orgAnswers }),
      })
      await loadOrgProfile()
    } catch { /* ignore */ }
    setSavingOrg(false)
  }

  // Save policy answers
  const savePolicyAnswers = async () => {
    if (!activePolicySlug) return
    setSavingPolicy(true)
    try {
      await fetch('/api/compliance/policies/questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, type: 'policy', policySlug: activePolicySlug, answers: policyAnswers }),
      })
    } catch { /* ignore */ }
    setSavingPolicy(false)
  }

  // Generate policy
  const generatePolicyHandler = async () => {
    if (!activePolicySlug) return
    setGenerating(true)
    setGeneratedContent(null)
    setError(null)
    try {
      // Save answers first
      await savePolicyAnswers()
      await saveOrgProfile()

      const res = await fetch('/api/compliance/policies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          policySlug: activePolicySlug,
          mode: 'new',
          frameworks: selectedFrameworks,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setGeneratedContent(json.data.content)
      await loadAnalysis()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // Approve policy
  const approvePolicy = async () => {
    if (!activePolicySlug) return
    try {
      await fetch('/api/compliance/policies/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, policySlug: activePolicySlug, action: 'approve' }),
      })
      await loadAnalysis()
    } catch { /* ignore */ }
  }

  // Open policy detail
  const openPolicyDetail = (slug: string) => {
    setActivePolicySlug(slug)
    setGeneratedContent(null)
    setView('policy-detail')
    loadPolicyDetail(slug)
  }

  // Download policy
  const downloadPolicy = (slug: string, format: string = 'html') => {
    window.open(
      `/api/compliance/policies/export?companyId=${companyId}&policySlug=${slug}&format=${format}`,
      '_blank'
    )
  }

  // Download bundle
  const downloadBundle = (format: string = 'html') => {
    window.open(
      `/api/compliance/policies/export?companyId=${companyId}&bundle=true&format=${format}`,
      '_blank'
    )
  }

  const activePolicy = analysis?.requiredPolicies.find((p) => p.slug === activePolicySlug)

  // ---------------------------------------------------------------------------
  // Render: Overview
  // ---------------------------------------------------------------------------

  if (view === 'org-profile') {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <button onClick={() => { setView('overview'); loadAnalysis() }} className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Back to Overview
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Organization Profile</h2>
              <p className="text-sm text-slate-400 mt-1">These answers are shared across all policy generation. Fill once, reuse everywhere.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">{orgCompletion}% complete</span>
              <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${orgCompletion}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orgQuestions.map((q) => {
              if (q.conditional) {
                const depVal = orgAnswers[q.conditional.questionId]
                if (depVal !== q.conditional.value) return null
              }
              return (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={orgAnswers[q.id]}
                  onChange={(val) => setOrgAnswers((prev) => ({ ...prev, [q.id]: val }))}
                />
              )
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={saveOrgProfile}
              disabled={savingOrg}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {savingOrg ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Policy Detail (intake + generation + review)
  // ---------------------------------------------------------------------------

  if (view === 'policy-detail' && activePolicySlug && activePolicy) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setView('overview'); loadAnalysis() }} className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Back to Overview
        </button>

        {/* Policy Header */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{activePolicy.name}</h2>
              <p className="text-sm text-slate-400 mt-1">
                {activePolicy.frameworks.join(', ')} — {activePolicy.controlCount} controls
              </p>
            </div>
            <StatusBadge status={activePolicy.status} />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 text-sm">{error}</div>
        )}

        {/* Intake Questions (if any) */}
        {policyQuestions.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Policy-Specific Questions</h3>
              <span className="text-xs text-slate-400">{policyCompletion}% complete</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policyQuestions.map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={policyAnswers[q.id]}
                  onChange={(val) => setPolicyAnswers((prev) => ({ ...prev, [q.id]: val }))}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={savePolicyAnswers}
                disabled={savingPolicy}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs disabled:opacity-50"
              >
                {savingPolicy ? 'Saving...' : 'Save Answers'}
              </button>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">AI Policy Generation</h3>
              <p className="text-xs text-slate-400 mt-1">
                {orgCompletion < 50
                  ? 'Complete the Organization Profile first for best results.'
                  : 'Ready to generate. The AI will use your org profile and policy answers.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={generatePolicyHandler}
                disabled={generating}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {generating && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                {generating ? 'Generating...' : activePolicy.status === 'draft' ? 'Regenerate' : 'Generate Policy'}
              </button>
            </div>
          </div>
        </div>

        {/* Generated Content Preview */}
        {(generatedContent || activePolicy.status === 'draft' || activePolicy.status === 'approved') && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Policy Draft</h3>
              <div className="flex gap-2">
                {activePolicy.status === 'draft' && (
                  <button
                    onClick={approvePolicy}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                  >
                    Approve
                  </button>
                )}
                <button
                  onClick={() => downloadPolicy(activePolicySlug, 'html')}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
                >
                  Download HTML
                </button>
                <button
                  onClick={() => downloadPolicy(activePolicySlug, 'markdown')}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
                >
                  Download MD
                </button>
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-4 max-h-[600px] overflow-y-auto">
              <div
                className="prose prose-invert prose-sm max-w-none text-slate-300
                  [&_h1]:text-lg [&_h1]:text-white [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3
                  [&_h2]:text-base [&_h2]:text-cyan-400 [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2
                  [&_h3]:text-sm [&_h3]:text-slate-200 [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1
                  [&_strong]:text-white [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
              >
                <MarkdownPreview content={generatedContent ?? 'Loading...'} />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: Main Overview
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Framework Selector */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-white mb-3">Target Frameworks</h2>
        <div className="flex flex-wrap gap-2">
          {FRAMEWORK_OPTIONS.map((fw) => (
            <button
              key={fw.id}
              onClick={() => {
                setSelectedFrameworks((prev) =>
                  prev.includes(fw.id)
                    ? prev.filter((f) => f !== fw.id)
                    : [...prev, fw.id]
                )
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                selectedFrameworks.includes(fw.id)
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-400 border-white/10 hover:border-white/20'
              }`}
            >
              {fw.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
          <p className="text-slate-400 mt-2 text-sm">Loading policy analysis...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300 text-sm">{error}</div>
      )}

      {analysis && !loading && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Required" value={analysis.stats.totalRequired} color="text-white" />
            <StatCard label="Existing" value={analysis.stats.existing} color="text-blue-400" />
            <StatCard label="Missing" value={analysis.stats.missing} color="text-red-400" />
            <StatCard label="Drafts" value={analysis.stats.drafts} color="text-cyan-400" />
            <StatCard label="Approved" value={analysis.stats.approved} color="text-emerald-400" />
            <StatCard label="Intake Needed" value={analysis.stats.intakeNeeded} color="text-violet-400" />
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setView('org-profile'); loadOrgProfile() }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <span>Organization Profile</span>
              <span className="text-xs text-slate-400">({orgCompletion}%)</span>
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => downloadBundle('html')}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
              >
                Download All (HTML)
              </button>
              <button
                onClick={() => downloadBundle('markdown')}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs"
              >
                Download All (MD)
              </button>
            </div>
          </div>

          {/* Policy List by Category */}
          {Object.entries(groupByCategory(analysis.requiredPolicies)).map(([cat, policies]) => (
            <div key={cat} className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 bg-slate-800/30">
                <h3 className="text-sm font-semibold text-slate-300">{CATEGORY_LABELS[cat] ?? cat}</h3>
              </div>
              <div className="divide-y divide-white/5">
                {policies.map((policy) => (
                  <div
                    key={policy.slug}
                    className="px-4 py-3 flex items-center justify-between hover:bg-white/5 cursor-pointer transition-colors"
                    onClick={() => openPolicyDetail(policy.slug)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{policy.name}</span>
                        <RequirementBadge requirement={policy.requirement} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-slate-500">{policy.controlCount} controls</span>
                        <span className="text-xs text-slate-500">{policy.frameworks.join(', ')}</span>
                        {policy.lastUpdated && (
                          <span className="text-xs text-slate-500">Updated {new Date(policy.lastUpdated).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <StatusBadge status={policy.status} />
                      {(policy.status === 'draft' || policy.status === 'approved') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadPolicy(policy.slug) }}
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30' }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.color}`}>
      {config.label}
    </span>
  )
}

function RequirementBadge({ requirement }: { requirement: string }) {
  if (requirement === 'required') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">Required</span>
  }
  if (requirement === 'recommended') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Recommended</span>
  }
  return null
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: QuestionDef
  value: string | string[] | boolean | undefined
  onChange: (val: string | string[] | boolean) => void
}) {
  const baseInputClass = 'w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50'

  return (
    <div className={question.type === 'textarea' ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-300 mb-1">
        {question.label}
        {question.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {question.helpText && (
        <p className="text-[11px] text-slate-500 mb-1">{question.helpText}</p>
      )}

      {question.type === 'text' || question.type === 'email' ? (
        <input
          type={question.type}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        />
      ) : question.type === 'textarea' ? (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={baseInputClass}
        />
      ) : question.type === 'select' ? (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputClass}
        >
          <option value="">Select...</option>
          {question.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : question.type === 'boolean' ? (
        <div className="flex gap-3">
          <button
            onClick={() => onChange(true)}
            className={`px-3 py-1.5 rounded text-xs font-medium border ${
              value === true ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-400 border-white/10'
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => onChange(false)}
            className={`px-3 py-1.5 rounded text-xs font-medium border ${
              value === false ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-400 border-white/10'
            }`}
          >
            No
          </button>
        </div>
      ) : question.type === 'multi-select' ? (
        <div className="flex flex-wrap gap-2">
          {question.options?.map((opt) => {
            const selected = Array.isArray(value) ? value.includes(opt.value) : false
            return (
              <button
                key={opt.value}
                onClick={() => {
                  const arr = Array.isArray(value) ? [...value] : []
                  if (selected) {
                    onChange(arr.filter((v) => v !== opt.value))
                  } else {
                    onChange([...arr, opt.value])
                  }
                }}
                className={`px-2 py-1 rounded text-xs font-medium border ${
                  selected ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-400 border-white/10'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  // Simple markdown rendering for preview
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i}>{line.slice(2)}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i}>{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i}>{line.slice(4)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i}>{formatInline(line.slice(2))}</li>)
    } else if (line.match(/^\d+\. /)) {
      elements.push(<li key={i}>{formatInline(line.replace(/^\d+\. /, ''))}</li>)
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="border-white/10 my-4" />)
    } else if (line.trim() === '') {
      elements.push(<br key={i} />)
    } else {
      elements.push(<p key={i}>{formatInline(line)}</p>)
    }
  }

  return <>{elements}</>
}

function formatInline(text: string): React.ReactNode {
  // Handle bold text
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function groupByCategory(policies: PolicyNeedItem[]): Record<string, PolicyNeedItem[]> {
  const groups: Record<string, PolicyNeedItem[]> = {}
  for (const p of policies) {
    const cat = p.category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(p)
  }
  return groups
}
