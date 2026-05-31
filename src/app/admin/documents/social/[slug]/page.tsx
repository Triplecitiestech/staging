import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import SocialPosts from '@/components/admin/documents/SocialPosts'
import CardGraphic from '@/components/admin/documents/CardGraphic'
import { getSocialDocBySlug, listCardBackgroundIndexes } from '@/lib/documents/store'
import { isImageGenConfigured } from '@/lib/documents/image-gen'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const doc = await getSocialDocBySlug(slug)
    if (doc) return { title: `${doc.title} — Social — TCT Documents`, description: doc.deck || undefined }
  } catch {
    /* default */
  }
  return { title: 'Social Content Dump — TCT Documents' }
}

export default async function SocialDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { slug } = await params
  const doc = await getSocialDocBySlug(slug)
  if (!doc) notFound()

  const bgIndexes = new Set(await listCardBackgroundIndexes(slug))
  const imageConfigured = isImageGenConfigured()

  return (
    <div className="min-h-screen bg-black text-slate-300">
      <header className="sticky top-0 z-50 flex h-16 items-center border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Image src="/logo/tctlogo.webp" alt="Triple Cities Tech" width={36} height={36} className="h-8 w-8 object-contain" />
          <div className="flex items-center gap-3">
            <Link href="/admin/documents/social" className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-all hover:border-cyan-400/30 hover:text-cyan-300">
              <ArrowLeft size={13} /> Social
            </Link>
            {doc.status === 'draft' && (
              <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">Draft</span>
            )}
            <Link href={`/admin/documents/social/${doc.slug}/edit`} className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-400 transition-all hover:bg-cyan-400/10">
              <Pencil size={13} /> Edit
            </Link>
          </div>
        </div>
      </header>

      <SocialPosts doc={{ title: doc.title, deck: doc.deck, posts: doc.posts }} />

      {doc.posts.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <h2 className="mb-1 text-2xl font-black tracking-tight text-white">Branded graphics</h2>
          <p className="mb-6 text-sm text-slate-400">
            TCT-branded social cards. The headline text is always rendered crisply by us (never garbled). Add a real
            AI-generated background per card, or keep the branded gradient.
          </p>
          <div className="space-y-8">
            {doc.posts.map((_, i) => (
              <CardGraphic
                key={i}
                slug={doc.slug}
                index={i}
                hasImage={bgIndexes.has(i)}
                configured={imageConfigured}
              />
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 bg-black py-12 text-center">
        <Image src="/logo/tctlogo.webp" alt="Triple Cities Tech" width={30} height={30} className="mx-auto mb-4 h-8 w-8 object-contain opacity-90" />
        <p className="text-sm text-slate-500">
          Social content — <span className="font-semibold text-cyan-400">Triple Cities Tech</span>.{' '}
          <Link href="/admin/documents/social" className="text-slate-500 hover:text-cyan-300">← All social dumps</Link>
        </p>
      </footer>
    </div>
  )
}
