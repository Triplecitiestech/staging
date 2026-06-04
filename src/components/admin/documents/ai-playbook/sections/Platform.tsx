import { SecHead, Lead, Callout, CalloutP } from '../primitives'

const ROWS: [string, string, string][] = [
  ['Best for', 'Everyday employee use, talking to AI with business context, custom GPTs & agents', 'Custom integrations, APIs, automations, development-grade work'],
  ['Why', 'Easier interface, easier to use, ready for this kind of deployment today', 'Clearly the winner for build / integration projects'],
  ['Maturity for rollout', 'Ready now — standardize here for managed services', 'Will likely be best out of the gate for chat once ready, but not yet'],
  ['Partner / channel status', 'No public reseller program; provision & manage ChatGPT Business on client\'s behalf (~$25/user/mo, 2-seat minimum). Track OpenAI enterprise pathways.', 'Claude Partner Network live since March 2026 — free to join, partner portal + certifications + Services Track'],
]

export default function Platform() {
  return (
    <section id="platform" className="pt-20 scroll-mt-8">
      <SecHead n="04" kicker="Platform Selection">
        ChatGPT <span className="text-cyan-400">vs. Claude</span>
      </SecHead>

      <Lead>
        Two sides of the same coin. Part of every engagement is determining which platform fits the company and its goals — and the honest answer is <strong className="text-white font-bold">most businesses end up needing both.</strong>
      </Lead>

      <div className="rounded-xl overflow-hidden border border-white/10 my-6">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr>
              <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30 w-[18%]"></th>
              <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-emerald-400 bg-cyan-400/10 border-b border-cyan-400/30">ChatGPT <span className="text-slate-400 font-medium normal-case">(OpenAI)</span></th>
              <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-purple-300 bg-cyan-400/10 border-b border-cyan-400/30">Claude <span className="text-slate-400 font-medium normal-case">(Anthropic)</span></th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, gpt, claude], i) => (
              <tr key={i} className="border-b border-white/10 last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-4 font-semibold text-white border-r border-white/10 align-top">{label}</td>
                <td className="px-5 py-4 text-slate-300 border-r border-white/10 align-top">{gpt}</td>
                <td className="px-5 py-4 text-slate-300 align-top">{claude}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout label="The standardization call">
        <CalloutP>
          <strong className="text-white font-semibold">Managed services standard = ChatGPT.</strong> It's the only one truly ready for broad employee deployment right now. Reach for Claude on the development / integration side, where it's the clear winner.
        </CalloutP>
        <CalloutP quote>
          "ChatGPT can do things Claude can't, and vice versa" — which is exactly why TCT carries both.
        </CalloutP>
      </Callout>

      <Callout open label={<><span className="px-2 py-0.5 rounded-full bg-rose-400/16 text-rose-400 text-[10.5px] font-bold uppercase tracking-wide border border-rose-400/30">Cost reality</span> Internal — factor into pricing</>}>
        <CalloutP>
          Both tools are needed. Roughly <strong className="text-white font-semibold">$200–$350/mo per tool</strong> to operate at team tier.
        </CalloutP>
      </Callout>
    </section>
  )
}
