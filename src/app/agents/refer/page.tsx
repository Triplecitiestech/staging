import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentAgent } from '@/lib/agent-auth'
import AgentHeader from '@/components/agents/AgentHeader'
import ReferralForm from '@/components/agents/ReferralForm'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Submit a Referral · Triple Cities Tech Agent Portal' }

export default async function SubmitReferralPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/agents/dashboard" className="text-sm text-cyan-400 hover:text-cyan-300">← Back to dashboard</Link>
          <h1 className="text-3xl font-bold text-white mt-2">Submit a Referral</h1>
          <p className="text-slate-400 mt-2">
            Tell us about the business you'd like to introduce us to. We'll take it from here and keep you updated on the status.
          </p>
        </div>
        <ReferralForm />
      </main>
    </>
  )
}
