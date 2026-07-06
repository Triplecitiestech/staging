import { redirect } from 'next/navigation'
import { resolveTrainingViewer } from '@/lib/agent-training-access'
import TrainingChrome from '@/components/agents/TrainingChrome'
import TrainingShell from '@/components/agents/TrainingShell'

export const dynamic = 'force-dynamic'

export default async function IdealClientPage() {
  const viewer = await resolveTrainingViewer()
  if (!viewer) redirect('/agents/login')

  return (
    <>
      <TrainingChrome viewer={viewer} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TrainingShell current="/agents/training/ideal-client" title="Ideal Client Profile">
          <p>A great TCT referral typically looks like this:</p>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li><strong>Size:</strong> 10–100 employees (we can handle smaller or larger, but this is the sweet spot).</li>
            <li><strong>Location:</strong> Central New York region or nearby (Binghamton, Syracuse, Ithaca, surrounding areas).</li>
            <li><strong>Industries we serve well:</strong> Professional services (accounting, legal, financial), healthcare, construction/contractors, nonprofits, light manufacturing, retail with multiple locations.</li>
          </ul>
          <h2 className="text-lg font-bold text-white mt-6 mb-2">Signs they need us</h2>
          <ul className="list-disc list-outside pl-5 space-y-1">
            <li>They rely on email, files, and line-of-business software every day.</li>
            <li>They've had a security scare, data loss, or major outage in the last year.</li>
            <li>They have compliance requirements (HIPAA, PCI, CMMC, NY SHIELD).</li>
            <li>Their "IT guy" is a family member, a vendor's nephew, or whoever happens to know computers.</li>
            <li>They're growing and feel like IT is a bottleneck.</li>
          </ul>
          <h2 className="text-lg font-bold text-white mt-6 mb-2">Less ideal fits</h2>
          <p>Pure-play tech companies with in-house engineers, very small shops under 5 people, or businesses that actively resist modernization.</p>
        </TrainingShell>
      </main>
    </>
  )
}
