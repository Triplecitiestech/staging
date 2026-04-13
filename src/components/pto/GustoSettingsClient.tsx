'use client'

import { useCallback, useEffect, useState } from 'react'

interface StatusData {
  connected: boolean
  environment?: string
  companyName?: string | null
  companyUuid?: string | null
  tokenExpiresAt?: string
  scope?: string | null
  live?: {
    email?: string
    primaryCompany?: { uuid: string; name: string } | null
    error?: string
  }
}

interface Mapping {
  id: string
  staffUserId: string
  staffEmail: string
  gustoEmployeeUuid: string
  gustoName: string
  gustoWorkEmail: string | null
  gustoPersonalEmail: string | null
  matchMethod: string
  createdAt: string
}

interface UnmatchedStaff {
  id: string
  email: string
  name: string
}

interface UnmatchedGusto {
  uuid: string
  name: string
  workEmail: string | null
  personalEmail: string | null
}

interface MappingResponse {
  connected: boolean
  mappings: Mapping[]
  unmatchedStaff: UnmatchedStaff[]
  unmatchedGustoEmployees: UnmatchedGusto[]
}

export default function GustoSettingsClient({
  initialConnectedFlag,
  initialError,
}: {
  initialConnectedFlag: boolean
  initialError: string | null
}) {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [mappingData, setMappingData] = useState<MappingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<string | null>(
    initialConnectedFlag ? 'Connected to Gusto.' : null
  )
  const [actionError, setActionError] = useState<string | null>(initialError)

  const loadAll = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const [sRes, mRes] = await Promise.all([
        fetch('/api/admin/integrations/gusto/status', { signal }),
        fetch('/api/admin/integrations/gusto/mapping', { signal }),
      ])
      if (sRes.ok) setStatus(await sRes.json())
      if (mRes.ok) setMappingData(await mRes.json())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadAll(controller.signal)
    return () => controller.abort()
  }, [loadAll])

  const sync = async () => {
    setActing('sync')
    setActionError(null)
    try {
      const res = await fetch('/api/admin/integrations/gusto/sync-employees', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setActionError(data.error ?? 'Sync failed')
      } else {
        setLastAction(
          `Synced employees. Created ${data.created} new mappings, updated ${data.updated}.`
        )
      }
      await loadAll()
    } finally {
      setActing(null)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect Gusto? This disables balance lookups and sync for new approvals.')) return
    setActing('disconnect')
    try {
      await fetch('/api/admin/integrations/gusto/disconnect', { method: 'POST' })
      setLastAction('Disconnected.')
      await loadAll()
    } finally {
      setActing(null)
    }
  }

  const map = async (staffUserId: string, gustoEmployeeUuid: string) => {
    setActing(`map:${staffUserId}`)
    try {
      const res = await fetch('/api/admin/integrations/gusto/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffUserId, gustoEmployeeUuid }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Map failed')
      } else {
        setLastAction('Mapped.')
      }
      await loadAll()
    } finally {
      setActing(null)
    }
  }

  const unmap = async (staffUserId: string) => {
    if (!confirm('Remove this mapping?')) return
    setActing(`unmap:${staffUserId}`)
    try {
      await fetch(`/api/admin/integrations/gusto/mapping?staffUserId=${staffUserId}`, {
        method: 'DELETE',
      })
      setLastAction('Unmapped.')
      await loadAll()
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* Status card */}
      <section className="rounded-lg border border-white/10 bg-white/5 p-6">
        {loading && !status ? (
          <div className="h-12 bg-white/5 rounded animate-pulse" />
        ) : status?.connected ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <p className="text-sm font-semibold text-white">Connected</p>
                <span className="text-xs text-slate-400 uppercase tracking-wide ml-2">
                  {status.environment}
                </span>
              </div>
              <p className="text-sm text-slate-300">
                {status.companyName ?? status.live?.primaryCompany?.name ?? 'Unknown company'}
              </p>
              {status.companyUuid && (
                <p className="text-xs text-slate-500 font-mono mt-1">{status.companyUuid}</p>
              )}
              {status.tokenExpiresAt && (
                <p className="text-xs text-slate-500 mt-1">
                  Token expires: {new Date(status.tokenExpiresAt).toLocaleString()}
                </p>
              )}
              {status.live?.email && (
                <p className="text-xs text-slate-500 mt-1">Connected as: {status.live.email}</p>
              )}
              {status.live?.error && (
                <p className="text-xs text-rose-300 mt-1">Verify error: {status.live.error}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={sync}
                disabled={!!acting}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-400 disabled:opacity-50"
              >
                {acting === 'sync' ? 'Syncing…' : 'Sync employees'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={!!acting}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-400 disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <p className="text-sm font-semibold text-white">Not connected</p>
              </div>
              <p className="text-sm text-slate-400">
                Connect to Gusto (demo) to enable balance lookups and approval sync.
              </p>
            </div>
            <a
              href="/api/admin/integrations/gusto/authorize"
              className="px-5 py-2.5 rounded-lg bg-cyan-500 text-white font-semibold hover:bg-cyan-400"
            >
              Connect Gusto
            </a>
          </div>
        )}
      </section>

      {lastAction && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {lastAction}
        </div>
      )}
      {actionError && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
          {actionError}
        </div>
      )}

      {/* Mappings */}
      {status?.connected && (
        <>
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Employee mappings</h2>
            {mappingData?.mappings && mappingData.mappings.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-white/5 text-left">
                    <tr>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Staff</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Gusto Employee</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Match</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {mappingData.mappings.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-3 text-white">{m.staffEmail}</td>
                        <td className="px-4 py-3 text-slate-200">
                          {m.gustoName}
                          <p className="text-xs text-slate-500">
                            {m.gustoWorkEmail ?? m.gustoPersonalEmail ?? ''}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs border border-white/10 bg-white/5 text-slate-300">
                            {m.matchMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => unmap(m.staffUserId)}
                            disabled={acting === `unmap:${m.staffUserId}`}
                            className="text-rose-400 hover:text-rose-300 text-xs font-medium disabled:opacity-50"
                          >
                            Unmap
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-slate-400 text-sm">
                No mappings yet. Click “Sync employees” above to auto-match by email.
              </div>
            )}
          </section>

          {/* Unmatched */}
          {(mappingData?.unmatchedStaff.length ?? 0) > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Unmatched staff</h2>
              <p className="text-sm text-slate-400 mb-3">
                Map manually by choosing the corresponding Gusto employee.
              </p>
              <div className="space-y-2">
                {mappingData?.unmatchedStaff.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <p className="text-white font-medium">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.email}</p>
                    </div>
                    <select
                      defaultValue=""
                      disabled={acting === `map:${s.id}`}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v) map(s.id, v)
                      }}
                      className="rounded-md bg-slate-900 border border-white/10 text-white px-3 py-2 text-sm"
                    >
                      <option value="">Select Gusto employee…</option>
                      {mappingData?.unmatchedGustoEmployees.map((g) => (
                        <option key={g.uuid} value={g.uuid}>
                          {g.name} ({g.workEmail ?? g.personalEmail ?? g.uuid.slice(0, 8)})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
