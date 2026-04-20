import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import AgentHeader from '@/components/agents/AgentHeader'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'My Agreement · Triple Cities Tech Agent Portal' }

export default async function MyAgreementPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: agent.id },
    select: { originalFilename: true, mimeType: true, fileSize: true, uploadedAt: true },
  })

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/agents/dashboard" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to dashboard</Link>
        <h1 className="text-3xl font-bold text-white mt-2 mb-6">My Referral Agreement</h1>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-8">
          {agreement ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">File</div>
                <div className="text-white text-base font-medium">{agreement.originalFilename}</div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">Uploaded</div>
                  <div className="text-slate-200">{agreement.uploadedAt.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">Size</div>
                  <div className="text-slate-200">{Math.round(agreement.fileSize / 1024)} KB</div>
                </div>
              </div>
              <a
                href="/api/agent-portal/agreement"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium shadow-lg shadow-cyan-500/20"
              >
                Download agreement
              </a>
            </div>
          ) : (
            <div className="text-slate-200">
              <p className="mb-3">
                Your signed referral agreement hasn't been uploaded yet.
              </p>
              <p className="text-sm text-slate-400">
                Reach out to <a href="mailto:sales@triplecitiestech.com" className="text-cyan-400 hover:text-cyan-300">sales@triplecitiestech.com</a> if you need a copy or have questions.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
