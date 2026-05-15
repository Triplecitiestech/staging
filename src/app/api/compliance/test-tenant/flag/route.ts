/**
 * POST /api/compliance/test-tenant/flag
 *
 * Toggle the `isTestTenant` flag on a company. SUPER_ADMIN only.
 *
 * Body: { companyId: string, isTestTenant: boolean }
 *
 * Flipping a company to isTestTenant=true makes it eligible for the
 * destructive reset endpoint. Flipping back to false removes that
 * eligibility. The flag does not affect any other behavior.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'

export const dynamic = 'force-dynamic'

interface FlagBody {
  companyId?: string
  isTestTenant?: boolean
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — SUPER_ADMIN required' }, { status: 403 })
  }

  let body: FlagBody = {}
  try {
    body = (await request.json()) as FlagBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const companyId = (body.companyId || '').trim()
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }
  if (typeof body.isTestTenant !== 'boolean') {
    return NextResponse.json({ error: 'isTestTenant must be a boolean' }, { status: 400 })
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    const res = await client.query<{ id: string; slug: string; displayName: string; isTestTenant: boolean }>(
      `UPDATE companies
          SET "isTestTenant" = $2,
              "updatedAt" = NOW()
        WHERE id = $1
        RETURNING id, slug, "displayName", "isTestTenant"`,
      [companyId, body.isTestTenant]
    )
    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, company: res.rows[0] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[compliance/test-tenant/flag] failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
  }
}
