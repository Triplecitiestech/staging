'use client'

/**
 * PublishPolicyButton — operator action on a generated / approved
 * policy row that pushes the document back to the customer's
 * SharePoint document library.
 *
 * Two-step interaction:
 *   1. Click "Publish to customer SharePoint" → modal opens.
 *   2. Operator pastes the SharePoint folder URL, ticks the
 *      "Customer has approved this version" checkbox, clicks Publish.
 *
 * Calls /api/compliance/[companyId]/findings/remediate with
 * actionId='policy.publish_to_sharepoint' + metadata so the same
 * pending-change machinery the Remediate button uses handles the
 * audit log + executor invocation. The approval checkbox is enforced
 * server-side too — see executors/sharepoint-publish.ts — so a UI
 * bug can't slip an unapproved publish through.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  companyId: string
  policyId: string
  policyTitle: string
  /**
   * Sticky suggestion for the SharePoint folder URL. If the customer
   * stores SOPs in SharePoint, the workflow's SOP-storage answer may
   * surface the right URL elsewhere; for now the operator pastes it.
   */
  defaultFolderUrl?: string
}

type Phase = 'idle' | 'previewing' | 'reviewing' | 'publishing' | 'done' | 'error'

export default function PublishPolicyButton({ companyId, policyId, policyTitle, defaultFolderUrl }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [folderUrl, setFolderUrl] = useState(defaultFolderUrl ?? '')
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [resultWebUrl, setResultWebUrl] = useState<string | null>(null)

  function open() {
    setPhase('reviewing')
    setError(null)
    setResultMessage(null)
    setResultWebUrl(null)
  }
  function reset() {
    setPhase('idle')
    setError(null)
  }

  async function publish() {
    if (!folderUrl.trim()) {
      setError('Paste the customer SharePoint folder URL first.')
      return
    }
    if (!approved) {
      setError('Tick the approval checkbox first — TCT does not push without explicit customer sign-off.')
      return
    }
    setPhase('publishing')
    setError(null)
    try {
      const res = await fetch(`/api/compliance/${companyId}/findings/remediate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId: 'policy.publish_to_sharepoint',
          confirm: true,
          metadata: {
            policyId,
            sharepointFolderUrl: folderUrl.trim(),
            customerApproved: true,
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Publish failed (${res.status})`)
        setPhase('error')
        return
      }
      const summary = body?.data?.executor?.summary ?? 'Published to SharePoint.'
      const webUrl = body?.data?.executor?.details?.sharepointWebUrl ?? null
      setResultMessage(typeof summary === 'string' ? summary : 'Published to SharePoint.')
      setResultWebUrl(typeof webUrl === 'string' ? webUrl : null)
      setPhase('done')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setPhase('error')
    }
  }

  if (phase === 'done') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-200">
          ✓ Published
        </span>
        <span className="text-[11px] text-slate-400 truncate max-w-md">{resultMessage}</span>
        {resultWebUrl && (
          <a
            href={resultWebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-cyan-300 hover:text-cyan-200 underline"
          >
            Open in SharePoint ↗
          </a>
        )}
        <button onClick={reset} className="text-[11px] text-slate-500 hover:text-slate-300 underline">
          dismiss
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-500/15 border border-violet-500/40 text-violet-200 hover:bg-violet-500/25"
      >
        Publish to customer SharePoint
      </button>

      {(phase === 'reviewing' || phase === 'publishing' || phase === 'error') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && phase !== 'publishing') reset() }}
        >
          <div className="bg-slate-900 border border-white/10 rounded-xl max-w-xl w-full p-5 space-y-4">
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-violet-300">Publish policy</p>
                <h3 className="text-lg font-bold text-white mt-1 truncate">{policyTitle}</h3>
              </div>
              <button
                type="button"
                onClick={reset}
                disabled={phase === 'publishing'}
                className="text-slate-400 hover:text-white text-xl leading-none disabled:opacity-40"
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <section className="space-y-2">
              <label className="block text-[11px] text-slate-400 uppercase tracking-wider">
                Customer SharePoint folder URL
              </label>
              <input
                type="url"
                value={folderUrl}
                onChange={(e) => setFolderUrl(e.target.value)}
                placeholder="https://customer.sharepoint.com/sites/Policies/Shared Documents/Compliance"
                disabled={phase === 'publishing'}
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <p className="text-[11px] text-slate-500">
                Any SharePoint URL works — direct folder URL or the browser address-bar viewer URL.
                The policy uploads as <code className="text-cyan-300">{policyTitle.slice(0, 60)}.docx</code>{' '}
                (Microsoft Word format). An auto-suffix (v2, v3, …) is added if a file by that name already
                exists, so existing approved versions are never silently overwritten.
              </p>
            </section>

            <section className="bg-slate-800/40 border border-white/5 rounded-lg p-3 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                  disabled={phase === 'publishing'}
                  className="mt-1 rounded border-white/20 bg-slate-800 text-violet-500 focus:ring-violet-500/50"
                />
                <span className="text-sm text-slate-200">
                  Customer HR or the designated PoC has reviewed and approved this version of the policy.
                </span>
              </label>
              <p className="text-[11px] text-slate-500 ml-7">
                TCT will refuse to publish without this confirmation. Treat it as a sign-off — anything you push
                here is what the customer sees in their SharePoint.
              </p>
            </section>

            {error && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={reset}
                disabled={phase === 'publishing'}
                className="px-3 py-2 text-xs rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={phase === 'publishing' || !folderUrl.trim() || !approved}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
              >
                {phase === 'publishing' ? 'Publishing…' : 'Publish to SharePoint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
