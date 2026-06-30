'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * WAN Reliability report generator (UI only — all business logic lives in
 * `src/lib/reporting/wan-reliability` and is reached through
 * `/api/reports/wan-reliability`).
 *
 * Flow: pick a Site (Domotz collector, live typeahead) → optionally pick the
 * monitored Device (the WAN gateway; the likely one is auto-selected) → choose a
 * window (default 90 days) → Generate / Export (MD, JSON, TXT) / Copy. Site
 * metadata (customer, address, ISP, public IP) is prefilled from Domotz and
 * editable, so the report header is accurate for any customer.
 */

interface SiteResult {
  id: number
  name: string
  status: string | null
  timezone: string | null
  publicIp: string | null
  ispHint: string | null
}

interface DeviceResult {
  id: number
  name: string
  vendor: string | null
  model: string | null
  type: string | null
  ip: string | null
  importance: string | null
  status: string | null
  likelyGateway: boolean
}

const DAY_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 180 days' },
  { value: 365, label: 'Last 365 days' },
]

export default function WanReliabilityGenerator() {
  // Site typeahead
  const [siteQuery, setSiteQuery] = useState('')
  const [siteResults, setSiteResults] = useState<SiteResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedSite, setSelectedSite] = useState<SiteResult | null>(null)

  // Devices for the selected site
  const [devices, setDevices] = useState<DeviceResult[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [deviceId, setDeviceId] = useState<number | null>(null)

  // Per-site WAN configuration override (auto = infer from gateway model)
  const [wanMode, setWanMode] = useState<'auto' | 'single_wan' | 'failover_capable'>('auto')
  const [savingMode, setSavingMode] = useState(false)

  // Window + overrides
  const [days, setDays] = useState(90)
  const [customer, setCustomer] = useState('')
  const [site, setSite] = useState('')
  const [address, setAddress] = useState('')
  const [gateway, setGateway] = useState('')
  const [isp, setIsp] = useState('')
  const [publicIp, setPublicIp] = useState('')

  // Status
  const [origin, setOrigin] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  // Live site typeahead (debounced). Skips when a site is already selected.
  useEffect(() => {
    if (selectedSite) {
      setSiteResults([])
      return
    }
    const term = siteQuery.trim()
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const url = term.length >= 1 ? `/api/reports/wan-reliability/sites?q=${encodeURIComponent(term)}` : '/api/reports/wan-reliability/sites'
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error('site search failed')
        const data = await res.json()
        setSiteResults(Array.isArray(data.sites) ? data.sites : [])
        setShowResults(true)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSiteResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [siteQuery, selectedSite])

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Load devices when a site is selected.
  useEffect(() => {
    if (!selectedSite) {
      setDevices([])
      return
    }
    const controller = new AbortController()
    setLoadingDevices(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/reports/wan-reliability/sites?agentId=${selectedSite.id}`, { signal: controller.signal })
        if (!res.ok) throw new Error('device load failed')
        const data = await res.json()
        const list: DeviceResult[] = Array.isArray(data.devices) ? data.devices : []
        setDevices(list)
        setWanMode(data.wanMode === 'single_wan' || data.wanMode === 'failover_capable' ? data.wanMode : 'auto')
        // Auto-select the likely WAN gateway and prefill the gateway/device fields.
        const gw = list.find((d) => d.likelyGateway) ?? null
        if (gw) {
          setDeviceId(gw.id)
          setGateway([gw.vendor, gw.model].filter(Boolean).join(' ').trim())
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setDevices([])
      } finally {
        setLoadingDevices(false)
      }
    })()
    return () => controller.abort()
  }, [selectedSite])

  const pickSite = (s: SiteResult) => {
    setSelectedSite(s)
    setSiteQuery(s.name)
    setShowResults(false)
    setDeviceId(null)
    // Prefill site metadata from Domotz (all editable).
    setCustomer((prev) => prev || s.name)
    setSite(s.name)
    setPublicIp(s.publicIp ?? '')
    setIsp(s.ispHint ?? '')
  }

  const clearSite = () => {
    setSelectedSite(null)
    setSiteQuery('')
    setDevices([])
    setDeviceId(null)
    setWanMode('auto')
  }

  // Persist the per-site WAN configuration override (drives the failover caveat).
  const saveWanMode = async (mode: 'auto' | 'single_wan' | 'failover_capable') => {
    if (!selectedSite) return
    setWanMode(mode)
    setSavingMode(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/wan-reliability/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedSite.id, wanMode: mode }),
      })
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(msg.error || `HTTP ${res.status}`)
      }
    } catch (err) {
      setError(`Could not save WAN configuration: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSavingMode(false)
    }
  }

  const buildUrl = useCallback(
    (format: 'json' | 'markdown' | 'text' | 'html', download = false): string => {
      if (!selectedSite) return ''
      const p = new URLSearchParams()
      p.set('agentId', String(selectedSite.id))
      if (deviceId != null) p.set('deviceId', String(deviceId))
      p.set('days', String(days))
      p.set('format', format)
      if (download) p.set('download', '1')
      if (customer.trim()) p.set('customer', customer.trim())
      if (site.trim()) p.set('site', site.trim())
      if (address.trim()) p.set('address', address.trim())
      if (gateway.trim()) p.set('gateway', gateway.trim())
      if (isp.trim()) p.set('isp', isp.trim())
      if (publicIp.trim()) p.set('publicIp', publicIp.trim())
      const selectedDevice = devices.find((d) => d.id === deviceId)
      if (selectedDevice) p.set('device', selectedDevice.name)
      return `${origin}/api/reports/wan-reliability?${p.toString()}`
    },
    [selectedSite, deviceId, days, customer, site, address, gateway, isp, publicIp, devices, origin],
  )

  const canRun = !!selectedSite && origin.length > 0

  const openReport = () => {
    const url = buildUrl('html')
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Fetch a format and trigger a file download (keeps the staff-session cookie).
  const downloadFormat = async (format: 'markdown' | 'json' | 'text') => {
    if (!canRun) return
    setError(null)
    setBusy(format)
    try {
      const res = await fetch(buildUrl(format))
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(msg.error || `HTTP ${res.status}`)
      }
      const text = await res.text()
      const ext = format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt'
      const slug = (customer || selectedSite?.name || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      triggerDownload(text, `wan-reliability-${slug}.${ext}`, format === 'json' ? 'application/json' : 'text/plain')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const copyText = async () => {
    if (!canRun) return
    setError(null)
    setBusy('copy')
    try {
      const res = await fetch(buildUrl('text'))
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(msg.error || `HTTP ${res.status}`)
      }
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-1">Generate Site Connectivity &amp; Stability Report</h2>
        <p className="text-sm text-slate-400 mb-4">
          Pulls full-site connectivity, uptime, latency and packet loss live from Domotz, plus failover events from
          ingested Domotz webhooks. Times are shown in US Eastern.{' '}
          <span className="text-slate-300">
            At a site with WAN failover, primary-circuit outages can be masked — the report says so rather than implying
            the ISP circuit is healthy. Set the WAN configuration below so it knows.
          </span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Site typeahead */}
          <div className="lg:col-span-2" ref={boxRef}>
            <label className="block text-sm font-medium text-slate-400 mb-1">Site (Domotz collector)</label>
            <div className="relative">
              <input
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                placeholder="Search monitored sites…"
                value={siteQuery}
                onChange={(e) => {
                  setSelectedSite(null)
                  setSiteQuery(e.target.value)
                }}
                onFocus={() => setShowResults(true)}
                autoComplete="off"
              />
              {selectedSite && (
                <button onClick={clearSite} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-300 text-xs">
                  ✕ clear
                </button>
              )}
              {showResults && !selectedSite && (
                <div className="absolute z-20 mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {searching && siteResults.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>
                  ) : siteResults.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">No sites found.</div>
                  ) : (
                    siteResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => pickSite(s)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-cyan-500/10 hover:text-cyan-300 transition-colors"
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-slate-500 ml-2">
                          {s.status ?? '—'}
                          {s.publicIp ? ` · ${s.publicIp}` : ''}
                          {s.ispHint ? ` · ${s.ispHint}` : ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Device */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Monitored device (optional)</label>
            <select
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              value={deviceId ?? ''}
              disabled={!selectedSite || loadingDevices}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null
                setDeviceId(id)
                const d = devices.find((x) => x.id === id)
                if (d) setGateway([d.vendor, d.model].filter(Boolean).join(' ').trim())
              }}
            >
              <option value="">{loadingDevices ? 'Loading…' : 'Circuit (collector connectivity)'}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.likelyGateway ? '★ ' : ''}
                  {d.name}
                  {d.model ? ` (${d.model})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Window */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Reporting period</label>
            <select
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* WAN configuration (drives the failover-masking caveat) */}
        {selectedSite && (
          <div className="mt-4 bg-slate-900/40 border border-slate-700 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-sm font-medium text-slate-300 whitespace-nowrap">WAN configuration</label>
              <select
                className="bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                value={wanMode}
                disabled={savingMode}
                onChange={(e) => saveWanMode(e.target.value as 'auto' | 'single_wan' | 'failover_capable')}
              >
                <option value="auto">Auto-detect from gateway model</option>
                <option value="single_wan">Single-WAN (no failover) — enable ISP SLA verdict</option>
                <option value="failover_capable">Has WAN failover (dual-WAN / cellular)</option>
              </select>
              <p className="text-xs text-slate-500">
                {wanMode === 'single_wan'
                  ? 'Connectivity is treated as a valid ISP-circuit proxy; SLA pass/fail is shown.'
                  : wanMode === 'failover_capable'
                    ? 'Report will warn that primary-circuit outages may be masked by failover.'
                    : 'Inferred from the gateway; defaults to showing the failover caveat unless confirmed single-WAN.'}
              </p>
            </div>
          </div>
        )}

        {/* Failover detection setup */}
        <details className="mt-3 group">
          <summary className="cursor-pointer text-sm text-cyan-400 hover:text-cyan-300">
            Enable failover detection (Domotz webhook setup)
          </summary>
          <div className="mt-2 text-xs text-slate-400 space-y-1 bg-slate-900/40 border border-slate-700 rounded-lg p-4">
            <p>
              Failover events (primary-circuit drops) are detected from Domotz <code className="text-slate-300">agent_wan_change</code>{' '}
              webhooks, which Domotz only pushes — they can&apos;t be pulled historically. To turn this on, one-time per Domotz account:
            </p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Domotz Portal → Account → Webhooks: add a webhook channel to <code className="text-slate-300">https://www.triplecitiestech.com/api/webhooks/domotz?token=&lt;DOMOTZ_WEBHOOK_TOKEN&gt;</code></li>
              <li>Bind an Alert Profile to your collectors covering &quot;WAN/Public IP changed&quot; and &quot;Collector up/down&quot;.</li>
              <li>Set <code className="text-slate-300">DOMOTZ_WEBHOOK_TOKEN</code> in Vercel to the same token value.</li>
            </ol>
            <p>Until enabled, the report clearly states failover detection is unavailable for the site.</p>
          </div>
        </details>

        {/* Site-info overrides */}
        <details className="mt-4 group">
          <summary className="cursor-pointer text-sm text-cyan-400 hover:text-cyan-300">Site details (customer, address, ISP)</summary>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            <Field label="Customer" value={customer} onChange={setCustomer} placeholder="Customer name" />
            <Field label="Site" value={site} onChange={setSite} placeholder="Site name" />
            <Field label="Address" value={address} onChange={setAddress} placeholder="Street, City, ST" />
            <Field label="Gateway" value={gateway} onChange={setGateway} placeholder="e.g. Cisco Meraki MX68CW" />
            <Field label="ISP" value={isp} onChange={setIsp} placeholder="e.g. Frontier Communications" />
            <Field label="Public IP" value={publicIp} onChange={setPublicIp} placeholder="e.g. 50.107.49.134" />
          </div>
        </details>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <button
            onClick={openReport}
            disabled={!canRun}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
          >
            Generate Report
          </button>
          <button onClick={() => downloadFormat('markdown')} disabled={!canRun || !!busy} className={btn}>
            {busy === 'markdown' ? '…' : 'Export Markdown'}
          </button>
          <button onClick={() => downloadFormat('json')} disabled={!canRun || !!busy} className={btn}>
            {busy === 'json' ? '…' : 'Export JSON'}
          </button>
          <button onClick={() => downloadFormat('text')} disabled={!canRun || !!busy} className={btn}>
            {busy === 'text' ? '…' : 'Export TXT'}
          </button>
          <button onClick={copyText} disabled={!canRun || !!busy} className={btn}>
            {copied ? 'Copied!' : busy === 'copy' ? '…' : 'Copy to Clipboard'}
          </button>
          <button
            disabled
            title="PDF export is planned — print the HTML report to PDF in the meantime."
            className="bg-slate-800 text-slate-500 font-medium rounded-lg px-4 py-2 text-sm cursor-not-allowed border border-slate-700"
          >
            Export PDF (soon)
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-rose-400">Error: {error}</p>}
        {!selectedSite && <p className="mt-3 text-xs text-slate-500">Select a site to enable report generation.</p>}
      </div>

      {/* Shareable link */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-1">Shareable report link</h2>
        <p className="text-sm text-slate-400 mb-3">Opens the printable report. Recipients must be signed in to the admin portal — no secrets in the URL.</p>
        <input
          readOnly
          value={canRun ? buildUrl('html') : 'Choose a site above to generate a link…'}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full bg-slate-900 border border-slate-600 text-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
        />
      </div>
    </div>
  )
}

const btn =
  'bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors'

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <input
        className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  )
}

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
