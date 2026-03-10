import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import SocConfigPanel from '@/components/soc/SocConfigPanel'

export default async function SocConfigPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">SOC Configuration</h1>
          <p className="text-slate-400 mt-1">Agent settings, thresholds, and model selection</p>
        </div>
        <SocConfigPanel />
      </main>
    </div>
  )
}
