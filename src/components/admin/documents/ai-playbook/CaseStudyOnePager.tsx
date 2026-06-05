/**
 * Printable case-study one-pager — light themed sales collateral (print / save
 * as PDF, then send). [Bracketed] values are placeholders to fill before
 * sharing. Presentational only.
 */

import type { CaseStudy } from '@/lib/ai-playbook/case-studies'

function Block({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-3">{title}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 items-start text-[15px] leading-relaxed text-slate-700">
            <span className={`flex-none mt-2 w-1.5 h-1.5 rounded-full ${accent ? 'bg-emerald-500' : 'bg-cyan-500'}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function CaseStudyOnePager({ study }: { study: CaseStudy }) {
  return (
    <article className="bg-white text-slate-900 max-w-[840px] mx-auto rounded-xl shadow-sm print:shadow-none print:rounded-none">
      <header className="px-8 sm:px-12 pt-10 pb-8 border-b border-slate-200">
        <div className="flex items-center justify-between gap-4 mb-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-700">Triple Cities Tech · Case Study</span>
          <span className="text-[11px] font-medium text-slate-400">{study.category}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">{study.client}</h1>
        <div className="text-sm text-slate-500 mt-1">{study.industry}</div>
        <p className="text-[18px] leading-relaxed text-slate-800 font-semibold mt-5">{study.headline}</p>
        <p className="text-[15.5px] leading-relaxed text-slate-600 mt-2">{study.summary}</p>
      </header>

      <div className="px-8 sm:px-12 py-8 flex flex-col gap-8">
        <Block title="The challenge" items={study.challenge} />
        <Block title="What we did" items={study.approach} />

        <section className="break-inside-avoid rounded-xl bg-slate-50 border border-slate-200 p-6">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-emerald-700 mb-3">The result</h2>
          <ul className="flex flex-col gap-2">
            {study.results.map((it, i) => (
              <li key={i} className="flex gap-2.5 items-start text-[15px] leading-relaxed text-slate-800">
                <span className="flex-none mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </section>

        {study.stack.length > 0 && (
          <section className="break-inside-avoid">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-3">Stack</h2>
            <div className="flex flex-wrap gap-2">
              {study.stack.map((s) => (
                <span key={s} className="text-[12.5px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">{s}</span>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="px-8 sm:px-12 py-5 border-t border-slate-200 text-[12px] text-slate-400 flex items-center justify-between">
        <span>Triple Cities Tech · AI Managed Services</span>
        <span>www.triplecitiestech.com</span>
      </footer>
    </article>
  )
}
