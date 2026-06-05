import { SecHead, Lead, Body, Bullets, H3, Callout, CalloutP, DividerQuote } from '../primitives'

const VALUE_ADDS: { name: string; desc: string; price: string }[] = [
  { name: 'Custom GPTs', desc: 'Purpose-built assistants — grant-writing, proposal drafting, SOP / policy Q&A, onboarding helpers.', price: 'from $1,000 each' },
  { name: 'Custom agents (ChatGPT)', desc: 'Scheduled or triggered agents that perform a task automatically.', price: 'from $1,000+' },
  { name: 'Claude Cowork enablement', desc: "Teach the client's team to set up & use Cowork — context, skills, scheduled tasks.", price: 'scoped package' },
  { name: 'Done-for-you Cowork builds', desc: 'We build their Cowork workspace, scheduled tasks, and custom automations.', price: 'project quote' },
  { name: 'Data ingestion & routing', desc: 'e.g. analyze call logs for missed / unreturned calls and new callers, then auto-ingest & route the data — eliminating manual entry (the Brooms Over Broome win).', price: 'scoped project' },
  { name: 'Workflows & integrations', desc: 'Beyond the 3 included native integrations — native = small, MCP / custom = larger.', price: 'project quote' },
]

function ValueAddRow({ name, desc, price }: { name: string; desc: string; price: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[15px] font-bold text-white">{name}</div>
        <div className="text-[14px] text-slate-400 mt-0.5 leading-snug">{desc}</div>
      </div>
      <span className="flex-none text-[11.5px] font-bold text-emerald-300 bg-emerald-400/15 border border-emerald-400/30 rounded-full px-2.5 py-1 whitespace-nowrap">{price}</span>
    </div>
  )
}

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
        <><strong className="text-white font-semibold">Custom builds can carry their own monthly recurring maintenance fee</strong> — price it in whenever there's ongoing upkeep, so each build adds to the MRR.</>,
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

      <H3>Value-add menu &amp; pricing</H3>
      <Body>These are the adds / moves / changes that ride on a managed environment — always additional, and the easiest upsells once a client has a taste.</Body>
      <div className="flex flex-col gap-2.5 my-5">
        {VALUE_ADDS.map((v) => <ValueAddRow key={v.name} {...v} />)}
      </div>

      <Callout label="Pricing anchor">
        <CalloutP>
          <strong className="text-white font-semibold">Custom GPTs and agents start at $1,000 each</strong> and scale with complexity. Larger automations, integrations, and app builds (e.g., replacing a legacy app — six-figure for bigger orgs, smaller for TCT's clients) are project-quoted. Every build can carry an optional recurring maintenance fee.
        </CalloutP>
      </Callout>

      <Callout label="Target the right people first">
        <CalloutP>
          Part of every engagement is <strong className="text-white font-semibold">selecting the employees and roles where these tools deliver the most</strong> — deploy there first for the fastest, most visible ROI and your best internal champions. Don't spread thin; win loud, then expand.
        </CalloutP>
      </Callout>

      <DividerQuote src="Land the project · Attach the maintenance MRR">
        One-off projects out-earn recurring at first — they can be large. The recurring then compounds as "set-it-and-forget-it" SaaS margin.
      </DividerQuote>
    </section>
  )
}
