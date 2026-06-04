import { SecHead, Lead, Body, Bullets, H3, QRow } from '../primitives'

export default function Discovery() {
  return (
    <section id="discovery" className="pt-20 scroll-mt-8">
      <SecHead n="07" kicker="Before Any AI Implementation">
        Discovery <span className="text-cyan-400">Questions</span>
      </SecHead>

      <Lead>Use these to determine the best delivery path — platform, tier, project vs. managed, and readiness.</Lead>
      <Body>Ask, then map each answer to the fork it informs.</Body>

      <div className="flex flex-col gap-3 my-6">
        <QRow theme="Profit Leak" question='"Where do you feel the business wastes the most time or money right now?"' tells="Targets the first automation / project" />
        <QRow theme="Manual Bottlenecks" question='"What are the top 2–3 things your team does manually that feel repetitive or outdated?"' tells="Low-hanging fruit for custom GPTs / agents" />
        <QRow theme="AI Awareness" question={"\"Have you experimented with any AI tools yet — and if so, what's working or frustrating you?\""} tells="Maturity → office-hours depth" />
        <QRow theme="Revenue Targets" question='"If you could add $10K/month without adding staff, where would it come from — more clients, higher ticket, or efficiency?"' tells="Frames the ROI pitch" />
        <QRow theme="Decision Power" question='"Who makes the final call on growth strategy or budget allocation?"' tells="Identifies the real buyer" />
        <QRow theme="Speed to Change" question='"When you see something that could improve profits, how fast do you typically move?"' tells="Sets rollout pace expectations" />
        <QRow theme="Tech Tolerance" question='"Does your team lean into new tools easily, or does adoption need more hand-holding?"' tells="Sizes the enablement / office-hours scope" />
        <QRow theme="Visibility & Reporting" question='"Do you have visibility into key metrics, or is it gut instinct and scattered reports?"' tells="Data-readiness signal" />
        <QRow theme="Risk vs. Reward" question='"Are you more focused on top-line revenue, protecting margins, or reducing dependency on human effort?"' tells="Tunes messaging emphasis" />
        <QRow theme="Future Vision" question='"If we met 12 months from now, what would make you call this year a success?"' tells="Anchors the roadmap & next TBR" />
      </div>

      <H3>TCT-specific readiness add-ons</H3>
      <Bullets items={[
        <><strong className="text-white font-semibold">Is your Microsoft environment set up and healthy?</strong> <em>(foundation gate)</em></>,
        <><strong className="text-white font-semibold">Where does your data live, and is it clean and connectable?</strong> <em>(data gate — full stop if no)</em></>,
        <><strong className="text-white font-semibold">Do you handle CUI / CMMC-regulated data?</strong> <em>(compliance fork)</em></>,
        <><strong className="text-white font-semibold">Will you buy AI through us, or do you already have / insist on your own?</strong> <em>(scope fork)</em></>,
      ]} />
    </section>
  )
}
