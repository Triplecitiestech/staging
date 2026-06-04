import { SecHead, Lead, Body, Bullets, H3, DividerQuote } from '../primitives'

export default function Development() {
  return (
    <section id="development" className="pt-20 scroll-mt-8">
      <SecHead n="07" kicker="Project Track & Release Discipline">
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

      <H3>The AI play catalog — pain → play</H3>
      <Body>This is the build menu the discovery report maps each pain point to. Every play also reveals an IT / security need — the natural bridge into managed services, cybersecurity, and MRR.</Body>
      <Bullets items={[
        <><strong className="text-white font-semibold">AI email automation</strong> — follow-ups, outreach, responses. <span className="text-slate-400">Needs secure identity controls.</span></>,
        <><strong className="text-white font-semibold">AI customer intake & support</strong> — chatbots + automated ticket creation. <span className="text-slate-400">Needs uptime, monitoring, integration.</span></>,
        <><strong className="text-white font-semibold">AI sales prospecting engine</strong> — lead scoring, list building, outreach scripts. <span className="text-slate-400">Must comply with privacy laws.</span></>,
        <><strong className="text-white font-semibold">AI SOP / documentation builder</strong> — turn tribal knowledge into structured docs. <span className="text-slate-400">Needs secured storage.</span></>,
        <><strong className="text-white font-semibold">AI meeting capture + follow-up</strong> — summaries, tasks, decisions. <span className="text-slate-400">Must prevent sensitive-info leakage.</span></>,
        <><strong className="text-white font-semibold">AI lead-qualification bot</strong> — warms leads automatically. <span className="text-slate-400">Needs secure embedding + API protection.</span></>,
        <><strong className="text-white font-semibold">AI project-management automation</strong> — task creation and handoffs. <span className="text-slate-400">Requires strong system integrations.</span></>,
        <><strong className="text-white font-semibold">AI finance workflow automation</strong> — AP/AR, reporting, forecasting. <span className="text-slate-400">High-risk → cybersecurity reinforcement.</span></>,
        <><strong className="text-white font-semibold">AI content-repurposing engine</strong> — one asset → posts, emails, social. <span className="text-slate-400">Must avoid copyright / hallucination liability.</span></>,
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
