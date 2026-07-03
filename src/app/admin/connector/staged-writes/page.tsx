'use client'

// Human approval queue for the MCP connector's gated Autotask config writes.
// Claude (or any connector caller) can only STAGE changes; applying them
// requires an approve click here, behind staff auth + system_settings.

import { useCallback, useEffect, useState } from 'react'

interface StagedWrite {
  id: string
  area: string
  operation: string
  targetLabel: string
  status: string
  risk: string
  diff: string
  reason: string | null
  stagedBy: string
  stagedAt: string
  approvedBy: string | null
  approvedAt: string | null
  executedAt: string | null
  expiresAt: string
  error: string | null
}

const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  approved: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  executing: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  executed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  failed: 'bg-red-500/15 text-red-300 border-red-500/40',
  drifted: 'bg-red-500/15 text-red-300 border-red-500/40',
  rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  cancelled: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  expired: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
}

export default function StagedWritesPage() {
  const [writes, setWrites] = useState<StagedWrite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null)
      const res = await fetch('/api/admin/connector/staged-writes', { credentials: 'include', signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load staged writes')
      setWrites(data.writes ?? [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load staged writes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/connector/staged-writes/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${action}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`)
    } finally {
      setActing(null)
    }
  }

  const pending = writes.filter((w) => w.status === 'pending_approval')
  const rest = writes.filter((w) => w.status !== 'pending_approval')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Connector Config Writes</h1>
          <p className="text-slate-400 mt-2 text-sm md:text-base">
            Autotask configuration changes staged by the AI connector. Nothing is written until a staff
            member approves it here; execution then re-checks the live record and aborts on drift.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-lg p-4 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-slate-400">Loading staged writes…</div>
        ) : (
          <>
            <Section title={`Awaiting approval (${pending.length})`}>
              {pending.length === 0 && <p className="text-slate-500 text-sm">Nothing waiting for approval.</p>}
              {pending.map((w) => (
                <WriteCard key={w.id} write={w}>
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <button
                      onClick={() => act(w.id, 'approve')}
                      disabled={acting === w.id}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold"
                    >
                      {acting === w.id ? 'Working…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => act(w.id, 'reject')}
                      disabled={acting === w.id}
                      className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-semibold"
                    >
                      Reject
                    </button>
                  </div>
                </WriteCard>
              ))}
            </Section>

            <Section title="History">
              {rest.length === 0 && <p className="text-slate-500 text-sm">No staged writes yet.</p>}
              {rest.map((w) => (
                <WriteCard key={w.id} write={w} />
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

function WriteCard({ write, children }: { write: StagedWrite; children?: React.ReactNode }) {
  const badge = STATUS_STYLES[write.status] ?? STATUS_STYLES.cancelled
  return (
    <div className="bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-lg p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${badge}`}>{write.status}</span>
        <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-500/15 text-slate-300 border-slate-500/40">
          {write.operation} · {write.area}
        </span>
        {write.risk === 'billing' && (
          <span className="text-xs px-2 py-0.5 rounded-full border bg-rose-500/15 text-rose-300 border-rose-500/40">
            billing-sensitive
          </span>
        )}
      </div>
      <p className="text-white font-medium mt-2 break-words">{write.targetLabel}</p>
      {write.reason && <p className="text-slate-400 text-sm mt-1 break-words">Reason: {write.reason}</p>}
      <pre className="mt-3 bg-slate-950/70 border border-white/10 rounded-lg p-3 text-xs text-cyan-100 overflow-x-auto whitespace-pre">
        {write.diff}
      </pre>
      <div className="text-xs text-slate-500 mt-3 space-y-0.5">
        <p>Staged by {write.stagedBy} · {new Date(write.stagedAt).toLocaleString()}</p>
        {write.approvedBy && <p>{write.status === 'rejected' ? 'Rejected' : 'Approved'} by {write.approvedBy}{write.approvedAt ? ` · ${new Date(write.approvedAt).toLocaleString()}` : ''}</p>}
        {write.executedAt && <p>Executed · {new Date(write.executedAt).toLocaleString()}</p>}
        {write.status === 'pending_approval' && <p>Expires · {new Date(write.expiresAt).toLocaleString()}</p>}
        {write.error && <p className="text-red-400 break-words">Error: {write.error}</p>}
      </div>
      {children}
    </div>
  )
}
