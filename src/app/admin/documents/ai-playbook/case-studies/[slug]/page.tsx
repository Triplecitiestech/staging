import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCaseStudy } from '@/lib/ai-playbook/case-studies'
import CaseStudyOnePager from '@/components/admin/documents/ai-playbook/CaseStudyOnePager'
import PrintButton from '@/components/admin/documents/ai-playbook/PrintButton'

export const dynamic = 'force-dynamic'

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { slug } = await params
  const study = getCaseStudy(slug)
  if (!study) notFound()

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <div className="print:hidden max-w-[840px] mx-auto flex items-center justify-between gap-4 mb-6">
        <Link
          href="/admin/documents/ai-playbook"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={14} /> Back to playbook
        </Link>
        <PrintButton />
      </div>
      <CaseStudyOnePager study={study} />
      <p className="print:hidden max-w-[840px] mx-auto mt-4 text-[12.5px] text-slate-500">
        Fill the <code>[bracketed]</code> figures with the client&apos;s real numbers before sharing, then Print / Save as PDF.
      </p>
    </main>
  )
}
