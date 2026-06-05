import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { buildDnsfilterPrefill } from '@/lib/ai-discovery/dnsfilter-prefill'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/admin/ai-discovery/prefill { companyName, companyId? }
// Reads the company's DNSFilter activity (via the existing mapping + token) and
// returns suggested AI-state / systems answers for the rep to review.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const csrf = checkCsrf(request)
  if (csrf) return csrf

  let body: { companyName?: string; companyId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : ''
  if (!companyName) return NextResponse.json({ error: 'Enter the company name first.' }, { status: 400 })

  try {
    const prefill = await buildDnsfilterPrefill(typeof body.companyId === 'string' ? body.companyId : null, companyName)
    return NextResponse.json({ prefill })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-discovery/prefill] failed:', msg)
    return NextResponse.json({ error: `DNSFilter pre-fill failed: ${msg}` }, { status: 502 })
  }
}
