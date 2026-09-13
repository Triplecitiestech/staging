'use client'

import { useCallback, useEffect, useState } from 'react'

interface AdminContractor {
  id: string
  name: string
  email: string
  phone: string | null
  active: boolean
  createdAt: string
  lastLoginAt: string | null
  openCode: { code: string | null; expiresAt: string; attempts: number; unavailableReason: string | null } | null
  lastDelivery: { result: string; at: string } | null
}

interface ListResponse {
  contractors: AdminContractor[]
  tableMissing?: boolean
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export default function FieldAdminPanel({ staffEmail }: { staffEmail: string }) {
  const [rows, setRows] = useState<AdminContractor[]>([])
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null)
    try {
      const res = await fetch('/api/field/admin/contractors', { signal, cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as Partial<ListResponse> & { error?: string }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      setRows(data.contractors ?? [])
      setTableMissing(Boolean(data.tableMissing))
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load contractors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/field/admin/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Create failed (${res.status})`)
      setForm({ name: '', email: '', phone: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  const setActive = async (row: AdminContractor, active: boolean) => {
    if (!active && !window.confirm(`Deactivate ${row.name}? Their sessions end immediately.`)) return
    setBusyId(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/field/admin/contractors/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Update failed (${res.status})`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  const copyCode = async (row: AdminContractor) => {
    const code = row.openCode?.code
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(row.id)
      setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 2000)
    } catch {
      window.prompt('Copy this code:', code)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Add contractor</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="min-h-11 rounded-md border border-white/20 bg-slate-950 px-3 text-white placeholder-slate-500"
          />
          <input
            required
            type="email"
            autoComplete="off"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="min-h-11 rounded-md border border-white/20 bg-slate-950 px-3 text-white placeholder-slate-500"
          />
          <input
            type="tel"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="min-h-11 rounded-md border border-white/20 bg-slate-950 px-3 text-white placeholder-slate-500"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Created by {staffEmail}. The contractor signs in at /field/login with this email.</p>
          <button
            type="submit"
            disabled={saving || tableMissing}
            className="min-h-11 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add contractor'}
          </button>
        </div>
      </form>

      {tableMissing && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          The field_* tables do not exist yet. POST /api/migrations/run once, then reload.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">No contractors yet.</p>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{row.name}</p>
                    <p className="break-all text-sm text-slate-300">{row.email}</p>
                    {row.phone && <p className="text-sm text-slate-400">{row.phone}</p>}
                  </div>
                  <StatusBadge active={row.active} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <dt>Last login</dt>
                  <dd className="text-slate-200">{fmt(row.lastLoginAt)}</dd>
                  <dt>Current code</dt>
                  <dd><CodeCell row={row} copied={copied === row.id} onCopy={() => copyCode(row)} /></dd>
                  <dt>Last email</dt>
                  <dd><DeliveryBadge delivery={row.lastDelivery} /></dd>
                </dl>
                <div className="mt-3">
                  <ToggleButton row={row} busy={busyId === row.id} onToggle={() => setActive(row, !row.active)} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-white/10 lg:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3">Current code</th>
                  <th className="px-4 py-3">Last email</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((row) => (
                  <tr key={row.id} className="bg-slate-900/40">
                    <td className="px-4 py-3 font-medium text-white">
                      {row.name}
                      {row.phone && <div className="text-xs text-slate-400">{row.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{row.email}</td>
                    <td className="px-4 py-3"><StatusBadge active={row.active} /></td>
                    <td className="px-4 py-3 text-slate-300">{fmt(row.lastLoginAt)}</td>
                    <td className="px-4 py-3"><CodeCell row={row} copied={copied === row.id} onCopy={() => copyCode(row)} /></td>
                    <td className="px-4 py-3"><DeliveryBadge delivery={row.lastDelivery} /></td>
                    <td className="px-4 py-3 text-right">
                      <ToggleButton row={row} busy={busyId === row.id} onToggle={() => setActive(row, !row.active)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Whether the last code email actually reached the mail provider. Staff had no
 * way to see this, so a send that never left the server looked identical to one
 * sitting in a spam folder.
 */
function DeliveryBadge({ delivery }: { delivery: AdminContractor['lastDelivery'] }) {
  if (!delivery) return <span className="text-xs text-slate-500">no code sent yet</span>
  const label: Record<string, { text: string; className: string; title: string }> = {
    sent: { text: 'Emailed', className: 'bg-emerald-500/15 text-emerald-300', title: 'Accepted by the mail provider. If it is not in their inbox, check spam.' },
    not_configured: { text: 'Email off', className: 'bg-slate-500/20 text-slate-300', title: 'RESEND_API_KEY is not set, so no email was attempted. Use Copy and text the code.' },
    failed: { text: 'Email failed', className: 'bg-rose-500/15 text-rose-300', title: 'The mail provider rejected the send. Use Copy and text the code.' },
  }
  const meta = label[delivery.result] ?? { text: delivery.result, className: 'bg-slate-500/20 text-slate-300', title: 'Unrecognised delivery result.' }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`} title={`${meta.title} (${fmt(delivery.at)})`}>
      {meta.text}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Active</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-500/20 px-2 py-0.5 text-xs font-medium text-slate-300">Deactivated</span>
  )
}

function ToggleButton({ row, busy, onToggle }: { row: AdminContractor; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={row.active}
      className={
        row.active
          ? 'min-h-10 rounded-md border border-rose-500/40 px-3 text-sm text-rose-200 hover:bg-rose-500/10 disabled:opacity-50'
          : 'min-h-10 rounded-md border border-emerald-500/40 px-3 text-sm text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50'
      }
    >
      {busy ? '…' : row.active ? 'Deactivate' : 'Reactivate'}
    </button>
  )
}

function CodeCell({ row, copied, onCopy }: { row: AdminContractor; copied: boolean; onCopy: () => void }) {
  const open = row.openCode
  if (!open) return <span className="text-slate-500">none</span>
  if (!open.code) {
    return <span className="text-slate-500" title={open.unavailableReason ?? undefined}>issued · not readable</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono tracking-widest text-slate-200" aria-label="masked code">••••••</span>
      <button
        type="button"
        onClick={onCopy}
        className="min-h-9 rounded-md border border-cyan-500/40 px-2 text-xs text-cyan-200 hover:bg-cyan-500/10"
        title={`Expires ${fmt(open.expiresAt)}`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="text-xs text-slate-500">exp {new Date(open.expiresAt).toLocaleTimeString()}</span>
    </span>
  )
}
