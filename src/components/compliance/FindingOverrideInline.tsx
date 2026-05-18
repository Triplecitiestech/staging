'use client'

/**
 * FindingOverrideInline — manual reviewer override of an engine finding.
 *
 * The compliance engine runs evaluators against collected evidence and
 * outputs pass/fail/partial/needs_review/not_applicable per control.
 * Sometimes the engine is wrong — the operator has out-of-band knowledge
 * the engine can't see (a compensating control documented in IT Glue,
 * a customer attestation, an exception that was granted via email).
 * This component lets the reviewer override the engine's status with a
 * written justification. The override survives reassessment because the
 * carry-over step in engine.ts re-applies prior overrides to new finding
 * rows.
 *
 * NOT the same thing as a "disposition" (FindingDispositionInline):
 *   - Override answers: "what IS the status?"  (pass/fail/...)
 *   - Disposition answers: "what are we DOING about it?" (open / accepted_risk
 *     / scheduled / billable_project / customer_declined / ...)
 * A failing control can have an override that flips it to pass AND a
 * disposition tracking the remediation workflow. They're orthogonal.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  /** The compliance_findings.id this override targets. */
  findingId: string
  /** Engine's raw status before any override. */
  engineStatus: string
  /** Currently-stored override, or null if engine result stands. */
  currentOverrideStatus: string | null
  currentOverrideReason: string | null
  currentOverrideBy: string | null
  currentOverrideAt: string | null
}

const OVERRIDE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pass',           label: 'Pass — Satisfied' },
  { value: 'partial',        label: 'Partial — Partially satisfied' },
  { value: 'fail',           label: 'Fail — Not satisfied' },
  { value: 'needs_review',   label: 'Needs review — Cannot determine' },
  { value: 'not_applicable', label: 'Not applicable — Excluded from scope' },
]

export default function FindingOverrideInline(props: Props) {
  const router = useRouter()
  const hasOverride = props.currentOverrideStatus !== null
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState(props.currentOverrideStatus ?? '')
  const [reason, setReason] = useState(props.currentOverrideReason ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!status) {
      setError('Pick a status to attest (or use Clear attestation to revert).')
      return
    }
    if (!reason.trim()) {
      setError('Justification is required so the next reviewer / auditor can see why the engine result was overridden.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/compliance/assessments/${props.findingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrideStatus: status,
          overrideReason: reason.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Save failed (${res.status})`)
        return
      }
      setEditing(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    if (!hasOverride) return
    if (!confirm('Clear the override and revert to the engine result?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/compliance/assessments/${props.findingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Clear failed (${res.status})`)
        return
      }
      setEditing(false)
      setStatus('')
      setReason('')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded border border-violet-500/20 bg-violet-500/[0.03] p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium uppercase tracking-wider text-violet-300">
          Analyst Attestation
        </p>
        <p className="text-[10px] text-slate-500">
          Analyst&apos;s asserted answer for this control — overrides what the AUTOMATED
          engine reports. Separate from disposition (which tracks
          <em> what we&apos;re doing about it</em>).
        </p>
      </div>

      {hasOverride && !editing && (
        <div className="space-y-2">
          <p className="text-sm text-slate-200">
            Engine said <span className="font-mono text-slate-400">{props.engineStatus}</span>
            {' '}→ analyst attested{' '}
            <span className="font-mono text-violet-300">{props.currentOverrideStatus}</span>
          </p>
          {props.currentOverrideReason && (
            <p className="text-sm text-slate-300 italic border-l-2 border-violet-500/40 pl-2">
              &ldquo;{props.currentOverrideReason}&rdquo;
            </p>
          )}
          <p className="text-[11px] text-slate-500">
            By {props.currentOverrideBy ?? 'unknown'}
            {props.currentOverrideAt ? ` on ${new Date(props.currentOverrideAt).toLocaleString()}` : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs px-2.5 py-1 rounded bg-violet-500/20 hover:bg-violet-500/30 text-violet-200"
            >
              Edit attestation
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={saving}
              className="text-xs px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 disabled:opacity-50"
            >
              {saving ? 'Clearing…' : 'Clear attestation (revert to engine)'}
            </button>
          </div>
        </div>
      )}

      {(editing || !hasOverride) && (
        <div className="space-y-2">
          {!hasOverride && (
            <p className="text-xs text-slate-400">
              Engine reported{' '}
              <span className="font-mono text-slate-300">{props.engineStatus}</span>.
              {' '}Attest a different status only if you have evidence the engine couldn&apos;t see
              (compensating control, customer attestation, scoped exception).
            </p>
          )}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value="">— attest a status —</option>
            {OVERRIDE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required: justify the attestation — compensating control, customer attestation, scoped exception, or out-of-band evidence the engine couldn't see. The next analyst / auditor sees this."
            rows={3}
            className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-y"
          />
          {error && (
            <p className="text-xs text-rose-300">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-xs px-3 py-1 rounded bg-cyan-500/25 hover:bg-cyan-500/35 text-cyan-200 disabled:opacity-50"
            >
              {saving ? 'Saving…' : hasOverride ? 'Update attestation' : 'Save attestation'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setStatus(props.currentOverrideStatus ?? '')
                  setReason(props.currentOverrideReason ?? '')
                  setError(null)
                }}
                disabled={saving}
                className="text-xs px-3 py-1 rounded bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
