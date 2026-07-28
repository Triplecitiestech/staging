import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import AdminHeader from '@/components/admin/AdminHeader'
import ConnectorUsageDashboard from '@/components/admin/ConnectorUsageDashboard'

export const dynamic = 'force-dynamic'

/**
 * MCP connector usage — who is using the connector, what is failing, what it is
 * refusing to do, and which tools are context-expensive.
 *
 * Staff-only, same as the rest of /admin (the API route re-checks the session).
 */
export default async function ConnectorUsagePage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(6,182,212,0.08)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(139,92,246,0.08)_0%,_transparent_50%)]" />
      </div>
      <div className="relative z-10">
        <AdminHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Connector Usage</h1>
            <p className="text-sm text-slate-400">
              How the team is using the TCT MCP connector: volume per technician, writes itemised,
              failures, refusals, and response weight. Tool arguments and responses are never
              recorded.
            </p>
          </div>
          <ConnectorUsageDashboard />
        </main>
      </div>
    </div>
  )
}
