import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import AgentHeader from '@/components/agents/AgentHeader'
import TrainingShell from '@/components/agents/TrainingShell'

export const dynamic = 'force-dynamic'

export default async function PitchesPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TrainingShell current="/agents/training/pitches" title="Elevator Pitches">
          <Pitch
            title="The Short One (15 seconds)"
            body={`"Triple Cities Tech is a managed IT services provider based in Central New York. We're the outsourced IT department for businesses that depend on technology but don't have — or don't want — a full IT team of their own. One flat monthly fee, everything handled."`}
          />
          <Pitch
            title="The Security Angle (30 seconds)"
            body={`"Small and mid-sized businesses are the #1 target for cyberattacks — not because they have more data, but because attackers know they're underdefended. TCT gives our clients enterprise-grade security monitoring, threat detection, and response for a predictable monthly fee. We handle the 24/7 watching so our clients can sleep at night."`}
          />
          <Pitch
            title="The Growth Angle (30 seconds)"
            body={`"Every hour your team spends troubleshooting computers, fighting with email, or waiting on the internet is an hour they're not serving customers or growing the business. TCT takes IT off your plate entirely — monitoring, support, security, cloud, backups — so you can focus on what actually moves the needle. Our clients typically recover the cost of our services in productivity alone."`}
          />
        </TrainingShell>
      </main>
    </>
  )
}

function Pitch({ title, body }: { title: string; body: string }) {
  return (
    <section className="bg-slate-900/40 border border-white/10 rounded-lg p-5 not-prose">
      <h3 className="text-sm font-semibold text-cyan-300 uppercase tracking-wider mb-2">{title}</h3>
      <p className="text-slate-100 leading-relaxed">{body}</p>
    </section>
  )
}
