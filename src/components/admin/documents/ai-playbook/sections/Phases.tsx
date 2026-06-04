import Link from 'next/link'
import { GradSection, SecHead, Lead, Body, Phase, Bullets, H3, Callout, CalloutP, Gate } from '../primitives'
import { DISCOVERY_GROUPS } from '@/lib/ai-discovery/questions'

/** Chip marking the two phases sold together as the paid front door. */
function PkgChip() {
  return (
    <span className="ml-2.5 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-purple-500/18 text-purple-300 border border-purple-500/40 align-middle">
      AI-Readiness Package
    </span>
  )
}

function PriceChip() {
  return (
    <span className="ml-2 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 align-middle">
      From $1,000
    </span>
  )
}

// The AIGPA deep-dive process — what actually happens, who does it, how long.
const PROCESS = [
  { n: 'Pre', title: 'Intake form', meta: 'Client · before the call', body: 'Client completes the Business Snapshot intake (systems & tools, time & team, pain & goals, current AI state, top workflows) so the call starts warm.' },
  { n: '1', title: 'Discovery call', meta: '30 min · Zoom or Teams', body: 'Run 2–3 questions per profit zone. An AI notetaker captures the transcript, mapped to the six AIGPA zones. Listen for "manual / copy-paste / I do it / we forget".' },
  { n: '2', title: 'Build the kit', meta: '60 min · solo', body: 'Feed the transcript to Claude. Identify 3–5 AI plays per zone that actually move the needle.' },
  { n: '3', title: 'Build the report', meta: '~2 hrs · solo', body: 'Map each pain point to a specific AI play. Assemble the report: AI Profit Gap, readiness score, estimated monthly waste, and a prioritized 90-day roadmap.' },
  { n: '4', title: 'Review call', meta: '30 min · Zoom or Teams', body: 'Walk the client through the report and position the three paths forward — the upsell trigger.' },
]

function ProcessSteps() {
  return (
    <div className="flex flex-col gap-2.5 my-5">
      {PROCESS.map((s) => (
        <div key={s.n} className="flex gap-4 items-start rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div
            className="flex-none w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-black text-cyan-300 border border-cyan-400/30"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.14), rgba(34,211,238,0.03))' }}
          >
            {s.n}
          </div>
          <div>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h4 className="text-[16px] font-bold text-white">{s.title}</h4>
              <span className="text-[11px] font-bold uppercase tracking-wide text-cyan-400">{s.meta}</span>
            </div>
            <p className="text-[14.5px] leading-relaxed text-slate-300 mt-1 m-0">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function NeedsCard({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h4 className="text-[13px] font-bold uppercase tracking-[0.12em] text-cyan-300 mb-3">{title}</h4>
      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {items.map((it, i) => (
          <li key={i} className="relative pl-5 text-[14.5px] leading-relaxed text-slate-300">
            <span className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full bg-cyan-400" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Read-only mirror of the discovery question set (same source as the form). */
function DiscoveryWorksheet() {
  return (
    <>
      <p className="text-[15px] leading-relaxed text-slate-300 m-0">
        We fill this out live with the client in the discovery form — these questions are mirrored from the same source, so the doc and the form never drift. Pick 2–3 per zone; the platform-direction answers tally into a suggested ChatGPT / Claude / both recommendation, and each zone captures an estimated monthly $ waste.
      </p>
      {DISCOVERY_GROUPS.map((group) => (
        <div key={group.id}>
          <div className="flex items-baseline gap-2 mb-2">
            <h4 className="text-[14px] font-bold uppercase tracking-[0.1em] text-cyan-300">{group.title}</h4>
            {group.platform && <span className="text-[10px] font-bold uppercase tracking-wide text-purple-300">· steers platform</span>}
          </div>
          <div className="rounded-lg border border-white/10 divide-y divide-white/5">
            {group.questions.map((q) => (
              <div key={q.id} className="grid grid-cols-[120px_1fr] gap-x-4 px-4 py-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-cyan-400 pt-0.5">{q.theme}</div>
                <div>
                  <div className="text-[15px] text-white leading-snug">{q.prompt}</div>
                  <div className="text-[12.5px] text-slate-500 mt-0.5"><span className="text-slate-400 font-semibold">Tells you:</span> {q.tells}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Link
        href="/admin/documents/ai-playbook/discovery"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-[#04222a] w-fit"
        style={{ background: 'linear-gradient(135deg, #22D3EE, #0891B2)' }}
      >
        Open the discovery form →
      </Link>
    </>
  )
}

// Phase 1 — the 7-category AI Readiness Scorecard (rate each 1–5).
const READINESS_CATEGORIES: [string, string][] = [
  ['Workflow Automation', 'How automated are daily tasks?'],
  ['Data Organization', 'Is data structured, accessible, and accurate?'],
  ['AI Tool Adoption', 'Are they using any AI tools today?'],
  ['Cybersecurity Preparedness', 'Protection against AI-driven threats?'],
  ['Compliance & Governance', 'Are AI policies in place?'],
  ['Employee AI Usage', 'Is the team using AI safely and consistently?'],
  ['AI ROI Tracking', 'Are they measuring output, accuracy, outcomes?'],
]
const READINESS_BANDS: [string, string][] = [
  ['0–10', 'High risk — fix foundational issues first.'],
  ['11–20', 'Decent but unstructured — AI will expose vulnerabilities.'],
  ['21–30', 'Ready for strategic AI deployment.'],
  ['31–35', 'Advanced — operating at enterprise level.'],
]

function ReadinessScorecard() {
  return (
    <>
      <p className="text-[15px] leading-relaxed text-slate-300 m-0">
        Score each category 1–5 during the assessment. The total maps to a readiness band that backs the go / clean-data-first / not-ready call and frames the AI Profit Gap.
      </p>
      <div className="rounded-lg border border-white/10 divide-y divide-white/5">
        {READINESS_CATEGORIES.map(([k, d]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 items-center">
            <div>
              <div className="text-[15px] text-white leading-snug">{k}</div>
              <div className="text-[12.5px] text-slate-500">{d}</div>
            </div>
            <div className="text-[12px] font-mono text-slate-500">1–5</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {READINESS_BANDS.map(([range, label]) => (
          <div key={range} className="flex items-baseline gap-3">
            <span className="font-mono text-[12px] font-bold text-cyan-300 w-14 flex-none">{range}</span>
            <span className="text-[14px] text-slate-300">{label}</span>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Phases() {
  return (
    <GradSection id="phases">
      <SecHead n="03" kicker="Step-by-Step">
        Delivery <span className="text-cyan-400">Phases</span>
      </SecHead>

      <Lead>This mirrors traditional managed-services onboarding, but for AI. <strong className="text-white font-bold">Follow the order.</strong></Lead>
      <Body>Skipping a step "can bite everyone" — the readiness gates exist for a reason.</Body>

      <Callout label="The paid front door — AI-Readiness Package">
        <CalloutP>
          Discovery and the Readiness Assessment are sold together as one paid <strong className="text-white font-semibold">AI-Readiness Package</strong> (Phases 0–1), run as the <strong className="text-white font-semibold">AI Growth &amp; Profit Assessment (AIGPA)</strong>. It's the front door to every engagement: the client pays for a structured deep dive plus a real readiness assessment, and walks away with a recommended platform, an AI-readiness score, a quantified AI Profit Gap, and a prioritized 90-day roadmap — whether or not they continue.
        </CalloutP>
        <CalloutP>
          Everything downstream — cleanup, provisioning, enablement, the MRR — is scoped from the package's output. Set the expectation up front: <strong className="text-white font-semibold">discovery is billable and valuable on its own.</strong>
        </CalloutP>
      </Callout>

      <div className="my-7">
        <Phase
          n="0"
          title={<>Discovery — AI Growth &amp; Profit Assessment <PkgChip /><PriceChip /></>}
          output="Output → the AIGPA report (AI Profit Gap, readiness score, six-zone scoring, estimated monthly waste) + a prioritized 90-day roadmap + the client's chosen path (DIY / Consult / Done-For-You)."
          detailLabel="Show the six-zone question bank"
          detail={<DiscoveryWorksheet />}
        >
          <Body>
            Discovery runs as a paid <strong className="text-white font-semibold">AI Growth &amp; Profit Assessment</strong>: a structured deep dive that maps where the business leaks time and money across <strong className="text-white font-semibold">six profit zones</strong>, scores readiness, quantifies the waste in dollars, and returns a 90-day roadmap. It qualifies the engagement and sets expectations — "AI is in its AOL stage" — in the same motion.
          </Body>

          <Callout label="Pricing">
            <CalloutP>
              <strong className="text-white font-semibold">Starts at $1,000.</strong> The AIGPA is billable on its own and is the front door to every engagement. Scope up from $1,000 by company size, the number of zones in play, and depth (deeper systems audit, more stakeholders, larger team).
            </CalloutP>
          </Callout>

          <H3>The process</H3>
          <ProcessSteps />

          <H3>Everything needed</H3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-5">
            <NeedsCard
              title="What we need — internal"
              items={[
                <><strong className="text-white font-semibold">AI notetaker</strong> on every call — transcript mapped to the six zones.</>,
                <><strong className="text-white font-semibold">Claude / Cowork</strong> set up to our SOP (context folder, brand-voice, skills, scheduled tasks) — the engine that builds the kit + report.</>,
                <><strong className="text-white font-semibold">AIGPA report template</strong> — pain → AI-play mapping, 90-day roadmap, three paths.</>,
                <>The <strong className="text-white font-semibold">discovery form</strong> (this tool) + the ROI / monthly-waste capture.</>,
                <><strong className="text-white font-semibold">~3.5 hrs solo build</strong> per assessment (kit + report), plus the two calls.</>,
                <>The <strong className="text-white font-semibold">AI Services Agreement</strong> (scope, pricing, liability) ready to attach if they proceed.</>,
              ]}
            />
            <NeedsCard
              title="What the client provides — external"
              items={[
                <><strong className="text-white font-semibold">Completed intake form</strong> before the call — systems & tools, time & team, pain & goals, current AI state, top workflows.</>,
                <>A <strong className="text-white font-semibold">30-min discovery call</strong> and a <strong className="text-white font-semibold">30-min review call</strong> (Zoom/Teams).</>,
                <>The <strong className="text-white font-semibold">owner / real decision-maker</strong> in the room, plus relevant department leads.</>,
                <><strong className="text-white font-semibold">Real numbers</strong> — hours, payroll, metrics — so we can quantify monthly waste.</>,
                <><strong className="text-white font-semibold">Read / visibility access</strong> where needed to validate readiness.</>,
              ]}
            />
          </div>

          <Link
            href="/admin/documents/ai-playbook/discovery"
            className="inline-flex items-center gap-2 mt-1 px-4 py-2.5 rounded-lg font-semibold text-sm text-[#04222a] w-fit"
            style={{ background: 'linear-gradient(135deg, #22D3EE, #0891B2)' }}
          >
            Open the discovery form →
          </Link>
        </Phase>

        <Phase
          n="1"
          title={<>Readiness Assessment <PkgChip /></>}
          output="Output → an AI-readiness score, the AI Profit Gap, the go / clean-data-first / not-ready decision, and a prioritized quick-win list."
          detailLabel="Show the AI Readiness Scorecard"
          detail={<ReadinessScorecard />}
        >
          <Bullets items={[
            <><strong className="text-white font-semibold">Audit foundations:</strong> is the Microsoft / Entra / SharePoint environment configured correctly and healthy?</>,
            <><strong className="text-white font-semibold">Assess the data:</strong> where it lives, and whether it's clean and connectable. This is the gate that decides everything downstream.</>,
            <><strong className="text-white font-semibold">Score AI readiness</strong> across seven categories (open the scorecard below) and surface low-hanging fruit / quick wins.</>,
            'Confirm compliance posture (CUI / CMMC) and procurement (buying through TCT vs. their own) — both set the engagement type.',
          ]} />
        </Phase>

        <Phase n="2" title="Foundation & Data Cleanup" gated>
          <Bullets items={[
            <><strong className="text-white font-semibold">If data fails the readiness gate:</strong> scope a cleanup project first (we use AI to do it). Cost varies with how messy SharePoint is.</>,
            'Confirm Microsoft / Entra / SharePoint hygiene and that systems are AI-connectable.',
            <><strong className="text-white font-semibold">Do not proceed to provisioning</strong> until the foundation passes.</>,
          ]} />
        </Phase>

        <Phase n="3" title="Platform Selection & Provisioning">
          <Bullets items={[
            'Confirm the platform direction from discovery (see §4 for the ChatGPT vs. Claude call). Default to ChatGPT for everyday employee use today.',
            'Stand up the business / Team account, configure the domain, prepare to invite employees.',
            'Confirm training is off (default on Business — contractual, not a per-account toggle) and document it. Confirm corporate (not personal) accounts for all employees.',
          ]} />
        </Phase>

        <Phase n="4" title="Governance & Integrations">
          <Bullets items={[
            'Apply security & governance baseline; document the ring-fencing.',
            <><strong className="text-white font-semibold">Wire native connectors:</strong> ChatGPT ↔ Microsoft, SharePoint, email. Context is everything — the more clean context, the better the output.</>,
            'Define user tiers (basic vs. advanced consumers, like Microsoft licensing).',
          ]} />
        </Phase>

        <Phase n="5" title="User Enablement & Adoption">
          <Bullets items={[
            'Launch AI office hours. Two to three weeks of sessions teaching prompting: "try this, come back to me." Review how they prompted, give better examples.',
            <>Centralize support through office hours — <strong className="text-white font-semibold">not</strong> "I built my own GPT, can I call you?" ad-hoc calls that eat time.</>,
            'Optional: monthly AI overview webinar (all-client). Good feedback loop, but it\'s a commitment.',
          ]} />
        </Phase>

        <Phase n="6" title={<>Ongoing Management <span className="text-sm font-bold text-cyan-300 tracking-wide">— the MRR</span></>}>
          <Bullets items={[
            'Monitor token consumption against the org pool; alert at thresholds; decide reallocate vs. buy more.',
            'Handle adds / moves / changes.',
            '"Surface project opportunities: \'you\'ve got a taste — it can also do these things as a project.\'"',
          ]} />
        </Phase>
      </div>

      <Callout label="Three paths forward — the Review-Call upsell">
        <CalloutP>
          Every AIGPA ends by positioning <strong className="text-white font-semibold">three paths</strong>: <strong className="text-white font-semibold">DIY</strong> (the client runs the roadmap themselves), <strong className="text-white font-semibold">Consult</strong> (we advise &amp; coach), or <strong className="text-white font-semibold">Done-For-You</strong> (we build and manage — the managed-services + AI Development motions). The report is the upsell trigger; the roadmap is the menu.
        </CalloutP>
      </Callout>

      <H3>Decision gates &amp; forks</H3>
      <Body>Run these in order. The first three qualify the engagement; the rest shape the build.</Body>
      <div className="my-6 space-y-0">
        <Gate fork="Gate · Readiness" question="Do foundations + data pass the readiness assessment?" yesText="Proceed to platform selection & provisioning." noText={<>Scope a foundation / data-cleanup project first <strong className="text-white font-semibold">(full stop)</strong>.</>} />
        <Gate fork="Gate · Compliance" question="Any CUI / CMMC-regulated data in scope?" yesText="Keep it out of cloud AI — out of scope at this stage." noText="Proceed under the standard disclaimer; ring-fence training off." />
        <Gate fork="Gate · Procurement" question="Is the client buying AI through TCT?" yesText="Full managed services — we run it end to end." noText="Support only on a contract; ongoing maintenance stays theirs." />
        <Gate fork="Gate · Platform" question="Primary use = everyday chat & employee enablement?" yesText="Standardize on ChatGPT." noText="Custom build / automation → Claude + an AI Development project." />
        <Gate fork="Gate · Sensitivity" question={'Is "AI sees our data" a true full-stop concern?'} yesText="Go local — Spark / private cloud (fewer integrations; set expectations)." noLabel="Otherwise" noText="Educate (§5) and proceed — same risk model as Google / Microsoft for 20 yrs." />
        <Gate fork="Gate · Expansion" question="Does the client want a custom build now?" yesText="Scope as AI Development — release cycle + recurring maintenance fee." noText="Stay in managed services; surface at the next TBR." />
      </div>
    </GradSection>
  )
}
