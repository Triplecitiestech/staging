import Image from 'next/image'
import { GradSection, SecHead, Lead } from '../primitives'

const ITEMS: React.ReactNode[] = [
  <><strong className="text-white font-semibold">Investigate OpenAI's enterprise / partner pathways</strong> — note there is no public reseller program; plan to provision and manage ChatGPT Business directly (~$25/user/mo, 2-seat minimum). Verify any minimums before quoting.</>,
  <><strong className="text-white font-semibold">Apply to the Claude Partner Network</strong> (live since March 2026, free) to access the partner portal, certifications, and Services Track for multi-tenancy + predictable billing.</>,
  <><strong className="text-white font-semibold">Build the AI services and finalize pricing in Autotask</strong> — make it real, as per-user add-on line items.</>,
  <><strong className="text-white font-semibold">Author case studies</strong> (everyday-usage + app / project) for thought-leadership in TBRs.</>,
  <><strong className="text-white font-semibold">Design the token-monitoring approach</strong> — deprioritize homegrown; lean on partner-channel multi-tenancy (Anthropic Partner Network live; manage OpenAI Business directly).</>,
  <><strong className="text-white font-semibold">Define AI office-hours curriculum</strong> (2–3 weeks of prompting sessions) and decide on the monthly all-client AI webinar.</>,
  <><strong className="text-white font-semibold">Document the scope boundary</strong> (AMC included / custom integrations excluded) into the standard quote terms, including the development-cycle language.</>,
]

export default function ActionItems() {
  return (
    <GradSection id="actions">
      <SecHead n="09" kicker="On the Books by End of June">
        Action Items to <span className="text-cyan-400">Operationalize</span>
      </SecHead>

      <Lead>Pulled from the meeting — what has to happen to make this real.</Lead>

      <div className="flex flex-col gap-3 my-6">
        {ITEMS.map((item, i) => (
          <div key={i} className="flex gap-4 items-start p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="flex-none w-5 h-5 rounded-md border-[1.5px] border-cyan-400/50 bg-cyan-400/[0.06] mt-0.5" />
            <div className="text-[15.5px] leading-relaxed text-slate-200">{item}</div>
          </div>
        ))}
      </div>

      {/* End mark */}
      <div className="mt-24 pt-8 border-t border-white/10 flex items-center justify-between flex-wrap gap-4 pb-0">
        <div className="text-[13px] leading-relaxed text-slate-500">
          <strong className="text-slate-300">Source:</strong> Fathom recording "TBR / AI pitch generation," Kurtis Florance &amp; James King, June 4, 2026.
          <br />Internal working document — v1.0 · Go-to-market draft.
        </div>
        <Image src="/logo/tctlogo.webp" alt="Triple Cities Tech" width={80} height={21} className="h-[26px] w-auto opacity-75" />
      </div>
    </GradSection>
  )
}
