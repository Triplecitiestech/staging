import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import AgentHeader from '@/components/agents/AgentHeader'
import TrainingShell from '@/components/agents/TrainingShell'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { href: '/agents/training/about-tct', label: 'About TCT', summary: 'Who we are, what we do, who we serve.' },
  { href: '/agents/training/pitches', label: 'Elevator Pitches', summary: 'Three ready-to-use pitches: short, security, growth.' },
  { href: '/agents/training/ideal-client', label: 'Ideal Client Profile', summary: 'What a great TCT referral looks like.' },
  { href: '/agents/training/objections', label: 'Objections & Handling', summary: 'Common pushback and how to respond.' },
  { href: '/agents/training/services', label: 'Services Overview', summary: 'What TCT actually sells.' },
  { href: '/agents/training/faq', label: 'Agent FAQ', summary: 'How commissions, qualifying, and timing work.' },
]

export default async function TrainingHomePage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">Training & Resources</h1>
        <p className="text-slate-400 mb-8">
          Quick reference material to help you talk about Triple Cities Tech with confidence.
        </p>
        <TrainingShell current="/agents/training" title="Overview">
          <p>
            Welcome to the agent training section. Use these pages as a reference whenever you're talking to a
            potential referral. You don't need to memorize anything — just know where to look.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 not-prose mt-4">
            {SECTIONS.map(s => (
              <li key={s.href}>
                <Link href={s.href} className="block p-4 bg-slate-900/50 border border-white/10 rounded-lg hover:border-cyan-500/40 hover:bg-slate-900/80 transition-colors">
                  <div className="text-white font-medium">{s.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{s.summary}</div>
                </Link>
              </li>
            ))}
          </ul>
        </TrainingShell>
      </main>
    </>
  )
}
