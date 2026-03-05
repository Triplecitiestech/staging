import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CompanyList from '@/components/companies/CompanyList'
import AdminHeader from '@/components/admin/AdminHeader'


export default async function CompaniesPage() {
  const { prisma } = await import("@/lib/prisma")
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      slug: true,
      displayName: true,
      primaryContact: true,
      contactEmail: true,
      _count: {
        select: { projects: true }
      }
    },
    orderBy: { displayName: 'asc' }
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Companies</h1>
            <p className="text-slate-400 mt-2">Manage client companies</p>
          </div>
          <Link
            href="/admin/companies/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-cyan-500/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Company
          </Link>
        </div>
        <CompanyList companies={companies} />
      </main>
    </div>
  )
}
