import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAssessment } from '@/lib/ai-discovery/store'
import ReportView from '@/components/admin/documents/ai-playbook/ReportView'
import ReportActions from '@/components/admin/documents/ai-playbook/ReportActions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI Profit & Readiness Assessment — TCT Admin',
}

export default async function AigpaReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { id } = await params
  const assessment = await getAssessment(id)

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <ReportActions />
      {assessment?.report ? (
        <ReportView report={assessment.report} />
      ) : (
        <div className="max-w-[840px] mx-auto rounded-xl bg-white p-12 text-center text-slate-500">
          <p className="text-slate-700 font-medium">No report has been generated for this assessment yet.</p>
          <p className="mt-2 text-sm">
            Go back to{' '}
            <Link href="/admin/documents/ai-playbook/discovery" className="text-cyan-700 font-semibold underline">
              the discovery form
            </Link>
            , open this company, and click <strong>Generate AI Profit Report</strong>.
          </p>
        </div>
      )}
    </main>
  )
}
