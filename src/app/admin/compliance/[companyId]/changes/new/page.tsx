/**
 * /admin/compliance/[companyId]/changes/new — minimal new-bundle creator
 *
 * Server component renders a form; submission goes to the client component
 * that POSTs to /api/compliance/[companyId]/bundles and redirects to the
 * resulting bundle detail page.
 */

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'
import { prisma } from '@/lib/prisma'
import NewBundleForm from '@/components/compliance/NewBundleForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ companyId: string }>
}

export default async function NewBundlePage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')
  const { companyId } = await params

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, displayName: true },
  })
  if (!company) notFound()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-cyan-400 uppercase tracking-wider">
            <Link href="/admin/compliance" className="hover:text-cyan-300">Compliance</Link>
            <span aria-hidden>›</span>
            <Link href={`/admin/compliance/${companyId}`} className="hover:text-cyan-300">{company.displayName}</Link>
            <span aria-hidden>›</span>
            <Link href={`/admin/compliance/${companyId}/changes`} className="hover:text-cyan-300">Changes</Link>
            <span aria-hidden>›</span>
            <span className="text-slate-500">New bundle</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1">New Change Bundle</h1>
          <p className="text-sm text-slate-400 mt-1">
            Group pending changes into one customer-facing approval conversation.
            You will add changes and send the bundle on the next screen.
          </p>
        </div>

        <NewBundleForm companyId={companyId} />
      </main>
    </div>
  )
}
