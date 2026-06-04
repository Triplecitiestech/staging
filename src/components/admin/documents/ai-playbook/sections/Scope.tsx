import Link from 'next/link'
import { AlertTriangle, Check, Plus } from 'lucide-react'
import { SecHead, Lead, Body, H4, Callout, CalloutP } from '../primitives'

const INCLUDED: React.ReactNode[] = [
  <><strong className="text-white font-semibold">Infrastructure setup</strong> — domain, the business / Team account, and full setup on the chosen platform (ChatGPT or Claude).</>,
  <><strong className="text-white font-semibold">AI Acceptable Use Policy</strong> — drafted, deployed, and documented (<Link href="/admin/documents/ai-playbook/aup" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">template</Link>).</>,
  <><strong className="text-white font-semibold">Up to 3 native integrations</strong> — connect the AI to up to three systems with native connectors (e.g., M365 email + SharePoint, Fathom, Monday.com) so it becomes the central brain tying systems together.</>,
  <><strong className="text-white font-semibold">Security & governance</strong> — confirm & document that data is not used for training (off by default on Business).</>,
  <><strong className="text-white font-semibold">User enablement</strong> — AI office hours + the monthly customer AI webinar.</>,
  <><strong className="text-white font-semibold">Token-pool monitoring</strong> & threshold alerting (roadmap — see Token Economics).</>,
  <><strong className="text-white font-semibold">Platform & integration-feasibility guidance</strong> — which platform fits, and which of their systems can actually connect.</>,
]

const ADDITIONAL: React.ReactNode[] = [
  <><strong className="text-white font-semibold">Adds, moves & changes (AMC)</strong> — any change after onboarding. Always additional.</>,
  <><strong className="text-white font-semibold">Custom GPTs & agents</strong> — one-off builds.</>,
  <><strong className="text-white font-semibold">Workflows & automations</strong> built for a specific business outcome.</>,
  <><strong className="text-white font-semibold">Integrations beyond the included 3</strong>, or any non-native connection (MCP / custom).</>,
  <><strong className="text-white font-semibold">Data cleanup / SharePoint remediation</strong> (prerequisite project).</>,
  <><strong className="text-white font-semibold">Custom app builds</strong> (e.g., an ERP replacement).</>,
  <><strong className="text-white font-semibold">CUI / CMMC-regulated workloads</strong> — out of scope at this stage (see Security & Risk).</>,
]

function ScopeList({ title, items, kind }: { title: string; items: React.ReactNode[]; kind: 'in' | 'add' }) {
  const Icon = kind === 'in' ? Check : Plus
  const iconClass = kind === 'in' ? 'text-emerald-400' : 'text-violet-300'
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h4 className={`text-[13px] font-bold uppercase tracking-[0.12em] mb-3 ${kind === 'in' ? 'text-emerald-400' : 'text-violet-300'}`}>{title}</h4>
      <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 items-start text-[14.5px] leading-relaxed text-slate-300">
            <Icon size={17} className={`${iconClass} flex-none mt-0.5`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Scope() {
  return (
    <section id="scope" className="pt-20 scroll-mt-8">
      <SecHead n="02" kicker="The Scope Boundary">
        What's Included <span className="text-cyan-400">vs. What's Additional</span>
      </SecHead>

      <Lead>
        The recurring fee covers <strong className="text-white font-bold">setup, policy, and up to three native integrations</strong>. Everything you change, add, or build after that is additional — that's the line that keeps the fee honest.
      </Lead>

      <H4>Managed AI Services — what the recurring fee covers</H4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        <ScopeList title="✅ Included" items={INCLUDED} kind="in" />
        <ScopeList title="➕ Always additional (project or T&M)" items={ADDITIONAL} kind="add" />
      </div>

      <Callout label="Onboarding fee">
        <CalloutP>
          A one-time <strong className="text-white font-semibold">onboarding fee</strong> covers the initial infrastructure setup, the AI Acceptable Use Policy, and connecting the first <strong className="text-white font-semibold">up to three native integrations</strong>. The monthly per-user fee starts once the environment is live. (See the Service Bundle for current numbers.)
        </CalloutP>
      </Callout>

      <H4>Integration feasibility — how we scope each system</H4>
      <Body>Part of the assessment is checking each line-of-business app against the chosen platform. Three outcomes:</Body>
      <div className="rounded-lg border border-white/10 divide-y divide-white/5 my-5">
        {[
          ['Native connector exists', 'Included (counts toward the 3). Fast — the AI plugs straight in.', 'text-emerald-400'],
          ['MCP available', 'Some work — possible, but usually scoped as additional (an integration project).', 'text-cyan-300'],
          ['No connector / custom or legacy app', 'A custom-development project — or, sometimes, not worth it. Set expectations.', 'text-violet-300'],
        ].map(([k, d, c]) => (
          <div key={k as string} className="grid grid-cols-[210px_1fr] gap-4 px-4 py-3">
            <div className={`text-[14px] font-bold ${c as string}`}>{k}</div>
            <div className="text-[14px] text-slate-300 leading-snug">{d}</div>
          </div>
        ))}
      </div>

      <Callout label="The line in the sand">
        <CalloutP quote>
          "We set up and manage the platform — the account, the policy, and up to three native integrations. Anything you want changed, added, or built after that — adds/moves/changes, custom GPTs, workflows, extra integrations — is additional, quoted as a project or billed T&amp;M."
        </CalloutP>
      </Callout>

      <Callout warn label={<><AlertTriangle size={16} /> If a client buys AI direct (not through TCT)</>}>
        <CalloutP>
          We don't carry it under managed services. We can support it on a <strong className="text-white font-semibold">premium T&amp;M AI rate ($250/hr)</strong> and/or <strong className="text-white font-semibold">advisory-only</strong> — we guide, we don't implement — and we'll likely require a <strong className="text-white font-semibold">liability waiver</strong>.
        </CalloutP>
        <CalloutP>
          Without full management and visibility into their systems, we can't safely own outcomes or work backwards from someone else's setup. <strong className="text-white font-semibold">Full management is strongly preferred</strong> — and if an unmanaged setup breaks, that's the case for managed services.
        </CalloutP>
      </Callout>
    </section>
  )
}
