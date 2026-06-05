import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { setIntakeToken, clearIntakeToken } from '@/lib/ai-discovery/store'

export const dynamic = 'force-dynamic'

// POST /api/admin/ai-discovery/intake { id, enable } → create or revoke the
// client-intake link for an assessment.
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const csrf = checkCsrf(request)
  if (csrf) return csrf

  let body: { id?: string; enable?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'Assessment id is required' }, { status: 400 })

  try {
    if (body.enable) {
      const token = await setIntakeToken(body.id)
      if (!token) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
      return NextResponse.json({ token })
    }
    await clearIntakeToken(body.id)
    return NextResponse.json({ token: null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-discovery/intake] failed:', msg)
    return NextResponse.json({ error: `Failed to update intake link: ${msg}` }, { status: 502 })
  }
}
