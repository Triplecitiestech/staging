/**
 * /admin/compliance/[companyId]/changes/[bundleId] — bundle detail / composer
 *
 * The operator surface for one Change Bundle. Server-renders the bundle +
 * its items (joined to action catalog), then mounts a client BundleComposer
 * that handles:
 *   - adding pending changes to the bundle
 *   - removing items
 *   - opening the preview in a new tab
 *   - sending the bundle (state transition + email if sentVia='email')
 *   - cancelling the bundle
 *   - recording per-item customer decisions when status reaches awaiting_customer
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'
import { getRemediationAction } from '@/lib/compliance/actions/catalog'
import BundleComposer from '@/components/compliance/BundleComposer'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyId: string; bundleId: string }>
}

export default async function BundleDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId, bundleId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  await ensureComplianceTables()
  const data = await loadBundleWithItems(companyId, bundleId)
  if (!data) notFound()

  const draftedPendingChanges = await loadDraftedChanges(companyId)

  // Map items to a UI-friendly shape with action catalog enrichment.
  const items = data.items.map((it) => {
    const action = getRemediationAction(it.actionId)
    return {
      id: it.id,
      pendingChangeId: it.pendingChangeId,
      actionId: it.actionId,
      actionName: action?.name ?? it.actionId,
      customerImpactSummary: it.customerImpactSummary,
      displayOrder: it.displayOrder,
      customerDecision: it.customerDecision,
      agreedDeploymentDate: it.agreedDeploymentDate,
      changeStatus: it.changeStatus,
    }
  })

  const draftedOptions = draftedPendingChanges.map((c) => ({
    pendingChangeId: c.id,
    actionId: c.actionId,
    actionName: getRemediationAction(c.actionId)?.name ?? c.actionId,
    customerImpactSummary: c.customerImpactSummary,
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
            <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
            <span aria-hidden>›</span>
            <Link href={`/admin/compliance/${companyId}`} className="hover:text-cyan-300">{company.displayName}</Link>
            <span aria-hidden>›</span>
            <Link href={`/admin/compliance/${companyId}/changes`} className="hover:text-cyan-300">Changes</Link>
            <span aria-hidden>›</span>
            <span className="text-slate-500">{data.bundle.title}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">{data.bundle.title}</h1>
          <p className="text-sm text-slate-400 mt-1">
            Status: <span className="text-cyan-300">{data.bundle.status.replace(/_/g, ' ')}</span>
            {data.bundle.sentAt && (
              <span className="ml-3 text-slate-500">
                Sent {new Date(data.bundle.sentAt).toLocaleString()} via {data.bundle.sentVia ?? '—'}
              </span>
            )}
          </p>
        </div>

        <BundleComposer
          companyId={companyId}
          bundleId={bundleId}
          bundleStatus={data.bundle.status}
          customerFacingNotes={data.bundle.customerFacingNotes ?? ''}
          items={items}
          draftedOptions={draftedOptions}
        />
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface BundleData {
  bundle: {
    id: string
    title: string
    status: string
    customerFacingNotes: string | null
    sentAt: string | null
    sentVia: string | null
  }
  items: Array<{
    id: string
    pendingChangeId: string
    actionId: string
    customerImpactSummary: string
    displayOrder: number
    customerDecision: string | null
    agreedDeploymentDate: string | null
    changeStatus: string
  }>
}

async function loadBundleWithItems(companyId: string, bundleId: string): Promise<BundleData | null> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const bRes = await client.query<{
      id: string
      title: string
      status: string
      customerFacingNotes: string | null
      sentAt: string | null
      sentVia: string | null
    }>(
      `SELECT id, title, status, "customerFacingNotes",
              "sentAt"::text AS "sentAt", "sentVia"
       FROM compliance_change_bundles
       WHERE id = $1 AND "companyId" = $2`,
      [bundleId, companyId]
    )
    if (bRes.rows.length === 0) return null
    const iRes = await client.query<{
      id: string
      pendingChangeId: string
      actionId: string
      customerImpactSummary: string
      displayOrder: number
      customerDecision: string | null
      agreedDeploymentDate: string | null
      changeStatus: string
    }>(
      `SELECT bi.id, bi."pendingChangeId", pc."actionId",
              pc."customerImpactSummary", bi."displayOrder",
              bi."customerDecision", bi."agreedDeploymentDate"::text AS "agreedDeploymentDate",
              pc.status AS "changeStatus"
       FROM compliance_change_bundle_items bi
       JOIN compliance_pending_changes pc ON pc.id = bi."pendingChangeId"
       WHERE bi."bundleId" = $1
       ORDER BY bi."displayOrder"`,
      [bundleId]
    )
    return { bundle: bRes.rows[0], items: iRes.rows }
  } catch {
    return null
  } finally {
    client.release()
  }
}

async function loadDraftedChanges(companyId: string): Promise<Array<{
  id: string
  actionId: string
  customerImpactSummary: string
}>> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      actionId: string
      customerImpactSummary: string
    }>(
      `SELECT id, "actionId", "customerImpactSummary"
       FROM compliance_pending_changes
       WHERE "companyId" = $1 AND status = 'drafted'
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
