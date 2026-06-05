import { NextRequest, NextResponse } from 'next/server'
import { checkCsrf, checkRateLimit } from '@/lib/security'
import { saveIntake } from '@/lib/ai-discovery/store'

export const dynamic = 'force-dynamic'

// PUBLIC, unauthenticated. Gated by a valid intake token + rate limit + a
// honeypot. Prospects submit the Business Snapshot here.
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, { strict: true })
  if (rl) return rl

  const csrf = checkCsrf(request)
  if (csrf) return csrf

  let body: { token?: string; data?: Record<string, unknown>; company_fax?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid submission' }, { status: 400 })
  }

  // Honeypot — bots fill hidden fields. Pretend success, save nothing.
  if (body.company_fax) return NextResponse.json({ ok: true })

  if (!body.token || typeof body.token !== 'string') {
    return NextResponse.json({ error: 'This form link is invalid.' }, { status: 400 })
  }

  // Coerce to a flat string map and cap sizes to keep submissions sane.
  const data: Record<string, string> = {}
  if (body.data && typeof body.data === 'object') {
    for (const [k, v] of Object.entries(body.data)) {
      if (typeof v === 'string' && v.trim() !== '') data[String(k).slice(0, 120)] = v.slice(0, 4000)
    }
  }

  try {
    const ok = await saveIntake(body.token, data)
    if (!ok) return NextResponse.json({ error: 'This form link is no longer active.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[intake] save failed:', msg)
    return NextResponse.json({ error: 'Something went wrong saving your responses. Please try again.' }, { status: 502 })
  }
}
