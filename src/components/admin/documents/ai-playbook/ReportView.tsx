/**
 * Client-facing AI Profit & Readiness Assessment report — light themed and print-friendly (it's the paid
 * deliverable presented on the Review Call / exported to PDF). Presentational
 * only; data comes from a saved DiscoveryAssessment's report.
 */

import type { AigpaReport } from '@/lib/ai-discovery/report'

function money(n: number | null | undefined): string | null {
  if (n == null || isNaN(n)) return null
  return '$' + Math.round(n).toLocaleString()
}

function sevClasses(sev: string): string {
  const s = (sev || '').toLowerCase()
  if (s.startsWith('red') || s.includes('heavy') || s.includes('high')) return 'bg-rose-50 text-rose-700 border-rose-200'
  if (s.startsWith('green') || s.includes('dialed') || s.includes('low')) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-slate-100 text-slate-600 border-slate-300'
}

export default function ReportView({ report }: { report: AigpaReport }) {
  const monthly = money(report.profitGap?.monthlyWaste)
  const annual = money(report.profitGap?.annualWaste ?? (report.profitGap?.monthlyWaste != null ? report.profitGap.monthlyWaste * 12 : null))
  const date = report.generatedAt ? new Date(report.generatedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : ''

  return (
    <article className="bg-white text-slate-900 max-w-[840px] mx-auto rounded-xl shadow-sm print:shadow-none print:rounded-none">
      {/* Masthead */}
      <header className="px-8 sm:px-12 pt-10 pb-8 border-b border-slate-200">
        <div className="flex items-center justify-between gap-4 mb-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-700">Triple Cities Tech</span>
          <span className="text-[11px] font-medium text-slate-400">{date}</span>
        </div>
        <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-cyan-700 mb-2">AI Profit &amp; Readiness Assessment</div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">{report.companyName}</h1>
        {report.executiveSummary && (
          <p className="text-[16px] leading-relaxed text-slate-600 mt-4">{report.executiveSummary}</p>
        )}
      </header>

      <div className="px-8 sm:px-12 py-8 flex flex-col gap-9">
        {/* AI Profit Gap */}
        <section>
          <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-3">Part A · Profit Gap Analysis</h2>
          {(monthly || annual) && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <div className="text-3xl font-black text-slate-900 tabular-nums">{monthly ?? '—'}</div>
                <div className="text-sm text-slate-500 mt-1">Estimated monthly waste</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                <div className="text-3xl font-black text-slate-900 tabular-nums">{annual ?? '—'}</div>
                <div className="text-sm text-slate-500 mt-1">Annualized</div>
              </div>
            </div>
          )}
          {report.profitGap?.narrative && <p className="text-[15.5px] leading-relaxed text-slate-700">{report.profitGap.narrative}</p>}
        </section>

        {/* Zones */}
        {report.zones?.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-4">Profit-zone breakdown</h2>
            <div className="flex flex-col gap-4">
              {report.zones.map((z, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-5 break-inside-avoid">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="text-[17px] font-bold text-slate-900">{z.name}</h3>
                    <div className="flex items-center gap-2">
                      {money(z.monthlyWaste) && <span className="text-sm font-semibold text-slate-500">{money(z.monthlyWaste)}/mo</span>}
                      {z.severity && <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${sevClasses(z.severity)}`}>{z.severity}</span>}
                    </div>
                  </div>
                  {z.pains?.length > 0 && (
                    <ul className="list-disc pl-5 text-[14.5px] text-slate-700 leading-relaxed mb-3">
                      {z.pains.map((p, j) => <li key={j}>{p}</li>)}
                    </ul>
                  )}
                  {z.plays?.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {z.plays.map((pl, j) => (
                        <div key={j} className="text-[14px] text-slate-700">
                          <span className="font-semibold text-cyan-800">{pl.play}</span>
                          {pl.impact ? <span className="text-slate-500"> — {pl.impact}</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Readiness + Platform */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 break-inside-avoid">
          {report.readiness && (
            <div className="rounded-lg border border-slate-200 p-5">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-2">Part B · Readiness Assessment</h2>
              {report.readiness.band && <div className="text-lg font-bold text-slate-900 mb-1">{report.readiness.band}</div>}
              {report.readiness.summary && <p className="text-[14.5px] leading-relaxed text-slate-700">{report.readiness.summary}</p>}
            </div>
          )}
          {report.platform && (
            <div className="rounded-lg border border-slate-200 p-5">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-2">Recommended Platform</h2>
              {report.platform.recommendation && <div className="text-lg font-bold text-slate-900 mb-1">{report.platform.recommendation}</div>}
              {report.platform.rationale && <p className="text-[14.5px] leading-relaxed text-slate-700">{report.platform.rationale}</p>}
            </div>
          )}
        </section>

        {/* Roadmap */}
        {report.roadmap?.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-4">90-day roadmap</h2>
            <div className="flex flex-col gap-4">
              {report.roadmap.map((ph, i) => (
                <div key={i} className="flex gap-4 break-inside-avoid">
                  <div className="flex-none w-24 pt-0.5">
                    <div className="text-sm font-bold text-cyan-800">{ph.window}</div>
                  </div>
                  <div className="flex-1 border-l-2 border-cyan-100 pl-4 pb-1">
                    {ph.focus && <div className="font-semibold text-slate-900 mb-1">{ph.focus}</div>}
                    {ph.items?.length > 0 && (
                      <ul className="list-disc pl-5 text-[14.5px] text-slate-700 leading-relaxed">
                        {ph.items.map((it, j) => <li key={j}>{it}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Three paths */}
        {report.paths && (
          <section className="break-inside-avoid">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-700 mb-4">Three paths forward</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { k: 'DIY', v: report.paths.diy },
                { k: 'Consult', v: report.paths.consult },
                { k: 'Done-For-You', v: report.paths.doneForYou },
              ].map((p) => (
                <div key={p.k} className="rounded-lg border border-slate-200 p-4">
                  <div className="text-sm font-bold text-slate-900 mb-1.5">{p.k}</div>
                  <p className="text-[13.5px] leading-relaxed text-slate-600">{p.v}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Next step */}
        {report.nextStep && (
          <section className="rounded-xl bg-slate-900 text-white p-6 break-inside-avoid">
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-cyan-300 mb-2">Recommended next step</div>
            <p className="text-[16px] leading-relaxed">{report.nextStep}</p>
          </section>
        )}
      </div>

      <footer className="px-8 sm:px-12 py-5 border-t border-slate-200 text-[12px] text-slate-400 flex items-center justify-between">
        <span>Triple Cities Tech · AI Profit &amp; Readiness Assessment</span>
        <span>{report.companyName}</span>
      </footer>
    </article>
  )
}
