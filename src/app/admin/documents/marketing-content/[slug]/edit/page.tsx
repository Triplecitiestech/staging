import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import DocumentEditor from '@/components/admin/documents/DocumentEditor'
import { getDocBySlug } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Edit Marketing Content — TCT Documents',
}

export default async function EditMarketingContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { slug } = await params
  const doc = await getDocBySlug(slug)
  if (!doc) notFound()

  return <DocumentEditor slug={doc.slug} initial={doc} />
}
