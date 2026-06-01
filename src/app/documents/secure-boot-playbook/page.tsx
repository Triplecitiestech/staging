import { notFound } from 'next/navigation'
import SecureBootPlaybook from '@/components/admin/documents/SecureBootPlaybook'
import { resolveShareToken } from '@/lib/documents/share-links'

export const dynamic = 'force-dynamic'

// Public, token-gated copy of the internal playbook. The admin route keeps its
// own auth gate untouched; this route renders the same shared component only
// when given a valid, non-revoked share token via ?key=. noindex so the
// unlisted link is never surfaced by search engines.
export const metadata = {
  title: 'Secure Boot 2023 Remediation — TCT Project Playbook',
  description:
    'Step-by-step operational playbook for the Secure Boot 2023 certificate remediation project.',
  robots: { index: false, follow: false },
}

const SLUG = 'secure-boot-playbook'

export default async function PublicSecureBootPlaybookPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string | string[] }>
}) {
  const { key } = await searchParams
  const token = Array.isArray(key) ? key[0] : key
  const slug = token ? await resolveShareToken(token) : null

  // Unknown / revoked / missing token → 404 (don't reveal the document exists).
  if (slug !== SLUG) notFound()

  return <SecureBootPlaybook publicView />
}
