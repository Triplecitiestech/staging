import { getIntakeContext } from '@/lib/ai-discovery/store'
import IntakeForm from '@/components/admin/documents/ai-playbook/IntakeForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Business Snapshot — Triple Cities Tech',
  robots: { index: false, follow: false },
}

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await getIntakeContext(token)

  if (!ctx) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-xl bg-white p-10 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">This form isn&apos;t available</h1>
          <p className="mt-2 text-sm text-slate-500">
            The link may have expired or been turned off. Please contact Triple Cities Tech for a new one.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <IntakeForm token={token} companyName={ctx.companyName} />
    </main>
  )
}
