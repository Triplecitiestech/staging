import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { setShareToken, clearShareToken } from '@/lib/ai-discovery/store'

export const dynamic = 'force-dynamic'

// POST /api/admin/ai-discovery/share { id, enable } → create or revoke a public
// share token for an assessment's AIGPA report.
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
      const token = await setShareToken(body.id)
      if (!token) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
      return NextResponse.json({ token })
    }
    await clearShareToken(body.id)
    return NextResponse.json({ token: null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-discovery/share] failed:', msg)
    return NextResponse.json({ error: `Failed to update share link: ${msg}` }, { status: 502 })
  }
}
