import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import NewCompanyForm from '@/components/companies/NewCompanyForm'
import AdminHeader from '@/components/admin/AdminHeader'

export default async function NewCompanyPage() {
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Create New Company</h1>
          <p className="text-slate-400 mt-2">Add a new client company</p>
        </div>
        <NewCompanyForm />
      </main>
    </div>
  )
}
