import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import SecureBootPlaybook from '@/components/admin/documents/SecureBootPlaybook'
import ShareLinkButton from '@/components/admin/documents/ShareLinkButton'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Secure Boot 2023 Remediation — TCT Project Playbook',
  description:
    'Step-by-step operational playbook for the Secure Boot 2023 certificate remediation project.',
}

// Staff-only view of the playbook. Auth gate is unchanged — anyone without a
// session is redirected to /admin. The shared <SecureBootPlaybook> renders the
// full document; the <ShareLinkButton> mints/revokes the token-gated public copy
// served at /documents/secure-boot-playbook.
export default async function SecureBootPlaybookPage() {
  const session = await auth()
  if (!session) redirect('/admin')

  return <SecureBootPlaybook shareControl={<ShareLinkButton slug="secure-boot-playbook" />} />
}
