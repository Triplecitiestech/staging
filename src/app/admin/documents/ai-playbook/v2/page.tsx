import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/AdminShell'
import AdminHeader from '@/components/admin/AdminHeader'
import PlaybookV2Doc from '@/components/admin/documents/ai-playbook/PlaybookV2Doc'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI Enablement Services Playbook v2 — TCT Admin',
  description:
    'Version 2 of the AI services playbook, rebuilt from the June 22 Jim King meeting — with a v1→v2 change-log and an assessment section for review.',
}

export default async function AiPlaybookV2Page() {
  const session = await auth()
  if (!session) redirect('/admin')

  return (
    <AdminShell>
      <AdminHeader />

      {/* Full-bleed dark canvas — AdminShell paints a blue ambient gradient that
          would turn the dark cards into hard rectangles; this covers it while
          this page is mounted (same approach as the v1 playbook). */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        aria-hidden
        style={{ background: 'radial-gradient(125% 90% at 50% -8%, #0b121c 0%, #07090e 55%, #050609 100%)' }}
      />

      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/documents/ai-playbook"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-cyan-400"
          >
            <ArrowLeft size={14} />
            v1.0 playbook
          </Link>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-300">
            v2.0 · for review
          </span>
        </div>
      </div>

      <PlaybookV2Doc />
    </AdminShell>
  )
}
