import CoverageResponseClient from '@/components/pto/CoverageResponseClient'

export const dynamic = 'force-dynamic'

export default async function CoverageResponsePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">PTO Coverage Request</h1>
          <p className="text-slate-400 mt-2 text-sm">
            A teammate has asked you to cover their work while they&apos;re out. Please review and respond below.
          </p>
        </div>
        <CoverageResponseClient token={token} />
      </main>
    </div>
  )
}
