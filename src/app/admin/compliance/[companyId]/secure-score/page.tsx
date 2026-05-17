/**
 * /admin/compliance/[companyId]/secure-score — Microsoft Secure Score
 * recommendations with per-row Remediate buttons where TCT has
 * automation.
 *
 * Directly addresses operator feedback #5b: "Is there a way to
 * automate the remediation for [Microsoft Secure Score] with a button?"
 *
 * Two paths per recommendation:
 *   1. TCT catalog action exists → green "Remediate" button (uses
 *      the same per-control Remediate flow the Findings page uses).
 *   2. No catalog match → "Open in admin center" deep link to the
 *      Microsoft surface the operator (or customer) needs to use.
 *
 * Sorted so the most-actionable items float to the top:
 * not-implemented + automatable, then not-implemented + manual, then
 * already-implemented (lowest priority).
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { loadSecureScoreSnapshot } from '@/lib/compliance/secure-score'
import RemediateButton from '@/components/compliance/RemediateButton'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function SecureScorePage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  const snapshot = await loadSecureScoreSnapshot(companyId)

  if (!snapshot) {
    return (
      <div className="space-y-5">
        <Header companyName={company.displayName} />
        <section className="bg-slate-900/50 border border-white/10 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-400">
            No Secure Score data available — either Microsoft 365 isn&apos;t connected for this customer
            yet, or the app registration is missing the SecurityEvents.Read.All permission.
          </p>
          <Link
            href={`/admin/compliance/${companyId}/connect`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/30"
          >
            Check M365 connection →
          </Link>
        </section>
      </div>
    )
  }

  const automated = snapshot.recommendations.filter((r) => !r.implemented && r.catalogActionId)
  const manual = snapshot.recommendations.filter((r) => !r.implemented && !r.catalogActionId)
  const implemented = snapshot.recommendations.filter((r) => r.implemented)

  return (
    <div className="space-y-5">
      <Header companyName={company.displayName} />

      <ScoreCard snapshot={snapshot} />

      <section>
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            One-click remediable {automated.length > 0 && <span className="text-emerald-300">({automated.length})</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Recommendations where TCT has an automated catalog action. Click Remediate to apply the same
            executor the Findings page uses — same preview, same precondition gate.
          </p>
        </header>
        {automated.length === 0 ? (
          <EmptySection message="No automatable recommendations open. Nice." />
        ) : (
          <ul className="space-y-2">
            {automated.map((r) => (
              <RecommendationRow key={r.id} rec={r} companyId={companyId} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Manual remediation {manual.length > 0 && <span className="text-cyan-300">({manual.length})</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            No matching TCT catalog action yet — operator follows the link into the appropriate Microsoft
            admin surface. (Want one of these automated? Tell us and we&apos;ll add a catalog entry.)
          </p>
        </header>
        {manual.length === 0 ? (
          <EmptySection message="Nothing manual is outstanding." />
        ) : (
          <ul className="space-y-2">
            {manual.map((r) => (
              <RecommendationRow key={r.id} rec={r} companyId={companyId} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Implemented <span className="text-slate-500">({implemented.length})</span>
          </h3>
        </header>
        {implemented.length === 0 ? (
          <EmptySection message="Nothing fully implemented yet — every passing recommendation will show up here." />
        ) : (
          <ul className="space-y-1">
            {implemented.slice(0, 50).map((r) => (
              <li
                key={r.id}
                className="text-xs bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
              >
                <span className="text-slate-200 truncate">✓ {r.title}</span>
                <span className="text-[10px] uppercase tracking-wider text-emerald-300 shrink-0">
                  {r.currentScore.toFixed(1)} / {r.maxScore} pts
                </span>
              </li>
            ))}
            {implemented.length > 50 && (
              <li className="text-[11px] text-slate-500">… and {implemented.length - 50} more</li>
            )}
          </ul>
        )}
      </section>
    </div>
  )
}

function Header({ companyName }: { companyName: string }) {
  return (
    <header>
      <p className="text-xs uppercase tracking-wider text-cyan-400">Microsoft Secure Score</p>
      <h2 className="text-2xl font-bold text-white">{companyName}</h2>
      <p className="text-sm text-slate-400 mt-1 max-w-2xl">
        Per-recommendation breakdown of the customer&apos;s Secure Score with TCT-side Remediate
        buttons where automation exists.
      </p>
    </header>
  )
}

function ScoreCard({ snapshot }: { snapshot: NonNullable<Awaited<ReturnType<typeof loadSecureScoreSnapshot>>> }) {
  const tone =
    snapshot.percentage >= 70 ? 'bg-emerald-500/10 border-emerald-500/30' :
    snapshot.percentage >= 40 ? 'bg-cyan-500/10 border-cyan-500/30' :
                                 'bg-rose-500/10 border-rose-500/30'
  const color =
    snapshot.percentage >= 70 ? 'text-emerald-300' :
    snapshot.percentage >= 40 ? 'text-cyan-300' :
                                 'text-rose-300'
  return (
    <section className={`rounded-xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider opacity-80">Current score</p>
          <p className={`text-4xl font-bold mt-1 ${color}`}>
            {snapshot.percentage}%
          </p>
          <p className="text-xs opacity-80 mt-1">
            {snapshot.currentScore.toFixed(1)} / {snapshot.maxScore} pts ·
            collected {new Date(snapshot.collectedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right text-xs opacity-80">
          <p>{snapshot.recommendations.length} total recommendations</p>
          <p>{snapshot.recommendations.filter((r) => !r.implemented).length} open</p>
        </div>
      </div>
    </section>
  )
}

function RecommendationRow({
  rec,
  companyId,
}: {
  rec: NonNullable<Awaited<ReturnType<typeof loadSecureScoreSnapshot>>>['recommendations'][number]
  companyId: string
}) {
  const action = rec.catalogActionId ? getRemediationAction(rec.catalogActionId) : null
  return (
    <li className="bg-slate-900/50 border border-white/10 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{rec.title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {rec.category} · {rec.service} · {rec.currentScore.toFixed(1)} / {rec.maxScore} pts
            {rec.state && <> · marked <span className="text-slate-300">{rec.state}</span></>}
          </p>
        </div>
        <div className="shrink-0">
          {rec.catalogActionId && action ? (
            <RemediateButton
              companyId={companyId}
              frameworkId="microsoft-secure-score"
              controlId={rec.id}
              findingId={`secure-score-${rec.id}`}
              actions={[{ id: action.id, name: action.name, coverage: 'full' }]}
            />
          ) : rec.actionUrl ? (
            <a
              href={rec.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800/60 border border-white/10 text-slate-200 hover:bg-slate-800/80 whitespace-nowrap"
            >
              Open in admin center ↗
            </a>
          ) : (
            <span className="text-[11px] text-slate-500">No remediation link</span>
          )}
        </div>
      </div>
      {rec.remediation && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
            Microsoft&apos;s recommendation
          </summary>
          <p className="text-xs text-slate-300 mt-2 whitespace-pre-line">{rec.remediation}</p>
        </details>
      )}
    </li>
  )
}

function EmptySection({ message }: { message: string }) {
  return (
    <p className="text-sm text-slate-400 bg-slate-900/30 border border-white/5 rounded-lg p-4 text-center">
      {message}
    </p>
  )
}
