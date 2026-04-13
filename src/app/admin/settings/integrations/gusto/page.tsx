import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import { hasPermission } from '@/lib/permissions'
import GustoSettingsClient from '@/components/pto/GustoSettingsClient'

export const dynamic = 'force-dynamic'

export default async function GustoSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; detail?: string }>
}) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  if (
    !hasPermission(
      session.user?.role,
      'manage_pto_integrations',
      session.user?.permissionOverrides
    )
  ) {
    redirect('/admin')
  }

  const params = await searchParams
  const connected = params.connected === '1'
  const errorCode = params.error ?? null
  const detail = params.detail ?? null
  const errorMessage = errorCode
    ? `${errorCode.replace(/_/g, ' ')}${detail ? ` — ${decodeURIComponent(detail)}` : ''}`
    : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Gusto Integration</h1>
          <p className="text-slate-400 mt-1">
            Connect Gusto to pull employee time-off balances and sync approved PTO back to Gusto.
          </p>
          <p className="text-xs text-slate-500 mt-2 font-mono">
            Environment: {process.env.GUSTO_ENV === 'production' ? 'production' : 'demo'}
          </p>
        </div>
        <GustoSettingsClient
          initialConnectedFlag={connected}
          initialError={errorMessage}
        />
      </main>
    </div>
  )
}
