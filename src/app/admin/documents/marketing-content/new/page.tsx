import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import DocumentEditor from '@/components/admin/documents/DocumentEditor'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'New Marketing Content — TCT Documents',
}

export default async function NewMarketingContentPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return <DocumentEditor slug={null} />
}
