import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import AdminHeader from '@/components/admin/AdminHeader'
import NewAgentForm from '@/components/admin/agents/NewAgentForm'

export const dynamic = 'force-dynamic'

export default async function NewAgentPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin/sales-agents" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to Sales Agents</Link>
        <div className="mt-2 mb-6">
          <h1 className="text-3xl font-bold text-white">Add Sales Agent</h1>
          <p className="text-slate-400 mt-2">
            Create the agent record. We'll automatically email them a single-use link to set their own password
            (link expires in 48 hours).
          </p>
        </div>
        <NewAgentForm />
      </main>
    </div>
  )
}
