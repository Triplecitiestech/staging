'use client'

/**
 * Client-side manager for /admin/compliance/test-tenant.
 *
 * Two panels:
 *   1. Active test tenants — each row has a "Reset to clean slate" button
 *      that opens a confirmation modal requiring the operator to type the
 *      slug before POST /api/compliance/test-tenant/reset fires.
 *   2. Recent companies — search + filter, with a toggle to flag/unflag
 *      isTestTenant via POST /api/compliance/test-tenant/flag.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface CompanyRow {
  id: string
  slug: string
  displayName: string
  isTestTenant: boolean
  m365SetupStatus: string | null
  m365ConsentMode: string | null
  onboardingCompletedAt: string | null
}

interface Props {
  testTenants: CompanyRow[]
  recentCompanies: CompanyRow[]
}

export default function TestTenantManager({ testTenants, recentCompanies }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [resetTarget, setResetTarget] = useState<CompanyRow | null>(null)
  const [confirmSlug, setConfirmSlug] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [flagBusyId, setFlagBusyId] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const filteredRecent = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recentCompanies
    return recentCompanies.filter(
      (c) =>
        c.slug.toLowerCase().includes(q) ||
        c.displayName.toLowerCase().includes(q)
    )
  }, [recentCompanies, search])

  async function toggleFlag(company: CompanyRow, next: boolean) {
    setFlagBusyId(company.id)
    setLastError(null)
    setLastResult(null)
    try {
      const r = await fetch('/api/compliance/test-tenant/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id, isTestTenant: next }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setLastError(data?.error || `Flag failed (HTTP ${r.status})`)
        return
      }
      setLastResult(
        next
          ? `Flagged "${company.displayName}" as a test tenant.`
          : `Removed test-tenant flag from "${company.displayName}".`
      )
      router.refresh()
    } finally {
      setFlagBusyId(null)
    }
  }

  async function performReset() {
    if (!resetTarget) return
    setResetBusy(true)
    setLastError(null)
    setLastResult(null)
    try {
      const r = await fetch('/api/compliance/test-tenant/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: resetTarget.id, confirmSlug }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setLastError(data?.error || `Reset failed (HTTP ${r.status})`)
        return
      }
      const totalRows = Array.isArray(data?.wiped)
        ? data.wiped.reduce((sum: number, row: { rows: number }) => sum + (row.rows ?? 0), 0)
        : 0
      setLastResult(
        `Reset "${resetTarget.displayName}" — ${totalRows} row(s) wiped across ${data?.wiped?.length ?? 0} table(s).`
      )
      setResetTarget(null)
      setConfirmSlug('')
      router.refresh()
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <>
      {(lastResult || lastError) && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            lastError
              ? 'bg-rose-950/40 border-rose-500/30 text-rose-200'
              : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
          }`}
        >
          {lastError ?? lastResult}
        </div>
      )}

      {/* Active test tenants */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          Active test tenants ({testTenants.length})
        </h2>
        {testTenants.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">
            No companies are flagged as test tenants yet. Use the search panel
            below to flag one.
          </p>
        ) : (
          <ul className="space-y-2">
            {testTenants.map((c) => (
              <li
                key={c.id}
                className="bg-slate-800/40 border border-white/5 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/compliance/${c.id}`}
                      className="text-sm font-medium text-white hover:text-cyan-300 truncate"
                    >
                      {c.displayName}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      {c.slug}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    M365: <span className="text-slate-300">{c.m365SetupStatus || 'not_configured'}</span>
                    {' · '}
                    Mode: <span className="text-slate-300">{c.m365ConsentMode || 'legacy'}</span>
                    {c.onboardingCompletedAt && (
                      <>
                        {' · '}
                        Onboarded: <span className="text-slate-300">{new Date(c.onboardingCompletedAt).toLocaleDateString()}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleFlag(c, false)}
                    disabled={flagBusyId === c.id}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700/40 border border-white/10 text-slate-300 hover:bg-slate-700/60 disabled:opacity-50"
                  >
                    {flagBusyId === c.id ? '...' : 'Unflag'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(c)
                      setConfirmSlug('')
                      setLastError(null)
                      setLastResult(null)
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 hover:bg-rose-500/20"
                  >
                    Reset to clean slate →
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Search + flag */}
      <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
          Flag a company as a test tenant
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company name or slug…"
          className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
        />
        <ul className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
          {filteredRecent.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 bg-slate-800/30 border border-white/5 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{c.displayName}</p>
                <p className="text-[11px] text-slate-500 truncate">{c.slug}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFlag(c, !c.isTestTenant)}
                disabled={flagBusyId === c.id}
                className={`shrink-0 px-3 py-1 text-xs font-medium rounded-lg border disabled:opacity-50 ${
                  c.isTestTenant
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20'
                    : 'bg-slate-700/40 border-white/10 text-slate-300 hover:bg-slate-700/60'
                }`}
              >
                {flagBusyId === c.id
                  ? '...'
                  : c.isTestTenant
                  ? 'Test tenant ✓'
                  : 'Mark as test tenant'}
              </button>
            </li>
          ))}
          {filteredRecent.length === 0 && (
            <li className="text-xs text-slate-500 px-3 py-4 text-center">No matches.</li>
          )}
        </ul>
      </section>

      {/* Confirm modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !resetBusy && setResetTarget(null)}
        >
          <div
            className="bg-slate-900 border border-rose-500/40 rounded-xl p-5 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">
              Reset &quot;{resetTarget.displayName}&quot;?
            </h3>
            <p className="text-sm text-slate-400 mt-2">
              This will wipe all compliance data, M365 consent state, customer
              profile, contacts, and onboarding state. The Company row, slug,
              and Autotask link stay intact so the wizard restarts at step 1.
            </p>
            <p className="text-sm text-slate-300 mt-3">
              Type <code className="bg-slate-800 px-1.5 py-0.5 rounded text-rose-300">{resetTarget.slug}</code> to confirm:
            </p>
            <input
              type="text"
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              placeholder={resetTarget.slug}
              autoFocus
              className="mt-2 w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-rose-500/50 focus:outline-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                disabled={resetBusy}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/40 border border-white/10 text-slate-300 hover:bg-slate-800/60 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performReset}
                disabled={resetBusy || confirmSlug.trim() !== resetTarget.slug}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-100 hover:bg-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetBusy ? 'Resetting…' : 'Reset now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
