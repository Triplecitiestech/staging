/**
 * Customer-facing policy approval page. Token-gated, no session auth —
 * holding the magic link grants access (same trust model as a
 * password-reset link).
 *
 * Surfaces the rendered policy + Approve / Reject form + optional
 * decision notes. Submits to /api/portal/policy-approval/[token]/decide.
 *
 * Rejected previously / approved previously / expired / token-invalid
 * states all render distinct read-only views explaining what happened.
 */

import { getPool } from '@/lib/db-pool'
import { verifyApprovalToken } from '@/lib/compliance/policy-approval-token'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import PolicyApprovalForm from '@/components/compliance/PolicyApprovalForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

interface ApprovalView {
  approvalId: string
  policyTitle: string
  policyContent: string
  companyName: string
  requesterEmail: string
  requesterNote: string | null
  recipientEmail: string
  decision: 'pending' | 'approved' | 'rejected' | 'expired'
  decisionNotes: string | null
  decidedAt: string | null
  expiresAt: string
  contentChanged: boolean
}

export default async function PolicyApprovalReviewPage({ params }: Props) {
  const { token } = await params
  const payload = verifyApprovalToken(token)
  if (!payload) {
    return <InvalidTokenView reason="Link is invalid or has expired." />
  }

  await ensureComplianceTables()
  const view = await loadApproval(payload.approvalId, payload.companyId, payload.policyId)
  if (!view) {
    return <InvalidTokenView reason="Approval request not found." />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 text-white">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-5">
        <header>
          <p className="text-xs uppercase tracking-wider text-cyan-400">Policy review</p>
          <h1 className="text-2xl font-bold mt-1">{view.policyTitle}</h1>
          <p className="text-sm text-slate-400 mt-1">
            Prepared for <span className="text-slate-200">{view.companyName}</span> by{' '}
            <span className="text-slate-200">Triple Cities Tech</span>.
          </p>
        </header>

        {view.requesterNote && (
          <section className="bg-slate-900/50 border-l-4 border-cyan-500/60 rounded-r-lg px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-cyan-300">Note from {view.requesterEmail}</p>
            <p className="text-sm text-slate-200 mt-1 whitespace-pre-wrap">{view.requesterNote}</p>
          </section>
        )}

        <PreviousDecisionBanner view={view} />

        <section className="bg-white text-slate-900 rounded-xl p-6 sm:p-8 shadow-2xl border border-white/10 overflow-x-auto">
          <article className="prose max-w-none policy-body">
            <PolicyMarkdown content={view.policyContent} />
          </article>
        </section>

        {view.decision === 'pending' && !view.contentChanged && (
          <PolicyApprovalForm token={token} policyTitle={view.policyTitle} />
        )}

        <footer className="text-center text-xs text-slate-500 pt-4">
          Triple Cities Tech · This link expires {new Date(view.expiresAt).toLocaleDateString()} ·{' '}
          Reply to <a href={`mailto:${view.requesterEmail}`} className="text-cyan-400 hover:text-cyan-300">{view.requesterEmail}</a> with questions
        </footer>
      </main>
    </div>
  )
}

function PreviousDecisionBanner({ view }: { view: ApprovalView }) {
  if (view.decision === 'approved') {
    return (
      <section className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-sm text-emerald-200">
        <p className="font-semibold">✓ You approved this policy on {view.decidedAt ? new Date(view.decidedAt).toLocaleString() : '(date unknown)'}.</p>
        {view.decisionNotes && <p className="mt-2 text-emerald-100 whitespace-pre-wrap">Your note: {view.decisionNotes}</p>}
      </section>
    )
  }
  if (view.decision === 'rejected') {
    return (
      <section className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 text-sm text-rose-200">
        <p className="font-semibold">You rejected this policy on {view.decidedAt ? new Date(view.decidedAt).toLocaleString() : '(date unknown)'}.</p>
        {view.decisionNotes && <p className="mt-2 text-rose-100 whitespace-pre-wrap">Your note: {view.decisionNotes}</p>}
        <p className="mt-2 text-slate-300">If you want to revisit, ask TCT to send a new approval request.</p>
      </section>
    )
  }
  if (view.decision === 'expired') {
    return (
      <section className="bg-slate-700/40 border border-white/10 rounded-lg p-4 text-sm text-slate-300">
        <p>This approval request expired without a decision. Ask TCT to send a new one if you still need to review.</p>
      </section>
    )
  }
  if (view.contentChanged) {
    return (
      <section className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 text-sm text-cyan-200">
        <p>TCT has revised this policy since this approval link was sent. Ask them to send a new approval request so you can review the latest version.</p>
      </section>
    )
  }
  return null
}

function InvalidTokenView({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-bold">Policy review unavailable</h1>
        <p className="text-slate-400">{reason}</p>
        <p className="text-sm text-slate-500">
          If you expected to be able to review a policy here, reply to the email that sent you the link,
          or contact <a href="mailto:support@triplecitiestech.com" className="text-cyan-400">support@triplecitiestech.com</a>.
        </p>
      </div>
    </div>
  )
}

/**
 * Trivial server-side markdown renderer for the policy body. The
 * generator emits a small set of features; we render them as plain
 * HTML strings inside dangerouslySetInnerHTML. Anything more exotic
 * (links, tables, images) falls through as plain text.
 */
function PolicyMarkdown({ content }: { content: string }) {
  const html = renderTrustedMarkdown(content)
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function renderTrustedMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let listOpen: 'ul' | 'ol' | null = null
  let paragraphBuf: string[] = []
  const flushPara = () => {
    if (paragraphBuf.length > 0) {
      const text = paragraphBuf.join(' ').trim()
      if (text) out.push(`<p>${inline(text)}</p>`)
      paragraphBuf = []
    }
  }
  const closeList = () => {
    if (listOpen) { out.push(`</${listOpen}>`); listOpen = null }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.length === 0) {
      flushPara()
      closeList()
      continue
    }
    const h1 = line.match(/^#\s+(.+)$/)
    if (h1) { flushPara(); closeList(); out.push(`<h1>${inline(h1[1])}</h1>`); continue }
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) { flushPara(); closeList(); out.push(`<h2>${inline(h2[1])}</h2>`); continue }
    const h3 = line.match(/^###\s+(.+)$/)
    if (h3) { flushPara(); closeList(); out.push(`<h3>${inline(h3[1])}</h3>`); continue }
    const h4 = line.match(/^####\s+(.+)$/)
    if (h4) { flushPara(); closeList(); out.push(`<h4>${inline(h4[1])}</h4>`); continue }
    const ul = line.match(/^[-*+]\s+(.+)$/)
    if (ul) {
      flushPara()
      if (listOpen !== 'ul') { closeList(); out.push('<ul>'); listOpen = 'ul' }
      out.push(`<li>${inline(ul[1])}</li>`)
      continue
    }
    const ol = line.match(/^\d+\.\s+(.+)$/)
    if (ol) {
      flushPara()
      if (listOpen !== 'ol') { closeList(); out.push('<ol>'); listOpen = 'ol' }
      out.push(`<li>${inline(ol[1])}</li>`)
      continue
    }
    if (/^---+$/.test(line)) { flushPara(); closeList(); out.push('<hr/>'); continue }
    paragraphBuf.push(line)
  }
  flushPara()
  closeList()
  return out.join('\n')
}

function inline(s: string): string {
  // Escape first, then re-apply bold/italic markers. Order matters
  // so we don't leak unescaped HTML in policy bodies (defense even
  // though the source is TCT-generated content).
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

async function loadApproval(approvalId: string, companyId: string, policyId: string): Promise<ApprovalView | null> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      policyTitle: string
      policyContent: string
      companyName: string
      requesterEmail: string
      requesterNote: string | null
      recipientEmail: string
      decision: 'pending' | 'approved' | 'rejected' | 'expired'
      decisionNotes: string | null
      decidedAt: string | null
      expiresAt: string
      contentChanged: boolean
    }>(
      `SELECT
         a.id,
         p.title AS "policyTitle",
         p.content AS "policyContent",
         c."displayName" AS "companyName",
         a."requesterEmail",
         a."requesterNote",
         a."recipientEmail",
         a.decision,
         a."decisionNotes",
         a."decidedAt"::text AS "decidedAt",
         a."expiresAt"::text AS "expiresAt",
         (encode(sha256(convert_to(p.content, 'UTF8')), 'hex') <> a."policyContentHash") AS "contentChanged"
       FROM compliance_policy_approvals a
       JOIN compliance_policies p ON p.id = a."policyId"
       JOIN companies c ON c.id = a."companyId"
       WHERE a.id = $1 AND a."companyId" = $2 AND a."policyId" = $3`,
      [approvalId, companyId, policyId]
    )
    const row = res.rows[0]
    if (!row) return null
    return {
      approvalId: row.id,
      policyTitle: row.policyTitle,
      policyContent: row.policyContent,
      companyName: row.companyName,
      requesterEmail: row.requesterEmail,
      requesterNote: row.requesterNote,
      recipientEmail: row.recipientEmail,
      decision: row.decision,
      decisionNotes: row.decisionNotes,
      decidedAt: row.decidedAt,
      expiresAt: row.expiresAt,
      contentChanged: row.contentChanged,
    }
  } finally {
    client.release()
  }
}

