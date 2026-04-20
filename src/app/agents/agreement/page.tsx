import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import AgentHeader from '@/components/agents/AgentHeader'
import AgreementSignForm from '@/components/agents/AgreementSignForm'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'My Agreement · Triple Cities Tech Agent Portal' }

export default async function MyAgreementPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  const agreement = await prisma.agentAgreement.findUnique({
    where: { agentId: agent.id },
    select: {
      contentText: true,
      originalFilename: true,
      mimeType: true,
      fileSize: true,
      signedName: true,
      signedAt: true,
      uploadedAt: true,
    },
  })

  const hasText = !!agreement?.contentText
  const hasFile = !!agreement?.originalFilename
  const isSigned = !!(agreement?.signedAt && agreement?.signedName)

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/agents/dashboard" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to dashboard</Link>
        <h1 className="text-3xl font-bold text-white mt-2 mb-6">My Referral Agreement</h1>

        {!agreement && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-8 text-slate-200">
            <p className="mb-3">Your referral agreement hasn't been prepared yet.</p>
            <p className="text-sm text-slate-400">
              Reach out to <a href="mailto:sales@triplecitiestech.com" className="text-cyan-400 hover:text-cyan-300">sales@triplecitiestech.com</a> if you have questions.
            </p>
          </div>
        )}

        {hasText && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs uppercase tracking-wider text-slate-400">Referral Agent Agreement</div>
              {isSigned ? (
                <span className="text-xs px-2 py-0.5 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  Signed {new Date(agreement!.signedAt as Date).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded border bg-violet-500/20 text-violet-300 border-violet-500/30">
                  Awaiting your signature
                </span>
              )}
            </div>

            <article className="prose prose-invert max-w-none whitespace-pre-wrap text-slate-100 leading-relaxed bg-slate-950/40 border border-white/5 rounded-lg p-4 sm:p-6 text-sm sm:text-[0.95rem] max-h-[60vh] overflow-y-auto">
              {agreement!.contentText}
            </article>

            {isSigned ? (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Electronic Signature</div>
                <div className="bg-slate-900/40 border border-white/10 rounded-lg p-4">
                  <div className="text-white font-medium text-lg" style={{ fontFamily: 'cursive' }}>
                    {agreement!.signedName}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {agent.firstName} {agent.lastName} · {new Date(agreement!.signedAt as Date).toLocaleString()}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href="/api/agent-portal/agreement/view"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium shadow-lg shadow-cyan-500/20"
                  >
                    Download / Print
                  </a>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Opens a printable view. Use your browser's Print → Save as PDF to keep a copy.
                </p>
              </div>
            ) : (
              <AgreementSignForm agentName={`${agent.firstName} ${agent.lastName}`} />
            )}
          </div>
        )}

        {hasFile && !hasText && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-8 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400">File</div>
              <div className="text-white text-base font-medium">{agreement!.originalFilename}</div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Uploaded</div>
                <div className="text-slate-200">{agreement!.uploadedAt.toLocaleString()}</div>
              </div>
              {typeof agreement!.fileSize === 'number' && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">Size</div>
                  <div className="text-slate-200">{Math.round(agreement!.fileSize / 1024)} KB</div>
                </div>
              )}
            </div>
            <a
              href="/api/agent-portal/agreement"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg font-medium shadow-lg shadow-cyan-500/20"
            >
              Download agreement
            </a>
          </div>
        )}
      </main>
    </>
  )
}
