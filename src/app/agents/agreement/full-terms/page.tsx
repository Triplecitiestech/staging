import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import { canonicalFullAgreementBody } from '@/lib/sales-agents/agreement-templates'
import AgentHeader from '@/components/agents/AgentHeader'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Full Referral Agent Agreement · Triple Cities Tech' }

// Canonical reference copy of the long-form Referral Agent Agreement. The
// one-page summary template links here. This page is read-only — it is NOT
// the agent's signed document; their personal signed agreement lives at
// /agents/agreement. Whichever version is displayed here is the version
// that is incorporated by reference into a signed summary.
export default async function FullTermsPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  const body = canonicalFullAgreementBody()

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/agents/agreement" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to my agreement</Link>
        <h1 className="text-3xl font-bold text-white mt-2 mb-2">Full Referral Agent Agreement</h1>
        <p className="text-sm text-slate-400 mb-6">
          This is the complete long-form Referral Agent Agreement referenced by the one-page summary. Your
          signed agreement on file is at{' '}
          <Link href="/agents/agreement" className="text-cyan-400 hover:text-cyan-300">My Agreement</Link>.
        </p>

        <article className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6 sm:p-8 whitespace-pre-wrap text-slate-100 leading-relaxed text-sm sm:text-[0.95rem]">
          {body}
        </article>
      </main>
    </>
  )
}
