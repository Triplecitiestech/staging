import Link from 'next/link'
import { GradSection, SecHead, Lead, Body, Phase, Bullets, H3, H4, Callout, CalloutP, Gate } from '../primitives'

function PriceChip() {
  return (
    <span className="ml-2 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 align-middle">
      From $1,000
    </span>
  )
}

function FormLink() {
  return (
    <Link
      href="/admin/documents/ai-playbook/discovery"
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-[#04222a] w-fit"
      style={{ background: 'linear-gradient(135deg, #22D3EE, #0891B2)' }}
    >
      Open the discovery form →
    </Link>
  )
}

// The deep-dive process inside the assessment — what happens, who, how long.
const PROCESS = [
  { n: 'Pre', title: 'Intake form', meta: 'Client · before the call', body: 'Client completes the Business Snapshot intake so the call starts warm. Captured in the discovery form.' },
  { n: '1', title: 'Discovery call', meta: '30 min · Zoom/Teams', body: 'Run 2–3 questions per profit zone. AI notetaker captures the transcript, mapped to the six zones. Listen for "manual / copy-paste / I do it / we forget".' },
  { n: '2', title: 'Foundations & data check', meta: 'During the engagement', body: 'Verify a healthy Microsoft / Entra / SharePoint environment and clean, connectable data — the gate that decides the roadmap.' },
  { n: '3', title: 'Build the report', meta: '~3 hrs · solo', body: 'Feed the transcript to Claude, map each pain to an AI play, and assemble the AIGPA report: AI Profit Gap, readiness score, estimated monthly waste, 90-day roadmap.' },
  { n: '4', title: 'Review call', meta: '30 min · Zoom/Teams', body: 'Walk the client through the report and position the three paths forward — the upsell trigger.' },
]

function ProcessSteps() {
  return (
    <div className="flex flex-col gap-2.5">
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

// Phase 1 — the 7-category AI Readiness Scorecard.
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

// Phase 6 — the committed monthly customer AI webinar.
const WEBINAR_AGENDA: [string, string][] = [
  ['Welcome & wins · 5 min', 'Quick community roundtable — what worked this month.'],
  ['What we shipped · 10 min', 'Anonymized success stories / plays deployed for customers.'],
  ["What's new in AI · 10 min", 'Landscape update — new models, features, releases.'],
  ["What's coming · 5 min", 'Roadmap and what to prepare for next.'],
  ['Live Q&A / office hours · 15 min', 'Bring your prompts and use cases.'],
  ['One play to try · 5 min', "The month's recommended action."],
]

function WebinarAgenda() {
  return (
    <>
      <p className="text-[15px] leading-relaxed text-slate-300 m-0">
        The monthly customer AI webinar is a <strong className="text-white font-semibold">committed managed-services deliverable</strong> — the community layer of the recurring fee. <strong className="text-white font-semibold">Owner: Jim.</strong> Cadence: monthly, all-customer (Zoom/Teams). Output: recording + recap posted to the portal.
      </p>
      <H4>Standard agenda (~45 min)</H4>
      <div className="rounded-lg border border-white/10 divide-y divide-white/5">
        {WEBINAR_AGENDA.map(([slot, desc]) => (
          <div key={slot} className="px-4 py-2.5">
            <div className="text-[14px] font-semibold text-white">{slot}</div>
            <div className="text-[13px] text-slate-400">{desc}</div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Phases() {
  return (
    <GradSection id="phases">
      <SecHead n="03" kicker="The Linear Process">
        Delivery <span className="text-cyan-400">Phases</span>
      </SecHead>

      <Lead>One path, start to finish. <strong className="text-white font-bold">Every customer begins with the AI Readiness Assessment</strong> — branches are explicit gates, not detours.</Lead>
      <Body>Each phase shows the essentials; click a phase to expand the full process, sub-steps, and templates.</Body>

      <Callout label="The paid front door — AI Readiness Assessment">
        <CalloutP>
          Every engagement starts with one paid <strong className="text-white font-semibold">AI Readiness Assessment</strong> (the AIGPA), from $1,000. It's a real deep-dive analysis — six profit zones, a readiness + foundations check, and a quantified AI Profit Gap — delivered as a report with a 90-day roadmap and three paths forward. <strong className="text-white font-semibold">The customer is buying clarity and a plan</strong>, not a sales pitch; everything downstream is scoped from its output.
        </CalloutP>
      </Callout>

      <div className="my-7">
        <Phase
          n="1"
          title={<>AI Readiness Assessment <PriceChip /></>}
          output="Output → the AIGPA report + a readiness verdict (go / clean-data-first / not-ready) + the client's chosen path (DIY / Consult / Done-For-You)."
          detail={
            <>
              <p className="text-[15px] leading-relaxed text-slate-300 m-0">
                <strong className="text-white font-semibold">What the client is paying for:</strong> a clear, quantified answer to "is AI worth it for us, and where's the ROI?" — delivered as the AIGPA report (AI Profit Gap, platform recommendation, 90-day roadmap, three paths). That's the differentiator: a real analysis, not a pitch.
              </p>

              <H4>The process</H4>
              <ProcessSteps />

              <H4>Everything needed</H4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NeedsCard
                  title="What we need — internal"
                  items={[
                    <><strong className="text-white font-semibold">AI notetaker</strong> on every call — transcript mapped to the six zones.</>,
                    <><strong className="text-white font-semibold">Claude / Cowork</strong> set up to our SOP (context, brand-voice, skills) — the engine that builds the report.</>,
                    <><strong className="text-white font-semibold">AIGPA report template</strong> + the discovery form (intake, questions, waste calculator).</>,
                    <><strong className="text-white font-semibold">~3 hrs solo build</strong> + the two 30-min calls.</>,
                    <>The <strong className="text-white font-semibold">AI Services Agreement</strong> ready to attach if they proceed.</>,
                  ]}
                />
                <NeedsCard
                  title="What the client provides — external"
                  items={[
                    <><strong className="text-white font-semibold">Completed intake</strong> before the call (systems & tools, time & team, pain & goals, current AI state, top workflows).</>,
                    <>A <strong className="text-white font-semibold">30-min discovery call</strong> and a <strong className="text-white font-semibold">30-min review call</strong>.</>,
                    <>The <strong className="text-white font-semibold">owner / real decision-maker</strong>, plus relevant department leads.</>,
                    <><strong className="text-white font-semibold">Real numbers</strong> — hours, payroll, metrics — to quantify monthly waste.</>,
                    <><strong className="text-white font-semibold">Read / visibility access</strong> where needed to validate readiness.</>,
                  ]}
                />
              </div>

              <H4>Foundations &amp; data readiness (built in)</H4>
              <p className="text-[15px] leading-relaxed text-slate-300 m-0">
                Verifying the foundation is <em>part of</em> the assessment — not a separate step. Without a healthy Microsoft / Entra / SharePoint environment and clean, connectable data, the LLM is just a chatbot with no knowledge of the business (garbage in, garbage out). If the foundation fails, the roadmap opens with a cleanup project (Phase 2).
              </p>

              <H4>AI Readiness Scorecard</H4>
              <p className="text-[15px] leading-relaxed text-slate-300 m-0">Score each 1–5; the total maps to a readiness band that backs the verdict.</p>
              <ReadinessScorecard />

              <Callout label="Pricing">
                <CalloutP>
                  <strong className="text-white font-semibold">Starts at $1,000.</strong> Billable and valuable on its own. Scope up by company size, zones in play, and depth.
                </CalloutP>
              </Callout>

              <FormLink />
              <p className="text-[13px] text-slate-500 m-0">The form holds the intake, the six-zone deep dive, and the monthly-waste calculator. Generate the AIGPA report from a saved assessment, then open it to present / print.</p>
            </>
          }
        >
          <Bullets items={[
            <><strong className="text-white font-semibold">Everyone starts here</strong> — a paid deep dive that answers "is AI worth it, and where's the ROI?"</>,
            'Six-zone discovery (intake + call), readiness scored, monthly waste quantified in dollars.',
            'Foundations & data readiness are checked as part of the assessment.',
            <><strong className="text-white font-semibold">Deliverable:</strong> the AIGPA report — Profit Gap, platform rec, 90-day roadmap, three paths.</>,
          ]} />
        </Phase>

        <Phase n="2" title="Foundation & Data Cleanup" gated>
          <Bullets items={[
            <><strong className="text-white font-semibold">Fires only if the readiness check fails.</strong> It's a project, not part of the MRR.</>,
            'Scope a cleanup / remediation project first (we use AI to do it). Cost scales with how messy SharePoint is.',
            'Confirm Microsoft / Entra / SharePoint hygiene and that systems are AI-connectable.',
            <><strong className="text-white font-semibold">Do not proceed to provisioning</strong> until the foundation passes.</>,
          ]} />
        </Phase>

        <Phase n="3" title="Platform Selection & Provisioning">
          <Bullets items={[
            'Confirm the platform direction from the assessment. Default to ChatGPT for everyday employee use; Claude for build / integration work.',
            'Stand up the business / Team account, configure the domain, prepare to invite employees.',
            'Confirm training is off (default on Business — contractual) and document it. Corporate (not personal) accounts for everyone.',
          ]} />
        </Phase>

        <Phase n="4" title="Governance & Integrations">
          <Bullets items={[
            'Apply the security & governance baseline; document the ring-fencing.',
            <><strong className="text-white font-semibold">Wire native connectors:</strong> ChatGPT ↔ Microsoft, SharePoint, email. Clean context in → better output.</>,
            'Define user tiers (basic vs. advanced consumers, like Microsoft licensing).',
          ]} />
        </Phase>

        <Phase n="5" title="Enablement & Adoption">
          <Bullets items={[
            'Launch AI office hours — 2–3 weeks of prompting sessions: "try this, come back to me," then review and level them up.',
            <>Centralize support through office hours — <strong className="text-white font-semibold">not</strong> ad-hoc "can I call you?" requests that eat time.</>,
            'Kick off the monthly customer AI webinar (handed to ongoing management).',
          ]} />
        </Phase>

        <Phase
          n="6"
          title={<>Ongoing Management <span className="text-sm font-bold text-cyan-300 tracking-wide">— the MRR</span></>}
          detail={<WebinarAgenda />}
        >
          <Bullets items={[
            'Monitor token consumption against the org pool; alert at thresholds; reallocate vs. buy more.',
            'Handle adds / moves / changes.',
            <><strong className="text-white font-semibold">Run the monthly customer AI webinar</strong> (owner: Jim) — community, success stories, what\'s new & coming. Expand for the agenda.</>,
            'Surface project opportunities: "you\'ve got a taste — it can also do these as a project."',
          ]} />
        </Phase>
      </div>

      <Callout label="Three paths forward — the Review-Call upsell">
        <CalloutP>
          Every assessment ends by positioning <strong className="text-white font-semibold">three paths</strong>: <strong className="text-white font-semibold">DIY</strong> (the client runs the roadmap), <strong className="text-white font-semibold">Consult</strong> (we advise &amp; coach), or <strong className="text-white font-semibold">Done-For-You</strong> (we build and manage — the managed-services + AI Development motions). The report is the upsell trigger; the roadmap is the menu.
        </CalloutP>
      </Callout>

      <H3>Decision gates &amp; forks</H3>
      <Body>Run these in order. The first three qualify the engagement; the rest shape the build.</Body>
      <div className="my-6 space-y-0">
        <Gate fork="Gate · Readiness" question="Do foundations + data pass the assessment?" yesText="Proceed to platform selection & provisioning." noText={<>Scope a foundation / data-cleanup project first <strong className="text-white font-semibold">(Phase 2)</strong>.</>} />
        <Gate fork="Gate · Compliance" question="Any CUI / CMMC-regulated data in scope?" yesText="Keep it out of cloud AI — out of scope at this stage." noText="Proceed under the standard disclaimer; ring-fence training off." />
        <Gate fork="Gate · Procurement" question="Is the client buying AI through TCT?" yesText="Full managed services — we run it end to end." noText="Support only on a contract; ongoing maintenance stays theirs." />
        <Gate fork="Gate · Platform" question="Primary use = everyday chat & employee enablement?" yesText="Standardize on ChatGPT." noText="Custom build / automation → Claude + an AI Development project." />
        <Gate fork="Gate · Sensitivity" question={'Is "AI sees our data" a true full-stop concern?'} yesText="Go local — Spark / private cloud (fewer integrations; set expectations)." noLabel="Otherwise" noText="Educate (see Security &amp; Risk below) and proceed — same risk model as Google / Microsoft for 20 yrs." />
        <Gate fork="Gate · Expansion" question="Does the client want a custom build now?" yesText="Scope as AI Development — release cycle + recurring maintenance fee." noText="Stay in managed services; surface at the next TBR." />
      </div>
    </GradSection>
  )
}
