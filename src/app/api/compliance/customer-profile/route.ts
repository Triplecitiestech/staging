/**
 * GET  /api/compliance/customer-profile?companyId=xxx
 *   Returns the customer-profile answers (merged from legacy +
 *   form_responses, per the canonical reader).
 *
 * POST /api/compliance/customer-profile
 *   Body: { companyId, answers: Record<string, string | string[] | null> }
 *   Persists answers to form_responses. Uses saveCustomerProfileAnswers
 *   which validates keys against the schema and does a read-modify-write
 *   so partial updates don't clobber untouched fields.
 *
 * Both endpoints require an authenticated staff session.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import {
  getCustomerProfileAnswers,
  saveCustomerProfileAnswers,
  type CustomerProfileWriteInput,
} from '@/lib/compliance/customer-profile-schema'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  try {
    const answers = await getCustomerProfileAnswers(companyId)
    return NextResponse.json({ answers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[compliance/customer-profile] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

interface PostBody {
  companyId?: string
  answers?: CustomerProfileWriteInput
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: PostBody = {}
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const companyId = (body.companyId || '').trim()
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'answers must be an object' }, { status: 400 })
  }
  try {
    await saveCustomerProfileAnswers(companyId, body.answers, session.user.email)
    const merged = await getCustomerProfileAnswers(companyId)
    return NextResponse.json({ success: true, answers: merged })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[compliance/customer-profile] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
