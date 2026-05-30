import Link from 'next/link'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import AdminShell from '@/components/admin/AdminShell'
import { ArrowLeft, Pencil, ArrowUpRight, Mail, FileText, Globe, Share2, Plus } from 'lucide-react'
import { getCampaignAssets, campaignTitle } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return { title: `${campaignTitle(slug)} — Campaign — TCT Documents` }
}

const KIND_META: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  email: { label: 'Email', icon: <Mail className="h-4 w-4" />, tone: 'text-cyan-300' },
  landing: { label: 'Landing page', icon: <Globe className="h-4 w-4" />, tone: 'text-emerald-300' },
  blog: { label: 'Blog', icon: <FileText className="h-4 w-4" />, tone: 'text-violet-300' },
  social: { label: 'Social posts', icon: <Share2 className="h-4 w-4" />, tone: 'text-pink-300' },
  marketing: { label: 'Content', icon: <FileText className="h-4 w-4" />, tone: 'text-cyan-300' },
}

function basePath(docType: string): string {
  return docType === 'social' ? '/admin/documents/social' : '/admin/documents/marketing-content'
}

export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { slug } = await params
  const assets = await getCampaignAssets(slug)
  if (assets.length === 0) notFound()
  const title = campaignTitle(slug)

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
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-cyan-400">Campaign</div>
          <h1 className="mb-3 text-4xl font-black tracking-tight text-white sm:text-5xl">{title}</h1>
          <p className="mb-6 max-w-2xl text-lg font-medium leading-relaxed text-white/90">
            Imported from Kaseya and rebranded for TCT — {assets.length} asset{assets.length === 1 ? '' : 's'}. Each is a
            draft; review, tweak, and publish.
          </p>
          <Link href="/admin/documents/import" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 transition-all hover:border-cyan-400/30 hover:text-cyan-200">
            <Plus size={15} /> Import another
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => {
            const meta = KIND_META[a.assetKind || a.docType] || KIND_META.marketing
            const base = basePath(a.docType)
            return (
              <div key={a.slug} className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-all hover:-translate-y-1 hover:border-cyan-400/30">
                <Link href={`${base}/${a.slug}`} className="flex-1 p-6">
                  <div className={`mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] ${meta.tone}`}>
                    {meta.icon}
                    {meta.label}
                    <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${a.status === 'published' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-slate-500'}`}>{a.status}</span>
                  </div>
                  <h3 className="text-base font-bold leading-snug tracking-tight text-white">
                    {a.title.replace(new RegExp(`^${title} — `), '')}
                  </h3>
                </Link>
                <div className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-3">
                  <Link href={`${base}/${a.slug}/edit`} className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-xs font-bold text-slate-300 hover:border-cyan-400/30 hover:text-cyan-300">
                    <Pencil size={12} /> Edit
                  </Link>
                  <Link href={`${base}/${a.slug}`} className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 px-2.5 py-1 text-xs font-bold text-cyan-400 hover:bg-cyan-400/10">
                    Open <ArrowUpRight size={12} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </AdminShell>
  )
}
