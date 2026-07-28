'use client'

// Owner view of how the team is using the TCT MCP connector: who calls it, what
// fails, what it refuses to do, and which tools are context-expensive.
//
// Deliberately absent: Anthropic dollar costs. The connector makes zero
// Anthropic API calls, so it contributes nothing to that bill — response size is
// a context-weight proxy in BYTES and is never converted to dollars or presented
// as a token count. Existing AI spend lives at /admin/monitoring.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ERROR_CLASS_LABELS,
  REFUSAL_KIND_LABELS,
  USAGE_WINDOWS,
  formatBytes,
  formatCount,
  formatDuration,
  formatShare,
  formatTimestamp,
  type ActorUsage,
  type ConnectorUsagePayload,
  type FailureGroup,
  type RefusalGroup,
  type ResponseWeight,
  type UsageWindowKey,
  type WriteCall,
} from '@/lib/connector/usage-metrics'

const MIGRATION_URL = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.triplecitiestech.com'}/api/migrations/run`

const OUTCOME_STYLES: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  refusal: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  failure: 'bg-red-500/15 text-red-300 border-red-500/40',
}

const RISK_STYLES: Record<string, string> = {
  read: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  'low-risk write': 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  destructive: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
}

export default function ConnectorUsageDashboard() {
  const [windowKey, setWindowKey] = useState<UsageWindowKey>('7d')
  const [data, setData] = useState<ConnectorUsagePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (key: UsageWindowKey, signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/connector/usage?window=${key}`, {
        credentials: 'include',
        signal,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load connector usage')
      setData(body.usage as ConnectorUsagePayload)
      setError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Surface the failure — never fall through to an empty state that reads
      // as "the connector is idle".
      setError(err instanceof Error ? err.message : 'Failed to load connector usage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(windowKey, controller.signal)
    return () => controller.abort()
  }, [load, windowKey])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {USAGE_WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWindowKey(w.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                windowKey === w.key
                  ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {loading && data && <span className="text-slate-500">Refreshing…</span>}
          <Link href="/admin/connector/staged-writes" className="text-cyan-400 hover:text-cyan-300">
            Staged write approvals →
          </Link>
          <Link href="/admin/monitoring" className="text-cyan-400 hover:text-cyan-300">
            AI spend (Anthropic) →
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-lg p-4 text-sm">
          <p className="font-semibold">Could not load connector usage.</p>
          <p className="mt-1 break-words">{error}</p>
          <button
            type="button"
            onClick={() => load(windowKey)}
            className="mt-3 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-semibold hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !data && <Skeleton />}

      {data && (
        <>
          {data.telemetryTableMissing && (
            <div className="bg-violet-500/10 border border-violet-500/40 text-violet-200 rounded-lg p-4 text-sm">
              <p className="font-semibold">Telemetry table not created yet.</p>
              <p className="mt-1">
                Nothing is being recorded. POST to{' '}
                <code className="text-violet-100 break-all">{MIGRATION_URL}</code> with{' '}
                <code className="text-violet-100">Authorization: Bearer &lt;MIGRATION_SECRET&gt;</code>, then reload
                this page. Connector tool calls are unaffected either way.
              </p>
            </div>
          )}

          <SummaryTiles data={data} />
          <ActorSection actors={data.byActor} />
          <WritesSection writes={data.writes} totalWrites={data.summary.writes} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FailuresSection failures={data.failures} />
            <RefusalsSection refusals={data.refusals} />
          </div>
          <ResponseWeightSection rows={data.responseWeight} />
          <StagedWritesSection data={data} />

          <p className="text-[11px] text-slate-500">
            Window {formatTimestamp(data.since)} → {formatTimestamp(data.generatedAt)}. Arguments and
            response bodies are never recorded — only tool names, classifications, outcomes, timings
            and response size.
          </p>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

interface CardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}

function Card({ title, subtitle, children, action }: CardProps) {
  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Wide tables scroll inside their own box; the page body never scrolls sideways. */
function TableScroll({ children, minWidth }: { children: React.ReactNode; minWidth: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>
}

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${className}`}>{label}</span>
}

function Tile({
  label,
  value,
  detail,
  accent = 'text-white',
}: {
  label: string
  value: string
  detail?: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold leading-tight ${accent}`}>{value}</p>
      {detail && <p className="text-[11px] text-slate-400 mt-1">{detail}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SummaryTiles({ data }: { data: ConnectorUsagePayload }) {
  const s = data.summary
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Tile
        label="Tool calls"
        value={formatCount(s.calls)}
        detail={`${formatCount(s.tools)} distinct tool${s.tools === 1 ? '' : 's'}`}
      />
      <Tile
        label="Reads"
        value={formatCount(s.reads)}
        detail={`${formatShare(s.reads, s.calls)} of calls`}
      />
      <Tile
        label="Writes"
        value={formatCount(s.writes)}
        detail={`${formatShare(s.writes, s.calls)} of calls`}
        accent="text-cyan-300"
      />
      <Tile
        label="Refusals"
        value={formatCount(s.refusals)}
        detail={`${formatShare(s.refusals, s.calls)} of calls`}
        accent="text-violet-300"
      />
      <Tile
        label="Failures"
        value={formatCount(s.failures)}
        detail={`${formatShare(s.failures, s.calls)} of calls`}
        accent={s.failures > 0 ? 'text-red-300' : 'text-white'}
      />
      <Tile
        label="Response weight"
        value={formatBytes(s.totalBytes)}
        detail={s.calls > 0 ? `avg ${formatDuration(s.avgDurationMs)} per call` : 'no calls in window'}
      />
    </div>
  )
}

function ActorSection({ actors }: { actors: ActorUsage[] }) {
  return (
    <Card
      title="Per technician"
      subtitle="Call volume, read vs write split, vendors touched and top tools."
    >
      {actors.length === 0 ? (
        <Empty>No connector calls recorded in this window.</Empty>
      ) : (
        <TableScroll minWidth={760}>
          <thead>
            <tr className="text-slate-500 border-b border-slate-700/30">
              <th className="font-medium pb-2 pr-3">Technician</th>
              <th className="font-medium pb-2 pr-3 text-right">Calls</th>
              <th className="font-medium pb-2 pr-3 text-right">Reads</th>
              <th className="font-medium pb-2 pr-3 text-right">Writes</th>
              <th className="font-medium pb-2 pr-3 text-right">Refused</th>
              <th className="font-medium pb-2 pr-3 text-right">Failed</th>
              <th className="font-medium pb-2 pr-3">Vendors</th>
              <th className="font-medium pb-2">Top tools</th>
            </tr>
          </thead>
          <tbody>
            {actors.map((a) => (
              <tr key={a.actor} className="border-b border-slate-800/40 align-top">
                <td className="py-2 pr-3 text-slate-200 font-medium break-words">
                  {a.actor}
                  <span className="block text-[10px] text-slate-500">
                    last call {formatTimestamp(a.lastCallAt)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right text-slate-300">{formatCount(a.calls)}</td>
                <td className="py-2 pr-3 text-right text-slate-400">{formatCount(a.reads)}</td>
                <td className="py-2 pr-3 text-right text-cyan-300 font-semibold">
                  {formatCount(a.writes)}
                </td>
                <td className="py-2 pr-3 text-right text-violet-300">{formatCount(a.refusals)}</td>
                <td
                  className={`py-2 pr-3 text-right ${a.failures > 0 ? 'text-red-300' : 'text-slate-500'}`}
                >
                  {formatCount(a.failures)}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {a.vendors.map((v) => (
                      <Badge key={v} label={v} className="bg-slate-500/15 text-slate-300 border-slate-500/40" />
                    ))}
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {a.topTools.map((t) => (
                      <span key={t.toolName} className="text-[10px] font-mono text-slate-400">
                        {t.toolName}
                        <span className="text-slate-600"> ×{t.calls}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </Card>
  )
}

function WritesSection({ writes, totalWrites }: { writes: WriteCall[]; totalWrites: number }) {
  const truncated = totalWrites > writes.length
  return (
    <Card
      title="Writes, itemised"
      subtitle="Every write call: who ran it, which tool, which vendor, and what happened. Reads are broad by design; writes change customer systems."
      action={
        <span className="text-[10px] text-slate-500">
          {truncated
            ? `showing ${formatCount(writes.length)} most recent of ${formatCount(totalWrites)}`
            : `${formatCount(writes.length)} in window`}
        </span>
      }
    >
      {writes.length === 0 ? (
        <Empty>No write calls in this window.</Empty>
      ) : (
        <TableScroll minWidth={820}>
          <thead>
            <tr className="text-slate-500 border-b border-slate-700/30">
              <th className="font-medium pb-2 pr-3">When</th>
              <th className="font-medium pb-2 pr-3">Technician</th>
              <th className="font-medium pb-2 pr-3">Tool</th>
              <th className="font-medium pb-2 pr-3">Vendor</th>
              <th className="font-medium pb-2 pr-3">Risk</th>
              <th className="font-medium pb-2 pr-3">Outcome</th>
              <th className="font-medium pb-2 text-right">Took</th>
            </tr>
          </thead>
          <tbody>
            {writes.map((w) => (
              <tr key={w.id} className="border-b border-slate-800/40">
                <td className="py-2 pr-3 text-slate-400 whitespace-nowrap">
                  {formatTimestamp(w.calledAt)}
                </td>
                <td className="py-2 pr-3 text-slate-300 break-words">{w.actor}</td>
                <td className="py-2 pr-3 text-slate-200 font-mono text-[11px] whitespace-nowrap">
                  {w.toolName}
                  {w.staged && (
                    <span className="block text-[10px] text-violet-300">gated by approval</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-slate-400">{w.vendor}</td>
                <td className="py-2 pr-3">
                  <Badge label={w.risk} className={RISK_STYLES[w.risk] ?? RISK_STYLES.read} />
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge
                      label={w.outcome}
                      className={OUTCOME_STYLES[w.outcome] ?? OUTCOME_STYLES.success}
                    />
                    {w.refusalKind && (
                      <span className="text-[10px] text-violet-300">
                        {REFUSAL_KIND_LABELS[w.refusalKind]}
                      </span>
                    )}
                    {w.errorClass && (
                      <span className="text-[10px] text-red-300">
                        {ERROR_CLASS_LABELS[w.errorClass]}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 text-right text-slate-400 whitespace-nowrap">
                  {formatDuration(w.durationMs)}
                  <span className="block text-[10px] text-slate-600">
                    {formatBytes(w.responseBytes)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </Card>
  )
}

function FailuresSection({ failures }: { failures: FailureGroup[] }) {
  return (
    <Card title="Failures by class" subtitle="Real breakage — refusals are counted separately.">
      {failures.length === 0 ? (
        <Empty>No failed calls in this window.</Empty>
      ) : (
        <TableScroll minWidth={420}>
          <thead>
            <tr className="text-slate-500 border-b border-slate-700/30">
              <th className="font-medium pb-2 pr-3">Class</th>
              <th className="font-medium pb-2 pr-3 text-right">Calls</th>
              <th className="font-medium pb-2">Most recent</th>
            </tr>
          </thead>
          <tbody>
            {failures.map((f) => (
              <tr key={f.errorClass} className="border-b border-slate-800/40 align-top">
                <td className="py-2 pr-3">
                  <span className="text-slate-200">{ERROR_CLASS_LABELS[f.errorClass] ?? f.errorClass}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {f.tools.map((t) => (
                      <span key={t.toolName} className="text-[10px] font-mono text-slate-500">
                        {t.toolName}
                        <span className="text-slate-600"> ×{t.calls}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-2 pr-3 text-right text-red-300 font-semibold">
                  {formatCount(f.calls)}
                </td>
                <td className="py-2 text-slate-400 whitespace-nowrap">{formatTimestamp(f.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </Card>
  )
}

function RefusalsSection({ refusals }: { refusals: RefusalGroup[] }) {
  return (
    <Card
      title="Refusals by tool"
      subtitle="What the team asked for and did not get: approval gate, kill switch off, or vendor not configured. This is demand, not breakage."
    >
      {refusals.length === 0 ? (
        <Empty>Nothing refused in this window.</Empty>
      ) : (
        <TableScroll minWidth={460}>
          <thead>
            <tr className="text-slate-500 border-b border-slate-700/30">
              <th className="font-medium pb-2 pr-3">Tool</th>
              <th className="font-medium pb-2 pr-3 text-right">Refused</th>
              <th className="font-medium pb-2 pr-3">Why</th>
              <th className="font-medium pb-2">Most recent</th>
            </tr>
          </thead>
          <tbody>
            {refusals.map((r) => (
              <tr key={r.toolName} className="border-b border-slate-800/40 align-top">
                <td className="py-2 pr-3">
                  <span className="text-slate-200 font-mono text-[11px] whitespace-nowrap">{r.toolName}</span>
                  <span className="block text-[10px] text-slate-500">
                    {r.vendor} · {formatCount(r.actors)} technician{r.actors === 1 ? '' : 's'}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right text-violet-300 font-semibold">
                  {formatCount(r.calls)}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-col gap-0.5">
                    {r.approvalRequired > 0 && (
                      <span className="text-[10px] text-violet-300">
                        {REFUSAL_KIND_LABELS.approval_required} ×{r.approvalRequired}
                      </span>
                    )}
                    {r.killSwitch > 0 && (
                      <span className="text-[10px] text-rose-300">
                        {REFUSAL_KIND_LABELS.kill_switch} ×{r.killSwitch}
                      </span>
                    )}
                    {r.notConfigured > 0 && (
                      <span className="text-[10px] text-cyan-300">
                        {REFUSAL_KIND_LABELS.not_configured} ×{r.notConfigured}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 text-slate-400 whitespace-nowrap">{formatTimestamp(r.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </Card>
  )
}

function ResponseWeightSection({ rows }: { rows: ResponseWeight[] }) {
  return (
    <Card
      title="Response weight — heaviest tools"
      subtitle="Median and p95 response size in BYTES. A context-weight proxy only: not a token count, and not a dollar figure. The connector makes no Anthropic API calls."
    >
      {rows.length === 0 ? (
        <Empty>No responses measured in this window.</Empty>
      ) : (
        <TableScroll minWidth={680}>
          <thead>
            <tr className="text-slate-500 border-b border-slate-700/30">
              <th className="font-medium pb-2 pr-3">Tool</th>
              <th className="font-medium pb-2 pr-3">Vendor</th>
              <th className="font-medium pb-2 pr-3 text-right">Calls</th>
              <th className="font-medium pb-2 pr-3 text-right">Median</th>
              <th className="font-medium pb-2 pr-3 text-right">p95</th>
              <th className="font-medium pb-2 pr-3 text-right">Max</th>
              <th className="font-medium pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.toolName} className="border-b border-slate-800/40">
                <td className="py-2 pr-3 text-slate-200 font-mono text-[11px] whitespace-nowrap">{r.toolName}</td>
                <td className="py-2 pr-3 text-slate-400">{r.vendor}</td>
                <td className="py-2 pr-3 text-right text-slate-400">{formatCount(r.calls)}</td>
                <td className="py-2 pr-3 text-right text-slate-300">{formatBytes(r.medianBytes)}</td>
                <td className="py-2 pr-3 text-right text-cyan-300 font-semibold">
                  {formatBytes(r.p95Bytes)}
                </td>
                <td className="py-2 pr-3 text-right text-slate-400">{formatBytes(r.maxBytes)}</td>
                <td className="py-2 text-right text-slate-400">{formatBytes(r.totalBytes)}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </Card>
  )
}

function StagedWritesSection({ data }: { data: ConnectorUsagePayload }) {
  const s = data.stagedWrites
  return (
    <Card
      title="Staged config writes"
      subtitle="The human-approval gate. Pending and approved are the live queue; the rest are outcomes inside the selected window."
      action={
        <Link
          href="/admin/connector/staged-writes"
          className="text-xs text-cyan-400 hover:text-cyan-300"
        >
          Review queue →
        </Link>
      }
    >
      {data.stagedWritesTableMissing ? (
        <Empty>The connector_staged_writes table does not exist yet on this database.</Empty>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <Tile
            label="Pending"
            value={formatCount(s.pendingApproval)}
            accent={s.pendingApproval > 0 ? 'text-violet-300' : 'text-white'}
            detail="awaiting a human"
          />
          <Tile label="Approved" value={formatCount(s.approved)} detail="not yet executed" />
          <Tile label="Executed" value={formatCount(s.executed)} accent="text-emerald-300" />
          <Tile label="Rejected" value={formatCount(s.rejected)} accent="text-rose-300" />
          <Tile
            label="Drifted"
            value={formatCount(s.drifted)}
            accent={s.drifted > 0 ? 'text-red-300' : 'text-white'}
            detail="aborted, record changed"
          />
          <Tile
            label="Failed"
            value={formatCount(s.failed)}
            accent={s.failed > 0 ? 'text-red-300' : 'text-white'}
          />
          <Tile
            label="Cancelled / expired"
            value={formatCount(s.cancelled + s.expired)}
            detail={`${formatCount(s.cancelled)} cancelled · ${formatCount(s.expired)} expired`}
          />
        </div>
      )}
    </Card>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-slate-800/50 border border-slate-700/40" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-slate-800/40 border border-slate-700/40" />
      <div className="h-64 rounded-xl bg-slate-800/40 border border-slate-700/40" />
    </div>
  )
}
