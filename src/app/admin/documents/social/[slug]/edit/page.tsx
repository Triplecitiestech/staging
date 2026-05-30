import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import SocialEditor from '@/components/admin/documents/SocialEditor'
import { getSocialDocBySlug } from '@/lib/documents/store'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Edit Social Dump — TCT Documents',
}

export default async function EditSocialPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) redirect('/admin')

  const { slug } = await params
  const doc = await getSocialDocBySlug(slug)
  if (!doc) notFound()

  return <SocialEditor slug={doc.slug} initial={doc} />
}
