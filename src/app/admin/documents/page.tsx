import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import AdminShell from '@/components/admin/AdminShell'
import { ArrowUpRight, ShieldCheck, FileBarChart, Megaphone, Share2, FileText, Sparkles, Bot, ClipboardList, Workflow, Calculator } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Documents — TCT Admin',
  description: 'Branded documents, playbooks, reports, and content — consistent across everything TCT publishes.',
}

interface DocCard {
  category: string
  categoryClass: string
  icon: React.ReactNode
  title: string
  description: string
  href?: string
  chips: { label: string; tone?: 'live' | 'priority' | 'muted' }[]
}

const documents: DocCard[] = [
  {
    category: 'AI Strategy',
    categoryClass: 'text-cyan-400',
    icon: <Bot className="h-5 w-5 text-cyan-400" />,
    title: 'AI Managed Services Playbook',
    description:
      'How TCT packages, sells, and delivers AI as a managed service — the two-part model (MRR vs. Development), scope boundaries, delivery phases, platform selection, token economics, and discovery questions.',
    href: '/admin/documents/ai-playbook',
    chips: [
      { label: 'Live', tone: 'live' },
      { label: 'v1.0' },
      { label: 'Sales & Delivery' },
    ],
  },
  {
    category: 'AI Strategy',
    categoryClass: 'text-cyan-400',
    icon: <Sparkles className="h-5 w-5 text-cyan-400" />,
    title: 'AI Enablement Services Playbook (v2)',
    description:
      'Version 2, rebuilt from the June 22 Jim King meeting: renamed offering, Claude as the standard, the $1,500 / included assessment, flat-fee pricing, webinar cut, and token economics de-emphasized. Opens with a v1→v2 change-log; the assessment section is written for Jim to review.',
    href: '/admin/documents/ai-playbook/v2',
    chips: [
      { label: 'Live', tone: 'live' },
      { label: 'v2.0' },
      { label: 'For review', tone: 'priority' },
    ],
  },
  {
    category: 'AI Strategy',
    categoryClass: 'text-cyan-400',
    icon: <ClipboardList className="h-5 w-5 text-cyan-400" />,
    title: 'AI Discovery & Readiness Form',
    description:
      'The staff-filled discovery tool — six profit zones, severity scoring, monthly-waste calculator, and platform direction. Saved per company; generates the client-facing AIGPA report.',
    href: '/admin/documents/ai-playbook/discovery',
    chips: [
      { label: 'Live', tone: 'live' },
      { label: 'Tool' },
    ],
  },
  {
    category: 'AI Strategy',
    categoryClass: 'text-cyan-400',
    icon: <Calculator className="h-5 w-5 text-cyan-400" />,
    title: 'AI ROI Calculator',
    description:
      'Put a number on the opportunity for the review call — time saved becomes labor dollars, plus any revenue lift, netted against tool + service cost. Live ROI %, payback period, and a copyable summary.',
    href: '/admin/documents/ai-playbook/roi',
    chips: [
      { label: 'Live', tone: 'live' },
      { label: 'Tool' },
    ],
  },
  {
    category: 'AI Strategy',
    categoryClass: 'text-cyan-400',
    icon: <FileText className="h-5 w-5 text-cyan-400" />,
    title: 'AI Acceptable Use Policy',
    description:
      'Deployable AUP template included in managed AI services — approved tools & accounts, data-handling rules, human oversight, prohibited uses, and an acknowledgment. Copy as plain text, customize per client.',
    href: '/admin/documents/ai-playbook/aup',
    chips: [
      { label: 'Live', tone: 'live' },
      { label: 'Template' },
    ],
  },
  {
    category: 'AI Strategy',
    categoryClass: 'text-cyan-400',
    icon: <Workflow className="h-5 w-5 text-cyan-400" />,
    title: 'Claude / Cowork Setup SOP',
    description:
      'Internal enablement: how to configure Claude / Cowork (home base, context files, connectors, skills, scheduled tasks) so it builds AIGPA kits and reports in TCT\'s voice.',
    href: '/admin/documents/ai-playbook/cowork-sop',
    chips: [
      { label: 'Live', tone: 'live' },
      { label: 'Internal SOP' },
    ],
  },
  {
    category: 'IT Operations',
    categoryClass: 'text-cyan-400',
    icon: <ShieldCheck className="h-5 w-5 text-cyan-400" />,
    title: 'Secure Boot 2023 Certificate Remediation',
    description:
      'Step-by-step operational playbook for the whole team — detect, classify, approve, remediate, and verify across the managed fleet before the June 2026 deadline.',
    href: '/admin/documents/secure-boot-playbook',
    chips: [
      { label: 'Live', tone: 'live' },
      { label: 'P1 Priority', tone: 'priority' },
      { label: 'v4.0' },
    ],
  },
  {
    category: 'Reports',
    categoryClass: 'text-emerald-400',
    icon: <FileBarChart className="h-5 w-5 text-emerald-400" />,
    title: 'Quarterly Business Review',
    description:
      'TCT-branded client QBR template — metrics, service summary, recommendations, and upcoming initiatives. Drop in your data and the brand is already applied.',
    chips: [{ label: 'Coming soon', tone: 'muted' }, { label: 'Template' }],
  },
  {
    category: 'Marketing',
    categoryClass: 'text-purple-400',
    icon: <Megaphone className="h-5 w-5 text-purple-400" />,
    title: 'Marketing Content — Branded',
    description:
      'Paste in content from the marketing agency and publish it under the TCT design system — replacing generic layouts and stock graphics with our own brand.',
    href: '/admin/documents/marketing-content',
    chips: [{ label: 'Live', tone: 'live' }, { label: 'Editable' }],
  },
  {
    category: 'Social Media',
    categoryClass: 'text-pink-400',
    icon: <Share2 className="h-5 w-5 text-pink-400" />,
    title: 'Social Content Dump',
    description:
      'Take raw social copy from the marketing company and format it into TCT-branded posts, captions, and campaign summaries ready for review or publishing.',
    href: '/admin/documents/social',
    chips: [{ label: 'Live', tone: 'live' }, { label: 'Editable' }],
  },
]

function Chip({ label, tone }: { label: string; tone?: 'live' | 'priority' | 'muted' }) {
  const palette =
    tone === 'live'
      ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
      : tone === 'priority'
        ? 'text-rose-400 border-rose-400/30 bg-rose-400/10'
        : tone === 'muted'
          ? 'text-slate-500 border-white/10'
          : 'text-slate-400 border-white/10 bg-white/5'
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${palette}`}>
      {label}
    </span>
  )
}

export default async function DocumentsHubPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  const liveCount = documents.filter((d) => d.href).length

  return (
    <AdminShell>
      <AdminHeader />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: "url('/herobg.webp')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-cyan-500/10" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-5 inline-flex items-center gap-2.5 text-sm font-bold uppercase tracking-[0.16em] text-cyan-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            Triple Cities Tech
          </div>
          <h1 className="mb-5 text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Branded <span className="text-cyan-400">Document</span> Hub
          </h1>
          <p className="mb-7 max-w-2xl text-lg font-medium leading-relaxed text-white/90">
            Every report, playbook, and content piece — consistently branded in the TCT design
            system. Drop in a document and the branding applies automatically.
          </p>
          <Link
            href="/admin/documents/import"
            className="mb-10 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5"
          >
            <Sparkles size={16} /> Import &amp; rebrand a Kaseya campaign
          </Link>
          <div className="flex flex-wrap items-center gap-7">
            <div>
              <div className="text-3xl font-black leading-none text-white">{liveCount}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Live document{liveCount === 1 ? '' : 's'}
              </div>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div>
              <div className="text-3xl font-black leading-none text-white">3</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Doc types supported
              </div>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div>
              <div className="text-3xl font-black leading-none text-white">∞</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Brand consistent
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        {/* Section label */}
        <div className="mb-7 flex items-center gap-4">
          <h2 className="text-2xl font-black tracking-tight text-white">Documents</h2>
          <div className="h-px flex-1 bg-white/10" />
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            {documents.length} total
          </span>
        </div>

        {/* Document grid */}
        <div className="mb-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const inner = (
              <>
                <div className="flex-1 p-6">
                  <div
                    className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] ${doc.categoryClass}`}
                  >
                    {doc.icon}
                    {doc.category}
                  </div>
                  <h3 className="mb-2.5 text-xl font-bold leading-snug tracking-tight text-white">
                    {doc.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">{doc.description}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-3.5">
                  <div className="flex flex-wrap gap-1.5">
                    {doc.chips.map((c) => (
                      <Chip key={c.label} label={c.label} tone={c.tone} />
                    ))}
                  </div>
                  {doc.href && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-400 transition-all group-hover:border-transparent group-hover:bg-gradient-to-r group-hover:from-cyan-500 group-hover:to-cyan-600 group-hover:text-[#04222a]">
                      Open
                      <ArrowUpRight size={13} />
                    </span>
                  )}
                </div>
              </>
            )

            const cardClass =
              'group flex flex-col overflow-hidden rounded-2xl border bg-white/5 transition-all'

            return doc.href ? (
              <Link
                key={doc.title}
                href={doc.href}
                className={`${cardClass} border-white/10 hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-lg hover:shadow-cyan-500/10`}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={doc.title}
                className={`${cardClass} border-white/10 opacity-60`}
                aria-disabled
              >
                {inner}
              </div>
            )
          })}
        </div>

        {/* How to add */}
        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.04] p-8 sm:p-9">
          <div className="mb-2.5 flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-cyan-400" />
            <h3 className="text-xl font-bold text-white">Adding a new branded document</h3>
          </div>
          <p className="mb-7 max-w-2xl text-sm text-slate-400">
            The brand system is shared — new documents automatically inherit TCT colors,
            typography, and components by following these three steps.
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                n: '1',
                t: 'Create the page',
                d: 'Add a route under src/app/admin/documents/ as a server component, gated with the standard auth() check.',
              },
              {
                n: '2',
                t: 'Use shared components',
                d: 'Reuse CopyButton, Countdown, PhaseNav and the TCT Tailwind brand classes — cyan accents, slate/black glass cards, Inter.',
              },
              {
                n: '3',
                t: 'List it here',
                d: 'Add an entry to the documents array in this hub with its title, category, and href.',
              },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-3.5">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-gradient-to-r from-cyan-400 to-cyan-600 text-sm font-black text-[#04222a]">
                  {step.n}
                </div>
                <div>
                  <div className="mb-0.5 text-sm font-semibold text-white">{step.t}</div>
                  <div className="text-xs leading-relaxed text-slate-500">{step.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </AdminShell>
  )
}
