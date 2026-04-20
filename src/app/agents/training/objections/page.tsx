import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import AgentHeader from '@/components/agents/AgentHeader'
import TrainingShell from '@/components/agents/TrainingShell'

export const dynamic = 'force-dynamic'

const OBJECTIONS: { q: string; a: string }[] = [
  {
    q: '"We already have an IT guy."',
    a: 'Great — we work alongside existing IT in a co-managed model all the time. Most "IT guys" are overwhelmed. TCT can handle the 24/7 monitoring, security tooling, and after-hours support so the internal person can focus on strategic projects.',
  },
  {
    q: '"It\'s too expensive."',
    a: 'Compare the cost of our monthly fee to the cost of one full day of downtime, one ransomware incident, or hiring a single full-time IT employee (salary + benefits + tools + training). Managed services almost always come out ahead.',
  },
  {
    q: '"We haven\'t had any IT issues."',
    a: 'That\'s exactly when you should switch — when there\'s no crisis. Most clients who wait until something breaks pay far more for emergency response than they would have for proactive prevention. Also, "no issues" often means "issues no one is monitoring for" (like failed backups or security breaches).',
  },
  {
    q: '"We don\'t have time to switch providers."',
    a: 'TCT handles the entire onboarding. Our clients typically spend less than 2 hours of their time during the transition. We document everything, meet with their existing provider, and take the weight off.',
  },
  {
    q: '"We need to think about it."',
    a: 'Totally fair. Would it help to have a no-cost conversation with our team to just walk through what they\'d do differently? No commitment, no hard sell.',
  },
]

export default async function ObjectionsPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TrainingShell current="/agents/training/objections" title="Common Objections & How to Handle Them">
          <div className="not-prose space-y-4">
            {OBJECTIONS.map((o, i) => (
              <div key={i} className="bg-slate-900/40 border border-white/10 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-cyan-300 mb-2">{o.q}</h3>
                <p className="text-slate-100 leading-relaxed">{o.a}</p>
              </div>
            ))}
          </div>
        </TrainingShell>
      </main>
    </>
  )
}
