import { getAssessmentByShareToken } from '@/lib/ai-discovery/store'
import ReportView from '@/components/admin/documents/ai-playbook/ReportView'
import PrintButton from '@/components/admin/documents/ai-playbook/PrintButton'

export const dynamic = 'force-dynamic'

// Public, unauthenticated deliverable. Don't index shared client reports.
export const metadata = {
  title: 'AI Growth & Profit Assessment',
  robots: { index: false, follow: false },
}

export default async function SharedAigpaReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const assessment = await getAssessmentByShareToken(token)

  // Generic message whether the token is unknown, revoked, or has no report —
  // never confirm which, to avoid leaking anything about the link.
  if (!assessment?.report) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl bg-white p-10 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">This report isn&apos;t available</h1>
          <p className="mt-2 text-sm text-slate-500">
            The link may have expired or been turned off. Please contact Triple Cities Tech for an up-to-date copy.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <div className="print:hidden max-w-[840px] mx-auto flex items-center justify-between gap-4 mb-6">
        <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">Triple Cities Tech</span>
        <PrintButton />
      </div>
      <ReportView report={assessment.report} />
    </main>
  )
}
