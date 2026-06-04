import { SecHead, Callout, CalloutP, Bullets, H3, ExCard, DividerQuote } from '../primitives'

export default function CaseStudies() {
  return (
    <section id="cases" className="pt-20 scroll-mt-8">
      <SecHead n="08" kicker="To Be Authored">
        Examples <span className="text-cyan-400">&amp; Case Studies</span>
      </SecHead>

      <Callout open label={<><span className="px-2 py-0.5 rounded-full bg-rose-400/16 text-rose-400 text-[10.5px] font-bold uppercase tracking-wide border border-rose-400/30">Action item</span> No written case studies yet</>}>
        <CalloutP>
          These need to be authored. Below are the real, in-flight examples from the conversation to formalize into one-pagers — split into <strong className="text-white font-semibold">everyday-usage stories</strong> (to sell managed services) and <strong className="text-white font-semibold">app / project stories</strong> (to sell development).
        </CalloutP>
      </Callout>

      <H3>Everyday-usage case studies <span className="text-sm font-bold text-cyan-300 tracking-wide">— sell managed services</span></H3>
      <Bullets items={[
        <><strong className="text-white font-semibold">Custom GPT for grant writing</strong> — standard capability inside the LLM dashboard, fast to build.</>,
        <><strong className="text-white font-semibold">Scheduled agent performing a recurring task</strong> — demonstrates automation without a big project.</>,
        <><strong className="text-white font-semibold">Connector-driven context</strong> — ChatGPT referencing SharePoint / Microsoft data to answer business questions.</>,
      ]} />

      <H3>App / project case studies <span className="text-sm font-bold text-purple-300 tracking-wide">— sell development</span></H3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
        <ExCard status="On the horizon" title="AllSpec — AI-built / maintained ERP-style solution">
          Replacing a single legacy app; warrants the full development conversation. TCT's most concrete near-term AI project.
        </ExCard>
        <ExCard status="In flight" title="SmartSumai — Kurtis's property mgmt system">
          Product-grade build with a feedback / roadmap loop. NYC-market interest; a company in Italy ($5–10M real estate) likely to adopt.
        </ExCard>
        <ExCard status="Lesson baked in" title="EcoSpect">
          Value-realization follow-up: schedule a check-in after a project so clients feel the value. Baked into the TBR "check-in" slide.
        </ExCard>
        <ExCard status="Proof of concept" title="Mom's business">
          Learning ground / proof-of-concept. Framed explicitly as a case study, not a paid engagement.
        </ExCard>
      </div>

      <DividerQuote src="Positioning line that works">
        "AI is in its AOL stage — mind-blowing, evolving fast. We'll share our journey with you. We can do this for you right now, but you'd pay thousands; we don't want that. We're getting it to a consumable, easy-to-pitch stage — and you'll walk away knowing things you had no idea were possible."
      </DividerQuote>
    </section>
  )
}
