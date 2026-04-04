/**
 * /admin/compliance — Compliance Guided Workflow
 *
 * Server component that loads the company list and renders the
 * 6-step guided compliance workflow stepper.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import ComplianceWorkflow from '@/components/compliance/ComplianceWorkflow'

export const dynamic = 'force-dynamic'

export default async function CompliancePage() {
  const session = await auth()
  if (!session) redirect('/admin')

  let companies: Array<{
    id: string
    name: string
    slug: string
    m365SetupStatus: string | null
    autotaskCompanyId: string | null
  }> = []

  try {
    const { prisma } = await import('@/lib/prisma')
    const result = await prisma.company.findMany({
      select: {
        id: true,
        displayName: true,
        slug: true,
        m365SetupStatus: true,
        autotaskCompanyId: true,
      },
      orderBy: { displayName: 'asc' },
    })

    companies = result.map((c: typeof result[number]) => ({
      id: c.id,
      name: c.displayName,
      slug: c.slug,
      m365SetupStatus: c.m365SetupStatus ?? null,
      autotaskCompanyId: c.autotaskCompanyId ?? null,
    }))
  } catch (err) {
    console.error('[compliance] Failed to load companies:', err)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Compliance Evidence Engine</h1>
            <p className="text-slate-400 mt-1">
              Guided workflow to assess and document customer compliance posture
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/compliance/setup"
              className="inline-flex items-center px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors whitespace-nowrap">
              MSP Setup
            </a>
            <a href="/admin/compliance/tools"
              className="inline-flex items-center px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors whitespace-nowrap">
              Tool Map
            </a>
          </div>
        </div>
        <ComplianceWorkflow companies={companies} />
      </main>
    </div>
  )
}
