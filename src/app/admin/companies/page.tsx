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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Companies</h1>
          <p className="text-slate-400 mt-2">Manage client companies</p>
        </div>
        <CompanyList companies={companies} />
      </main>
    </div>
  )
}
