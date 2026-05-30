import Link from 'next/link'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import CopyButton from '@/components/admin/documents/CopyButton'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Marketing Content — Branded — TCT Documents',
  description:
    'Marketing agency content rendered in the Triple Cities Tech design system — no generic layouts, no stock graphics.',
}

/* ---------------------------------------------------------------------------
 * HOW TO REPLACE THIS WITH REAL CONTENT
 *
 * Everything an editor needs to swap lives in the DOC object below. Paste the
 * marketing agency's copy into `body` as Markdown (headings, lists, **bold**,
 * links, > blockquotes all render branded automatically), update the meta
 * fields + CTA, and the TCT brand treatment applies with zero layout work.
 *
 * The copy below is a representative SAMPLE so the branded treatment is visible
 * before real agency content arrives. Replace it.
 * ------------------------------------------------------------------------- */

const DOC = {
  eyebrow: 'Service Spotlight',
  kicker: 'Sample content — replace with the agency piece',
  title: 'Security that watches while you sleep',
  deck: 'Why Binghamton-area businesses are moving from “we have antivirus” to a fully managed detection-and-response operation — and what that actually changes day to day.',
  meta: [
    { k: 'Format', v: 'Service spotlight' },
    { k: 'Audience', v: 'SMB owners & office managers' },
    { k: 'Read', v: '~3 min' },
  ],
  body: `Most small businesses don't get breached because they ignored security. They get breached because security was **something they bought once** — a box checked years ago — instead of something that runs every hour of every day. The threats kept evolving. The defense didn't.

That gap is exactly what a managed Security Operations Center (SOC) closes.

## What "managed detection and response" really means

Antivirus asks a simple question: *is this file on a list of known-bad things?* Modern attacks walk right past that. They use legitimate tools, stolen passwords, and patient, quiet movement that no signature catches.

A managed SOC watches **behavior** instead of signatures:

- Sign-ins from two countries an hour apart
- A finance workstation suddenly reaching out to a server it has never talked to
- Backups being deleted in the middle of the night

Each of those is a story, not a file — and our analysts read those stories across your whole environment, correlating signals from your endpoints, your Microsoft 365 tenant, your firewall, and your DNS in one place.

## The part that matters: someone is actually on the other end

Tools generate alerts. Alerts without people are just noise that arrives faster. The difference with Triple Cities Tech is that **a real analyst triages every meaningful signal** — confirms whether it's a genuine threat, takes the first containment action, and tells you in plain language what happened and what we did about it.

> You don't get a dashboard full of red squares and a wish of good luck. You get an answer: "We isolated that laptop at 2:14 AM, the account is locked, and nothing else was touched."

## What changes day to day

For your team, almost nothing changes — and that's the point. People keep working. The shift happens underneath:

1. **Threats get caught early**, while they're still one laptop instead of your whole network.
2. **Response happens in minutes**, around the clock, without waiting for someone to notice Monday morning.
3. **You get clarity**, not homework — a short, human summary instead of a console you have to learn.

## Where to start

Most clients begin with a no-cost review of what's already protecting them and where the real gaps are. From there, managed detection and response layers on top of what you have — it doesn't rip anything out.

The businesses that sleep best aren't the ones with the most tools. They're the ones who know someone is watching.`,
  cta: {
    heading: 'Want this rendered for a real campaign?',
    sub: 'Paste the agency draft into this document and it publishes in the TCT brand — same dark theme, same typography, same components used everywhere else we publish.',
    primaryLabel: 'Back to Documents',
    primaryHref: '/admin/documents',
  },
}

// Raw markdown source, handy for copying into a CMS / re-editing.
const RAW = `# ${DOC.title}\n\n${DOC.deck}\n\n${DOC.body}`

// Branded react-markdown element overrides (dark theme, cyan accents).
// Same approach the blog uses — no Tailwind typography plugin in this repo.
const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-4 mt-12 text-3xl font-black tracking-tight text-white">{children}</h2>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-4 mt-12 text-2xl font-black tracking-tight text-white sm:text-3xl">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-3 mt-8 text-xl font-bold tracking-tight text-white">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-5 text-lg leading-relaxed text-slate-300">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="border-b border-cyan-400/40 font-medium text-cyan-400 transition-colors hover:text-cyan-300"
    >
      {children}
    </a>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="text-slate-200">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-6 list-disc space-y-2 pl-6 text-lg text-slate-300 marker:text-cyan-400">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-6 list-decimal space-y-2 pl-6 text-lg text-slate-300 marker:font-bold marker:text-cyan-400">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-8 rounded-r-xl border-l-[3px] border-cyan-400 bg-cyan-400/[0.06] py-4 pl-6 pr-5 text-lg font-medium italic leading-relaxed text-slate-200">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-300">
      {children}
    </code>
  ),
  hr: () => <hr className="my-10 border-white/10" />,
}

export default async function MarketingContentPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <div className="min-h-screen bg-black text-slate-300">
      {/* Document top bar */}
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Image
            src="/logo/tctlogo.webp"
            alt="Triple Cities Tech"
            width={36}
            height={36}
            className="h-8 w-8 object-contain"
          />
          <div className="flex items-center gap-4">
            <Link
              href="/admin/documents"
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
            >
              <ArrowLeft size={13} /> Documents
            </Link>
            <span className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 sm:inline">
              Marketing · Branded
            </span>
            <CopyButton text={RAW} label="Copy markdown" variant="dark" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: "url('/herobg.webp')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-black" />
        <div className="relative mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm font-bold uppercase tracking-[0.16em] text-cyan-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              {DOC.eyebrow}
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs font-semibold normal-case tracking-normal text-slate-400">
              {DOC.kicker}
            </span>
          </div>
          <h1 className="mb-5 text-4xl font-black leading-[0.98] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {DOC.title}
          </h1>
          <p className="mb-9 max-w-2xl text-lg font-medium leading-relaxed text-white/90 sm:text-xl">
            {DOC.deck}
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {DOC.meta.map((m) => (
              <div key={m.k}>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {m.k}
                </div>
                <div className="text-base font-bold text-white">{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Body — agency content rendered branded */}
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        <ReactMarkdown components={mdComponents}>{DOC.body}</ReactMarkdown>
      </article>

      {/* CTA band */}
      <section className="border-t border-white/10 bg-gradient-to-br from-slate-900 via-black to-black">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="mb-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            {DOC.cta.heading}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-slate-400">
            {DOC.cta.sub}
          </p>
          <Link
            href={DOC.cta.primaryHref}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-6 py-3 text-sm font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5"
          >
            {DOC.cta.primaryLabel}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black py-12 text-center">
        <Image
          src="/logo/tctlogo.webp"
          alt="Triple Cities Tech"
          width={30}
          height={30}
          className="mx-auto mb-4 h-8 w-8 object-contain opacity-90"
        />
        <p className="text-sm text-slate-500">
          Branded marketing content — <span className="font-semibold text-cyan-400">Triple Cities Tech</span>.{' '}
          <Link href="/admin/documents" className="text-slate-500 hover:text-cyan-300">
            ← Back to Documents
          </Link>
        </p>
      </footer>
    </div>
  )
}
