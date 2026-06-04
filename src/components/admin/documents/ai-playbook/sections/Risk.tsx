import { AlertTriangle } from 'lucide-react'
import { SecHead, Lead, Body, Callout, CalloutP, H3, SinglePathGate } from '../primitives'

export default function Risk() {
  return (
    <section id="risk" className="pt-20 scroll-mt-8">
      <SecHead n="05" kicker="How to Talk About It">
        Security, Risk <span className="text-cyan-400">&amp; Compliance</span>
      </SecHead>

      <Lead>Lead from the truth, not from fear.</Lead>
      <Body>The competitor instinct is "security, security, secure the AI" — but the headline data-exfiltration fear is largely a false alarm, and <strong className="text-white font-semibold">saying so is a differentiator.</strong></Body>

      <H3>Myth #1 — "AI will leak our data to competitors"</H3>
      <Callout label={<span className="text-emerald-400">False alarm</span>}>
        <CalloutP>
          Data exfiltration through AI does not work the way people think. Putting TCT financials into a personal LLM <strong className="text-white font-semibold">does not</strong> let another company query the model for "TCT's financials." It never works that way.
        </CalloutP>
        <CalloutP>
          The most an LLM might absorb is generic patterns — not "this specific company does it this way." The narrow exception: public website content a model lists as a reference.
        </CalloutP>
      </Callout>

      <H3>Risk #2 — Employee offboarding</H3>
      <Callout warn label={<><AlertTriangle size={16} /> Real</>}>
        <CalloutP>
          If an employee keeps all their work and files inside a <strong className="text-white font-semibold">personal</strong> AI account and then leaves, that data walks out the door. <strong className="text-white font-semibold">Fix: corporate accounts, not personal.</strong>
        </CalloutP>
      </Callout>

      <H3>Risk #3 — Provider control &amp; future use</H3>
      <Callout label="Acknowledge, don't over-sell">
        <CalloutP>
          You have no control or visibility over what the provider does with inputs now or later (terms can change; the platform could be sold). This is the <strong className="text-white font-semibold">same bargain we've accepted with Google and Microsoft for 20 years</strong> — arguably higher with AI because it correlates more.
        </CalloutP>
        <CalloutP>
          There is nothing you, TCT, or anyone can do to change that. So name it plainly: <em>"No one knows exactly where your data may go. If that's a full-stop concern, you can't use cloud AI — and you'll fall behind those who accept the risk."</em> Make the risk known; let them choose.
        </CalloutP>
      </Callout>

      <H3>Forks on sensitivity</H3>
      <div className="my-6">
        <SinglePathGate fork="Sensitivity fork" question="Hard sensitivity concern" pathColor="#67E8F9" pathLabel="Path">
          Buy a Spark / build local (private cloud). Set expectations: fewer integrations, more limitations than cloud LLMs.
        </SinglePathGate>
        <SinglePathGate fork="Compliance fork" question="CUI / CMMC data" pathColor="#FB7185" pathLabel="Path">
          Lean no at this stage. Even though providers aren't training on your data, don't put CUI in. No firm answer yet — treat as out of scope.
        </SinglePathGate>
        <SinglePathGate fork="Everyone else" question="Standard engagement" pathColor="#34D399" pathLabel="Path">
          Provide the disclaimer, ring-fence training off, use corporate accounts, and proceed.
        </SinglePathGate>
      </div>
    </section>
  )
}
