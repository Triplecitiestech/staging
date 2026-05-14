/**
 * /admin/compliance/[companyId]/changes — pending changes + bundles dashboard
 *
 * Two columns: (left) pending changes grouped by lifecycle status,
 * (right) bundles in flight + recently completed. Each pending change row
 * shows the underlying action's name + customer impact summary; each
 * bundle row shows its title + item count + customer-response status.
 *
 * Mutations (abandon a change, send a bundle, record a decision) happen
 * on the bundle detail page; this page is read-only with navigation links.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyId: string }>
}

export default async function ChangesPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()

  const [pendingChanges, bundles] = await Promise.all([
    loadPendingChanges(companyId),
    loadBundles(companyId),
  ])

  const grouped = groupByLifecycle(pendingChanges)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
              <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
              <span aria-hidden>›</span>
              <Link href={`/admin/compliance/${companyId}`} className="hover:text-cyan-300">{company.displayName}</Link>
              <span aria-hidden>›</span>
              <span className="text-slate-500">Changes</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">Change Queue</h1>
            <p className="text-sm text-slate-400 mt-1">
              Pending remediation actions and customer-facing bundles for {company.displayName}.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/compliance/${companyId}/findings`}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
            >
              Stage from Findings →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: pending changes grouped by lifecycle */}
          <section className="lg:col-span-2 bg-slate-900/50 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Pending Changes
            </h2>
            {pendingChanges.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                No staged changes. Stage one from a finding to get started.
              </p>
            ) : (
              <div className="space-y-4">
                {LIFECYCLE_ORDER.filter((s) => grouped[s]?.length).map((status) => (
                  <div key={status}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      {status.replace(/_/g, ' ')} ({grouped[status].length})
                    </h3>
                    <ul className="space-y-2">
                      {grouped[status].map((c) => (
                        <PendingChangeRow key={c.id} companyId={companyId} change={c} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Right: bundles */}
          <section className="bg-slate-900/50 border border-white/10 rounded-xl p-5">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Bundles
              </h2>
              {pendingChanges.some((c) => c.status === 'drafted') && (
                <NewBundleLink companyId={companyId} />
              )}
            </header>
            {bundles.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                No bundles yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {bundles.map((b) => (
                  <li
                    key={b.id}
                    className="bg-slate-800/40 border border-white/5 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link
                        href={`/admin/compliance/${companyId}/changes/${b.id}`}
                        className="text-sm font-medium text-white hover:text-cyan-300 truncate"
                      >
                        {b.title}
                      </Link>
                      <BundleStatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {b.itemCount} item{b.itemCount === 1 ? '' : 's'}
                      {b.sentAt && (
                        <span className="ml-2">
                          · sent {new Date(b.sentAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

const LIFECYCLE_ORDER = [
  'drafted',
  'bundled',
  'awaiting_customer',
  'scheduled',
  'deploying',
  'verifying',
  'deferred',
  'complete',
  'rolled_back',
  'customer_declined',
  'abandoned',
]

function PendingChangeRow({ companyId, change }: { companyId: string; change: PendingChange }) {
  const action = getRemediationAction(change.actionId)
  const actionName = action?.name ?? change.actionId
  return (
    <li className="bg-slate-800/40 border border-white/5 rounded-lg p-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{actionName}</p>
          <p className="text-xs text-slate-500">
            {change.actionId} v{change.actionVersion}
            {change.bundleId && (
              <Link
                href={`/admin/compliance/${companyId}/changes/${change.bundleId}`}
                className="ml-2 text-cyan-400 hover:text-cyan-300"
              >
                · bundle →
              </Link>
            )}
          </p>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wider rounded px-2 py-0.5 bg-violet-500/10 text-violet-300 border border-violet-500/20">
          {change.status.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-xs text-slate-400 line-clamp-2">{change.customerImpactSummary}</p>
    </li>
  )
}

function BundleStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'complete' ? 'emerald' :
    status === 'cancelled' ? 'slate' :
    status === 'awaiting_customer' || status === 'partially_approved' ? 'cyan' :
    status === 'deploying' ? 'violet' :
    'slate'
  const cls =
    tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
    tone === 'cyan' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20' :
    tone === 'violet' ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' :
    'bg-slate-700/40 text-slate-300 border-white/10'
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wider rounded px-2 py-0.5 border ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function NewBundleLink({ companyId }: { companyId: string }) {
  return (
    <Link
      href={`/admin/compliance/${companyId}/changes/new`}
      className="px-2 py-1 text-[11px] font-medium rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30"
    >
      + New bundle
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface PendingChange {
  id: string
  actionId: string
  actionVersion: string
  status: string
  bundleId: string | null
  customerImpactSummary: string
  createdAt: string
}

interface BundleRow {
  id: string
  title: string
  status: string
  itemCount: number
  sentAt: string | null
}

async function loadPendingChanges(companyId: string): Promise<PendingChange[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<PendingChange>(
      `SELECT id, "actionId", "actionVersion", status, "bundleId",
              "customerImpactSummary", "createdAt"::text AS "createdAt"
       FROM compliance_pending_changes
       WHERE "companyId" = $1
       ORDER BY "createdAt" DESC`,
      [companyId]
    )
    return res.rows
  } catch {
    return []
  } finally {
    client.release()
  }
}

async function loadBundles(companyId: string): Promise<BundleRow[]> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<BundleRow & { itemCount: string }>(
      `SELECT b.id, b.title, b.status, b."sentAt"::text AS "sentAt",
              COALESCE(
                (SELECT COUNT(*)::text FROM compliance_change_bundle_items WHERE "bundleId" = b.id),
                '0'
              ) AS "itemCount"
       FROM compliance_change_bundles b
       WHERE b."companyId" = $1
       ORDER BY b."createdAt" DESC
       LIMIT 50`,
      [companyId]
    )
    return res.rows.map((r) => ({ ...r, itemCount: parseInt(r.itemCount, 10) }))
  } catch {
    return []
  } finally {
    client.release()
  }
}

function groupByLifecycle(changes: PendingChange[]): Record<string, PendingChange[]> {
  const out: Record<string, PendingChange[]> = {}
  for (const c of changes) {
    if (!out[c.status]) out[c.status] = []
    out[c.status].push(c)
  }
  return out
}
