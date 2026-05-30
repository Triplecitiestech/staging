import Link from 'next/link'
import ReactMarkdown from 'react-markdown'

/**
 * Shared branded renderer for a Marketing-content document. Used by both the
 * read page (/admin/documents/marketing-content/[slug]) and the editor's live
 * preview, so what an author sees while typing is exactly what publishes.
 *
 * No 'use client' — works in both the server render page and the client editor.
 * Renders the hero + Markdown body + CTA only (page chrome lives in the page).
 */

export interface BrandedDocView {
  eyebrow?: string
  title: string
  deck?: string
  meta?: { k: string; v: string }[]
  body: string
  cta?: { heading?: string; sub?: string; primaryLabel?: string; primaryHref?: string }
}

// Branded react-markdown element overrides (dark theme, cyan accents). Same
// approach the blog uses — this repo has no Tailwind typography plugin.
const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-4 mt-12 text-3xl font-black tracking-tight text-white">{children}</h2>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-4 mt-12 text-2xl font-black tracking-tight text-white sm:text-3xl">{children}</h2>
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
  em: ({ children }: { children?: React.ReactNode }) => <em className="text-slate-200">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-6 list-disc space-y-2 pl-6 text-lg text-slate-300 marker:text-cyan-400">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-6 list-decimal space-y-2 pl-6 text-lg text-slate-300 marker:font-bold marker:text-cyan-400">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-8 rounded-r-xl border-l-[3px] border-cyan-400 bg-cyan-400/[0.06] py-4 pl-6 pr-5 text-lg font-medium italic leading-relaxed text-slate-200">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-300">{children}</code>
  ),
  hr: () => <hr className="my-10 border-white/10" />,
}

function CtaButton({ href, label }: { href: string; label: string }) {
  const cls =
    'inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-6 py-3 text-sm font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5'
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {label}
      </a>
    )
  }
  return (
    <Link href={href || '/admin/documents'} className={cls}>
      {label}
    </Link>
  )
}

export default function BrandedDoc({ doc }: { doc: BrandedDocView }) {
  const meta = doc.meta?.filter((m) => m.k || m.v) ?? []
  const cta = doc.cta
  return (
    <div className="bg-black text-slate-300">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: "url('/herobg.webp')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-black" />
        <div className="relative mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          {doc.eyebrow && (
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-cyan-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              {doc.eyebrow}
            </div>
          )}
          <h1 className="mb-5 text-4xl font-black leading-[0.98] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {doc.title || 'Untitled document'}
          </h1>
          {doc.deck && (
            <p className="mb-9 max-w-2xl text-lg font-medium leading-relaxed text-white/90 sm:text-xl">
              {doc.deck}
            </p>
          )}
          {meta.length > 0 && (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {meta.map((m, i) => (
                <div key={`${m.k}-${i}`}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{m.k}</div>
                  <div className="text-base font-bold text-white">{m.v}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Body */}
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        {doc.body.trim() ? (
          <ReactMarkdown components={mdComponents}>{doc.body}</ReactMarkdown>
        ) : (
          <p className="text-lg italic text-slate-500">Start typing the body to see it here…</p>
        )}
      </article>

      {/* CTA */}
      {cta && (cta.heading || cta.sub) && (
        <section className="border-t border-white/10 bg-gradient-to-br from-slate-900 via-black to-black">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
            {cta.heading && (
              <h2 className="mb-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{cta.heading}</h2>
            )}
            {cta.sub && (
              <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-slate-400">{cta.sub}</p>
            )}
            <CtaButton href={cta.primaryHref || '/admin/documents'} label={cta.primaryLabel || 'Back to Documents'} />
          </div>
        </section>
      )}
    </div>
  )
}
