import Link from 'next/link'
import CopyButton from '@/components/admin/documents/CopyButton'
import { SecHead, Lead, Body, H4, Callout, CalloutP, Bullets } from '../primitives'

const AUTOTASK_LINES = `AI Managed Services — per user / month .............. $50.00 / user / mo
  Includes: platform setup, AI Acceptable Use Policy, up to 3 native
  integrations, governance, AI office hours, monthly AI webinar,
  token-pool monitoring, managed-environment support.
  Minimum seats follow the platform (ChatGPT Business 2 / Claude Team 5).

AI Onboarding & Implementation (one-time) ........... $[set per engagement]
  Domain + business/Team account setup, AUP, first up-to-3 native integrations.

AI Profit & Readiness Assessment (one-time) ......... from $1,000.00
  Profit Gap Analysis + Readiness Assessment + 90-day roadmap + 3 paths.
  May be credited toward onboarding if engaged within 30 days.

Add / Move / Change — AI (T&M) ...................... $[standard AI rate] / hr
AI Development — custom GPT / agent .................. from $1,000.00 (by complexity)
AI Development — workflow / integration / app build . project quote
Unmanaged AI support (no full management) ........... $250.00 / hr  (waiver req.)`

// Platform cost reference — current public pricing (~mid-2026). CONFIRM live +
// partner/reseller terms directly before quoting.
const PLANS: [string, string, string, string][] = [
  ['ChatGPT Business', '$25 / $20', '2 seats', 'Month-to-month OK. Everyday-employee tier. Native connectors: SharePoint, Outlook, Teams, Drive, Slack, GitHub.'],
  ['ChatGPT Enterprise', '~$45–75 (≈$60)', '150 seats', 'Annual only. Data residency, SSO, audit, dedicated capacity. Non-native apps need custom MCP/dev.'],
  ['Claude Team — Standard', '$25 / $20', '5 seats', 'Up to 150 seats. Good for everyday + lighter build users.'],
  ['Claude Team — Premium', '$125 / $100', '5 seats', '6.25× usage per session. For heavy Claude Code / dev users.'],
  ['Claude Enterprise', 'from $20 + usage', '20 (self) / 50 (sales)', 'SSO/SCIM, Claude Code + Cowork, 500K context, org spend controls.'],
]

export default function ServiceBundle() {
  return (
    <section id="bundle" className="pt-20 scroll-mt-8">
      <SecHead n="07" kicker="Productized Offering">
        Service Bundle <span className="text-cyan-400">&amp; Pricing</span>
      </SecHead>

      <Lead>The copy-paste-ready offering for Autotask. <strong className="text-white font-bold">Confirm vendor minimums and partner/reseller terms before quoting</strong> — they drive the floor and the margin.</Lead>

      <Callout warn label="Confirm before you quote">
        <CalloutP>
          Reseller / multi-tenant pricing isn't finalized with OpenAI or Anthropic. Apply to <strong className="text-white font-semibold">Anthropic's Claude Partner Network</strong> (live since March 2026) and pin down <strong className="text-white font-semibold">OpenAI's enterprise/Business path</strong> (no public reseller program — provision & manage on the client's behalf). Verify per-seat cost, seat minimums, token/usage limits, and which integrations are native.
        </CalloutP>
      </Callout>

      <H4>Managed AI Services — the bundle</H4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-5">
        {[
          { n: '$50', l: 'per user / month (TCT)', s: 'The recurring line item' },
          { n: 'from $1,000', l: 'AI Profit & Readiness Assessment', s: 'One-time front door' },
          { n: 'one-time', l: 'Onboarding & implementation fee', s: 'Set per engagement' },
        ].map((c) => (
          <div key={c.l} className="p-5 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="text-2xl font-black text-cyan-400 leading-none tracking-tight">{c.n}</div>
            <div className="text-sm text-white font-semibold mt-2 leading-snug">{c.l}</div>
            <div className="text-[12.5px] text-slate-500 mt-1">{c.s}</div>
          </div>
        ))}
      </div>
      <Body>
        The <strong className="text-white font-semibold">$50/user/month</strong> covers the managed environment (see §2 for the full included list): platform setup, the AI Acceptable Use Policy, up to 3 native integrations, governance, AI office hours, the monthly AI webinar, and token-pool monitoring. <strong className="text-white font-semibold">Practical seat floor follows the platform's own minimum</strong> — ChatGPT Business = 2 seats, Claude Team = 5 seats.
      </Body>
      <p className="text-[13.5px] text-slate-400 -mt-1 mb-2">Quantify it for the client: <Link href="/admin/documents/ai-playbook/roi" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">open the ROI calculator</Link>.</p>

      <H4>Platform cost reference (confirm live)</H4>
      <div className="rounded-xl overflow-hidden border border-white/10 my-5">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Plan</th>
              <th className="text-left px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Per seat (mo / yr)</th>
              <th className="text-left px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Min seats</th>
              <th className="text-left px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Notes</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map(([plan, price, min, notes]) => (
              <tr key={plan} className="border-b border-white/10 last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-semibold text-white border-r border-white/10 align-top">{plan}</td>
                <td className="px-4 py-3 text-cyan-300 border-r border-white/10 align-top whitespace-nowrap">{price}</td>
                <td className="px-4 py-3 text-slate-300 border-r border-white/10 align-top whitespace-nowrap">{min}</td>
                <td className="px-4 py-3 text-slate-400 align-top">{notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-slate-500 -mt-2 mb-2">Figures are current public pricing as of mid-2026 and change often — treat as a starting point, not a quote.</p>

      <Callout label="Margin check">
        <CalloutP>
          At <strong className="text-white font-semibold">$50/user</strong> with a standard platform cost of <strong className="text-white font-semibold">~$20–25/user</strong> (ChatGPT Business / Claude Team Standard), the gross margin is strong before counting the MSP foundation it rides on. Heavy Claude Premium / Enterprise or large token/API usage change the math — reprice those engagements.
        </CalloutP>
      </Callout>

      <H4>Add-ons &amp; rates</H4>
      <Bullets items={[
        <><strong className="text-white font-semibold">AMC, custom GPTs, workflows, extra/non-native integrations</strong> → custom GPTs &amp; agents from $1,000 each; larger automations, integrations &amp; app builds are project-quoted or T&M. Never folded into the $50.</>,
        <><strong className="text-white font-semibold">Integrations beyond the included 3</strong> → additional: native = small, MCP = larger, no connector = a custom-dev project.</>,
        <><strong className="text-white font-semibold">Custom builds</strong> → can carry their own optional recurring maintenance fee.</>,
        <><strong className="text-white font-semibold">Unmanaged / direct-buy AI support</strong> → <strong className="text-white font-semibold">$250/hr T&M</strong>, advisory-only by default, liability waiver required.</>,
      ]} />

      <H4>Who it's for &amp; the incentive</H4>
      <Bullets items={[
        <><strong className="text-white font-semibold">Best value as an add-on for existing TCT managed customers</strong> — a line item on the existing monthly invoice. The AI layer rides on the MSP foundation; the two complement each other for the best bang for the buck.</>,
        <><strong className="text-white font-semibold">Standalone is possible</strong> — we'll sell it — but unmanaged setups carry more risk; when one breaks, that's the case for full managed services.</>,
        <><strong className="text-white font-semibold">Suggested incentive:</strong> credit the $1,000 assessment toward the onboarding fee if they engage within 30 days.</>,
      ]} />

      <div className="flex items-center justify-between gap-3 flex-wrap mt-8 mb-3">
        <h4 className="text-[15px] font-bold uppercase tracking-[0.12em] text-cyan-300">Autotask line items (copy-paste)</h4>
        <CopyButton text={AUTOTASK_LINES} label="Copy line items" variant="dark" />
      </div>
      <pre className="text-[12.5px] leading-relaxed text-slate-300 bg-white/[0.03] border border-white/10 rounded-xl p-5 overflow-x-auto whitespace-pre">{AUTOTASK_LINES}</pre>
    </section>
  )
}
