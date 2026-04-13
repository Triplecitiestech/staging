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
  coverageStatus: 'covered' | 'partial' | 'none'
  coverageRatio: number
  coveredBy: string[]
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
    notGenerated: number
    needsEnhancement: number
    coveredByExisting: number
    generating: number
  }
  latestPolicyActivityAt: string | null
  latestAssessmentAt: string | null
  needsNewAssessment: boolean
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
  group?: string
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

// Status labels — collapsed into clear user-facing states.
// Before: "Missing"/"Ready"/"Intake Needed" all meant "not generated yet"
// but the mixed colors (red/blue/violet) confused users who thought Blue "Ready" = done.
// Now all three pre-generation states use the same rose label "Not Generated" so the
// list and the count always tell the same story.
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  missing: { label: 'Not Generated', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  intake_needed: { label: 'Needs Info', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
  ready_to_generate: { label: 'Not Generated', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' },
  generating: { label: 'Generating\u2026', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  draft: { label: 'Draft \u2014 Review', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
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
  onViewChange,
}: {
  companyId: string
  companyName: string
  /** Optional — parent (e.g. the workflow stepper) can use this to hide
      sibling content when the user drills into a specific policy, so the
      detail page stays focused. */
  onViewChange?: (view: 'overview' | 'org-profile' | 'policy-detail') => void
}) {
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>(['cis-v8'])
  const [analysis, setAnalysis] = useState<NeedsAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Active view state
  const [view, setView] = useState<'overview' | 'org-profile' | 'policy-detail'>('overview')
  const [activePolicySlug, setActivePolicySlug] = useState<string | null>(null)

  // Notify parent on view changes so outer containers can hide sibling content
  useEffect(() => {
    onViewChange?.(view)
  }, [view, onViewChange])

  // Org profile state
  const [orgQuestions, setOrgQuestions] = useState<QuestionDef[]>([])
  const [orgAnswers, setOrgAnswers] = useState<Record<string, string | string[] | boolean>>({})
  const [orgCompletion, setOrgCompletion] = useState(0)
  const [savingOrg, setSavingOrg] = useState(false)
  const [autoFilledFields, setAutoFilledFields] = useState<string[]>([])

  // Policy detail state
  const [policyQuestions, setPolicyQuestions] = useState<QuestionDef[]>([])
  const [policyAnswers, setPolicyAnswers] = useState<Record<string, string | string[] | boolean>>({})
  const [policyCompletion, setPolicyCompletion] = useState(0)
  const [policyRequiredCount, setPolicyRequiredCount] = useState(0)
  const [policyAnsweredCount, setPolicyAnsweredCount] = useState(0)
  const [policyTotalQuestions, setPolicyTotalQuestions] = useState(0)
  const [policyDerivedFields, setPolicyDerivedFields] = useState<string[]>([])
  const [generatedContent, setGeneratedContent] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)

  // Manual edit state for the Policy Draft card.
  // isEditingDraft toggles between rendered preview and a textarea editor;
  // editedDraft holds the tech's in-progress edits until they save/cancel.
  const [isEditingDraft, setIsEditingDraft] = useState(false)
  const [editedDraft, setEditedDraft] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null)

  // Mass generation state
  const [massGenerating, setMassGenerating] = useState(false)
  const [massProgress, setMassProgress] = useState({ current: 0, total: 0, currentName: '', completed: 0, failed: 0 })

  // Filter state — drives which policies appear in the list when stat cards are clicked
  type ListFilter = 'all' | 'covered' | 'partial' | 'notGenerated' | 'drafts' | 'approved'
  const [listFilter, setListFilter] = useState<ListFilter>('all')

  const filterLabel = (f: ListFilter): string => {
    switch (f) {
      case 'covered': return 'policies covered by existing uploads'
      case 'partial': return 'partially-covered policies'
      case 'notGenerated': return 'policies that need new AI generation'
      case 'drafts': return 'drafts awaiting review'
      case 'approved': return 'approved policies'
      default: return 'all policies'
    }
  }

  const matchesFilter = (p: PolicyNeedItem, f: ListFilter): boolean => {
    const isUngenerated = p.status === 'missing' || p.status === 'intake_needed' || p.status === 'ready_to_generate'
    switch (f) {
      case 'covered': return isUngenerated && p.coverageStatus === 'covered'
      case 'partial': return isUngenerated && p.coverageStatus === 'partial'
      case 'notGenerated': return isUngenerated && p.coverageStatus === 'none'
      case 'drafts': return p.status === 'draft'
      case 'approved': return p.status === 'approved'
      default: return true
    }
  }

  // Load catalog / needs analysis
  const loadAnalysis = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ companyId })
      if (selectedFrameworks.length > 0) {
        params.set('frameworks', selectedFrameworks.join(','))
      }
      const res = await fetch(`/api/compliance/policies/catalog?${params}`, { signal })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setAnalysis(json.data)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load policy catalog')
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedFrameworks])

  useEffect(() => {
    const c = new AbortController()
    loadAnalysis(c.signal)
    // Also load org profile to sync framework selection
    loadOrgProfile()
    return () => c.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAnalysis])

  // Load org profile questionnaire and sync frameworks
  const loadOrgProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/compliance/policies/questionnaire?companyId=${companyId}`)
      const json = await res.json()
      if (!json.success) return
      setOrgQuestions(json.data.orgProfile.questions)
      setOrgAnswers(json.data.orgProfile.answers)
      setOrgCompletion(json.data.orgProfile.completionPct)
      setAutoFilledFields(json.data.orgProfile.autoFilledFields ?? [])
      // Sync framework selection from org profile.
      // CRITICAL: only update state when the values actually differ. Passing a
      // new array reference with identical contents causes React to re-render,
      // which changes loadAnalysis's identity (via useCallback deps), which
      // re-triggers the useEffect that calls loadOrgProfile again \u2014 an
      // infinite re-fetch loop that shows "Loading policy analysis..." flashing.
      const fw = json.data.orgProfile.answers?.org_target_frameworks
      if (Array.isArray(fw) && fw.length > 0) {
        const newFw = fw as string[]
        setSelectedFrameworks((current) => {
          if (current.length === newFw.length && current.every((v, i) => v === newFw[i])) {
            return current // same content \u2014 keep existing reference, no re-render
          }
          return newFw
        })
      }
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
        setPolicyRequiredCount(json.data.policyIntake.requiredCount ?? 0)
        setPolicyAnsweredCount(json.data.policyIntake.answeredCount ?? 0)
        setPolicyTotalQuestions(json.data.policyIntake.totalQuestions ?? json.data.policyIntake.questions.length)
        setPolicyDerivedFields(json.data.policyIntake.derivedFields ?? [])
        // Pre-populate the content preview with the latest generated draft so
        // the Policy Draft card shows the content immediately instead of
        // getting stuck on "Loading...".
        if (json.data.policyIntake.latestContent) {
          setGeneratedContent(json.data.policyIntake.latestContent)
        }
      } else {
        setPolicyQuestions([])
        setPolicyAnswers({})
        setPolicyCompletion(100)
        setPolicyRequiredCount(0)
        setPolicyAnsweredCount(0)
        setPolicyTotalQuestions(0)
        setPolicyDerivedFields([])
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
    setError(null)
    // Don't clear generatedContent here — if generation fails, we want to keep
    // showing the previous draft instead of going blank.
    try {
      // Save answers first (ignore failures — tables may not exist yet)
      try { await savePolicyAnswers() } catch { /* ignore */ }
      try { await saveOrgProfile() } catch { /* ignore */ }

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

      // Handle non-JSON responses (Vercel error pages, timeouts).
      // Surface a friendly message when we hit FUNCTION_INVOCATION_TIMEOUT
      // (Vercel's 60s function timeout) rather than the raw HTML blurb.
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        if (res.status === 504 || /INVOCATION_TIMEOUT/i.test(text)) {
          throw new Error(
            'AI generation took longer than 60 seconds and was cut short. This sometimes happens when the Anthropic API is slow. Try clicking Generate again — the second attempt usually succeeds. If this keeps happening, let the team know.'
          )
        }
        throw new Error(`Server error (${res.status}): ${text.substring(0, 200)}`)
      }

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

  // Save manually-edited draft content
  const saveDraftEdit = async () => {
    if (!activePolicySlug) return
    if (!editedDraft || editedDraft.trim().length < 10) {
      setDraftSaveError('Content is too short. Enter the full policy text before saving.')
      return
    }
    setSavingDraft(true)
    setDraftSaveError(null)
    try {
      const res = await fetch('/api/compliance/policies/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          policySlug: activePolicySlug,
          action: 'edit',
          content: editedDraft,
        }),
      })
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${res.status})`)
      }
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to save')
      setGeneratedContent(editedDraft)
      setIsEditingDraft(false)
      await loadAnalysis()
    } catch (err) {
      setDraftSaveError(err instanceof Error ? err.message : 'Failed to save edit')
    } finally {
      setSavingDraft(false)
    }
  }

  // Start editing: copy current content into the edit buffer
  const startEditingDraft = () => {
    setEditedDraft(generatedContent ?? '')
    setDraftSaveError(null)
    setIsEditingDraft(true)
  }

  const cancelEditingDraft = () => {
    setIsEditingDraft(false)
    setEditedDraft('')
    setDraftSaveError(null)
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
    // Discard any in-progress manual edits — they belong to the previous policy.
    setIsEditingDraft(false)
    setEditedDraft('')
    setDraftSaveError(null)
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

  // Mass generate all missing policies
  const generateAllMissing = async () => {
    if (!analysis) return
    // Only generate policies that are genuinely missing AND not already covered by
    // uploaded content. Policies marked as "covered by existing" or "partial" are
    // skipped — those require the tech to explicitly click Enhance on them, we don't
    // want to clobber the customer's existing content.
    const missing = analysis.requiredPolicies.filter(
      (p) => (p.status === 'missing' || p.status === 'intake_needed' || p.status === 'ready_to_generate')
        && p.coverageStatus === 'none'
    )
    if (missing.length === 0) return

    setMassGenerating(true)
    setMassProgress({ current: 0, total: missing.length, currentName: '', completed: 0, failed: 0 })

    // Save org profile first (ignore failures)
    try { await saveOrgProfile() } catch { /* ignore */ }

    let completed = 0
    let failed = 0

    for (let i = 0; i < missing.length; i++) {
      const policy = missing[i]
      setMassProgress({ current: i + 1, total: missing.length, currentName: policy.name, completed, failed })

      // Refresh analysis after every 3 policies to pick up any async completions
      // from Vercel timeouts where the backend finished but the fetch timed out.
      if (i > 0 && i % 3 === 0) {
        try {
          const refreshRes = await fetch(`/api/compliance/policies/catalog?companyId=${companyId}&frameworks=${selectedFrameworks.join(',')}`)
          const refreshJson = await refreshRes.json()
          if (refreshJson.success) {
            const refreshed = refreshJson.data as NeedsAnalysis
            const thisPolicy = refreshed.requiredPolicies.find((p) => p.slug === policy.slug)
            if (thisPolicy && (thisPolicy.status === 'draft' || thisPolicy.status === 'approved')) {
              // Already generated during background — skip
              completed++
              continue
            }
          }
        } catch { /* ignore refresh errors */ }
      }

      try {
        const res = await fetch('/api/compliance/policies/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            policySlug: policy.slug,
            mode: 'new',
            frameworks: selectedFrameworks,
          }),
        })

        const contentType = res.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) {
          // Non-JSON response usually means Vercel timeout. The generation may still
          // complete in the background. We'll verify on the next refresh.
          failed++
          continue
        }

        const json = await res.json()
        if (json.success) {
          completed++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setMassProgress({ current: missing.length, total: missing.length, currentName: '', completed, failed })
    setMassGenerating(false)
    // Final refresh after batch — catches any background completions from timeouts
    await loadAnalysis()
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

          {autoFilledFields.length > 0 && (
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg mb-2">
              <p className="text-sm text-cyan-300">
                {autoFilledFields.length} field{autoFilledFields.length === 1 ? ' was' : 's were'} auto-filled from uploaded policy analysis.
                Fields marked with <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 ml-1">Auto-filled</span> were extracted from your policies.
                You can edit them at any time.
              </p>
            </div>
          )}

          <div className="space-y-6">
            {(() => {
              let lastGroup = ''
              return orgQuestions.map((q) => {
                if (q.conditional) {
                  const depVal = orgAnswers[q.conditional.questionId]
                  if (depVal !== q.conditional.value) return null
                }
                const showGroupHeader = q.group && q.group !== lastGroup
                if (q.group) lastGroup = q.group
                return (
                  <div key={q.id}>
                    {showGroupHeader && (
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4 mb-2 border-b border-white/5 pb-1">
                        {q.group}
                      </h3>
                    )}
                    <QuestionField
                      question={q}
                      value={orgAnswers[q.id]}
                      onChange={(val) => setOrgAnswers((prev) => ({ ...prev, [q.id]: val }))}
                      autoFilled={autoFilledFields.includes(q.id)}
                    />
                  </div>
                )
              })
            })()}
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
                {activePolicy.frameworks.join(', ')} &mdash; {activePolicy.controlCount} controls
              </p>
            </div>
            <SmartStatusBadge policy={activePolicy} />
          </div>
        </div>

        {/* Coverage-from-existing banner. Only shown when the tech hasn't
            generated anything yet but uploads cover these controls. */}
        {(activePolicy.status === 'missing' || activePolicy.status === 'ready_to_generate' || activePolicy.status === 'intake_needed')
          && activePolicy.coverageStatus !== 'none' && (
          <div className={`border rounded-lg p-4 ${
            activePolicy.coverageStatus === 'covered'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-violet-500/10 border-violet-500/30'
          }`}>
            <h3 className={`text-sm font-semibold ${activePolicy.coverageStatus === 'covered' ? 'text-emerald-300' : 'text-violet-300'}`}>
              {activePolicy.coverageStatus === 'covered'
                ? `This policy is already covered (${activePolicy.coverageRatio}%) by existing uploaded content`
                : `Partial coverage (${activePolicy.coverageRatio}%) from existing uploads`}
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Uploaded polic{activePolicy.coveredBy.length === 1 ? 'y' : 'ies'} covering controls here:{' '}
              <span className="font-medium text-white">{activePolicy.coveredBy.join(', ')}</span>.
            </p>
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-xs font-semibold text-white mb-1">
                {activePolicy.coverageStatus === 'covered'
                  ? 'What happens if you generate anyway?'
                  : 'What happens when you generate?'}
              </p>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                <li>A <span className="font-semibold">new, standalone AI-written policy document</span> is created.</li>
                <li>
                  The customer&apos;s uploaded polic{activePolicy.coveredBy.length === 1 ? 'y is' : 'ies are'}{' '}
                  <span className="font-semibold text-emerald-300">never modified or replaced</span>.
                </li>
                <li>
                  You can keep both (use the AI version as a supplement) or delete the old upload from the
                  Policy Analysis tab and use the AI version as a replacement. That&apos;s up to the tech/customer.
                </li>
              </ul>
              {activePolicy.coverageStatus === 'covered' && (
                <p className="text-xs text-slate-400 mt-2 italic">
                  Since controls here are already fully covered, most techs skip generation for this policy.
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-red-300 text-sm flex-1">{error}</div>
              {/* Offer a prominent Retry for timeout/abort errors so the tech
                  doesn't have to scroll back up and find the Generate button. */}
              {(/timeout|aborted|INVOCATION_TIMEOUT|latency/i.test(error)) && (
                <button
                  onClick={generatePolicyHandler}
                  disabled={generating}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium disabled:opacity-50 flex items-center gap-2 whitespace-nowrap flex-shrink-0"
                >
                  {generating && <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />}
                  {generating ? 'Retrying\u2026' : 'Retry Generation'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Intake Questions (if any) */}
        {policyQuestions.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Policy-Specific Questions</h3>
              <span className="text-xs text-slate-400">
                {policyRequiredCount === 0
                  ? `${policyAnsweredCount} of ${policyTotalQuestions} optional fields answered`
                  : `${policyCompletion}% of required fields complete`}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {policyRequiredCount === 0
                ? 'All questions below are optional. Leave blank for AI to use sensible defaults, or answer to customize the generated policy.'
                : `Answer the required questions marked with a red asterisk. Optional fields let you further customize the generated policy.`}
            </p>
            {policyDerivedFields.length > 0 && (
              <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded mb-3">
                <p className="text-xs text-cyan-300">
                  {policyDerivedFields.length} answer{policyDerivedFields.length === 1 ? '' : 's'} auto-derived from platform mappings and org profile. Fields marked
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 mx-1">Auto-filled</span>
                  were inferred from existing data &mdash; you can edit them below.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policyQuestions.map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={policyAnswers[q.id]}
                  onChange={(val) => setPolicyAnswers((prev) => ({ ...prev, [q.id]: val }))}
                  autoFilled={policyDerivedFields.includes(q.id)}
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

        {/* Generate action — adapts to current state.
            - If already covered by uploads (>=80%): do NOT push user to generate.
              Show "already handled" message and hide Generate behind an Advanced
              collapsible so it's still available but not the default action.
            - If partial coverage: offer Enhance (fills gaps) as primary.
            - If missing + no coverage: primary Generate button.
            - If draft/approved: show Regenerate option. */}
        {(() => {
          const isHandledByUploads = (activePolicy.status === 'missing'
            || activePolicy.status === 'ready_to_generate'
            || activePolicy.status === 'intake_needed')
            && activePolicy.coverageStatus === 'covered'

          const isPartial = (activePolicy.status === 'missing'
            || activePolicy.status === 'ready_to_generate'
            || activePolicy.status === 'intake_needed')
            && activePolicy.coverageStatus === 'partial'

          const isDraftOrApproved = activePolicy.status === 'draft' || activePolicy.status === 'approved'

          if (isHandledByUploads) {
            // Covered by uploaded content — no primary action needed. Offer optional
            // AI generation inside an Advanced section so it's discoverable but not default.
            return (
              <details className="bg-slate-800/40 border border-white/10 rounded-lg">
                <summary className="px-4 py-3 cursor-pointer text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-lg">
                  Advanced: Optionally generate an AI version of this policy
                </summary>
                <div className="px-4 pb-4 pt-2 border-t border-white/10 mt-2">
                  <p className="text-xs text-slate-400 mb-3">
                    The customer already has policy content covering these controls. Generating a new AI version
                    will create an additional standalone document and will not modify the uploaded policy. Only do
                    this if you want a second draft for comparison or want to replace the customer&apos;s existing policy
                    with an AI-written one.
                  </p>
                  <button
                    onClick={generatePolicyHandler}
                    disabled={generating}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {generating && <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />}
                    {generating ? 'Generating\u2026' : 'Generate AI Version Anyway'}
                  </button>
                </div>
              </details>
            )
          }

          const bannerColor = isDraftOrApproved
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : isPartial
            ? 'bg-violet-500/5 border-violet-500/30'
            : 'bg-rose-500/5 border-rose-500/20'

          const heading = isDraftOrApproved
            ? `${activePolicy.name} has been generated`
            : isPartial
            ? `${activePolicy.name} is partially covered \u2014 fill the gaps`
            : `${activePolicy.name} has not been generated yet`

          const subtext = activePolicy.status === 'generating'
            ? 'A previous attempt is running or stalled. Click below to retry.'
            : activePolicy.status === 'draft'
            ? 'The draft is shown below. Review the content and approve when ready, or regenerate with different inputs.'
            : activePolicy.status === 'approved'
            ? 'This policy is approved. You can regenerate a new version if needed.'
            : isPartial
            ? `Uploaded policies cover ${activePolicy.coverageRatio}% of the required controls. Generating will produce a new standalone document that fills the remaining gaps.`
            : orgCompletion < 50
            ? 'Complete the Organization Profile first for best results.'
            : 'Click Generate to create this policy. The AI will use your org profile and policy answers below.'

          const btnLabel = generating
            ? 'Generating\u2026'
            : activePolicy.status === 'generating'
            ? 'Retry Generation'
            : isDraftOrApproved
            ? 'Regenerate'
            : isPartial
            ? 'Generate Gap-Filling Version'
            : 'Generate Policy'

          return (
            <div className={`backdrop-blur-sm border rounded-lg p-6 ${bannerColor}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">{heading}</h3>
                  <p className="text-xs text-slate-300 mt-1">{subtext}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={generatePolicyHandler}
                    disabled={generating}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                  >
                    {generating && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                    {btnLabel}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Generated Content Preview (with inline edit) */}
        {(generatedContent || activePolicy.status === 'draft' || activePolicy.status === 'approved') && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Policy Draft</h3>
                {isEditingDraft ? (
                  <p className="text-xs text-cyan-400 mt-0.5">
                    Editing — changes are saved as a new version when you click Save.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click Edit to make manual changes to the generated content.
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {isEditingDraft ? (
                  <>
                    <button
                      onClick={cancelEditingDraft}
                      disabled={savingDraft}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDraftEdit}
                      disabled={savingDraft}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {savingDraft && <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />}
                      {savingDraft ? 'Saving\u2026' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={startEditingDraft}
                      disabled={!generatedContent}
                      className="px-3 py-1.5 bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 rounded text-xs font-medium disabled:opacity-50"
                    >
                      Edit
                    </button>
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
                  </>
                )}
              </div>
            </div>

            {draftSaveError && (
              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
                {draftSaveError}
              </div>
            )}

            {isEditingDraft ? (
              <div>
                <textarea
                  value={editedDraft}
                  onChange={(e) => setEditedDraft(e.target.value)}
                  spellCheck
                  className="w-full h-[600px] bg-slate-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-y"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Markdown supported. {editedDraft.length.toLocaleString()} characters.
                </p>
              </div>
            ) : (
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
            )}
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
          {/* Next Step Banner — tells the user exactly what to do now */}
          <NextStepBanner
            orgCompletion={orgCompletion}
            stats={analysis.stats}
            massGenerating={massGenerating}
            onOpenOrgProfile={() => { setView('org-profile'); loadOrgProfile() }}
            onGenerateAll={generateAllMissing}
          />

          {/* Assessment re-run nudge — shown when policies have changed since
              the last assessment. Points the tech to run a new assessment so
              the customer can see their improved compliance score. */}
          {analysis.needsNewAssessment && (
            <AssessmentRerunBanner
              latestPolicyActivityAt={analysis.latestPolicyActivityAt}
              latestAssessmentAt={analysis.latestAssessmentAt}
            />
          )}

          {/* Progress Bar + Clean Stats Row */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Overall Progress</h3>
              <span className="text-sm text-slate-400">
                {analysis.stats.coveredByExisting + analysis.stats.drafts + analysis.stats.approved} of {analysis.stats.totalRequired} handled
              </span>
            </div>
            <div className="w-full bg-slate-700/50 rounded-full h-2.5 mb-4 overflow-hidden">
              <div className="flex h-2.5">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${analysis.stats.totalRequired > 0 ? (analysis.stats.approved / analysis.stats.totalRequired) * 100 : 0}%` }}
                  title={`${analysis.stats.approved} approved`}
                />
                <div
                  className="bg-teal-500 transition-all"
                  style={{ width: `${analysis.stats.totalRequired > 0 ? (analysis.stats.coveredByExisting / analysis.stats.totalRequired) * 100 : 0}%` }}
                  title={`${analysis.stats.coveredByExisting} covered by uploaded policies`}
                />
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: `${analysis.stats.totalRequired > 0 ? (analysis.stats.drafts / analysis.stats.totalRequired) * 100 : 0}%` }}
                  title={`${analysis.stats.drafts} drafts`}
                />
                <div
                  className="bg-violet-500 transition-all"
                  style={{ width: `${analysis.stats.totalRequired > 0 ? (analysis.stats.needsEnhancement / analysis.stats.totalRequired) * 100 : 0}%` }}
                  title={`${analysis.stats.needsEnhancement} partial coverage`}
                />
                <div
                  className="bg-cyan-500 animate-pulse transition-all"
                  style={{ width: `${analysis.stats.totalRequired > 0 ? (analysis.stats.generating / analysis.stats.totalRequired) * 100 : 0}%` }}
                  title={`${analysis.stats.generating} generating`}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              &ldquo;Handled&rdquo; = covered by an uploaded policy, currently a draft, or approved. Click any card below to filter the list.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard
                label="Covered by Existing"
                value={analysis.stats.coveredByExisting}
                color="text-emerald-400"
                hint="Uploaded policies already satisfy these controls"
                active={listFilter === 'covered'}
                onClick={() => setListFilter((f) => f === 'covered' ? 'all' : 'covered')}
              />
              <StatCard
                label="Partial Coverage"
                value={analysis.stats.needsEnhancement}
                color="text-violet-400"
                hint="Some gaps — enhance existing"
                active={listFilter === 'partial'}
                onClick={() => setListFilter((f) => f === 'partial' ? 'all' : 'partial')}
              />
              <StatCard
                label="Needs New Policy"
                value={analysis.stats.notGenerated}
                color="text-rose-400"
                hint="No uploaded coverage — must generate"
                active={listFilter === 'notGenerated'}
                onClick={() => setListFilter((f) => f === 'notGenerated' ? 'all' : 'notGenerated')}
              />
              <StatCard
                label="Drafts to Review"
                value={analysis.stats.drafts}
                color="text-blue-400"
                active={listFilter === 'drafts'}
                onClick={() => setListFilter((f) => f === 'drafts' ? 'all' : 'drafts')}
              />
              <StatCard
                label="Approved"
                value={analysis.stats.approved}
                color="text-emerald-400"
                active={listFilter === 'approved'}
                onClick={() => setListFilter((f) => f === 'approved' ? 'all' : 'approved')}
              />
            </div>
            {listFilter !== 'all' && (
              <div className="mt-3 flex items-center justify-between bg-cyan-500/10 border border-cyan-500/30 rounded px-3 py-2">
                <span className="text-xs text-cyan-300">
                  Showing only <span className="font-semibold">{filterLabel(listFilter)}</span> below
                </span>
                <button
                  onClick={() => setListFilter('all')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>

          {/* Secondary Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setView('org-profile'); loadOrgProfile() }}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium flex items-center gap-2"
              >
                <span>Edit Organization Profile</span>
                <span className="text-slate-400">({orgCompletion}%)</span>
              </button>
            </div>
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

          {/* Mass Generation Progress */}
          {massGenerating && (
            <div className="bg-slate-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white font-medium">
                  Generating: {massProgress.currentName}
                </span>
                <span className="text-xs text-slate-400">
                  {massProgress.current}/{massProgress.total} &middot; {massProgress.completed} done &middot; {massProgress.failed} failed
                </span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-2">
                <div
                  className="bg-cyan-500 h-2 rounded-full transition-all"
                  style={{ width: `${massProgress.total > 0 ? (massProgress.current / massProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Mass Generation Complete Summary */}
          {!massGenerating && massProgress.total > 0 && massProgress.current === massProgress.total && (
            <div className={`border rounded-lg p-4 ${massProgress.failed > 0 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
              <p className={`text-sm font-medium ${massProgress.failed > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                Batch generation complete: {massProgress.completed} generated, {massProgress.failed} failed out of {massProgress.total} policies.
              </p>
            </div>
          )}

          {/* Policy List by Category */}
          {Object.entries(groupByCategory(analysis.requiredPolicies.filter((p) => matchesFilter(p, listFilter)))).map(([cat, policies]) => (
            <div key={cat} className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 bg-slate-800/30">
                <h3 className="text-sm font-semibold text-slate-300">{CATEGORY_LABELS[cat] ?? cat}</h3>
              </div>
              <div className="divide-y divide-white/5">
                {policies.map((policy) => (
                  <button
                    key={policy.slug}
                    type="button"
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 cursor-pointer transition-colors text-left"
                    onClick={() => openPolicyDetail(policy.slug)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white truncate">{policy.name}</span>
                        {/* Hide Required/Recommended when the policy is already handled.
                            Showing red "Required" next to green "Covered by Existing" is confusing. */}
                        {policy.coverageStatus !== 'covered' && policy.status !== 'draft' && policy.status !== 'approved' && (
                          <RequirementBadge requirement={policy.requirement} />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-500">{policy.controlCount} controls</span>
                        <span className="text-xs text-slate-500">{policy.frameworks.join(', ')}</span>
                        {policy.lastUpdated && (
                          <span className="text-xs text-slate-500">Updated {new Date(policy.lastUpdated).toLocaleDateString()}</span>
                        )}
                      </div>
                      {/* Coverage info — only show for pre-generation items where it matters */}
                      {(policy.status === 'missing' || policy.status === 'ready_to_generate' || policy.status === 'intake_needed') && policy.coverageStatus !== 'none' && (
                        <p className="text-xs text-slate-400 mt-1 truncate">
                          {policy.coverageStatus === 'covered' ? (
                            <span className="text-emerald-400">&#10003; {policy.coverageRatio}% covered by: {policy.coveredBy.slice(0, 2).join(', ')}{policy.coveredBy.length > 2 ? ` +${policy.coveredBy.length - 2}` : ''}</span>
                          ) : (
                            <span className="text-violet-400">~ {policy.coverageRatio}% covered by: {policy.coveredBy.slice(0, 2).join(', ')}{policy.coveredBy.length > 2 ? ` +${policy.coveredBy.length - 2}` : ''}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <SmartStatusBadge policy={policy} />
                      {(policy.status === 'draft' || policy.status === 'approved') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadPolicy(policy.slug) }}
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </button>
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

function NextStepBanner({
  orgCompletion,
  stats,
  massGenerating,
  onOpenOrgProfile,
  onGenerateAll,
}: {
  orgCompletion: number
  stats: NeedsAnalysis['stats']
  massGenerating: boolean
  onOpenOrgProfile: () => void
  onGenerateAll: () => void
}) {
  // Determine current phase and next action in priority order:
  // 1. Org profile incomplete → fill it first
  // 2. Policies not generated AND not covered by uploads → generate new ones
  // 3. Drafts exist → review them
  // 4. Partial-coverage items exist → offer enhancement
  // 5. All approved → done
  let phase: 'profile' | 'generate' | 'review' | 'enhance' | 'done' = 'done'
  if (orgCompletion < 60) phase = 'profile'
  else if (stats.notGenerated > 0) phase = 'generate'
  else if (stats.drafts > 0) phase = 'review'
  else if (stats.needsEnhancement > 0) phase = 'enhance'

  const phases = [
    { key: 'profile', num: 1, label: 'Organization Profile' },
    { key: 'generate', num: 2, label: 'Generate Policies' },
    { key: 'review', num: 3, label: 'Review & Approve' },
  ] as const

  return (
    <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg p-4 sm:p-6">
      {/* Phase indicator */}
      <div className="flex items-center gap-2 mb-4">
        {phases.map((p, i) => {
          const isActive = p.key === phase
          const isDone = phases.findIndex((x) => x.key === phase) > i
          return (
            <div key={p.key} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${
                isDone ? 'bg-emerald-500 border-emerald-500 text-white'
                  : isActive ? 'bg-cyan-500 border-cyan-500 text-white'
                  : 'border-slate-600 text-slate-500'
              }`}>
                {isDone ? '\u2713' /* checkmark */ : p.num}
              </div>
              <span className={`text-xs font-medium truncate ${
                isActive ? 'text-cyan-300' : isDone ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {p.label}
              </span>
              {i < phases.length - 1 && (
                <div className={`flex-1 h-0.5 min-w-4 ${isDone ? 'bg-emerald-500' : 'bg-slate-700'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Next step message + action */}
      {phase === 'profile' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Step 1: Complete the Organization Profile</h3>
            <p className="text-sm text-slate-300 mt-1">
              The AI uses this to personalize every policy. You&apos;re <span className="font-semibold text-cyan-300">{orgCompletion}%</span> complete.
              Fields are auto-filled from uploaded policies and platform mappings where possible.
            </p>
          </div>
          <button
            onClick={onOpenOrgProfile}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-semibold flex-shrink-0"
          >
            Open Profile &rarr;
          </button>
        </div>
      )}

      {phase === 'generate' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Step 2: Generate {stats.notGenerated} New Polic{stats.notGenerated === 1 ? 'y' : 'ies'}</h3>
            <p className="text-sm text-slate-300 mt-1">
              {stats.coveredByExisting > 0 || stats.needsEnhancement > 0 ? (
                <>
                  The customer&apos;s uploaded policies already cover{' '}
                  <span className="text-emerald-400 font-semibold">{stats.coveredByExisting}</span> catalog items
                  {stats.needsEnhancement > 0 && (
                    <> and partially cover <span className="text-violet-400 font-semibold">{stats.needsEnhancement}</span> more</>
                  )}.{' '}
                  Only <span className="text-rose-400 font-semibold">{stats.notGenerated}</span> need to be written from scratch.
                </>
              ) : (
                <>
                  Your Organization Profile is ready ({orgCompletion}%). Click below to batch-generate all remaining policies.
                  They&apos;ll come back as drafts for your review.
                </>
              )}
            </p>
          </div>
          <button
            onClick={onGenerateAll}
            disabled={massGenerating}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg text-sm font-semibold flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {massGenerating && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
            {massGenerating ? 'Generating\u2026' : `Generate ${stats.notGenerated} New Polic${stats.notGenerated === 1 ? 'y' : 'ies'} \u2192`}
          </button>
        </div>
      )}

      {phase === 'enhance' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Optional: Enhance {stats.needsEnhancement} Partially-Covered Polic{stats.needsEnhancement === 1 ? 'y' : 'ies'}</h3>
            <p className="text-sm text-slate-300 mt-1">
              The customer&apos;s existing policies cover most of what&apos;s needed. For {stats.needsEnhancement} catalog item{stats.needsEnhancement === 1 ? '' : 's'} with
              partial coverage, you can generate an enhanced version that fills the remaining gaps. Click a policy below to review and enhance.
            </p>
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Step 3: Review {stats.drafts} Draft Polic{stats.drafts === 1 ? 'y' : 'ies'}</h3>
            <p className="text-sm text-slate-300 mt-1">
              All policies are generated. Click on each draft below to review the content and approve it.
              Approved policies are ready to share with the customer.
            </p>
          </div>
          <div className="px-4 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm font-medium flex-shrink-0">
            {stats.drafts} awaiting review
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-lg flex-shrink-0">
            &#10003;
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">All Policies Approved</h3>
            <p className="text-sm text-slate-300 mt-1">
              {stats.approved} of {stats.totalRequired} policies are approved. Use the Download buttons below to deliver them to the customer.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function AssessmentRerunBanner({
  latestPolicyActivityAt,
  latestAssessmentAt,
}: {
  latestPolicyActivityAt: string | null
  latestAssessmentAt: string | null
}) {
  const never = !latestAssessmentAt
  const policyTs = latestPolicyActivityAt ? new Date(latestPolicyActivityAt) : null
  const assessTs = latestAssessmentAt ? new Date(latestAssessmentAt) : null

  const formatDate = (d: Date | null): string => {
    if (!d) return 'never'
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-500/30 rounded-lg p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-500/30 flex items-center justify-center text-violet-200 text-sm flex-shrink-0 mt-0.5">
            !
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">Policies have changed — run a new assessment</h3>
            <p className="text-xs text-slate-300 mt-1">
              {never ? (
                <>No assessment has been run yet. Run one now to capture the customer&apos;s current CIS compliance score.</>
              ) : (
                <>
                  Last policy change: <span className="text-violet-300">{formatDate(policyTs)}</span>.
                  Last assessment: <span className="text-slate-400">{formatDate(assessTs)}</span>.
                  Running a new assessment will pick up the latest uploaded and generated policies so the customer sees their updated score.
                </>
              )}
            </p>
          </div>
        </div>
        <a
          href="/admin/compliance"
          className="px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white rounded-lg text-sm font-semibold flex-shrink-0 whitespace-nowrap"
        >
          Run New Assessment &rarr;
        </a>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, hint, active, onClick }: {
  label: string
  value: number
  color: string
  hint?: string
  active?: boolean
  onClick?: () => void
}) {
  const clickable = !!onClick
  const base = 'backdrop-blur-sm border rounded-lg p-4 text-center transition-all'
  const interactive = clickable
    ? (active
      ? 'bg-cyan-500/15 border-cyan-500/50 ring-2 ring-cyan-500/40 cursor-pointer'
      : 'bg-slate-800/50 border-white/10 hover:bg-slate-800/80 hover:border-white/20 cursor-pointer')
    : 'bg-slate-800/50 border-white/10'
  return (
    <button
      type="button"
      disabled={!clickable || value === 0}
      onClick={onClick}
      className={`${base} ${interactive} w-full disabled:cursor-default disabled:hover:bg-slate-800/50 disabled:hover:border-white/10`}
      title={hint}
    >
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </button>
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

// Shows the most informative badge per policy. When a catalog item has no
// generation record yet but is covered/partial by uploaded content, we surface
// the coverage state instead of a generic "Not Generated" badge.
function SmartStatusBadge({ policy }: { policy: PolicyNeedItem }) {
  const isUngenerated = policy.status === 'missing' || policy.status === 'ready_to_generate' || policy.status === 'intake_needed'

  if (isUngenerated && policy.coverageStatus === 'covered') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-400" title={`Covered by: ${policy.coveredBy.join(', ')}`}>
        Covered by Existing
      </span>
    )
  }
  if (isUngenerated && policy.coverageStatus === 'partial') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium border bg-violet-500/10 border-violet-500/30 text-violet-400" title={`Partially covered by: ${policy.coveredBy.join(', ')}`}>
        Partial {policy.coverageRatio}%
      </span>
    )
  }
  return <StatusBadge status={policy.status} />
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
  autoFilled,
}: {
  question: QuestionDef
  value: string | string[] | boolean | undefined
  onChange: (val: string | string[] | boolean) => void
  autoFilled?: boolean
}) {
  const baseInputClass = 'w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50'

  return (
    <div className={question.type === 'textarea' ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-300 mb-1">
        {question.label}
        {question.required && <span className="text-red-400 ml-1">*</span>}
        {autoFilled && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 ml-2">
            Auto-filled
          </span>
        )}
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
