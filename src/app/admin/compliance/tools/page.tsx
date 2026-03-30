/**
 * /admin/compliance/tools — Tool Capability Map & Gap Analysis
 *
 * Visual map showing all MSP tools, their capabilities, and which
 * CIS controls they help answer. Includes gap analysis showing
 * what's automated vs what needs manual input.
 */

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import ToolCapabilityMap from '@/components/compliance/ToolCapabilityMap'

export const dynamic = 'force-dynamic'

export default async function ToolCapabilityMapPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  let companies: Array<{ id: string; name: string }> = []
  try {
    const { prisma } = await import('@/lib/prisma')
    const result = await prisma.company.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    })
    companies = result.map((c) => ({ id: c.id, name: c.displayName }))
  } catch { /* continue with empty */ }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Tool Capability Map</h1>
            <p className="text-slate-400 mt-1">See which tools answer which compliance controls and identify gaps</p>
          </div>
          <a href="/admin/compliance" className="text-sm text-cyan-400 hover:text-cyan-300">Back to Compliance</a>
        </div>
        <ToolCapabilityMap companies={companies} />
      </main>
    </div>
  )
}
