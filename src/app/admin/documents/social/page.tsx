import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import AdminShell from '@/components/admin/AdminShell'
import { ArrowLeft, Plus, Pencil, ArrowUpRight, Share2 } from 'lucide-react'
import { listSocialDocs, seedSampleSocialIfEmpty } from '@/lib/documents/store'
import { platformInfo, type SocialDoc } from '@/lib/documents/social-types'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Social Content Dump — TCT Documents',
  description: 'Turn raw social copy into TCT-branded, copy-ready posts.',
}

function fmtDate(s: string): string {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function SocialListPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  let docs: SocialDoc[] = []
  let loadError = false
  try {
    await seedSampleSocialIfEmpty(session.user?.email || null)
    docs = await listSocialDocs()
  } catch (err) {
    console.error('[documents:social] list page failed:', err)
    loadError = true
  }

  return (
    <AdminShell>
      <AdminHeader />

      <header className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: "url('/herobg.webp')" }} />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-cyan-500/10" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Link href="/admin/documents" className="mb-5 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300">
            <ArrowLeft size={13} /> Documents
          </Link>
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-pink-400">
            <Share2 className="h-5 w-5" /> Social Media
          </div>
          <h1 className="mb-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Social <span className="text-cyan-400">Content</span> Dump
          </h1>
          <p className="mb-8 max-w-2xl text-lg font-medium leading-relaxed text-white/90">
            Paste raw copy from the marketing company, split it into posts, brand it, and copy each one out to the
            platform — captions, hashtags, and character counts included.
          </p>
          <Link href="/admin/documents/social/new" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-[#04222a] shadow-lg shadow-cyan-500/20 transition-transform hover:-translate-y-0.5">
            <Plus size={16} /> New social dump
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {loadError ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-8 text-center">
            <p className="text-lg font-bold text-white">Couldn&apos;t load social dumps</p>
            <p className="mt-1 text-sm text-slate-400">The documents store is temporarily unavailable. Refresh in a moment.</p>
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
            <Share2 className="mx-auto mb-4 h-8 w-8 text-pink-400" />
            <p className="text-lg font-bold text-white">No social dumps yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Paste a batch of social copy and turn it into branded, copy-ready posts.</p>
            <Link href="/admin/documents/social/new" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-cyan-600 px-5 py-2.5 text-sm font-black uppercase tracking-wide text-[#04222a]">
              <Plus size={16} /> New social dump
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => {
              const platforms = Array.from(new Set(doc.posts.map((p) => platformInfo(p.platform).label)))
              return (
                <div key={doc.slug} className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all hover:-translate-y-1 hover:border-cyan-400/30">
                  <Link href={`/admin/documents/social/${doc.slug}`} className="flex-1 p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${doc.status === 'published' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-slate-500'}`}>{doc.status}</span>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-pink-400">{doc.posts.length} post{doc.posts.length === 1 ? '' : 's'}</span>
                    </div>
                    <h3 className="mb-2 text-lg font-bold leading-snug tracking-tight text-white">{doc.title}</h3>
                    {doc.deck && <p className="line-clamp-2 text-sm leading-relaxed text-slate-400">{doc.deck}</p>}
                    {platforms.length > 0 && <p className="mt-3 text-xs text-slate-500">{platforms.join(' · ')}</p>}
                  </Link>
                  <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-3">
                    <span className="text-xs text-slate-500">Updated {fmtDate(doc.updatedAt)}</span>
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/documents/social/${doc.slug}/edit`} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300 hover:border-cyan-400/30 hover:text-cyan-300">
                        <Pencil size={12} /> Edit
                      </Link>
                      <Link href={`/admin/documents/social/${doc.slug}`} className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 px-2.5 py-1 text-xs font-bold text-cyan-400 hover:bg-cyan-400/10">
                        Open <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AdminShell>
  )
}
