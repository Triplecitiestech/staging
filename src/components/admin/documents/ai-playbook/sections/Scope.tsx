import { AlertTriangle, Check, X } from 'lucide-react'
import { SecHead, Lead, H4, Callout, CalloutP } from '../primitives'

const ROWS: [string, string][] = [
  ['Infrastructure setup — domain, business / Team account, inviting employees', 'Custom GPTs and agents — one-off builds (can be done at onboarding)'],
  ['Security & governance — confirm & document that client data is not used for training (off by default on Business)', 'Custom integrations to ERP / CRM where no native connector exists'],
  ['Ecosystem integrations — native connectors: ChatGPT ↔ Microsoft, SharePoint, email', 'Automations & scheduled agents built for a specific business outcome'],
  ['User enablement — AI office hours, prompting education, sharing what works', 'Data cleanup / SharePoint remediation (prerequisite project)'],
  ['Adds, moves, changes (AMC) on the managed environment', 'Building or maintaining a custom app (e.g., an ERP replacement)'],
  ['Token pool monitoring & threshold alerting (roadmap — see §6)', 'Live one-off tweaks to delivered custom products (governed by a release cycle)'],
  ['Platform selection guidance — ChatGPT vs. Claude per use case', 'CUI / CMMC-regulated workloads (see §5 risk)'],
]

export default function Scope() {
  return (
    <section id="scope" className="pt-20 scroll-mt-8">
      <SecHead n="02" kicker="The Scope Boundary">
        What's Included <span className="text-cyan-400">vs. What's Not</span>
      </SecHead>

      <Lead>
        The clarity here — <strong className="text-white font-bold">"adds / moves / changes yes, custom integrations no"</strong> — is what protects your time and keeps the recurring fee honest.
      </Lead>

      <H4>AI Managed Services — the recurring bundle</H4>
      <div className="rounded-xl overflow-hidden border border-white/10 my-6">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr>
              <th className="text-left px-5 py-4 text-emerald-400 font-bold text-[13px] uppercase tracking-wide bg-emerald-400/10 border-b border-cyan-400/30 w-1/2">✅ Included in MRR</th>
              <th className="text-left px-5 py-4 text-rose-400 font-bold text-[13px] uppercase tracking-wide bg-rose-400/10 border-b border-cyan-400/30 w-1/2">❌ Not included (= AI Development project)</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([inc, exc], i) => (
              <tr key={i} className="border-b border-white/10 last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-4 align-top text-slate-300 border-r border-white/10">
                  <div className="flex gap-3 items-start">
                    <Check size={18} className="text-emerald-400 flex-none mt-0.5" />
                    <span dangerouslySetInnerHTML={{ __html: inc.replace(/—/, '<strong class="text-white">—</strong>').replace(/^([^—]+)/, (m) => `<strong class="text-white">${m}</strong>`) }} />
                  </div>
                </td>
                <td className="px-5 py-4 align-top text-slate-300">
                  <div className="flex gap-3 items-start">
                    <X size={18} className="text-rose-400 flex-none mt-0.5" />
                    <span dangerouslySetInnerHTML={{ __html: exc.replace(/—/, '<strong class="text-white">—</strong>').replace(/^([^—]+)/, (m) => `<strong class="text-white">${m}</strong>`) }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout label="The line in the sand">
        <CalloutP quote>
          "We manage the infrastructure — the Microsoft, the OpenAI. You want adds, moves, changes, whatever — included. But if you're building custom integrations, that's not supported, that's not in scope."
        </CalloutP>
      </Callout>

      <Callout warn label={<><AlertTriangle size={16} /> If a client buys AI direct (not through TCT)</>}>
        <CalloutP>
          We will still help them manage it — <strong className="text-white font-semibold">but only on a contract.</strong> We can't force them through us; we just can't carry the ongoing maintenance for free.
        </CalloutP>
      </Callout>
    </section>
  )
}
