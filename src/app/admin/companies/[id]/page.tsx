import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import AdminHeader from '@/components/admin/AdminHeader'
import CompanyDetail from '@/components/companies/CompanyDetail'

export const dynamic = 'force-dynamic'

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      displayName: true,
      primaryContact: true,
      contactTitle: true,
      contactEmail: true,
      createdAt: true,
      updatedAt: true,
      projects: {
        select: { id: true, title: true, status: true, projectType: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!company) notFound()

  // Fetch contacts (table may not exist yet)
  let contacts: {
    id: string
    name: string
    email: string
    title: string | null
    phone: string | null
    phoneType: string | null
    isPrimary: boolean
    isActive: boolean
  }[] = []

  try {
    contacts = await prisma.companyContact.findMany({
      where: { companyId: id },
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        phone: true,
        phoneType: true,
        isPrimary: true,
        isActive: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }]
    })
  } catch {
    // Table may not exist yet
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CompanyDetail
          company={{
            ...company,
            createdAt: company.createdAt.toISOString(),
            updatedAt: company.updatedAt.toISOString(),
          }}
          contacts={contacts.map(c => ({
            ...c,
            phoneType: c.phoneType as 'MOBILE' | 'WORK' | null,
          }))}
          projects={company.projects.map(p => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
          }))}
        />
      </main>
    </div>
  )
}
