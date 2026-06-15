'use client'

import { useState, useEffect, useRef } from 'react'

interface AutotaskCompanyResult {
  id: number
  name: string
}

/**
 * Customer History (TBR) generator.
 *
 * Drives the read-only /api/reports/tbr-export endpoint, which pulls a customer's
 * full multi-year ticket history live from Autotask (+ Datto RMM) — independent of
 * the reporting sync's rolling cache. Produces a printable report and a shareable
 * link any logged-in staff member can open.
 *
 * Customer picker is a live typeahead against Autotask (/api/autotask/companies/search),
 * so any active Autotask company is selectable — not just ones already in our cache.
 */
export default function CustomerHistoryGenerator() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AutotaskCompanyResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const [years, setYears] = useState(3)
  const [includeHours, setIncludeHours] = useState(true)
  const [includeDatto, setIncludeDatto] = useState(true)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  // Live typeahead against Autotask (debounced). Skips when a company is already
  // selected (the query equals the chosen name), so picking doesn't re-search.
  useEffect(() => {
    if (selectedId !== null) {
      setResults([])
      return
    }
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autotask/companies/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        if (!res.ok) throw new Error('search failed')
        const data = await res.json()
        const list: AutotaskCompanyResult[] = (data.companies || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))
        setResults(list)
        setShowResults(true)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, selectedId])

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const onQueryChange = (value: string) => {
    setSelectedId(null) // editing the text clears any prior selection
    setQuery(value)
  }

  const pickCompany = (c: AutotaskCompanyResult) => {
    setSelectedId(c.id)
    setQuery(c.name)
    setResults([])
    setShowResults(false)
  }

  const buildUrl = (format: 'html' | 'json'): string => {
    const params = new URLSearchParams()
    if (selectedId !== null) {
      params.set('companyId', String(selectedId)) // exact Autotask match
    } else {
      params.set('company', query.trim()) // fuzzy name match server-side
    }
    params.set('years', String(years))
    if (includeHours) params.set('hours', 'true')
    if (!includeDatto) params.set('datto', 'false')
    if (format === 'html') params.set('format', 'html')
    return `${origin}/api/reports/tbr-export?${params.toString()}`
  }

  const canRun = (selectedId !== null || query.trim().length >= 2) && origin.length > 0
  const reportUrl = canRun ? buildUrl('html') : ''

  const copyLink = async () => {
    if (!reportUrl) return
    try {
      await navigator.clipboard.writeText(reportUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard may be blocked; the link is still selectable in the field */
    }
  }

  return (
    <div className="space-y-8">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-1">Generate Customer History</h2>
        <p className="text-sm text-slate-400 mb-4">
          Pulls live from Autotask, so it isn&apos;t limited to recently-synced tickets. Larger pulls can take up to a minute.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Customer typeahead (searches all active Autotask companies) */}
          <div className="lg:col-span-2" ref={boxRef}>
            <label className="block text-sm font-medium text-slate-400 mb-1">Customer</label>
            <div className="relative">
              <input
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                placeholder="Search Autotask customers…"
                value={query}
                onChange={e => onQueryChange(e.target.value)}
                onFocus={() => results.length > 0 && setShowResults(true)}
                autoComplete="off"
              />
              {selectedId !== null && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs">✓ selected</span>
              )}
              {showResults && (searching || results.length > 0) && (
                <div className="absolute z-20 mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {searching && results.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>
                  ) : (
                    results.map(c => (
                      <button
                        key={c.id}
                        onClick={() => pickCompany(c)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors"
                      >
                        {c.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Time range */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">History</label>
            <select
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              value={years}
              onChange={e => setYears(Number(e.target.value))}
            >
              <option value={1}>Last 1 year</option>
              <option value={2}>Last 2 years</option>
              <option value={3}>Last 3 years</option>
              <option value={5}>Last 5 years</option>
            </select>
          </div>

          {/* Action */}
          <div className="flex items-end">
            {canRun ? (
              <a
                href={buildUrl('html')}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
              >
                Open Report
              </a>
            ) : (
              <span className="w-full text-center bg-slate-700 text-slate-500 font-semibold rounded-lg px-4 py-2 text-sm cursor-not-allowed">
                Open Report
              </span>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-wrap items-center gap-5 mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={includeDatto} onChange={() => setIncludeDatto(v => !v)} className="accent-cyan-500" />
            Include Datto RMM (devices &amp; alerts)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={includeHours} onChange={() => setIncludeHours(v => !v)} className="accent-cyan-500" />
            Include labor hours
          </label>
          {canRun && (
            <a
              href={buildUrl('json')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-cyan-400 hover:text-cyan-300 ml-auto"
            >
              Open raw data (JSON) &rarr;
            </a>
          )}
        </div>
      </div>

      {/* Shareable link */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-1">Share with your team</h2>
        <p className="text-sm text-slate-400 mb-3">
          Send this link to anyone on the team. They&apos;ll need to be signed in to the admin portal — no secrets in the URL.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={reportUrl || 'Choose a customer above to generate a link…'}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 bg-slate-900 border border-slate-600 text-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={copyLink}
            disabled={!canRun}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors whitespace-nowrap"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}
