import { redirect } from 'next/navigation'
import { getCurrentAgent } from '@/lib/agent-auth'
import AgentHeader from '@/components/agents/AgentHeader'
import TrainingShell from '@/components/agents/TrainingShell'

export const dynamic = 'force-dynamic'

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I log in the first time?',
    a: 'When TCT sets up your agent account, you\'ll receive a welcome email with a secure link. Click it to set your own password (the link expires in 48 hours — if it does, just reply to the email and we\'ll re-send). From then on, you log in at our agent portal with your email and your chosen password.',
  },
  {
    q: 'I\'m locked out or forgot my password.',
    a: 'Use the "Forgot password" link on the login page. If it doesn\'t arrive, email sales@triplecitiestech.com and we\'ll reset it manually.',
  },
  {
    q: 'When exactly do I get paid?',
    a: 'When the business you referred pays their third monthly invoice, you receive a commission equal to the full amount of that third invoice. So if they sign a $3,500/month agreement, you receive $3,500 after the third month\'s payment clears.',
  },
  {
    q: 'What counts as a qualified referral?',
    a: 'A business that (a) you have actually talked to and gotten permission to share their info, (b) was not already in TCT\'s pipeline, and (c) ultimately signs a recurring managed services agreement. One-off project work doesn\'t qualify unless it converts into an ongoing agreement.',
  },
  {
    q: 'What if two agents refer the same business?',
    a: 'The first agent to submit the referral through the portal gets credit, assuming the business hadn\'t already been in our pipeline before either submission.',
  },
  {
    q: 'How long do I have credit for a referral?',
    a: 'Your referral stays credited to you as long as the deal is active in our pipeline. If they go cold and come back 18 months later through another channel, we\'d handle that case-by-case — but if it\'s clearly still the result of your introduction, you\'re credited.',
  },
  {
    q: 'What if the client cancels after 3 months?',
    a: 'Once the commission is triggered by the third payment, it\'s yours. Future cancellations don\'t claw that back.',
  },
  {
    q: 'Do I need to do the selling?',
    a: 'No. Your job is to introduce and make the connection. TCT handles the sales process, scoping, quoting, and closing. You can absolutely stay involved if it helps build trust with the prospect, but you\'re not expected to pitch or negotiate.',
  },
  {
    q: 'Who do I contact at TCT if I have a question about a referral?',
    a: 'Reply to the confirmation email you received when you submitted, or email sales@triplecitiestech.com.',
  },
]

export default async function FaqPage() {
  const agent = await getCurrentAgent()
  if (!agent) redirect('/agents/login')

  return (
    <>
      <AgentHeader agentName={agent.firstName} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TrainingShell current="/agents/training/faq" title="FAQ for Agents">
          <div className="not-prose space-y-4">
            {FAQ.map((item, i) => (
              <details key={i} className="bg-slate-900/40 border border-white/10 rounded-lg p-5 group">
                <summary className="cursor-pointer text-white font-medium list-none flex items-start justify-between gap-3">
                  <span>{item.q}</span>
                  <span className="text-cyan-400 text-xl leading-none transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="text-slate-200 leading-relaxed mt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </TrainingShell>
      </main>
    </>
  )
}
