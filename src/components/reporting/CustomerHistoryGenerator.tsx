'use client'

import { useState, useEffect, useCallback } from 'react'

interface CompanyOption {
  id: string
  displayName: string
  ticketCount: number
}

/**
 * Customer History (TBR) generator.
 *
 * Drives the read-only /api/reports/tbr-export endpoint, which pulls a customer's
 * full multi-year ticket history live from Autotask (+ Datto RMM) — independent of
 * the reporting sync's rolling cache. Produces a printable report and a shareable
 * link any logged-in staff member can open.
 */
export default function CustomerHistoryGenerator() {
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [companyName, setCompanyName] = useState('')
  const [years, setYears] = useState(3)
  const [includeHours, setIncludeHours] = useState(false)
  const [includeDatto, setIncludeDatto] = useState(true)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const fetchCompanies = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/reports/selectors', { signal })
      if (!res.ok) return
      const data = await res.json()
      const list: CompanyOption[] = (data.companies || [])
        .map((c: { id: string; displayName: string; ticketCount?: number }) => ({
          id: c.id,
          displayName: c.displayName,
          ticketCount: c.ticketCount || 0,
        }))
        .sort((a: CompanyOption, b: CompanyOption) =>
          b.ticketCount - a.ticketCount || a.displayName.localeCompare(b.displayName),
        )
      setCompanies(list)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('Failed to load companies:', err)
    }
  }, [])

  useEffect(() => {
    const c = new AbortController()
    fetchCompanies(c.signal)
    return () => c.abort()
  }, [fetchCompanies])

  const buildUrl = (format: 'html' | 'json'): string => {
    const params = new URLSearchParams()
    params.set('company', companyName.trim())
    params.set('years', String(years))
    if (includeHours) params.set('hours', 'true')
    if (!includeDatto) params.set('datto', 'false')
    if (format === 'html') params.set('format', 'html')
    return `${origin}/api/reports/tbr-export?${params.toString()}`
  }

  const canRun = companyName.trim().length >= 2 && origin.length > 0
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
          {/* Company picker (dropdown fills the field; you can also type any name) */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-slate-400 mb-1">Customer</label>
            <input
              list="tbr-company-list"
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              placeholder="Start typing or pick a customer…"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />
            <datalist id="tbr-company-list">
              {companies.map(c => (
                <option key={c.id} value={c.displayName}>
                  {c.ticketCount > 0 ? `${c.ticketCount} recent tickets` : ''}
                </option>
              ))}
            </datalist>
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

          {/* Actions */}
          <div className="flex items-end gap-2">
            {canRun ? (
              <a
                href={buildUrl('html')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
              >
                Open Report
              </a>
            ) : (
              <span className="flex-1 text-center bg-slate-700 text-slate-500 font-semibold rounded-lg px-4 py-2 text-sm cursor-not-allowed">
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
            Include labor hours <span className="text-slate-500">(slower)</span>
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
