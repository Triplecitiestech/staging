import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import BrandedDoc from '@/components/admin/documents/BrandedDoc'
import { getDocBySlug } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const { slug } = await params
    const doc = await getDocBySlug(slug)
    if (!doc || doc.status !== 'published') return { title: 'Not found — Triple Cities Tech' }
    const url = `${BASE}/content/${doc.slug}`
    const description = doc.deck || `${doc.title} — Triple Cities Tech.`
    return {
      title: `${doc.title} — Triple Cities Tech`,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: doc.title,
        description,
        url,
        type: 'article',
        siteName: 'Triple Cities Tech',
      },
      twitter: { card: 'summary_large_image', title: doc.title, description },
    }
  } catch {
    return { title: 'Triple Cities Tech' }
  }
}

export default async function PublicContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = await getDocBySlug(slug)
  // Only published documents are public. Drafts and unknown slugs 404.
  if (!doc || doc.status !== 'published') notFound()

  return (
    <>
      <Header />
      <main className="bg-black">
        <BrandedDoc
          doc={{
            eyebrow: doc.eyebrow,
            title: doc.title,
            deck: doc.deck,
            meta: doc.meta,
            body: doc.body,
            cta: doc.cta,
          }}
          topInset
        />
      </main>
      <Footer />
    </>
  )
}
