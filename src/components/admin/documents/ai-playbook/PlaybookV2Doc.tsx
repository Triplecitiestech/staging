import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AI_PLAYBOOK_V2_MD } from '@/lib/ai-playbook/ai-playbook-v2-content'

/**
 * Renders the AI Enablement Services Playbook v2 (the canonical doc at
 * docs/reference/AI_PLAYBOOK_V2.md) as a branded, on-site page.
 *
 * Styling mirrors the BrandedDoc dark-theme/cyan markdown overrides (this repo
 * has no Tailwind typography plugin), and ADDS GFM table support for the
 * v1 -> v2 change-log table. Kept separate from BrandedDoc so the shared
 * marketing/blog renderer's behavior is untouched.
 *
 * Content is imported as a bundled string (not read from disk) so it ships in
 * the serverless function without filesystem tracing.
 */

// Pull plain text out of react-markdown children so headings can carry a
// GitHub-style slug id (makes the doc's in-page [§x](#…) anchors jump).
function toText(node: React.ReactNode): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(toText).join('')
  if (typeof node === 'object' && 'props' in (node as { props?: { children?: React.ReactNode } })) {
    return toText((node as { props?: { children?: React.ReactNode } }).props?.children)
  }
  return ''
}
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9 -]/g, '').replace(/\s/g, '-')
}

const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1
      id={slugify(toText(children))}
      className="scroll-mt-24 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl"
    >
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2
      id={slugify(toText(children))}
      className="mt-14 mb-4 scroll-mt-24 border-t border-white/10 pt-10 text-2xl font-black tracking-tight text-white sm:text-3xl"
    >
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 id={slugify(toText(children))} className="mb-3 mt-8 scroll-mt-24 text-xl font-bold tracking-tight text-white">
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-2 mt-6 text-base font-bold uppercase tracking-[0.12em] text-cyan-300">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-4 text-[15.5px] leading-relaxed text-slate-300">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const external = !!href && /^https?:\/\//i.test(href)
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="border-b border-cyan-400/40 font-medium text-cyan-400 transition-colors hover:text-cyan-300"
      >
        {children}
      </a>
    )
  },
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="text-slate-200">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-5 list-disc space-y-1.5 pl-6 text-[15.5px] text-slate-300 marker:text-cyan-400">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-5 list-decimal space-y-1.5 pl-6 text-[15.5px] text-slate-300 marker:font-bold marker:text-cyan-400">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-6 rounded-r-xl border-l-[3px] border-cyan-400 bg-cyan-400/[0.06] py-3 pl-5 pr-4 text-[15.5px] leading-relaxed text-slate-200">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.86em] text-cyan-300">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-5 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[13px] leading-relaxed text-slate-300">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-10 border-white/10" />,
  // GFM tables — the v1 -> v2 change-log lives here.
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left align-top text-[12px] font-bold uppercase tracking-wide text-white">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-b border-white/10 px-4 py-3 align-top text-slate-300">{children}</td>
  ),
}

export default function PlaybookV2Doc() {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-32 pt-4 sm:px-6 lg:px-8">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {AI_PLAYBOOK_V2_MD}
      </ReactMarkdown>
    </article>
  )
}
