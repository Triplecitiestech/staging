'use client'

/**
 * Policy Manager — Upload, paste, or link SharePoint policies for AI analysis
 *
 * Features:
 *   - Paste policy text directly
 *   - Upload .txt/.docx/.pdf files (text extracted client-side)
 *   - Link to SharePoint document library for auto-fetch
 *   - AI analysis via Claude — maps policies to CIS v8 controls
 *   - Shows satisfied, partial, and missing controls per policy
 *   - Gap analysis with actionable recommendations
 */

import { useState, useEffect, useCallback } from 'react'
import type { CompliancePolicy, PolicyAnalysis, PolicyControlDetail } from '@/lib/compliance/types'
import PublishPolicyButton from './PublishPolicyButton'
import RequestApprovalButton from './RequestApprovalButton'
import PolicyApprovalBadge, { type PolicyApprovalSnapshot } from './PolicyApprovalBadge'

interface SharePointFile {
  id: string
  name: string
  size: number
  lastModified: string
  webUrl: string
  mimeType: string | null
  // Stamped by the scan endpoint so the import can pass driveId+itemId
  // straight to the server-side fetch+extract helper.
  driveId: string
}

interface PolicyManagerProps {
  companyId: string
  companyName: string
}

const POLICY_CATEGORIES = [
  'Acceptable Use Policy',
  'Access Control Policy',
  'Backup & Recovery Policy',
  'Change Management Policy',
  'Data Classification Policy',
  'Data Retention Policy',
  'Disaster Recovery Plan',
  'Encryption Policy',
  'Incident Response Plan',
  'Information Security Policy',
  'Mobile Device Policy',
  'Network Security Policy',
  'Password Policy',
  'Patch Management Policy',
  'Remote Access Policy',
  'Risk Assessment Policy',
  'Security Awareness Training Policy',
  'Vendor Management Policy',
  'Other',
]

export default function PolicyManager({ companyId, companyName }: PolicyManagerProps) {
  const [policies, setPolicies] = useState<CompliancePolicy[]>([])
  const [analyses, setAnalyses] = useState<PolicyAnalysis[]>([])
  // Latest customer-portal approval per policy id. Drives the status
  // badge on each row + lets the publish modal auto-cite an approval.
  const [approvals, setApprovals] = useState<Record<string, PolicyApprovalSnapshot>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add policy form state
  const [showAddForm, setShowAddForm] = useState(false)
  // Scan = primary path (bulk-import from SharePoint, the common case).
  // Manual = fallback for the rare single-policy upload from disk or paste.
  const [addMode, setAddMode] = useState<'scan' | 'manual'>('scan')
  // Manual-mode source picker (only visible when addMode === 'manual').
  const [manualSource, setManualSource] = useState<'upload' | 'paste'>('upload')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reanalyzing, setReanalyzing] = useState<string | null>(null) // policyId or 'all'
  const [reanalyzeProgress, setReanalyzeProgress] = useState({ current: 0, total: 0, currentTitle: '' })
  const [generatingGapPolicy, setGeneratingGapPolicy] = useState(false)
  const [gapPolicyResult, setGapPolicyResult] = useState<{ success: boolean; message: string } | null>(null)

  // SharePoint folder scan state — supports MULTIPLE sites (operators
  // often store policies across several SharePoint sites at the same
  // customer). Each entry is one folder URL.
  const [sharepointUrls, setSharepointUrls] = useState<string[]>([''])
  const [spScanning, setSpScanning] = useState(false)
  const [spFiles, setSpFiles] = useState<Array<SharePointFile & { sourceUrl: string }>>([])
  // Track that a scan has completed at least once so the UI can show
  // a "no matching files found" message instead of silently going
  // back to the idle state when the scan succeeds with 0 results.
  const [spScanCompletedAt, setSpScanCompletedAt] = useState<number | null>(null)
  // Per-site totals from the scan response — folder count + truncation
  // flag — so the operator can see what the scan actually examined.
  const [spScanSummary, setSpScanSummary] = useState<{ sitesScanned: number; foldersScanned: number; truncated: boolean } | null>(null)
  const [spSelected, setSpSelected] = useState<Set<string>>(new Set())
  const [spImporting, setSpImporting] = useState(false)
  const [spImportProgress, setSpImportProgress] = useState(0)
  // Persisted summary of the most recent import — operator sees X
  // imported / Y failed inline instead of the form silently closing.
  const [spImportResult, setSpImportResult] = useState<{
    imported: number
    failures: Array<{ fileName: string; message: string }>
    total: number
  } | null>(null)
  // Sticky hint shown only after an actual 403/permission failure on
  // a scan call — not as always-on chrome.
  const [spPermissionHint, setSpPermissionHint] = useState<string | null>(null)

  // Expanded policy detail
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null)

  const loadPolicies = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/compliance/policies?companyId=${companyId}`, { signal })
      const json = await res.json()
      if (json.success) {
        setPolicies(json.data.policies ?? [])
        setAnalyses(json.data.analyses ?? [])
        setApprovals(json.data.approvals ?? {})
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('Failed to load policies')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    const c = new AbortController()
    loadPolicies(c.signal)
    return () => c.abort()
  }, [loadPolicies])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Extract text from file
    if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const text = await file.text()
      setContent(text)
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
    } else if (file.name.endsWith('.pdf')) {
      setContent(`[PDF file: ${file.name} — ${(file.size / 1024).toFixed(0)}KB. PDF text extraction happens server-side during analysis.]`)
      if (!title) setTitle(file.name.replace(/\.pdf$/, ''))
      // Read as base64 for server-side processing
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setContent(`[PDF_BASE64:${base64}]`)
      }
      reader.readAsDataURL(file)
    } else {
      // For .docx and other files, read as text (best effort)
      try {
        const text = await file.text()
        setContent(text)
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
      } catch {
        setError('Could not read file. Try .txt or .md format.')
      }
    }
  }

  const handleSubmit = async () => {
    // handleSubmit is the manual-add path (paste / upload). SharePoint
    // imports use importSelectedFiles, which never touches this.
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        companyId,
        title: title.trim(),
        content: content.trim(),
        source: manualSource, // 'paste' | 'upload'
        category,
        analyze: true,
      }

      const res = await fetch('/api/compliance/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      // Reset form and reload
      setTitle('')
      setContent('')
      setCategory('')
      setShowAddForm(false)
      await loadPolicies()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add policy')
    } finally {
      setSubmitting(false)
    }
  }

  const scanSharePointFolder = async () => {
    const urls = sharepointUrls.map((u) => u.trim()).filter(Boolean)
    if (urls.length === 0) return
    setSpScanning(true)
    setError(null)
    setSpPermissionHint(null)
    setSpFiles([])
    setSpScanSummary(null)
    setSpScanCompletedAt(null)
    const aggregated: Array<SharePointFile & { sourceUrl: string }> = []
    const failures: Array<{ url: string; message: string }> = []
    let totalFoldersScanned = 0
    let anyTruncated = false
    for (const url of urls) {
      try {
        const res = await fetch('/api/compliance/policies/sharepoint-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, folderUrl: url }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          const msg = typeof json?.error === 'string' ? json.error : `scan failed (${res.status})`
          failures.push({ url, message: msg })
          // Only surface the permission hint when the underlying error
          // names a permission/scope issue — not on every scan attempt.
          if (/403|forbidden|sites\.read\.all|permission/i.test(msg)) {
            setSpPermissionHint(
              'SharePoint refused with a permissions error. Confirm the TCT Customer Portal app registration has Sites.Read.All consented at the tenant level for this customer.'
            )
          }
          continue
        }
        for (const f of (json.files ?? []) as SharePointFile[]) {
          aggregated.push({ ...f, sourceUrl: url })
        }
        if (typeof json.scannedFolderCount === 'number') totalFoldersScanned += json.scannedFolderCount
        if (json.truncated === true) anyTruncated = true
      } catch (err) {
        failures.push({ url, message: err instanceof Error ? err.message : 'Network error' })
      }
    }
    setSpFiles(aggregated)
    // Select all scanned files by default — the operator usually wants
    // to import everything they found.
    setSpSelected(new Set(aggregated.map((f) => f.id)))
    setSpScanSummary({
      sitesScanned: urls.length - failures.length,
      foldersScanned: totalFoldersScanned,
      truncated: anyTruncated,
    })
    setSpScanCompletedAt(Date.now())
    if (failures.length > 0) {
      setError(
        `Scanned ${urls.length - failures.length}/${urls.length} site${urls.length === 1 ? '' : 's'}. ` +
        failures.map((f) => `(${f.url.slice(-40)}…: ${f.message})`).join(' ')
      )
    }
    setSpScanning(false)
  }

  const importSelectedFiles = async () => {
    if (spSelected.size === 0) return
    setSpImporting(true)
    setSpImportProgress(0)
    setError(null)
    setSpImportResult(null)
    const selected = spFiles.filter((f) => spSelected.has(f.id))
    const importFailures: Array<{ fileName: string; message: string }> = []
    const succeededIds = new Set<string>()
    let imported = 0

    for (const file of selected) {
      try {
        const res = await fetch('/api/compliance/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            title: file.name.replace(/\.[^.]+$/, ''),
            // sharePointRef lets the server fetch the document directly
            // by driveId+itemId (one Graph call), then run mammoth/pdf-parse
            // on the bytes to get real extracted text for AI analysis.
            // Without this the analyzer used to see a 50-byte placeholder.
            sharePointRef: {
              driveId: file.driveId,
              itemId: file.id,
              fileName: file.name,
            },
            source: 'sharepoint',
            category: '',
            analyze: true,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          importFailures.push({
            fileName: file.name,
            message: typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`,
          })
        } else {
          imported++
          succeededIds.add(file.id)
        }
        setSpImportProgress(Math.round(((imported + importFailures.length) / selected.length) * 100))
      } catch (err) {
        importFailures.push({
          fileName: file.name,
          message: err instanceof Error ? err.message : 'Network error',
        })
      }
    }

    setSpImporting(false)
    // Drop successfully-imported rows from the scanned-file list so the
    // operator can't accidentally re-import them. Re-clicking the import
    // button after a clean run was creating duplicate policies. Failed
    // rows stay so the operator can retry just those.
    setSpFiles((prev) => prev.filter((f) => !succeededIds.has(f.id)))
    setSpSelected((prev) => {
      const next = new Set(prev)
      succeededIds.forEach((id) => next.delete(id))
      return next
    })
    // Don't close the form. Leave the import-result card visible so
    // the operator can see what landed (and what didn't) before
    // dismissing. Refresh the policy list under the form so newly
    // imported docs appear immediately.
    setSpImportResult({
      imported,
      failures: importFailures,
      total: selected.length,
    })
    await loadPolicies()
  }

  const toggleSpFile = (id: string) => {
    setSpSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const reanalyzePolicy = async (policyId: string) => {
    setReanalyzing(policyId)
    setError(null)
    try {
      const res = await fetch('/api/compliance/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      await loadPolicies()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-analysis failed')
    } finally {
      setReanalyzing(null)
    }
  }

  const reanalyzeAll = async () => {
    setReanalyzing('all')
    setError(null)
    setReanalyzeProgress({ current: 0, total: policies.length, currentTitle: '' })
    for (let i = 0; i < policies.length; i++) {
      const policy = policies[i]
      setReanalyzeProgress({ current: i + 1, total: policies.length, currentTitle: policy.title })
      try {
        const res = await fetch('/api/compliance/policies', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policyId: policy.id }),
        })
        const json = await res.json()
        if (!json.success) {
          console.error(`[reanalyzeAll] Failed for ${policy.title}:`, json.error)
        }
      } catch (err) {
        console.error(`[reanalyzeAll] Error for ${policy.title}:`, err)
      }
    }
    await loadPolicies()
    setReanalyzing(null)
    setReanalyzeProgress({ current: 0, total: 0, currentTitle: '' })
  }

  const generateGapFillingPolicy = async (uncoveredControls: string[]) => {
    if (uncoveredControls.length === 0) return
    setGeneratingGapPolicy(true)
    setGapPolicyResult(null)
    try {
      const controlList = uncoveredControls.join(', ')
      const res = await fetch('/api/compliance/policies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          policySlug: 'gap-remediation-policy',
          mode: 'fill-missing',
          frameworks: ['cis-v8'],
          userInstructions: `Generate a comprehensive gap-remediation policy that specifically addresses the following uncovered controls: ${controlList}. This policy should complement the customer's existing policies and fill coverage gaps. Focus on practical, implementable language for each control.`,
        }),
      })
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${res.status})`)
      }
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setGapPolicyResult({ success: true, message: `Gap-filling policy generated covering ${uncoveredControls.length} controls. Check the Policy Generation tab.` })
      await loadPolicies()
    } catch (err) {
      setGapPolicyResult({ success: false, message: err instanceof Error ? err.message : 'Failed to generate gap-filling policy' })
    } finally {
      setGeneratingGapPolicy(false)
    }
  }

  const getAnalysisForPolicy = (policyId: string): PolicyAnalysis | undefined => {
    return analyses.find((a) => a.policyId === policyId)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-emerald-400'
      case 'analyzing': return 'text-cyan-400'
      case 'error': return 'text-red-400'
      default: return 'text-slate-400'
    }
  }

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'paste': return 'Pasted'
      case 'upload': return 'Uploaded'
      case 'sharepoint': return 'SharePoint'
      case 'generated': return 'AI Generated'
      default: return source
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  // Library summary: count uploaded vs AI-generated policies so the tech
  // understands "where policies live" at a glance. Also used to flag
  // potential conflicts when both sources cover the same category.
  const uploadedCount = policies.filter((p) => p.source !== 'generated').length
  const generatedCount = policies.filter((p) => p.source === 'generated').length

  // Detect potential duplicates: categories that have both an uploaded AND a
  // generated policy. The tech may want to keep both, delete the old one,
  // or discard the new one \u2014 flag it so they don't miss the decision.
  const categoriesWithBothSources = new Map<string, { uploaded: string[]; generated: string[] }>()
  for (const p of policies) {
    if (!p.category) continue
    const entry = categoriesWithBothSources.get(p.category) ?? { uploaded: [], generated: [] }
    if (p.source === 'generated') entry.generated.push(p.title)
    else entry.uploaded.push(p.title)
    categoriesWithBothSources.set(p.category, entry)
  }
  const duplicateCategories = Array.from(categoriesWithBothSources.entries())
    .filter(([, v]) => v.uploaded.length > 0 && v.generated.length > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white">Policy Library</h2>
          <p className="text-sm text-slate-400 mt-1">
            All policies for {companyName} — both customer uploads and AI-generated documents. AI analyzes them against CIS v8 controls.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          {policies.length > 0 && (
            <button
              onClick={reanalyzeAll}
              disabled={reanalyzing === 'all'}
              className="inline-flex items-center px-3 py-2 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-lg text-sm font-medium hover:bg-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {reanalyzing === 'all'
                ? `Analyzing ${reanalyzeProgress.current}/${reanalyzeProgress.total}: ${reanalyzeProgress.currentTitle.substring(0, 20)}...`
                : 'Re-analyze All'}
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium text-sm transition-all"
          >
            {showAddForm ? 'Cancel' : '+ Add Policy'}
          </button>
        </div>
      </div>

      {/* Library summary */}
      {policies.length > 0 && (
        <div className="bg-slate-800/30 border border-white/10 rounded-lg p-4 space-y-2">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-slate-400">
              <span className="text-white font-semibold">{policies.length}</span> total
            </span>
            <span className="text-slate-400">
              <span className="text-cyan-300 font-semibold">{uploadedCount}</span> uploaded by customer
            </span>
            <span className="text-slate-400">
              <span className="text-emerald-300 font-semibold">{generatedCount}</span> AI-generated
            </span>
          </div>
          {duplicateCategories.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-violet-300 cursor-pointer hover:text-violet-200">
                {duplicateCategories.length} categor{duplicateCategories.length === 1 ? 'y has' : 'ies have'} both uploaded and generated versions — review for conflicts
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {duplicateCategories.map(([cat, v]) => (
                  <li key={cat}>
                    <span className="font-semibold text-white">{cat}</span>:{' '}
                    <span className="text-cyan-300">uploaded &ldquo;{v.uploaded.join(', ')}&rdquo;</span>
                    <span className="text-slate-500"> + </span>
                    <span className="text-emerald-300">generated &ldquo;{v.generated.join(', ')}&rdquo;</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 mt-2 italic">
                Keep both (the AI version as a supplement), delete the older upload to use the AI version as a replacement, or delete the generated draft to stick with the customer&apos;s content. Use the expand arrows on each policy below to view and manage.
              </p>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Add Policy Form
          Two modes:
            scan   — bulk-import from one or more SharePoint sites
                     (primary; what operators actually use).
            manual — single-policy upload or paste (rare; fallback). */}
      {showAddForm && (
        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Add policies for {companyName}</h3>

          {/* Mode tabs — scan first because it's the common path */}
          <div className="flex gap-2">
            {[
              { mode: 'scan' as const, label: 'Scan SharePoint', sub: 'bulk import from sites' },
              { mode: 'manual' as const, label: 'Add single policy', sub: 'upload or paste one' },
            ].map(({ mode, label, sub }) => (
              <button
                key={mode}
                onClick={() => setAddMode(mode)}
                className={`flex-1 px-4 py-3 rounded-lg text-left transition-all ${
                  addMode === mode
                    ? 'bg-cyan-500/15 border border-cyan-500/40'
                    : 'bg-slate-700/40 border border-white/5 hover:bg-slate-700/60'
                }`}
              >
                <p className={`text-sm font-medium ${addMode === mode ? 'text-cyan-200' : 'text-slate-300'}`}>{label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>

          {/* ============================ */}
          {/* SCAN MODE — multi-site bulk  */}
          {/* ============================ */}
          {addMode === 'scan' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-300 mb-2 block">
                  SharePoint folder URLs
                </label>
                <div className="space-y-2">
                  {sharepointUrls.map((url, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => {
                          const next = [...sharepointUrls]
                          next[i] = e.target.value
                          setSharepointUrls(next)
                        }}
                        placeholder="https://customer.sharepoint.com/sites/Policies/Shared Documents/Compliance"
                        className="flex-1 bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      />
                      {sharepointUrls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSharepointUrls(sharepointUrls.filter((_, idx) => idx !== i))}
                          className="px-2 py-2 text-xs text-rose-300 hover:text-rose-200"
                          title="Remove this site"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setSharepointUrls([...sharepointUrls, ''])}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    + Add another site
                  </button>
                  <span className="text-[11px] text-slate-500">
                    Policies often live across multiple SharePoint sites — add as many as needed.
                  </span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={scanSharePointFolder}
                  disabled={spScanning || !sharepointUrls.some((u) => u.trim().length > 0)}
                  className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-medium hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {spScanning
                    ? 'Scanning…'
                    : `Scan ${sharepointUrls.filter((u) => u.trim().length > 0).length} site${sharepointUrls.filter((u) => u.trim().length > 0).length === 1 ? '' : 's'}`}
                </button>
              </div>

              {/* Permission hint — only after a real 403 */}
              {spPermissionHint && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                  <p className="text-xs text-rose-200">{spPermissionHint}</p>
                </div>
              )}

              {/* Empty-state — scan finished with 0 results. Without this
                  the UI silently went back to idle and the operator
                  couldn't tell whether the scan even ran. Suppress when
                  an import just succeeded (spFiles drains on success). */}
              {spScanCompletedAt && spFiles.length === 0 && !spScanning && !spImportResult && (
                <div className="bg-slate-800/40 border border-white/10 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-white font-medium">
                    Scan finished — no matching documents found.
                  </p>
                  {spScanSummary && (
                    <p className="text-[11px] text-slate-400">
                      Walked {spScanSummary.foldersScanned} folder{spScanSummary.foldersScanned === 1 ? '' : 's'} across {spScanSummary.sitesScanned} site{spScanSummary.sitesScanned === 1 ? '' : 's'}.
                      {spScanSummary.truncated && ' Stopped early at the 500-file cap.'}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    The scan looks for <code className="text-cyan-300">.txt .md .pdf .docx .doc .rtf</code> files (recursing up to 5 levels of subfolders).
                    If you expected results: confirm the folder URL actually contains policy documents,
                    or that the customer&apos;s app registration has Sites.Read.All so we can see them.
                  </p>
                </div>
              )}

              {/* Scanned files list */}
              {spFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white font-medium">
                      {spFiles.length} document{spFiles.length === 1 ? '' : 's'} found
                      {sharepointUrls.filter((u) => u.trim().length > 0).length > 1 && (
                        <span className="text-slate-500 font-normal"> across {sharepointUrls.filter((u) => u.trim().length > 0).length} sites</span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSpSelected(new Set(spFiles.map((f) => f.id)))}
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setSpSelected(new Set())}
                        className="text-xs text-slate-400 hover:text-slate-300"
                      >
                        Deselect all
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {spFiles.map((file) => {
                      // Compact label for the site of origin: hostname + last path segment.
                      let siteLabel = ''
                      try {
                        const u = new URL(file.sourceUrl)
                        const host = u.hostname.replace('.sharepoint.com', '')
                        const tail = u.pathname.split('/').filter(Boolean).pop() ?? ''
                        siteLabel = `${host} · ${decodeURIComponent(tail).slice(0, 40)}`
                      } catch {
                        siteLabel = file.sourceUrl.slice(-40)
                      }
                      return (
                        <label
                          key={file.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/30 hover:bg-slate-900/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={spSelected.has(file.id)}
                            onChange={() => toggleSpFile(file.id)}
                            className="rounded border-white/20 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{file.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {(file.size / 1024).toFixed(0)}KB &middot; Modified {new Date(file.lastModified).toLocaleDateString()} &middot; {siteLabel}
                            </p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  <button
                    onClick={importSelectedFiles}
                    disabled={spImporting || spSelected.size === 0}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {spImporting
                      ? `Importing & Analyzing… ${spImportProgress}%`
                      : `Import & Analyze ${spSelected.size} document${spSelected.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}

              {/* Import-result card — visible after a bulk import
                  completes so the operator knows what landed and
                  what didn't. Was silently closing the form before. */}
              {spImportResult && (
                <div
                  className={`rounded-lg border p-4 space-y-2 ${
                    spImportResult.failures.length === 0
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : spImportResult.imported === 0
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : 'bg-cyan-500/10 border-cyan-500/30'
                  }`}
                >
                  <p className="text-sm font-semibold text-white">
                    {spImportResult.failures.length === 0
                      ? `✓ Imported ${spImportResult.imported} of ${spImportResult.total} documents`
                      : spImportResult.imported === 0
                      ? `✗ All ${spImportResult.total} imports failed`
                      : `${spImportResult.imported} imported, ${spImportResult.failures.length} failed`}
                  </p>
                  {spImportResult.failures.length > 0 && (
                    <details className="text-xs text-rose-200">
                      <summary className="cursor-pointer">Show failures</summary>
                      <ul className="mt-2 space-y-1">
                        {spImportResult.failures.map((f, i) => (
                          <li key={i} className="font-mono">
                            <span className="text-rose-100">{f.fileName}</span>: {f.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="text-[11px] text-slate-300/80">
                    Imported policies appear in the library below — analyze runs in the background and
                    framework coverage updates within a minute or two.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSpImportResult(null)
                        setSpFiles([])
                        setSpSelected(new Set())
                        setSharepointUrls([''])
                        setShowAddForm(false)
                      }}
                      className="text-xs text-slate-300 hover:text-white underline"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================ */}
          {/* MANUAL MODE — single policy   */}
          {/* ============================ */}
          {addMode === 'manual' && (
            <div className="space-y-4">
              {/* Source sub-tabs */}
              <div className="flex gap-2">
                {[
                  { mode: 'upload' as const, label: 'Upload file' },
                  { mode: 'paste' as const, label: 'Paste text' },
                ].map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setManualSource(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      manualSource === mode
                        ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30'
                        : 'bg-slate-700/40 text-slate-400 border border-white/5 hover:bg-slate-700/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Title + Category — only relevant in manual mode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Policy title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Acceptable Use Policy"
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <option value="">Select category…</option>
                    {POLICY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {manualSource === 'paste' && (
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Policy content</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste the full policy text here…"
                    rows={12}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-y"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {content.length.toLocaleString()} characters
                  </p>
                </div>
              )}

              {manualSource === 'upload' && (
                <div>
                  <label className="text-sm text-slate-300 mb-1 block">Upload policy document</label>
                  <input
                    type="file"
                    accept=".txt,.md,.pdf,.docx"
                    onChange={handleFileUpload}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white file:bg-cyan-500/20 file:text-cyan-400 file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 file:text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Supports .txt, .md, .pdf, .docx. Content will be extracted and analyzed.
                  </p>
                  {content && (
                    <div className="mt-2 p-2 bg-slate-900/50 border border-white/5 rounded-lg">
                      <p className="text-xs text-slate-400">Preview ({content.length.toLocaleString()} chars):</p>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-3">{content.substring(0, 300)}…</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !title.trim() || !content.trim()}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Analyzing…
                    </>
                  ) : (
                    'Submit & analyze'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Cross-Policy Control Coverage Summary                            */}
      {/* ================================================================= */}
      {policies.length > 0 && (() => {
        // Aggregate control coverage across ALL policies
        const completedAnalyses = analyses.filter((a) => a.status === 'complete')
        if (completedAnalyses.length === 0) return null

        // Build maps: controlId -> which policies satisfy/partial it
        const satisfiedBy = new Map<string, string[]>()  // controlId -> [policyTitle, ...]
        const partialBy = new Map<string, string[]>()
        const allControlIds = new Set<string>()

        for (const a of completedAnalyses) {
          const policy = policies.find((p) => p.id === a.policyId)
          const pTitle = policy?.title ?? 'Unknown'

          for (const c of (a.satisfiedControls ?? [])) {
            allControlIds.add(c)
            if (!satisfiedBy.has(c)) satisfiedBy.set(c, [])
            satisfiedBy.get(c)!.push(pTitle)
          }
          for (const c of (a.partialControls ?? [])) {
            allControlIds.add(c)
            if (!partialBy.has(c)) partialBy.set(c, [])
            partialBy.get(c)!.push(pTitle)
          }
          for (const c of (a.missingControls ?? [])) {
            allControlIds.add(c)
          }
        }

        const fullyCovered = Array.from(allControlIds).filter((c) => satisfiedBy.has(c))
        const partiallyCovered = Array.from(allControlIds).filter((c) => !satisfiedBy.has(c) && partialBy.has(c))
        const noCoverage = Array.from(allControlIds).filter((c) => !satisfiedBy.has(c) && !partialBy.has(c))
        const totalControls = allControlIds.size
        const coveragePct = totalControls > 0 ? Math.round((fullyCovered.length / totalControls) * 100) : 0

        // Sort control IDs numerically
        const sortControls = (arr: string[]) => arr.sort((a, b) => {
          const numA = a.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
          const numB = b.replace(/^[a-z]+-[a-z0-9]+-/, '').split('.').map(Number)
          for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
            const diff = (numA[i] ?? 0) - (numB[i] ?? 0)
            if (diff !== 0) return diff
          }
          return 0
        })

        return (
          <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Control Coverage Across All Policies</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Combined view of {completedAnalyses.length} analyzed {completedAnalyses.length === 1 ? 'policy' : 'policies'} for {companyName}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-2xl font-bold ${coveragePct >= 80 ? 'text-emerald-400' : coveragePct >= 50 ? 'text-cyan-400' : 'text-red-400'}`}>
                  {coveragePct}%
                </div>
                <span className="text-xs text-slate-500">coverage</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-emerald-400">{fullyCovered.length}</p>
                <p className="text-xs text-emerald-300/70">Controls Covered</p>
              </div>
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-violet-400">{partiallyCovered.length}</p>
                <p className="text-xs text-violet-300/70">Controls Partial</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-red-400">{noCoverage.length}</p>
                <p className="text-xs text-red-300/70">Controls Uncovered</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-700/50 rounded-full h-2.5 mb-4">
              <div className="flex h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${totalControls > 0 ? (fullyCovered.length / totalControls) * 100 : 0}%` }}
                />
                <div
                  className="bg-violet-500 transition-all"
                  style={{ width: `${totalControls > 0 ? (partiallyCovered.length / totalControls) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Gap details — controls with no coverage */}
            {noCoverage.length > 0 && (
              <details className="group">
                <summary className="text-sm text-red-400 font-medium cursor-pointer hover:text-red-300 flex items-center gap-2">
                  <span>{noCoverage.length} controls have no policy coverage</span>
                  <span className="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
                </summary>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sortControls(noCoverage).map((c) => (
                    <span key={c} className="text-xs bg-red-500/10 text-red-300 px-2 py-1 rounded font-mono">
                      {c.replace('cis-v8-', '')}
                    </span>
                  ))}
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => generateGapFillingPolicy(noCoverage)}
                    disabled={generatingGapPolicy}
                    className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-rose-500/80 to-rose-600/80 hover:from-rose-400 hover:to-rose-500 text-white rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {generatingGapPolicy && <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full mr-2" />}
                    {generatingGapPolicy ? 'Generating...' : `Generate Gap-Filling Policy (${noCoverage.length} controls)`}
                  </button>
                  {gapPolicyResult && (
                    <p className={`text-xs mt-2 ${gapPolicyResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                      {gapPolicyResult.message}
                    </p>
                  )}
                </div>
              </details>
            )}

            {/* Partial coverage details */}
            {partiallyCovered.length > 0 && (
              <details className="group mt-3">
                <summary className="text-sm text-violet-400 font-medium cursor-pointer hover:text-violet-300 flex items-center gap-2">
                  <span>{partiallyCovered.length} controls only partially covered</span>
                  <span className="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
                </summary>
                <div className="mt-3 space-y-1.5">
                  {sortControls(partiallyCovered).map((c) => (
                    <div key={c} className="text-xs bg-violet-500/10 text-violet-300 px-2.5 py-1.5 rounded flex items-baseline gap-2">
                      <span className="font-mono font-medium flex-shrink-0">{c.replace('cis-v8-', '')}</span>
                      <span className="text-slate-400">partially by: {partialBy.get(c)?.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Fully covered — collapsed by default */}
            {fullyCovered.length > 0 && (
              <details className="group mt-3">
                <summary className="text-sm text-emerald-400 font-medium cursor-pointer hover:text-emerald-300 flex items-center gap-2">
                  <span>{fullyCovered.length} controls fully covered</span>
                  <span className="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
                </summary>
                <div className="mt-3 space-y-1.5">
                  {sortControls(fullyCovered).map((c) => (
                    <div key={c} className="text-xs bg-emerald-500/10 text-emerald-300 px-2.5 py-1.5 rounded flex items-baseline gap-2">
                      <span className="font-mono font-medium flex-shrink-0">{c.replace('cis-v8-', '')}</span>
                      <span className="text-slate-400">by: {satisfiedBy.get(c)?.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )
      })()}

      {/* Existing Policies */}
      {policies.length === 0 && !showAddForm ? (
        <div className="text-center py-12 bg-slate-800/30 border border-white/5 rounded-xl">
          <p className="text-slate-400 mb-2">No policies uploaded yet</p>
          <p className="text-sm text-slate-500">
            Add a policy to see how it maps to CIS v8 controls
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => {
            const analysis = getAnalysisForPolicy(policy.id)
            const isExpanded = expandedPolicy === policy.id
            const satisfied = (analysis?.satisfiedControls ?? []).length
            const partial = (analysis?.partialControls ?? []).length
            const missing = (analysis?.missingControls ?? []).length

            return (
              <div
                key={policy.id}
                className="bg-slate-800/50 border border-white/10 rounded-xl overflow-hidden"
              >
                {/* Policy Header */}
                <div
                  onClick={() => setExpandedPolicy(isExpanded ? null : policy.id)}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0">
                      {analysis?.status === 'complete' ? (
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
                          {satisfied > 0 ? satisfied : '?'}
                        </div>
                      ) : analysis?.status === 'analyzing' ? (
                        <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                          <div className="animate-spin w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-lg">
                          ?
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-white truncate">{policy.title}</h4>
                        {policy.source === 'generated' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 whitespace-nowrap">
                            AI Generated
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-cyan-500/10 border-cyan-500/30 text-cyan-300 whitespace-nowrap">
                            Customer Upload
                          </span>
                        )}
                        <PolicyApprovalBadge approval={approvals[policy.id]} />
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {getSourceLabel(policy.source)}{policy.category ? ` · ${policy.category}` : ''} ·{' '}
                        Added {new Date(policy.createdAt).toLocaleDateString()}
                        {analysis?.analyzedAt && (
                          <> · Analyzed {new Date(analysis.analyzedAt).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 flex-shrink-0 pl-13 sm:pl-0">
                    {analysis?.status === 'complete' && (
                      <div className="flex gap-3 text-xs" title="Counts include only controls the analyzer judged relevant to this policy's scope.">
                        <span className="text-emerald-400">{satisfied} covered</span>
                        <span className="text-violet-400">{partial} partial</span>
                        <span className="text-rose-400">{missing} gap{missing === 1 ? '' : 's'}</span>
                      </div>
                    )}
                    {analysis && (
                      <span className={`text-xs ${getStatusColor(analysis.status)}`}>
                        {analysis.status}
                      </span>
                    )}
                    <span className="text-slate-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && analysis?.status === 'complete' && (
                  <div className="border-t border-white/5 p-4 space-y-4">
                    {/* Push-back-to-customer action panel.
                        Two paths, both gated on customer approval:
                          1. Request customer approval — emails the
                             customer's HR/PoC a magic link to review
                             and approve in their browser. Decision
                             gets recorded against this policy version.
                          2. Publish to customer SharePoint — operator
                             vouches for the customer (checkbox in
                             modal) and uploads immediately.
                        Available for every analyzed policy regardless
                        of source (uploaded or generated), since the
                        operator may need to push a refined version of
                        a customer's own upload too. */}
                    <div className="flex items-center justify-between gap-3 flex-wrap p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs uppercase tracking-wider text-violet-300">Push back to customer</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Download the .docx to upload anywhere (IT Glue, My Glue, third-party platforms),
                          send the customer a magic link to review + approve in their browser, or publish
                          directly to their SharePoint when you have sign-off.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <a
                          href={`/api/compliance/${companyId}/policies/${policy.id}/download`}
                          download
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80"
                          title="Download as .docx — upload to IT Glue, My Glue, or any third-party platform manually"
                        >
                          Download .docx
                        </a>
                        <RequestApprovalButton
                          companyId={companyId}
                          policyId={policy.id}
                          policyTitle={policy.title}
                        />
                        <PublishPolicyButton
                          companyId={companyId}
                          policyId={policy.id}
                          policyTitle={policy.title}
                          approval={approvals[policy.id]}
                        />
                      </div>
                    </div>

                    {/* Summary */}
                    {analysis.analysisText && (
                      <div className="p-3 bg-slate-900/50 rounded-lg">
                        <p className="text-sm text-slate-300">{analysis.analysisText}</p>
                      </div>
                    )}

                    {/* Controls Grid */}
                    {(() => {
                      const details = (analysis.controlDetails ?? []) as PolicyControlDetail[]
                      const detailMap = new Map(details.map((d) => [d.controlId, d]))
                      const hasDetails = details.length > 0

                      const renderControlList = (
                        controls: string[],
                        status: 'satisfied' | 'partial' | 'missing',
                        label: string,
                        colorClass: string,
                        bgClass: string
                      ) => (
                        <div className="space-y-2">
                          <h5 className={`text-sm font-medium ${colorClass}`}>
                            {label} ({controls.length})
                          </h5>
                          <div className="space-y-1.5">
                            {controls.map((c: string) => {
                              const detail = detailMap.get(c)
                              return (
                                <div key={c} className={`text-xs ${bgClass} px-2.5 py-1.5 rounded`}>
                                  <span className="font-medium">{c}</span>
                                  {hasDetails && detail?.reasoning && (
                                    <p className="mt-0.5 text-slate-400">{detail.reasoning}</p>
                                  )}
                                  {hasDetails && detail?.quote && status !== 'missing' && (
                                    <p className="mt-0.5 italic text-slate-500">&ldquo;{detail.quote}&rdquo;
                                      {detail.section && <span className="not-italic text-slate-600"> — {detail.section}</span>}
                                    </p>
                                  )}
                                </div>
                              )
                            })}
                            {controls.length === 0 && (
                              <p className="text-xs text-slate-500">None</p>
                            )}
                          </div>
                        </div>
                      )

                      return (
                        <div className="space-y-2">
                          {/* Plain-English explanation of what the three buckets
                              mean. The operator's hit: it was reading as
                              "this policy failed to cover all 50 CIS controls",
                              when in fact the AI only lists controls that
                              are RELEVANT to the policy's stated scope. A
                              password policy isn't expected to cover backup
                              controls and won't appear in any bucket here. */}
                          <p className="text-[11px] text-slate-400 leading-snug">
                            Only controls the analyzer judged <span className="text-slate-300">relevant to this policy&apos;s scope</span> appear below.
                            A password policy isn&apos;t expected to address backup controls — those won&apos;t show up at all.
                            &ldquo;Relevant gap&rdquo; means this policy type <em>should</em> address the control but the text doesn&apos;t.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {renderControlList(analysis.satisfiedControls ?? [], 'satisfied', 'Fully covered',          'text-emerald-400', 'bg-emerald-500/10 text-emerald-300')}
                            {renderControlList(analysis.partialControls   ?? [], 'partial',   'Partially covered',     'text-violet-400',  'bg-violet-500/10 text-violet-300')}
                            {renderControlList(analysis.missingControls   ?? [], 'missing',   'Relevant gap',          'text-rose-400',    'bg-rose-500/10 text-rose-300')}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Gaps */}
                    {(analysis.gaps ?? []).length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-slate-300 mb-2">Gaps Identified</h5>
                        <ul className="space-y-1">
                          {(analysis.gaps as string[]).map((gap, i) => (
                            <li key={i} className="text-xs text-slate-400 flex gap-2">
                              <span className="text-red-400 flex-shrink-0">&bull;</span>
                              {gap}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Recommendations */}
                    {(analysis.recommendations ?? []).length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-slate-300 mb-2">Recommendations</h5>
                        <ul className="space-y-1">
                          {(analysis.recommendations as string[]).map((rec, i) => (
                            <li key={i} className="text-xs text-slate-400 flex gap-2">
                              <span className="text-cyan-400 flex-shrink-0">&rarr;</span>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Re-analyze + Content Preview */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); reanalyzePolicy(policy.id) }}
                        disabled={reanalyzing !== null}
                        className="text-xs px-3 py-1 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded hover:bg-violet-500/30 disabled:opacity-50 transition-all"
                      >
                        {reanalyzing === policy.id ? 'Re-analyzing...' : 'Re-analyze with latest prompt'}
                      </button>
                    </div>
                    <details className="group">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
                        View policy content ({policy.content.length.toLocaleString()} chars)
                      </summary>
                      <pre className="mt-2 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-400 whitespace-pre-wrap max-h-[600px] overflow-y-auto font-mono leading-relaxed">
                        {policy.content}
                      </pre>
                    </details>
                  </div>
                )}

                {/* Analyzing State */}
                {isExpanded && analysis?.status === 'analyzing' && (
                  <div className="border-t border-white/5 p-6 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-cyan-400">Analyzing policy against CIS v8 controls...</p>
                  </div>
                )}

                {/* Error State */}
                {isExpanded && analysis?.status === 'error' && (
                  <div className="border-t border-white/5 p-4 space-y-3">
                    <p className="text-sm text-red-400">{analysis.analysisText || 'Analysis failed'}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); reanalyzePolicy(policy.id) }}
                      disabled={reanalyzing !== null}
                      className="text-xs px-3 py-1 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded hover:bg-violet-500/30 disabled:opacity-50 transition-all"
                    >
                      {reanalyzing === policy.id ? 'Retrying\u2026' : 'Retry analysis'}
                    </button>
                    <details className="group">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
                        View policy content ({policy.content.length.toLocaleString()} chars)
                      </summary>
                      <pre className="mt-2 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-400 whitespace-pre-wrap max-h-[600px] overflow-y-auto font-mono leading-relaxed">
                        {policy.content}
                      </pre>
                    </details>
                  </div>
                )}

                {/* No Analysis Yet State \u2014 applies to freshly-generated AI
                    policies and any policy that was added without analysis.
                    Without this branch the expand arrow appeared non-functional. */}
                {isExpanded && !analysis && (
                  <div className="border-t border-white/5 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-slate-900/40 rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-300">
                          This policy hasn&apos;t been analyzed against CIS v8 controls yet.
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {policy.source === 'generated'
                            ? 'AI-generated policies are created to fit the catalog; analyzing confirms which specific controls they satisfy.'
                            : 'Run analysis to map this policy to CIS v8 controls and see coverage gaps.'}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); reanalyzePolicy(policy.id) }}
                        disabled={reanalyzing !== null}
                        className="text-xs px-3 py-1.5 bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded hover:bg-violet-500/30 disabled:opacity-50 transition-all whitespace-nowrap flex-shrink-0"
                      >
                        {reanalyzing === policy.id ? 'Analyzing\u2026' : 'Analyze Policy'}
                      </button>
                    </div>
                    <details className="group" open>
                      <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-200 font-medium">
                        View policy content ({policy.content.length.toLocaleString()} chars)
                      </summary>
                      <pre className="mt-2 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-300 whitespace-pre-wrap max-h-[600px] overflow-y-auto font-mono leading-relaxed">
                        {policy.content}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
