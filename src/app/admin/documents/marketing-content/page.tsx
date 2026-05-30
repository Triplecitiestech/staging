import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import AdminShell from '@/components/admin/AdminShell'
import { ArrowLeft, Plus, Pencil, ArrowUpRight, Megaphone } from 'lucide-react'
import { listDocs, seedSampleIfEmpty, type MarketingDoc } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Marketing Content — Branded — TCT Documents',
  description: 'Create and manage marketing content rendered in the Triple Cities Tech design system.',
}

function fmtDate(s: string): string {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function MarketingContentListPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  let docs: MarketingDoc[] = []
  let loadError = false
  try {
    await seedSampleIfEmpty(session.user?.email || null)
    docs = await listDocs()
  } catch (err) {
    console.error('[documents] list page failed:', err)
    loadError = true
  }

  return (
    <AdminShell>
      <AdminHeader />

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: "url('/herobg.webp')" }} />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-cyan-500/10" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href="/admin/documents"
            className="mb-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
          >
            <ArrowLeft size={13} /> Documents
          </Link>
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-purple-400">
            <Megaphone className="h-5 w-5" /> Marketing
          </div>
          <h1 className="mb-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Branded <span className="text-cyan-400">Marketing</span> Content
          </h1>
          <p className="mb-8 max-w-2xl text-lg font-medium leading-relaxed text-white/90">
            Paste the agency draft, hit save, and it publishes in the TCT design system — no layout work,
            no stock graphics. Everything here renders in the house brand.
          </p>
          <Link
            href="/admin/documents/marketing-content/new"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5"
          >
            <Plus size={16} /> New marketing piece
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {loadError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-8 text-center">
            <p className="text-lg font-bold text-white">Couldn&apos;t load documents</p>
            <p className="mt-1 text-sm text-slate-400">
              The documents store is temporarily unavailable. Refresh in a moment.
            </p>
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <Megaphone className="mx-auto mb-4 h-8 w-8 text-purple-400" />
            <p className="text-lg font-bold text-white">No marketing content yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              Create your first branded piece — paste the agency copy and it renders in the TCT brand.
            </p>
            <Link
              href="/admin/documents/marketing-content/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-[#04222a]"
            >
              <Plus size={16} /> New marketing piece
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => (
              <div
                key={doc.slug}
                className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all hover:-translate-y-1 hover:border-cyan-400/30"
              >
                <Link href={`/admin/documents/marketing-content/${doc.slug}`} className="flex-1 p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        doc.status === 'published'
                          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                          : 'border-white/10 text-slate-500'
                      }`}
                    >
                      {doc.status}
                    </span>
                    {doc.eyebrow && (
                      <span className="text-[11px] font-bold uppercase tracking-wide text-purple-400">{doc.eyebrow}</span>
                    )}
                  </div>
                  <h3 className="mb-2 text-lg font-bold leading-snug tracking-tight text-white">{doc.title}</h3>
                  {doc.deck && <p className="line-clamp-3 text-sm leading-relaxed text-slate-400">{doc.deck}</p>}
                </Link>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-3">
                  <span className="text-xs text-slate-500">Updated {fmtDate(doc.updatedAt)}</span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/documents/marketing-content/${doc.slug}/edit`}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300 hover:border-cyan-400/30 hover:text-cyan-300"
                    >
                      <Pencil size={12} /> Edit
                    </Link>
                    <Link
                      href={`/admin/documents/marketing-content/${doc.slug}`}
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 px-2.5 py-1 text-xs font-bold text-cyan-400 hover:bg-cyan-400/10"
                    >
                      Open <ArrowUpRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AdminShell>
  )
}
