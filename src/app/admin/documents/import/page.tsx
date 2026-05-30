import Link from 'next/link'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import AdminShell from '@/components/admin/AdminShell'
import { ArrowLeft, Sparkles } from 'lucide-react'
import CampaignImporter from '@/components/admin/documents/CampaignImporter'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Import a Campaign — TCT Documents',
  description: 'Upload a Kaseya campaign zip and rebrand its content into the TCT design system.',
}

export default async function ImportCampaignPage() {
  const session = await auth()
  if (!session) redirect('/admin')

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
          <div className="mb-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-cyan-400">
            <Sparkles className="h-5 w-5" /> Import &amp; rebrand
          </div>
          <h1 className="mb-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Rebrand a <span className="text-cyan-400">Kaseya</span> campaign
          </h1>
          <p className="max-w-2xl text-lg font-medium leading-relaxed text-white/90">
            Drop in a Kaseya &ldquo;Download Full Campaign&rdquo; zip. We keep the wording exactly as written, strip the
            Kaseya boilerplate, and rebuild the email, blog, landing page, and social copy in the TCT design system.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <CampaignImporter />
      </main>
    </AdminShell>
  )
}
