import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import SocialEditor from '@/components/admin/documents/SocialEditor'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'New Social Dump — TCT Documents',
}

export default async function NewSocialPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return <SocialEditor slug={null} />
}
