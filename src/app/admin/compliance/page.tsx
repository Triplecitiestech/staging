/**
 * /admin/compliance — Compliance Evidence Engine Dashboard
 *
 * Server component that loads the company list and renders the
 * client-side compliance dashboard.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import ComplianceDashboard from '@/components/compliance/ComplianceDashboard'

export const dynamic = 'force-dynamic'

export default async function CompliancePage() {
  const session = await auth()
  if (!session) redirect('/admin')

  let companies: Array<{ id: string; name: string; slug: string; m365SetupStatus: string | null }> = []

  try {
    const { prisma } = await import('@/lib/prisma')
    const result = await prisma.company.findMany({
      select: {
        id: true,
        displayName: true,
        slug: true,
        m365SetupStatus: true,
      },
      orderBy: { displayName: 'asc' },
    })

    companies = result.map((c: typeof result[number]) => ({
      id: c.id,
      name: c.displayName,
      slug: c.slug,
      m365SetupStatus: c.m365SetupStatus ?? null,
    }))
  } catch (err) {
    console.error('[compliance] Failed to load companies:', err)
    // Continue with empty list rather than crashing
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Compliance Evidence Engine</h1>
            <p className="text-slate-400 mt-1">
              Assess customer compliance posture using real data from managed tools
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href="/admin/compliance/workflow"
              className="inline-flex items-center px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg text-sm transition-colors whitespace-nowrap">
              Guided Workflow (Beta)
            </a>
            <a href="/admin/compliance/setup"
              className="inline-flex items-center px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors whitespace-nowrap">
              MSP Setup
            </a>
          </div>
        </div>
        <ComplianceDashboard companies={companies} />
      </main>
    </div>
  )
}
