import Link from 'next/link'
import { GradSection, SecHead, Lead, Body, Phase, Bullets, H3, Callout, CalloutP, Gate } from '../primitives'
import { DISCOVERY_GROUPS } from '@/lib/ai-discovery/questions'

/** Small chip marking the two phases sold together as the paid front door. */
function PkgChip() {
  return (
    <span className="ml-2.5 inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-purple-500/18 text-purple-300 border border-purple-500/40 align-middle">
      AI-Readiness Package
    </span>
  )
}

/** Read-only mirror of the discovery question set (same source as the form). */
function DiscoveryWorksheet() {
  return (
    <>
      <p className="text-[15px] leading-relaxed text-slate-300 m-0">
        We fill this out live with the client in the discovery form — these questions are mirrored from the same source, so the doc and the form never drift. The platform-direction answers tally into a suggested ChatGPT / Claude / both recommendation.
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
          Discovery and the Readiness Assessment are sold together as one paid <strong className="text-white font-semibold">AI-Readiness Package</strong> (Phases 0–1). It's the front door to every engagement: the client pays for a structured discovery plus a real readiness assessment, and walks away with a recommended platform, an AI-readiness score, and a prioritized list of quick wins — whether or not they continue.
        </CalloutP>
        <CalloutP>
          Everything downstream — cleanup, provisioning, enablement, the MRR — is scoped from the package's output. Set the expectation up front: <strong className="text-white font-semibold">discovery is billable and valuable on its own.</strong>
        </CalloutP>
      </Callout>

      <div className="my-7">
        <Phase
          n="0"
          title={<>Discovery <PkgChip /></>}
          output="Output → a completed discovery form, a recommended platform (ChatGPT / Claude / both), expectations set, and an early go / clean-data-first / not-ready lean."
          detailLabel="Show the discovery question set"
          detail={<DiscoveryWorksheet />}
        >
          <Body>Discovery is a guided working session — we fill out the discovery form live with the client. It does double duty: it qualifies the engagement and sets expectations about what AI can and can't do today.</Body>
          <Bullets items={[
            <><strong className="text-white font-semibold">Set expectations.</strong> "AI is in its AOL stage" — powerful and evolving fast. Frame realistic scope, timelines, and where the limits are today.</>,
            <><strong className="text-white font-semibold">Determine platform direction.</strong> Use the platform-direction questions to land on ChatGPT, Claude, or both, driven by their actual use cases.</>,
            <><strong className="text-white font-semibold">Capture everything in the form</strong> so the data feeds the Readiness Assessment and the eventual scope — open the question set below or jump straight to the form.</>,
          ]} />
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
          output="Output → an AI-readiness score, the go / clean-data-first / not-ready decision, and a prioritized quick-win list."
        >
          <Bullets items={[
            <><strong className="text-white font-semibold">Audit foundations:</strong> is the Microsoft / Entra / SharePoint environment configured correctly and healthy?</>,
            <><strong className="text-white font-semibold">Assess the data:</strong> where it lives, and whether it's clean and connectable. This is the gate that decides everything downstream.</>,
            'Score AI readiness and surface low-hanging fruit / quick wins to demonstrate value early.',
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
