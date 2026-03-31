/**
 * GET  /api/compliance/setup — Get current MSP compliance setup config
 * POST /api/compliance/setup — Save setup answers and configure the tool registry
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

export interface SetupAnswer {
  questionId: string
  toolId: string | null
  notes: string
}

export interface SetupConfig {
  answers: SetupAnswer[]
  completedAt: string | null
  completedBy: string | null
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_msp_setup (
        id          TEXT PRIMARY KEY DEFAULT 'msp_setup',
        answers     JSONB NOT NULL DEFAULT '[]',
        "completedAt" TIMESTAMPTZ,
        "completedBy" TEXT,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const res = await client.query<{ answers: SetupAnswer[]; completedAt: string | null; completedBy: string | null }>(
      `SELECT answers, "completedAt", "completedBy" FROM compliance_msp_setup WHERE id = 'msp_setup'`
    )

    if (res.rows.length === 0) {
      return NextResponse.json({ success: true, data: { answers: [], completedAt: null, completedBy: null } })
    }

    return NextResponse.json({ success: true, data: res.rows[0] })
  } catch (err) {
    console.error('[compliance/setup] GET error:', err)
    return NextResponse.json({ error: 'Failed to load setup' }, { status: 500 })
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { answers: SetupAnswer[] }
    if (!body.answers || !Array.isArray(body.answers)) {
      return NextResponse.json({ error: 'answers array is required' }, { status: 400 })
    }

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_msp_setup (
          id          TEXT PRIMARY KEY DEFAULT 'msp_setup',
          answers     JSONB NOT NULL DEFAULT '[]',
          "completedAt" TIMESTAMPTZ,
          "completedBy" TEXT,
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)

      await client.query(
        `INSERT INTO compliance_msp_setup (id, answers, "completedAt", "completedBy", "updatedAt")
         VALUES ('msp_setup', $1::jsonb, NOW(), $2, NOW())
         ON CONFLICT (id) DO UPDATE SET answers = $1::jsonb, "completedAt" = NOW(), "completedBy" = $2, "updatedAt" = NOW()`,
        [JSON.stringify(body.answers), session.user.email]
      )

      return NextResponse.json({ success: true })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/setup] POST error:', err)
    return NextResponse.json({ error: 'Failed to save setup' }, { status: 500 })
  }
}
