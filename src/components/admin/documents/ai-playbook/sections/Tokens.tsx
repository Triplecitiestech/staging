import { AlertTriangle } from 'lucide-react'
import { GradSection, SecHead, Lead, Body, Callout, CalloutP, Bullets, H3 } from '../primitives'

const STATS = [
  { n: '$150→$200', l: 'Per-user add-on framing' },
  { n: '~$10', l: 'Reference cost / user (Integris)' },
  { n: '70–30', l: 'Allocate / reserve token split' },
  { n: '0%', l: 'Monitoring built so far' },
]

export default function Tokens() {
  return (
    <GradSection id="tokens">
      <SecHead n="06" kicker="The Hardest Part to Get Right">
        Token Economics <span className="text-cyan-400">&amp; Billing</span>
      </SecHead>

      <Lead>Governing token consumption is the single hardest part of ongoing management — and the most important to get right.</Lead>

      <Callout warn label={<><AlertTriangle size={16} /> The failure mode</>}>
        <CalloutP>
          Get it wrong and a client's bill jumps from <strong className="text-white font-semibold">~$4K to ~$12K/month</strong> — and they come to you furious.
        </CalloutP>
      </Callout>

      <H3>What a token is — the client explanation</H3>
      <Body>
        A token is a unit of measurement, <strong className="text-white font-semibold">like a utility</strong>. It rolls up energy, hardware, and overhead into one billable unit. Newer, more capable models cost more per token. Frame it like <strong className="text-white font-semibold">Azure consumption, not like Microsoft mailbox size</strong>: the variable to watch is consumption, not storage.
      </Body>

      <H3>Chat vs. API — the key distinction</H3>
      <div className="rounded-xl overflow-hidden border border-white/10 my-6">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr>
              <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30 w-1/4">Mode</th>
              <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Token behavior</th>
              <th className="px-5 py-4 text-left text-[13px] font-bold uppercase tracking-wide text-white bg-cyan-400/10 border-b border-cyan-400/30">Implication</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/10 hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-4 font-semibold text-white border-r border-white/10 align-top">Business / Team chat</td>
              <td className="px-5 py-4 text-slate-300 border-r border-white/10 align-top">Effectively unlimited; no per-token tracking</td>
              <td className="px-5 py-4 text-slate-300 align-top"><span className="text-emerald-400 font-semibold">Safe</span> for broad employee enablement — predictable</td>
            </tr>
            <tr className="hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-4 font-semibold text-white border-r border-white/10 align-top">API / agents / custom builds</td>
              <td className="px-5 py-4 text-slate-300 border-r border-white/10 align-top">Burns tokens fast; must be metered</td>
              <td className="px-5 py-4 text-slate-300 align-top"><span className="text-rose-400 font-semibold">This is where runaway bills happen</span> — monitor closely</td>
            </tr>
          </tbody>
        </table>
      </div>

      <H3>The pool model</H3>
      <Bullets items={[
        <>The org buys a <strong className="text-white font-semibold">pool of tokens</strong>; you allocate per employee (tiered, like Microsoft — basic vs. advanced users).</>,
        <>Divvy <strong className="text-white font-semibold">~70–80%</strong> to employees; keep <strong className="text-white font-semibold">~20–30%</strong> in reserve as a buffer.</>,
        'When a heavy user nears their cap, alert → decide: grant from reserve (fine if reserve holds), reallocate from light users, or buy more.',
        <>Goal for the client: <strong className="text-white font-semibold">predictable billing.</strong></>,
      ]} />

      <Callout open label={<><span className="px-2 py-0.5 rounded-full bg-rose-400/16 text-rose-400 text-[10.5px] font-bold uppercase tracking-wide border border-rose-400/30">Open · 0%</span> Be honest internally</>}>
        <CalloutP>
          <strong className="text-white font-semibold">Monitoring is at 0%.</strong> There's no token-threshold monitoring system yet. Building a fragile homegrown monitor with hooks into client businesses is a bad idea.
        </CalloutP>
        <CalloutP>
          The right path is partner-channel multi-tenancy — Anthropic's Partner Network is live now; for OpenAI, manage ChatGPT Business directly while tracking their enterprise pathways — to get native consumption controls, the same way Microsoft licensing works, but with consumption.
        </CalloutP>
      </Callout>

      <H3>Packaging &amp; pricing</H3>
      <Bullets items={[
        <><strong className="text-white font-semibold">Seamless add-on:</strong> take existing quotes (Complete Care / Fortress) and add a per-user AI line item. <em>"You're paying $150/user — now it's $200 and includes AI services."</em> Make it easy to say yes.</>,
        <><strong className="text-white font-semibold">Reference data point (Integris / Kevin):</strong> cost ~$10/user, charging ~$50/user/mo. No stated minimum for them — but TCT clients have a lower barrier to entry, so watch the entry point.</>,
        <><strong className="text-white font-semibold">Margins look excellent</strong> because the MSP foundation is already in place; the AI layer rides on top.</>,
        <><strong className="text-white font-semibold">One-off projects:</strong> charge something, refine over time. Near-term these out-earn the recurring.</>,
      ]} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
        {STATS.map((s) => (
          <div key={s.n} className="p-5 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="text-3xl font-black text-cyan-400 leading-none tracking-tight">{s.n}</div>
            <div className="text-sm text-slate-400 mt-2 leading-snug">{s.l}</div>
          </div>
        ))}
      </div>
    </GradSection>
  )
}
