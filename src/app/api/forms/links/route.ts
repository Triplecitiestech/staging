import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { auth } from '@/auth'
import { checkAutomationKey } from '@/lib/api-auth'
import { createFormLink, resolveFormCompany } from '@/lib/form-links'

const pool = getPool()

// ---------------------------------------------------------------------------
// POST /api/forms/links — Create a tokenized form link
//
// Auth: staff admin session OR the Thread automation key
// (x-automation-key header or ?key= query param — see checkAutomationKey;
// fail-closed when THREAD_AUTOMATION_KEY is unset).
//
// Body: {
//   autotaskCompanyId?,        // PRIMARY company identifier (deterministic)
//   companySlug?,              // exact-slug fallback
//   companyName?,              // exact-name fallback; fuzzy ONLY when no
//                              // exact identifier was supplied
//   email? | emailDomain?,     // active-contact domain fallback
//   type,                      // 'onboarding' | 'offboarding'
//   preFill?, expiresInMinutes? (default 1440), source?
// }
//
// Responses:
//   201 { url, token, expiresAt }
//   404 { error: 'not_configured' } — no managed company matched
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Automation key first (programmatic callers), then staff session.
  let isAuthenticated = checkAutomationKey(request) === null
  if (!isAuthenticated) {
    const session = await auth()
    isAuthenticated = Boolean(session?.user)
  }
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    autotaskCompanyId?: string | number
    companySlug?: string
    companyName?: string
    email?: string
    emailDomain?: string
    type: string
    preFill?: Record<string, unknown>
    expiresInMinutes?: number
    source?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { autotaskCompanyId, companySlug, companyName, email, emailDomain, type, preFill, source = 'manual' } = body
  const expiresInMinutes =
    typeof body.expiresInMinutes === 'number' && body.expiresInMinutes > 0
      ? Math.min(body.expiresInMinutes, 30 * 24 * 60)
      : 1440

  if (!type || !['onboarding', 'offboarding'].includes(type)) {
    return NextResponse.json({ error: 'type must be "onboarding" or "offboarding"' }, { status: 400 })
  }
  if (!autotaskCompanyId && !companySlug && !companyName && !email && !emailDomain) {
    return NextResponse.json(
      { error: 'Provide a company identifier: autotaskCompanyId (preferred), companySlug, companyName, or email/emailDomain' },
      { status: 400 }
    )
  }

  const client = await pool.connect()
  try {
    const company = await resolveFormCompany(client, {
      autotaskCompanyId,
      companySlug,
      companyName,
      email,
      emailDomain,
    })

    if (!company) {
      return NextResponse.json({ error: 'not_configured' }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? request.nextUrl.origin
    const link = await createFormLink(client, {
      companyId: company.id,
      type: type as 'onboarding' | 'offboarding',
      baseUrl,
      preFill,
      expiresInMinutes,
      source,
      createdBy: source === 'thread' ? 'thread' : 'admin',
    })

    return NextResponse.json(
      { url: link.url, token: link.token, expiresAt: link.expiresAt, companySlug: company.slug },
      { status: 201 }
    )
  } finally {
    client.release()
  }
}
