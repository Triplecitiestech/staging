import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import AgentHeader from '@/components/agents/AgentHeader'
import TrainingShell from '@/components/agents/TrainingShell'

export const dynamic = 'force-dynamic'

export default async function ServicesPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TrainingShell current="/agents/training/services" title="TCT Services at a Glance">
          <p>Agents don't need to sell the technical details — just know we cover it:</p>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li>Managed IT support — help desk, on-site, after-hours</li>
            <li>24/7 network and endpoint monitoring</li>
            <li>Cybersecurity — endpoint protection, email security, SaaS monitoring, security awareness training, dark web monitoring</li>
            <li>Backup and disaster recovery — Datto BCDR and cloud backup</li>
            <li>Microsoft 365 and Google Workspace — licensing, migration, administration</li>
            <li>Cloud and infrastructure — Azure, Microsoft 365, VoIP, network design</li>
            <li>Compliance support — HIPAA, CMMC, NY SHIELD, PCI</li>
            <li>Strategic IT planning (vCIO) — budgeting, roadmapping, technology reviews</li>
            <li>Project work — server migrations, office moves, hardware refreshes</li>
          </ul>
        </TrainingShell>
      </main>
    </>
  )
}
