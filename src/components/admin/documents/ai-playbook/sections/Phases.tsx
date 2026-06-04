import { GradSection, SecHead, Lead, Body, Phase, Bullets, H3, Gate } from '../primitives'

export default function Phases() {
  return (
    <GradSection id="phases">
      <SecHead n="03" kicker="Step-by-Step">
        Delivery <span className="text-cyan-400">Phases</span>
      </SecHead>

      <Lead>This mirrors traditional managed-services onboarding, but for AI. <strong className="text-white font-bold">Follow the order.</strong></Lead>
      <Body>Skipping a step "can bite everyone" — readiness gates exist for a reason.</Body>

      <div className="my-7">
        <Phase n="0" title="Discovery & Readiness Assessment" output="Output → a go / clean-data-first / not-ready decision and a recommended platform.">
          <Bullets items={[
            'Run the discovery questions (§7) to determine the best delivery path.',
            'Audit foundations: is the Microsoft environment configured correctly? Is there clean, connectable data?',
            'Score AI readiness and surface low-hanging fruit.',
          ]} />
        </Phase>
        <Phase n="1" title="Foundation & Data Cleanup" gated>
          <Bullets items={[
            <><strong className="text-white font-semibold">If data fails the readiness gate:</strong> scope a cleanup project first (we use AI to do it). Cost varies with how messy SharePoint is.</>,
            'Confirm Microsoft / Entra / SharePoint hygiene and that systems are AI-connectable.',
            <><strong className="text-white font-semibold">Do not proceed to Phase 2</strong> until the foundation passes.</>,
          ]} />
        </Phase>
        <Phase n="2" title="Platform Selection & Provisioning">
          <Bullets items={[
            'Choose platform per use case (see §4). Default to ChatGPT for everyday employee use today.',
            'Stand up the business / Team account, configure the domain, prepare to invite employees.',
            'Confirm training is off (default on Business — contractual, not a per-account toggle) and document it. Confirm corporate (not personal) accounts for all employees.',
          ]} />
        </Phase>
        <Phase n="3" title="Governance & Integrations">
          <Bullets items={[
            'Apply security & governance baseline; document the ring-fencing.',
            <><strong className="text-white font-semibold">Wire native connectors:</strong> ChatGPT ↔ Microsoft, SharePoint, email. Context is everything — the more clean context, the better the output.</>,
            'Define user tiers (basic vs. advanced consumers, like Microsoft licensing).',
          ]} />
        </Phase>
        <Phase n="4" title="User Enablement & Adoption">
          <Bullets items={[
            'Launch AI office hours. Two to three weeks of sessions teaching prompting: "try this, come back to me." Review how they prompted, give better examples.',
            <>Centralize support through office hours — <strong className="text-white font-semibold">not</strong> "I built my own GPT, can I call you?" ad-hoc calls that eat time.</>,
            'Optional: monthly AI overview webinar (all-client). Good feedback loop, but it\'s a commitment.',
          ]} />
        </Phase>
        <Phase n="5" title={<>Ongoing Management <span className="text-sm font-bold text-cyan-300 tracking-wide">— the MRR</span></>}>
          <Bullets items={[
            'Monitor token consumption against the org pool; alert at thresholds; decide reallocate vs. buy more.',
            'Handle adds / moves / changes.',
            '"Surface project opportunities: \'you\'ve got a taste — it can also do these things as a project.\'"',
          ]} />
        </Phase>
      </div>

      <H3>Decision gates &amp; forks</H3>
      <div className="my-6 space-y-0">
        <Gate fork="At this fork" question="Foundations + clean data present?" yesText="Proceed to platform selection." noText={<>Sell a data-cleanup project first <strong className="text-white font-semibold">(full stop)</strong>.</>} />
        <Gate fork="At this fork" question="Workload involves CUI / CMMC data?" yesText="Do not put it in AI — lean no at this stage." noText="Proceed under standard disclaimer." />
        <Gate fork="At this fork" question="Client buying AI through TCT?" yesText="Full managed services — we handle everything." noText="Help only on contract; ongoing maintenance is theirs." />
        <Gate fork="At this fork" question="Use case = everyday chat / employee enablement?" yesText="Standardize on ChatGPT." noText="Custom build / automation → Claude, AI Development project." />
        <Gate fork="At this fork" question="Client wants custom build now?" yesText="Scope as AI Development w/ release cycle & recurring fee." noText="Stay in managed services; revisit at next TBR." />
        <Gate fork="At this fork" question={'Client\'s only concern is "AI sees our data"?'} yesText="Educate (§5); if a true full-stop, consider local Spark / private cloud." noLabel="Otherwise" noText="Proceed — same risk model as Google / Microsoft for 20 yrs." />
      </div>
    </GradSection>
  )
}
