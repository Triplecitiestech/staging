'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type MatchStatus =
  | 'ready'
  | 'already_invited'
  | 'already_active'
  | 'declined'
  | 'inactive'
  | 'no_match'
  | 'ambiguous'

interface ContactMatch {
  contactId: string
  contactName: string
  contactRole: string
  inviteStatus: string
  invitedAt: string | null
  inviteAcceptedAt: string | null
  companyId: string
  companyName: string
  companySlug: string
}

interface MatchedRow {
  rowIndex: number
  email: string
  lastLoginIso: string | null
  daysSinceLogin: number | null
  csvName: string | null
  csvCompanyHint: string | null
  status: MatchStatus
  matches: ContactMatch[]
}

interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

interface ColumnMapping {
  email: number | null
  lastLogin: number | null
  name: number | null
  firstName: number | null
  lastName: number | null
  company: number | null
}

const STORAGE_KEY = 'portal_migration_v1'

// ─────────────────────────────────────────────────────────────────────────────
// Delimited parser — handles quoted fields, escaped quotes (""), CRLF/LF/CR
// endings, BOM, tab vs comma auto-detection, and skips Autotask report
// preamble (title / date-range / generated-at lines before the real header).
// ─────────────────────────────────────────────────────────────────────────────
function detectDelimiter(text: string): ',' | '\t' {
  const sample = text.split(/\r?\n/).slice(0, 30).join('\n')
  const tabs = (sample.match(/\t/g) || []).length
  const commas = (sample.match(/,/g) || []).length
  return tabs > commas ? '\t' : ','
}

const HEADER_TOKEN_HINTS = [
  'email', 'emailaddress', 'username', 'user', 'login', 'logindate',
  'lastlogin', 'lastlogindate', 'name', 'fullname', 'firstname', 'lastname',
  'company', 'companyname', 'account', 'accountname',
]

function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuote = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"' && field === '') {
        inQuote = true
      } else if (c === delimiter) {
        row.push(field)
        field = ''
      } else if (c === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else if (c === '\r') {
        if (text[i + 1] !== '\n') {
          row.push(field)
          rows.push(row)
          row = []
          field = ''
        }
      } else {
        field += c
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function findHeaderIndex(rows: string[][]): number {
  // The real header row has 2+ recognisable column-name tokens (email/username/etc.)
  // Earlier rows are report metadata (title, date range, "generated at" stamp).
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    let hits = 0
    for (const cell of rows[i]) {
      const n = norm(cell)
      if (HEADER_TOKEN_HINTS.includes(n)) hits++
    }
    if (hits >= 2) return i
  }
  return 0
}

function parseCsv(text: string): ParsedCsv | null {
  if (!text) return null
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const delim = detectDelimiter(text)
  const allRows = parseDelimited(text, delim)
  if (allRows.length === 0) return null

  const headerIdx = findHeaderIndex(allRows)
  const headerRow = allRows[headerIdx]
  const dataRows = allRows.slice(headerIdx + 1).filter((r) => r.length >= headerRow.length - 2)
  if (dataRows.length === 0 && allRows.length > headerIdx + 1) {
    // header detection probably wrong — fall back to first row as headers
    return { headers: allRows[0].map((h) => h.trim()), rows: allRows.slice(1) }
  }

  return { headers: headerRow.map((h) => h.trim()), rows: dataRows }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function autoDetectColumns(headers: string[]): ColumnMapping {
  const findIdx = (patterns: string[]) => {
    for (let i = 0; i < headers.length; i++) {
      const h = norm(headers[i])
      if (patterns.includes(h)) return i
    }
    return null
  }
  return {
    // Autotask's Client Portal Log uses "Username" — which is the email — as the user id.
    email: findIdx(['email', 'emailaddress', 'useremail', 'loginemail', 'mail', 'username', 'user']),
    lastLogin: findIdx([
      'logindate',
      'lastlogin',
      'lastlogindate',
      'lastlogindatetime',
      'lastsignin',
      'lastactivity',
      'lastloginat',
      'lastloggedin',
      'logintime',
    ]),
    name: findIdx(['name', 'contactname', 'fullname']),
    firstName: findIdx(['firstname', 'first']),
    lastName: findIdx(['lastname', 'surname', 'last']),
    company: findIdx(['company', 'companyname', 'account', 'accountname', 'organization', 'organisation']),
  }
}

function tryParseDate(raw: string | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v || /^never$/i.test(v) || v === '-' || v === '—') return null
  const isoMs = Date.parse(v)
  if (!Number.isNaN(isoMs)) return new Date(isoMs).toISOString()
  // US format: M/D/YYYY [H:MM[:SS] [AM/PM]]
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/)
  if (m) {
    const [, mo, d, y, hh, mm, ss, ap] = m
    let yr = parseInt(y, 10)
    if (yr < 100) yr += 2000
    let hour = hh ? parseInt(hh, 10) : 0
    if (ap) {
      const isPm = ap.toUpperCase() === 'PM'
      if (isPm && hour < 12) hour += 12
      if (!isPm && hour === 12) hour = 0
    }
    const dt = new Date(Date.UTC(yr, parseInt(mo, 10) - 1, parseInt(d, 10), hour, mm ? parseInt(mm, 10) : 0, ss ? parseInt(ss, 10) : 0))
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }
  return null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

const statusLabels: Record<MatchStatus, { label: string; color: string }> = {
  ready: { label: 'Ready to invite', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  already_invited: { label: 'Already invited', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  already_active: { label: 'On new portal', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  declined: { label: 'Invite declined', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  inactive: { label: 'Contact inactive', color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  no_match: { label: 'Not in our DB', color: 'bg-red-500/15 text-red-300 border-red-500/30' },
  ambiguous: { label: 'Multiple matches', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
}

interface InputRow {
  email: string
  lastLoginIso: string | null
  name: string | null
  companyHint: string | null
  rowIndex: number
}

export default function PortalMigrationClient() {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [matched, setMatched] = useState<MatchedRow[] | null>(null)
  const [matching, setMatching] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterDays, setFilterDays] = useState<number>(60)
  const [includeNever, setIncludeNever] = useState(false)
  const [includeStale, setIncludeStale] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Set<MatchStatus>>(new Set<MatchStatus>(['ready']))
  const [fileName, setFileName] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.parsed) setParsed(data.parsed)
      if (data.mapping) setMapping(data.mapping)
      if (data.matched) setMatched(data.matched)
      if (data.fileName) setFileName(data.fileName)
    } catch {
      /* ignore */
    }
  }, [])

  // Persist on changes
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ parsed, mapping, matched, fileName })
      )
    } catch {
      /* quota or disabled — silently skip */
    }
  }, [parsed, mapping, matched, fileName])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setSendResult(null)
    setSelected(new Set())
    setMatched(null)
    const text = await file.text()
    const result = parseCsv(text)
    if (!result || result.headers.length === 0) {
      setError('Could not parse CSV. Make sure the first row is column headers.')
      return
    }
    setFileName(file.name)
    setParsed(result)
    setMapping(autoDetectColumns(result.headers))
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const inputRows: InputRow[] | null = useMemo(() => {
    if (!parsed || !mapping) return null
    if (mapping.email === null) return null
    const raw = parsed.rows.map((row, idx) => {
      const get = (col: number | null) => (col !== null ? (row[col] ?? '').trim() : '')
      const email = get(mapping.email)
      const lastLoginRaw = get(mapping.lastLogin)
      const first = get(mapping.firstName)
      const last = get(mapping.lastName)
      const fullName = get(mapping.name) || `${first} ${last}`.trim()
      const company = get(mapping.company)
      return {
        rowIndex: idx,
        email,
        lastLoginIso: tryParseDate(lastLoginRaw),
        name: fullName || null,
        companyHint: company || null,
      }
    })

    // Dedupe by email (case-insensitive): keep the row with the latest parsed login.
    // Autotask's Client Portal Log is event-style — multiple rows per user — so this
    // collapses to one entry per unique customer.
    const byEmail = new Map<string, InputRow>()
    for (const r of raw) {
      const key = r.email.trim().toLowerCase()
      if (!key || !key.includes('@')) continue
      const existing = byEmail.get(key)
      if (!existing) {
        byEmail.set(key, r)
        continue
      }
      const eMs = existing.lastLoginIso ? Date.parse(existing.lastLoginIso) : -Infinity
      const rMs = r.lastLoginIso ? Date.parse(r.lastLoginIso) : -Infinity
      if (rMs > eMs) byEmail.set(key, r)
    }
    return Array.from(byEmail.values()).sort((a, b) => {
      const aMs = a.lastLoginIso ? Date.parse(a.lastLoginIso) : 0
      const bMs = b.lastLoginIso ? Date.parse(b.lastLoginIso) : 0
      return bMs - aMs
    })
  }, [parsed, mapping])

  const runMatch = useCallback(async () => {
    if (!inputRows) return
    setMatching(true)
    setError(null)
    setSendResult(null)
    setSelected(new Set())
    try {
      const res = await fetch('/api/admin/portal-migration/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: inputRows }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || `Match failed (${res.status})`)
        return
      }
      setMatched(data.rows as MatchedRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Match request failed')
    } finally {
      setMatching(false)
    }
  }, [inputRows])

  const visibleRows = useMemo(() => {
    if (!matched) return []
    return matched.filter((row) => {
      if (!statusFilter.has(row.status)) return false
      const d = row.daysSinceLogin
      if (d === null) return includeNever
      if (d <= filterDays) return true
      return includeStale
    })
  }, [matched, statusFilter, filterDays, includeNever, includeStale])

  const selectableContactIds = useMemo(() => {
    const ids: string[] = []
    for (const r of visibleRows) {
      if (r.status === 'ready' || r.status === 'already_invited' || r.status === 'declined') {
        for (const m of r.matches) ids.push(m.contactId)
      }
    }
    return ids
  }, [visibleRows])

  const allSelected = selectableContactIds.length > 0 && selectableContactIds.every((id) => selected.has(id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableContactIds))
    }
  }

  const toggleOne = (contactId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(contactId)) next.delete(contactId)
      else next.add(contactId)
      return next
    })
  }

  const sendInvites = useCallback(async () => {
    if (selected.size === 0) return
    if (!confirm(`Send portal invite emails to ${selected.size} contact${selected.size === 1 ? '' : 's'}?`)) return
    setSending(true)
    setError(null)
    setSendResult(null)
    try {
      const res = await fetch('/api/contacts/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || `Invite send failed (${res.status})`)
        return
      }
      setSendResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 })
      // Re-match to refresh status badges
      await runMatch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite request failed')
    } finally {
      setSending(false)
    }
  }, [selected, runMatch])

  const clearAll = () => {
    if (!confirm('Clear the loaded CSV and all matches?')) return
    setParsed(null)
    setMapping(null)
    setMatched(null)
    setSelected(new Set())
    setFileName(null)
    setError(null)
    setSendResult(null)
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const counts = useMemo(() => {
    const c: Record<MatchStatus, number> = {
      ready: 0,
      already_invited: 0,
      already_active: 0,
      declined: 0,
      inactive: 0,
      no_match: 0,
      ambiguous: 0,
    }
    if (matched) for (const r of matched) c[r.status]++
    return c
  }, [matched])

  return (
    <div className="space-y-6">
      {/* Step 1: Upload, paste, or pull from Autotask */}
      {!parsed && !matched && (
        <UploadStep
          onDrop={onDrop}
          onFileChange={onFileChange}
          onPaste={(text) => {
            const result = parseCsv(text)
            if (!result || result.headers.length === 0) {
              setError('Could not parse pasted text. Make sure it includes a header row.')
              return
            }
            setError(null)
            setFileName('(pasted)')
            setParsed(result)
            setMapping(autoDetectColumns(result.headers))
          }}
          onAutotaskPull={async () => {
            setMatching(true)
            setError(null)
            setSendResult(null)
            setSelected(new Set())
            setFileName('(Autotask Client Access Portal — live)')
            try {
              const res = await fetch('/api/admin/portal-migration/old-portal-users')
              const data = await res.json()
              if (!res.ok) {
                setError(data?.error || `Autotask pull failed (${res.status})`)
                return
              }
              setMatched(data.rows as MatchedRow[])
              // Autotask doesn't expose last-login via API — every row has lastLoginIso = null.
              // Auto-enable the "include never-logged-in" toggle so the table isn't empty by default.
              setIncludeNever(true)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Autotask pull failed')
            } finally {
              setMatching(false)
            }
          }}
          autotaskPulling={matching}
          error={error}
          fileInputRef={fileInputRef}
        />
      )}

      {/* Step 2: Column mapping + Match */}
      {parsed && mapping && !matched && (
        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-white">Confirm column mapping</h2>
              <p className="text-sm text-slate-400 mt-1">
                Loaded <span className="text-slate-200 font-medium">{fileName}</span> &mdash; {parsed.rows.length} rows. Auto-detected mapping shown below; override if needed.
              </p>
            </div>
            <button onClick={clearAll} className="text-sm text-slate-400 hover:text-white">
              Upload different file
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(
              [
                ['email', 'Email', true],
                ['lastLogin', 'Last login', true],
                ['name', 'Full name', false],
                ['firstName', 'First name', false],
                ['lastName', 'Last name', false],
                ['company', 'Company', false],
              ] as const
            ).map(([key, label, required]) => (
              <label key={key} className="block">
                <span className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
                  {label} {required && <span className="text-rose-400">*</span>}
                </span>
                <select
                  value={mapping[key] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setMapping((m) => (m ? { ...m, [key]: v === '' ? null : parseInt(v, 10) } : m))
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="">— Not in CSV —</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `(column ${i + 1})`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
            <p className="text-xs text-slate-500">
              {mapping.email === null
                ? 'Email column is required to match against our contact database.'
                : `${inputRows?.filter((r) => r.email && r.email.includes('@')).length ?? 0} valid email rows ready to match.`}
            </p>
            <button
              onClick={runMatch}
              disabled={mapping.email === null || matching}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-semibold rounded-lg transition"
            >
              {matching ? 'Matching…' : 'Match against contacts →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Matched results */}
      {matched && (
        <>
          <div className="bg-slate-800/50 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-white">Matched results</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {matched.length} CSV rows &middot; {fileName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={runMatch}
                  disabled={matching}
                  className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                >
                  {matching ? 'Refreshing…' : 'Re-match'}
                </button>
                <button onClick={clearAll} className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
                  Start over
                </button>
              </div>
            </div>

            {/* Status counts + filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {(Object.keys(statusLabels) as MatchStatus[]).map((s) => {
                const cfg = statusLabels[s]
                const active = statusFilter.has(s)
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setStatusFilter((prev) => {
                        const next = new Set(prev)
                        if (next.has(s)) next.delete(s)
                        else next.add(s)
                        return next
                      })
                    }}
                    className={`px-3 py-2 rounded-lg border text-xs text-left transition ${
                      active ? cfg.color : 'bg-slate-900/40 border-white/5 text-slate-500'
                    }`}
                  >
                    <div className="font-semibold">{counts[s]}</div>
                    <div className="text-[11px] truncate">{cfg.label}</div>
                  </button>
                )
              })}
            </div>

            {/* Date filter */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/5">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <span>Last login within</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={filterDays}
                  onChange={(e) => setFilterDays(Math.max(1, parseInt(e.target.value || '60', 10)))}
                  className="w-20 bg-slate-900 border border-white/10 rounded px-2 py-1 text-white"
                />
                <span>days</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeNever}
                  onChange={(e) => setIncludeNever(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                Include never-logged-in
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStale}
                  onChange={(e) => setIncludeStale(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500"
                />
                Include stale ({'>'}
                {filterDays} days)
              </label>
              <span className="text-xs text-slate-500 ml-auto">{visibleRows.length} rows visible</span>
            </div>

            {/* Bulk actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5">
              <button
                onClick={toggleAll}
                disabled={selectableContactIds.length === 0}
                className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg"
              >
                {allSelected ? 'Unselect all' : `Select all invitable (${selectableContactIds.length})`}
              </button>
              <button
                onClick={sendInvites}
                disabled={selected.size === 0 || sending}
                className="px-4 py-1.5 text-sm bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-semibold rounded-lg"
              >
                {sending ? 'Sending…' : `Send invite to ${selected.size} selected`}
              </button>
              {sendResult && (
                <span className="text-sm text-slate-300">
                  Last batch: <span className="text-emerald-300">{sendResult.sent} sent</span>
                  {sendResult.failed > 0 && (
                    <>
                      {' · '}
                      <span className="text-rose-300">{sendResult.failed} failed</span>
                    </>
                  )}
                </span>
              )}
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-800/50 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/50 border-b border-white/10">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3 w-10"></th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Name / Company</th>
                    <th className="px-3 py-3">Last login (old portal)</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-12 text-center text-slate-400">
                        No rows match the current filters. Toggle status pills or adjust the date filter.
                      </td>
                    </tr>
                  )}
                  {visibleRows.map((row) => (
                    <RowDisplay
                      key={`${row.rowIndex}-${row.email}`}
                      row={row}
                      selected={selected}
                      onToggle={toggleOne}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function UploadStep({
  onDrop,
  onFileChange,
  onPaste,
  onAutotaskPull,
  autotaskPulling,
  error,
  fileInputRef,
}: {
  onDrop: (e: React.DragEvent) => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPaste: (text: string) => void
  onAutotaskPull: () => void | Promise<void>
  autotaskPulling: boolean
  error: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
}) {
  const [mode, setMode] = useState<'autotask' | 'file' | 'paste'>('autotask')
  const [pastedText, setPastedText] = useState('')

  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-2">Build the outreach list</h2>
      <p className="text-sm text-slate-400 mb-5 max-w-2xl">
        Pull every active legacy-portal user live from Autotask (most complete), or upload / paste a Client Portal Log export when you want a specific date window. Either way you&rsquo;ll land in the same review table.
      </p>

      <div className="flex gap-2 mb-4 border-b border-white/5 flex-wrap">
        <button
          onClick={() => setMode('autotask')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            mode === 'autotask' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Pull from Autotask
        </button>
        <button
          onClick={() => setMode('file')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            mode === 'file' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Upload file
        </button>
        <button
          onClick={() => setMode('paste')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            mode === 'paste' ? 'border-cyan-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Paste data
        </button>
      </div>

      {mode === 'autotask' ? (
        <div className="border-2 border-dashed border-white/15 rounded-xl p-10 text-center">
          <svg className="w-10 h-10 mx-auto text-slate-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
            Queries <span className="text-slate-300">ClientPortalUsers</span> in Autotask and joins to your local contacts via <span className="text-slate-300">autotaskContactId</span>. Returns everyone who has legacy-portal access today, with their new-portal invite status.
          </p>
          <button
            onClick={() => onAutotaskPull()}
            disabled={autotaskPulling}
            className="inline-block px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-semibold rounded-lg transition"
          >
            {autotaskPulling ? 'Querying Autotask…' : 'Pull live portal users'}
          </button>
          <p className="text-xs text-slate-500 mt-4">
            No date filter — returns every active portal user. Use upload/paste below for a recent-logins-only list.
          </p>
        </div>
      ) : mode === 'file' ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-white/15 rounded-xl p-10 text-center"
        >
          <svg className="w-10 h-10 mx-auto text-slate-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9 5 5 0 019.9-1A5.5 5.5 0 0118.5 16H17m-5-5v9m0 0l-3-3m3 3l3-3" />
          </svg>
          <p className="text-sm text-slate-400 mb-4">Drop a CSV here or pick a file</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,.txt,.tsv,text/plain,text/tab-separated-values"
            onChange={onFileChange}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className="inline-block px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg cursor-pointer transition"
          >
            Choose file
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={'Paste the Autotask Client Portal Log here. Example:\n\nUsername\tFull Name\tCompany Name\tLogin Date\tIP Address\nuser@example.com\tDoe, Jane\tExample Co\t05/20/2026 12:28 PM\t1.2.3.4'}
            rows={10}
            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-cyan-400 focus:outline-none"
          />
          <button
            onClick={() => pastedText.trim() && onPaste(pastedText)}
            disabled={!pastedText.trim()}
            className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-semibold rounded-lg transition"
          >
            Parse pasted data
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
    </div>
  )
}

function RowDisplay({
  row,
  selected,
  onToggle,
}: {
  row: MatchedRow
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  const cfg = statusLabels[row.status]
  const invitable = row.status === 'ready' || row.status === 'already_invited' || row.status === 'declined'
  const primaryMatch = row.matches[0]

  return (
    <tr className="hover:bg-slate-900/30 transition">
      <td className="px-3 py-3 align-top">
        {invitable && primaryMatch && row.matches.length === 1 ? (
          <input
            type="checkbox"
            checked={selected.has(primaryMatch.contactId)}
            onChange={() => onToggle(primaryMatch.contactId)}
            className="w-4 h-4 accent-cyan-500"
          />
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="text-white font-medium break-all">{row.email}</div>
        {row.csvName && <div className="text-xs text-slate-500 mt-0.5">CSV: {row.csvName}</div>}
      </td>
      <td className="px-3 py-3 align-top">
        {row.matches.length === 0 ? (
          <span className="text-slate-500 italic">{row.csvCompanyHint || '—'}</span>
        ) : (
          <div className="space-y-1">
            {row.matches.map((m) => (
              <div key={m.contactId}>
                <div className="text-slate-200">{m.contactName}</div>
                <div className="text-xs text-slate-500">
                  {m.companyName} &middot; {m.contactRole}
                </div>
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="text-slate-300">{formatDate(row.lastLoginIso)}</div>
        {row.daysSinceLogin !== null && (
          <div className="text-xs text-slate-500">
            {row.daysSinceLogin === 0 ? 'today' : `${row.daysSinceLogin}d ago`}
          </div>
        )}
      </td>
      <td className="px-3 py-3 align-top">
        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs border ${cfg.color}`}>{cfg.label}</span>
        {row.status === 'already_invited' && primaryMatch?.invitedAt && (
          <div className="text-xs text-slate-500 mt-1">on {formatDate(primaryMatch.invitedAt)}</div>
        )}
        {row.status === 'already_active' && primaryMatch?.inviteAcceptedAt && (
          <div className="text-xs text-slate-500 mt-1">since {formatDate(primaryMatch.inviteAcceptedAt)}</div>
        )}
        {row.status === 'ambiguous' && (
          <div className="text-xs text-slate-500 mt-1">{row.matches.length} contacts share this email — invite individually below.</div>
        )}
      </td>
      <td className="px-3 py-3 align-top text-right">
        {row.status === 'ambiguous' &&
          row.matches.map((m) => (
            <label key={m.contactId} className="block text-xs text-slate-400 mb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(m.contactId)}
                onChange={() => onToggle(m.contactId)}
                className="w-3.5 h-3.5 accent-cyan-500 mr-1.5"
              />
              {m.companyName}
            </label>
          ))}
      </td>
    </tr>
  )
}
