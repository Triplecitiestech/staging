import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { checkCsrf } from '@/lib/security'
import { getAssessment, saveReport } from '@/lib/ai-discovery/store'
import { generateAigpaReport } from '@/lib/ai-discovery/report'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // report generation calls Claude with a large output

// POST /api/admin/ai-discovery/report { id } → generate + persist the AIGPA report
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const csrf = checkCsrf(request)
  if (csrf) return csrf

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'Assessment id is required' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured.' }, { status: 503 })
  }

  try {
    const assessment = await getAssessment(body.id)
    if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })

    const report = await generateAigpaReport(assessment)
    await saveReport(assessment.id, report)
    return NextResponse.json({ report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-discovery/report] generation failed:', msg)
    return NextResponse.json({ error: `Report generation failed: ${msg}` }, { status: 502 })
  }
}
