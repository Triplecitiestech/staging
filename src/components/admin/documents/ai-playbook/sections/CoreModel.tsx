import { SecHead, Lead, Body, Callout, CalloutP, Bullets, H3 } from '../primitives'

export default function CoreModel() {
  return (
    <section id="core" className="pt-20 scroll-mt-8">
      <SecHead n="01" kicker="The #1 Rule">
        The <span className="text-cyan-400">Core Model</span>
      </SecHead>

      <Lead>
        The offering is split into two distinct, <strong className="text-cyan-300 font-bold">separately-sold</strong> motions. Keeping them separate is the single most important rule in this playbook.
      </Lead>
      <Body>
        Conflating them is what lets the wrong client think they can call you to "snap your fingers" on custom work for a flat monthly fee. Sell them apart. Price them apart. Talk about them apart.
      </Body>

      {/* Two-part model cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 my-7">
        {/* MRR card */}
        <div
          className="rounded-3xl p-8 border border-cyan-400/30 overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, rgba(6,182,212,0.16), rgba(0,0,0,0.55))',
            boxShadow: '0 8px 24px rgba(6,182,212,0.20)',
          }}
        >
          <span
            className="inline-flex items-center text-[11.5px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full mb-4 text-[#04222a]"
            style={{ background: 'linear-gradient(90deg, #22D3EE, #0891B2)' }}
          >
            Recurring · MRR
          </span>
          <h3 className="text-[27px] font-black text-white tracking-tight mb-1.5">AI Managed Services</h3>
          <div className="text-sm font-semibold text-cyan-300 tracking-wide mb-4">High-margin recurring — enablement, governance &amp; community</div>
          <p className="text-[15.5px] leading-relaxed text-slate-300 m-0">
            We configure the org, set token / consumption rules, run governance and adds / moves / changes — <strong className="text-white font-semibold">plus monthly customer AI webinars</strong> (success stories, what's new, what's coming). High margin because it rides on the MSP foundation; active, not "set and forget," because the AI landscape moves fast.
          </p>
          <div className="mt-5 pt-4 border-t border-white/10 text-sm leading-snug text-slate-200">
            <strong className="text-white font-semibold">Pitch this in every TBR.</strong> It's the foundation the AI layer rides on.
          </div>
        </div>
        {/* Dev card */}
        <div
          className="rounded-3xl p-8 border border-white/20 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(31,41,55,0.55), rgba(0,0,0,0.6))' }}
        >
          <span className="inline-flex items-center text-[11.5px] font-bold uppercase tracking-[0.16em] px-3 py-1.5 rounded-full mb-4 bg-purple-500/18 text-purple-300 border border-purple-500/40">
            Project-based · One-off
          </span>
          <h3 className="text-[27px] font-black text-white tracking-tight mb-1.5">AI Development</h3>
          <div className="text-sm font-semibold text-purple-300 tracking-wide mb-4">Custom builds, billed up front</div>
          <p className="text-[15.5px] leading-relaxed text-slate-300 m-0">
            Custom GPTs, agents, integrations, automations, and data cleanup. Bigger dollars up front — and each build carries its own recurring maintenance fee once delivered.
          </p>
          <div className="mt-5 pt-4 border-t border-white/10 text-sm leading-snug text-slate-200">
            <strong className="text-white font-semibold">Near-term, these out-earn the recurring.</strong> They can be large.
          </div>
        </div>
      </div>

      <Callout label="Why carry both">
        <CalloutP>
          MRR is the predictable, near-free money once configured. But in the near term the one-off projects will make more than the recurring. The natural regression: <strong className="text-white font-semibold">a client adopts managed services, gets a taste of what AI can do, then buys a project</strong> to push past the out-of-the-box limits.
        </CalloutP>
      </Callout>

      <H3>Go-to-market sequencing</H3>
      <Body>Do not let buildout block client conversations. The phased rollout:</Body>
      <Bullets items={[
        <><strong className="text-white font-semibold">Now — Thought leadership.</strong> Use TBRs to establish TCT as the AI authority. Show the amazing things, share the journey ("AI is in its AOL stage — evolving fast"), talk prompting for free. Goal: they walk away wowed.</>,
        <><strong className="text-white font-semibold">Next — Partner channels.</strong> Anthropic's Claude Partner Network is already live (launched March 2026; free to join, with a partner portal and certifications) — apply now. OpenAI has no public reseller program; the path there is provisioning and managing ChatGPT Business on the client's behalf, plus tracking OpenAI's enterprise pathways. The goal of both: predictable billing and multi-tenancy.</>,
        <><strong className="text-white font-semibold">Then — Scale.</strong> Standardized bundle, Autotask line items, monthly AI overview webinars, case studies feeding new-client meetings.</>,
      ]} />
      <Callout label="Timeline anchor">
        <CalloutP>
          By <strong className="text-white font-semibold">end of June</strong>, have something on the books to take to a client. The TBR audience is small — fewer than 10 — so the bar is "get these done," not "build the perfect platform."
        </CalloutP>
      </Callout>
    </section>
  )
}
