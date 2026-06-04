import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { listAssessments, getAssessment, upsertAssessment } from '@/lib/ai-discovery/store'

export const dynamic = 'force-dynamic'

// GET /api/admin/ai-discovery        → list saved assessments (summaries)
// GET /api/admin/ai-discovery?id=…   → one full assessment
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  try {
    if (id) {
      const assessment = await getAssessment(id)
      if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ assessment })
    }
    const assessments = await listAssessments()
    return NextResponse.json({ assessments })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-discovery] load failed:', msg)
    return NextResponse.json({ error: `Failed to load discovery data: ${msg}` }, { status: 502 })
  }
}

// POST /api/admin/ai-discovery → create or update an assessment
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const csrf = checkCsrf(request)
  if (csrf) return csrf

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : ''
  if (!companyName) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  const createdBy = (session.user?.email as string | undefined) ?? null

  try {
    const assessment = await upsertAssessment({
      id: typeof body.id === 'string' ? body.id : null,
      companyId: typeof body.companyId === 'string' ? body.companyId : null,
      companyName,
      createdBy,
      status: body.status === 'complete' ? 'complete' : 'draft',
      answers: (body.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, string>,
      platformRecommendation: typeof body.platformRecommendation === 'string' ? body.platformRecommendation : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    })
    return NextResponse.json({ assessment })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-discovery] save failed:', msg)
    return NextResponse.json({ error: `Failed to save discovery assessment: ${msg}` }, { status: 502 })
  }
}
