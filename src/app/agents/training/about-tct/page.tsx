import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import AgentHeader from '@/components/agents/AgentHeader'
import TrainingShell from '@/components/agents/TrainingShell'

export const dynamic = 'force-dynamic'

export default async function AboutTctPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TrainingShell current="/agents/training/about-tct" title="About Triple Cities Tech">
          <p>
            Triple Cities Tech (TCT) is a Managed Service Provider headquartered in the Central New York region.
            We function as the outsourced IT department for small and mid-sized businesses — organizations that
            rely on technology every day but are too small to staff a full internal IT team (and too busy to
            deal with it themselves).
          </p>
          <p>
            We combine 24/7 monitoring, proactive maintenance, cybersecurity, cloud services, backup and
            disaster recovery, and strategic IT planning into a single predictable monthly fee. Our clients
            stop thinking about IT and start running their businesses.
          </p>
          <h2 className="text-lg font-bold text-white mt-6 mb-2">What makes TCT different</h2>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li>Local, responsive, and accountable — real humans in the region, not an overseas call center.</li>
            <li>Enterprise-grade tooling (Datto, Microsoft 365, advanced security monitoring) at small-business pricing.</li>
            <li>Proactive, not reactive — we catch problems before they cause downtime.</li>
            <li>Transparent, flat-rate pricing with no nickel-and-diming.</li>
          </ul>
        </TrainingShell>
      </main>
    </>
  )
}
