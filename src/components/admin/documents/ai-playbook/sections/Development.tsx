import { SecHead, Lead, Body, Bullets, H3, DividerQuote } from '../primitives'

export default function Development() {
  return (
    <section id="development" className="pt-20 scroll-mt-8">
      <SecHead n="08" kicker="Project Track & Release Discipline">
        AI <span className="text-cyan-400">Development</span>
      </SecHead>

      <Lead>Anything custom — GPTs, agents, integrations, automations, app builds — lives here, <strong className="text-white font-bold">not in the monthly fee.</strong></Lead>
      <Body>This is development work; treat it with development discipline so a single client can't consume you with live tweak requests.</Body>

      <H3>Guardrails</H3>
      <Bullets items={[
        <><strong className="text-white font-semibold">Every signature-ready quote states a development cycle.</strong> The product ships at, say, v1.2; new asks queue into the next release (1.3, 1.4).</>,
        <><strong className="text-white font-semibold">No live tweaking.</strong> Work flows development → test → production. AI makes this faster than traditional dev (you can speak tweaks into existence), so it needn't be rigid — but the guardrails protect your time.</>,
        <><strong className="text-white font-semibold">Communicate the roadmap like a game studio patch list:</strong> "here's what's in 1.3, here's what's on the PTR / dev list." Sets expectations and kills the "call you every other day" problem.</>,
        <><strong className="text-white font-semibold">Custom builds always carry a monthly recurring maintenance fee</strong> — never sell a custom product without it.</>,
      ]} />

      <H3>Project examples — fast, one-off mini-projects</H3>
      <Bullets items={[
        'Custom GPT for grant writing.',
        'Scheduled agent that performs a task automatically.',
        'Connector / automation into SharePoint, email, or a line-of-business app.',
        'Larger builds: replacing a single legacy app (e.g., an ERP-style solution) — potentially six-figure for bigger orgs, smaller for TCT\'s clients.',
      ]} />

      <DividerQuote src="Land the project · Attach the maintenance MRR">
        One-off projects out-earn recurring at first — they can be large. The recurring then compounds as "set-it-and-forget-it" SaaS margin.
      </DividerQuote>
    </section>
  )
}
