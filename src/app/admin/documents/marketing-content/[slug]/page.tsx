import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import BrandedDoc from '@/components/admin/documents/BrandedDoc'
import { getDocBySlug } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const doc = await getDocBySlug(slug)
    if (doc) return { title: `${doc.title} — TCT Documents`, description: doc.deck || undefined }
  } catch {
    /* fall through to default */
  }
  return { title: 'Marketing Content — TCT Documents' }
}

export default async function MarketingDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { slug } = await params
  const doc = await getDocBySlug(slug)
  if (!doc) notFound()

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
          <div className="flex items-center gap-3">
            <Link
              href="/admin/documents/marketing-content"
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300"
            >
              <ArrowLeft size={13} /> Marketing
            </Link>
            {doc.status === 'draft' && (
              <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                Draft
              </span>
            )}
            <Link
              href={`/admin/documents/marketing-content/${doc.slug}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-400 transition-all hover:bg-cyan-400/10"
            >
              <Pencil size={13} /> Edit
            </Link>
          </div>
        </div>
      </header>

      <BrandedDoc
        doc={{
          eyebrow: doc.eyebrow,
          title: doc.title,
          deck: doc.deck,
          meta: doc.meta,
          body: doc.body,
          cta: doc.cta,
        }}
      />

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
          <Link href="/admin/documents/marketing-content" className="text-slate-500 hover:text-cyan-300">
            ← All marketing content
          </Link>
        </p>
      </footer>
    </div>
  )
}
