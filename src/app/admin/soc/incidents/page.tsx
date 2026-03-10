import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import SocIncidentsList from '@/components/soc/SocIncidentsList'

export default async function SocIncidentsPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/admin/soc" className="text-sm text-slate-400 hover:text-white transition-colors">
            &larr; Back to SOC Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-white mt-2">SOC Incidents</h1>
          <p className="text-slate-400 mt-1">AI-analyzed security alert incidents</p>
        </div>
        <SocIncidentsList />
      </main>
    </div>
  )
}
