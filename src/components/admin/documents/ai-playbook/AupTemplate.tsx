import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CopyButton from '@/components/admin/documents/CopyButton'

/**
 * AI Acceptable Use Policy — a deployable template, included in managed AI
 * services (set up during Phase 4 governance). The team replaces the
 * [bracketed] fields per client and has counsel review before deployment.
 * The on-screen sections and the copyable plain text come from one source.
 */

const SECTIONS: { n: string; heading: string; body: string }[] = [
  {
    n: '1',
    heading: 'Purpose & Scope',
    body: 'This policy governs how [Company Name] employees, contractors, and agents use artificial-intelligence tools for company business. It applies to all AI use that touches company systems, data, clients, or work product.',
  },
  {
    n: '2',
    heading: 'Approved Tools & Accounts',
    body: '• Only company-approved AI platforms may be used for company work — currently [ChatGPT Business / Claude Team].\n• Use company-provisioned (corporate) accounts only. Personal AI accounts must not be used for company business or data.\n• Do not install AI tools, browser extensions, or agents that connect to company data without IT approval.',
  },
  {
    n: '3',
    heading: 'Data Handling — What You May and May Not Enter',
    body: 'You MAY use approved tools for general business questions, drafting, summarizing, and analysis of non-sensitive company information.\n\nYou MUST NOT enter into any AI tool:\n• Regulated data (e.g., CUI/CMMC, PHI/HIPAA, PCI cardholder data).\n• Passwords, API keys, secrets, or other credentials.\n• Customer or employee personal data beyond what is strictly necessary.\n• Anything you would not be comfortable sending outside the company.\n\nApproved business tiers are configured so your data is not used to train the model. Do not move company work to a personal or unapproved tier where that protection does not apply.',
  },
  {
    n: '4',
    heading: 'Human Oversight & Accuracy',
    body: 'AI output is probabilistic, not authoritative — it can be confidently wrong. Review and verify AI-generated content before you rely on it, send it, or publish it. You remain responsible for any work you produce with AI. Do not let AI make final decisions in high-stakes areas (legal, financial, HR, safety, medical) without qualified human review.',
  },
  {
    n: '5',
    heading: 'Prohibited Uses',
    body: '• Illegal, harmful, harassing, discriminatory, or deceptive activity.\n• Generating malware, exploits, or content intended to breach security.\n• Impersonating a person or organization, or creating misleading content presented as human-authored where disclosure is required.\n• Bypassing security controls, or using AI to access data you are not authorized to see.\n• Infringing intellectual property or violating confidentiality obligations.',
  },
  {
    n: '6',
    heading: 'Confidentiality & Intellectual Property',
    body: 'Company and client confidential information must stay within approved tools and must not be shared with unapproved AI services. Work product created with AI for company business is the property of [Company Name], subject to any client agreements.',
  },
  {
    n: '7',
    heading: 'Security & Offboarding',
    body: 'Because only corporate accounts are used, AI work and history remain with the company. On separation, AI account access is revoked and company AI data stays with the company. Report any suspected misuse, data exposure, or unusual AI behavior to IT / [TCT] immediately.',
  },
  {
    n: '8',
    heading: 'Management, Monitoring & Review',
    body: 'Approved AI usage and consumption are managed and may be monitored for security, cost control, and compliance. This policy is reviewed periodically and updated as the AI landscape and the company’s tools evolve.',
  },
  {
    n: '9',
    heading: 'Acknowledgment',
    body: 'By using company-provided AI tools, you acknowledge that you have read, understood, and agree to comply with this AI Acceptable Use Policy.\n\nEmployee name: ____________________   Signature: ____________________   Date: __________',
  },
]

const POLICY_TEXT =
  `AI ACCEPTABLE USE POLICY\n[Company Name]\nEffective date: __________\n\n` +
  SECTIONS.map((s) => `${s.n}. ${s.heading}\n${s.body}`).join('\n\n') +
  `\n\n— Template provided by Triple Cities Tech. Customize the [bracketed] fields and have your counsel review before deployment. Not legal advice.`

export default function AupTemplate() {
  return (
    <>
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        aria-hidden
        style={{ background: 'radial-gradient(125% 90% at 50% -8%, #0b121c 0%, #07090e 55%, #050609 100%)' }}
      />

      <div className="max-w-[820px] mx-auto px-5 sm:px-8 pb-32">
        <div className="pt-6 pb-2">
          <Link
            href="/admin/documents/ai-playbook"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft size={14} /> AI Managed Services Playbook
          </Link>
        </div>

        <header className="pt-8 pb-7 border-b border-white/10 mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[12.5px] font-bold uppercase tracking-[0.22em] text-cyan-400 mb-2">Included Deliverable · Governance</div>
              <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-black leading-[1.04] tracking-tight text-white">
                AI Acceptable <span className="text-cyan-400">Use Policy</span>
              </h1>
            </div>
            <div className="pt-2">
              <CopyButton text={POLICY_TEXT} label="Copy policy text" variant="dark" />
            </div>
          </div>
          <p className="text-[16px] leading-relaxed text-slate-300 mt-4 max-w-[680px]">
            Deployed during onboarding (Phase 4) and included in managed AI services. This is a starter template — replace the <code className="text-cyan-300">[bracketed]</code> fields per client and have your own counsel review before deployment. Not legal advice.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          {SECTIONS.map((s) => (
            <section key={s.n} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
              <h2 className="text-[17px] font-bold text-white tracking-tight mb-2">
                <span className="text-cyan-400 font-mono mr-2">{s.n}.</span>{s.heading}
              </h2>
              <p className="text-[14.5px] leading-relaxed text-slate-300 whitespace-pre-line m-0">{s.body}</p>
            </section>
          ))}
        </div>

        <p className="text-[12.5px] text-slate-500 mt-8">
          Template provided by Triple Cities Tech. Pairs with the AI Services Agreement (legal terms — see counsel). This policy covers acceptable use; the agreement covers scope, liability, and pricing.
        </p>
      </div>
    </>
  )
}
