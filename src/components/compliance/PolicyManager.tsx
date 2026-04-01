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
import type { CompliancePolicy, PolicyAnalysis } from '@/lib/compliance/types'

interface SharePointFile {
  id: string
  name: string
  size: number
  lastModified: string
  webUrl: string
  mimeType: string | null
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add policy form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [addMode, setAddMode] = useState<'paste' | 'upload' | 'sharepoint'>('paste')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [content, setContent] = useState('')
  const [sharepointUrl, setSharepointUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reanalyzing, setReanalyzing] = useState<string | null>(null) // policyId or 'all'

  // SharePoint folder scan state
  const [spScanning, setSpScanning] = useState(false)
  const [spFiles, setSpFiles] = useState<SharePointFile[]>([])
  const [spSelected, setSpSelected] = useState<Set<string>>(new Set())
  const [spImporting, setSpImporting] = useState(false)
  const [spImportProgress, setSpImportProgress] = useState(0)

  // Expanded policy detail
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null)

  const loadPolicies = useCallback(async () => {
    try {
      const res = await fetch(`/api/compliance/policies?companyId=${companyId}`)
      const json = await res.json()
      if (json.success) {
        setPolicies(json.data.policies ?? [])
        setAnalyses(json.data.analyses ?? [])
      }
    } catch {
      setError('Failed to load policies')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { loadPolicies() }, [loadPolicies])

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
    if (!title.trim() || (!content.trim() && !sharepointUrl.trim())) {
      setError('Title and content (or SharePoint URL) are required')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        companyId,
        title: title.trim(),
        content: addMode === 'sharepoint' ? `[SHAREPOINT:${sharepointUrl.trim()}]` : content.trim(),
        source: addMode,
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
      setSharepointUrl('')
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
    if (!sharepointUrl.trim()) return
    setSpScanning(true)
    setError(null)
    setSpFiles([])
    try {
      const res = await fetch('/api/compliance/policies/sharepoint-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, folderUrl: sharepointUrl.trim() }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setSpFiles(json.files ?? [])
      // Select all by default
      setSpSelected(new Set((json.files ?? []).map((f: SharePointFile) => f.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan SharePoint folder')
    } finally {
      setSpScanning(false)
    }
  }

  const importSelectedFiles = async () => {
    if (spSelected.size === 0) return
    setSpImporting(true)
    setSpImportProgress(0)
    setError(null)
    const selected = spFiles.filter((f) => spSelected.has(f.id))
    let imported = 0

    for (const file of selected) {
      try {
        await fetch('/api/compliance/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            title: file.name.replace(/\.[^.]+$/, ''),
            content: `[SHAREPOINT:${file.webUrl}]`,
            source: 'sharepoint',
            category: '',
            analyze: true,
          }),
        })
        imported++
        setSpImportProgress(Math.round((imported / selected.length) * 100))
      } catch {
        // Continue with remaining files
      }
    }

    setSpImporting(false)
    setSpFiles([])
    setSpSelected(new Set())
    setSharepointUrl('')
    setShowAddForm(false)
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
    // Re-analyze one at a time from the client to avoid server timeout
    let succeeded = 0
    for (const policy of policies) {
      try {
        const res = await fetch('/api/compliance/policies', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policyId: policy.id }),
        })
        const json = await res.json()
        if (json.success) succeeded++
      } catch {
        // Continue with remaining policies
      }
    }
    await loadPolicies()
    setReanalyzing(null)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Policy Analysis</h2>
          <p className="text-sm text-slate-400 mt-1">
            Upload or paste customer policies — AI analyzes them against CIS v8 controls
          </p>
        </div>
        <div className="flex gap-2">
          {policies.length > 0 && (
            <button
              onClick={reanalyzeAll}
              disabled={reanalyzing === 'all'}
              className="inline-flex items-center px-3 py-2 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-lg text-sm font-medium hover:bg-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {reanalyzing === 'all' ? 'Re-analyzing...' : 'Re-analyze All'}
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

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Add Policy Form */}
      {showAddForm && (
        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Add Policy for {companyName}</h3>

          {/* Source Tabs */}
          <div className="flex gap-2">
            {[
              { mode: 'paste' as const, label: 'Paste Text', icon: '📋' },
              { mode: 'upload' as const, label: 'Upload File', icon: '📄' },
              { mode: 'sharepoint' as const, label: 'SharePoint', icon: '🔗' },
            ].map(({ mode, label, icon }) => (
              <button
                key={mode}
                onClick={() => setAddMode(mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  addMode === mode
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-slate-700/50 text-slate-400 border border-white/5 hover:bg-slate-700'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Title + Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Policy Title</label>
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
                <option value="">Select category...</option>
                {POLICY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Content Input */}
          {addMode === 'paste' && (
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Policy Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the full policy text here..."
                rows={12}
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-y"
              />
              <p className="text-xs text-slate-500 mt-1">
                {content.length.toLocaleString()} characters
              </p>
            </div>
          )}

          {addMode === 'upload' && (
            <div>
              <label className="text-sm text-slate-300 mb-1 block">Upload Policy Document</label>
              <input
                type="file"
                accept=".txt,.md,.pdf,.docx"
                onChange={handleFileUpload}
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white file:bg-cyan-500/20 file:text-cyan-400 file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 file:text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Supports .txt, .md, .pdf. Content will be extracted and analyzed.
              </p>
              {content && (
                <div className="mt-2 p-2 bg-slate-900/50 border border-white/5 rounded-lg">
                  <p className="text-xs text-slate-400">Preview ({content.length.toLocaleString()} chars):</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-3">{content.substring(0, 300)}...</p>
                </div>
              )}
            </div>
          )}

          {addMode === 'sharepoint' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-300 mb-1 block">SharePoint Folder URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={sharepointUrl}
                    onChange={(e) => setSharepointUrl(e.target.value)}
                    placeholder="https://yourcompany.sharepoint.com/sites/Policies/Shared Documents/Compliance"
                    className="flex-1 bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    onClick={scanSharePointFolder}
                    disabled={spScanning || !sharepointUrl.trim()}
                    className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-medium hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {spScanning ? 'Scanning...' : 'Scan Folder'}
                  </button>
                </div>
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-300">
                  Point to a SharePoint folder containing policy documents. The system will scan for all
                  .txt, .md, .pdf, and .docx files. You can select which ones to import and analyze.
                  Requires <code className="text-cyan-400">Sites.Read.All</code> permission on the customer&apos;s app registration.
                </p>
              </div>

              {/* Scanned files list */}
              {spFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white font-medium">{spFiles.length} documents found</p>
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
                    {spFiles.map((file) => (
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
                          <p className="text-xs text-slate-500">
                            {(file.size / 1024).toFixed(0)}KB &middot; Modified {new Date(file.lastModified).toLocaleDateString()}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={importSelectedFiles}
                    disabled={spImporting || spSelected.size === 0}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {spImporting
                      ? `Importing & Analyzing... ${spImportProgress}%`
                      : `Import & Analyze ${spSelected.size} Document${spSelected.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Submit — only show for paste/upload modes, or sharepoint with no scanned files */}
          {(addMode !== 'sharepoint' || spFiles.length === 0) && (
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              {addMode !== 'sharepoint' && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !title.trim() || !content.trim()}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    'Submit & Analyze'
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
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
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-white truncate">{policy.title}</h4>
                      <p className="text-xs text-slate-400">
                        {getSourceLabel(policy.source)} {policy.category ? `&bull; ${policy.category}` : ''} &bull;{' '}
                        {new Date(policy.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {analysis?.status === 'complete' && (
                      <div className="flex gap-3 text-xs">
                        <span className="text-emerald-400">{satisfied} satisfied</span>
                        <span className="text-violet-400">{partial} partial</span>
                        <span className="text-red-400">{missing} missing</span>
                      </div>
                    )}
                    {analysis && (
                      <span className={`text-xs ${getStatusColor(analysis.status)}`}>
                        {analysis.status}
                      </span>
                    )}
                    <span className="text-slate-500 text-sm">{isExpanded ? '&#9650;' : '&#9660;'}</span>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && analysis?.status === 'complete' && (
                  <div className="border-t border-white/5 p-4 space-y-4">
                    {/* Summary */}
                    {analysis.analysisText && (
                      <div className="p-3 bg-slate-900/50 rounded-lg">
                        <p className="text-sm text-slate-300">{analysis.analysisText}</p>
                      </div>
                    )}

                    {/* Controls Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Satisfied */}
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-emerald-400">
                          Satisfied Controls ({(analysis.satisfiedControls ?? []).length})
                        </h5>
                        <div className="space-y-1">
                          {(analysis.satisfiedControls ?? []).map((c: string) => (
                            <div key={c} className="text-xs bg-emerald-500/10 text-emerald-300 px-2 py-1 rounded">
                              {c}
                            </div>
                          ))}
                          {(analysis.satisfiedControls ?? []).length === 0 && (
                            <p className="text-xs text-slate-500">None</p>
                          )}
                        </div>
                      </div>

                      {/* Partial */}
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-violet-400">
                          Partially Addressed ({(analysis.partialControls ?? []).length})
                        </h5>
                        <div className="space-y-1">
                          {(analysis.partialControls ?? []).map((c: string) => (
                            <div key={c} className="text-xs bg-violet-500/10 text-violet-300 px-2 py-1 rounded">
                              {c}
                            </div>
                          ))}
                          {(analysis.partialControls ?? []).length === 0 && (
                            <p className="text-xs text-slate-500">None</p>
                          )}
                        </div>
                      </div>

                      {/* Missing */}
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-red-400">
                          Missing / Not Addressed ({(analysis.missingControls ?? []).length})
                        </h5>
                        <div className="space-y-1">
                          {(analysis.missingControls ?? []).map((c: string) => (
                            <div key={c} className="text-xs bg-red-500/10 text-red-300 px-2 py-1 rounded">
                              {c}
                            </div>
                          ))}
                          {(analysis.missingControls ?? []).length === 0 && (
                            <p className="text-xs text-slate-500">None</p>
                          )}
                        </div>
                      </div>
                    </div>

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
                        disabled={reanalyzing === policy.id}
                        className="text-xs px-3 py-1 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded hover:bg-violet-500/30 disabled:opacity-50 transition-all"
                      >
                        {reanalyzing === policy.id ? 'Re-analyzing...' : 'Re-analyze with latest prompt'}
                      </button>
                    </div>
                    <details className="group">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
                        View policy content ({policy.content.length.toLocaleString()} chars)
                      </summary>
                      <pre className="mt-2 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                        {policy.content.substring(0, 5000)}
                        {policy.content.length > 5000 && '\n\n[...truncated]'}
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
                  <div className="border-t border-white/5 p-4">
                    <p className="text-sm text-red-400">{analysis.analysisText || 'Analysis failed'}</p>
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
