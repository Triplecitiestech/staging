import { NextResponse } from 'next/server'
import { clearPortalSessionCookie } from '@/lib/portal-session'

// ---------------------------------------------------------------------------
// POST /api/portal/auth/logout
// ---------------------------------------------------------------------------

export async function POST(): Promise<NextResponse> {
  await clearPortalSessionCookie()
  return NextResponse.json({ ok: true })
}
