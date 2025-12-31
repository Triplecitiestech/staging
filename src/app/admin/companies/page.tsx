import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'
import CompanyList from '@/components/companies/CompanyList'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

export default async function CompaniesPage() {
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  // Try to fetch with invite columns, fallback if they don't exist yet
  let companies
  try {
    companies = await prisma.company.findMany({
      select: {
        id: true,
        displayName: true,
        primaryContact: true,
        contactEmail: true,
        invitedAt: true,
        inviteCount: true,
        _count: {
          select: { projects: true }
        }
      },
      orderBy: { displayName: 'asc' }
    })
  } catch {
    // Fallback if invitedAt/inviteCount columns don't exist yet
    companies = await prisma.company.findMany({
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
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Image src="/logo/tctlogo.webp" alt="Logo" width={48} height={48} className="w-12 h-12 object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-white">Companies</h1>
                <p className="text-sm text-slate-400">Manage client companies</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-slate-300 hover:text-white transition-colors text-sm font-medium">
                Back to Dashboard
              </Link>
              <Link href="/admin/companies/new" className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium">
                + New Company
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CompanyList companies={companies} />
      </main>
    </div>
  )
}
