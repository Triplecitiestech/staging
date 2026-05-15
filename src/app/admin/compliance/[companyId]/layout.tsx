/**
 * Compliance workflow layout. Wraps every page under
 * /admin/compliance/[companyId]/* so:
 *
 *   - The persistent step nav is always visible (left column at desktop,
 *     horizontal scrollable strip at mobile).
 *   - The breadcrumb is consistent (Compliance › Company › Step).
 *   - Step state is computed once per request and threaded into the
 *     nav, so individual step pages don't each re-query the DB.
 *
 * Slice 1 ships this layout + the landing page + 3 step pages
 * (onboard / profile / connect). Future slices add the remaining 5
 * steps without changing this file.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import { getWorkflowState } from '@/lib/compliance/workflow-state'
import WorkflowNav from '@/components/compliance/WorkflowNav'

export const dynamic = 'force-dynamic'

interface Props {
  children: React.ReactNode
  params: Promise<{ companyId: string }>
}

export default async function ComplianceCompanyLayout({ children, params }: Props) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, slug: true, displayName: true, isTestTenant: true },
  })
  if (!company) notFound()

  const steps = await getWorkflowState(companyId)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Breadcrumb + title */}
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
            <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
            <span aria-hidden>›</span>
            <span className="text-slate-300">{company.displayName}</span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{company.displayName}</h1>
            {company.isTestTenant && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-200">
                Test Tenant
              </span>
            )}
          </div>
        </div>

        {/* Layout: nav left, content right at desktop; stacked at mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          <aside>
            <WorkflowNav steps={steps} />
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  )
}
