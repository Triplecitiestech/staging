/**
 * GET  /api/compliance/registry/company-tools?companyId=xxx — Get tool deployment status per company
 * POST /api/compliance/registry/company-tools — Toggle a tool as deployed/not-deployed for a company
 *
 * When a tool is marked "deployed" but has no API integration, the
 * compliance engine treats it as attestation-based evidence — the
 * controls it covers get "pass" with confidence "low" and a note
 * that the status is based on admin attestation, not live data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPool } from '@/lib/db-pool'
import { ensureComplianceTables } from '@/lib/compliance/ensure-tables'

export const dynamic = 'force-dynamic'

interface CompanyToolRow {
  id: string
  companyId: string
  toolId: string
  deployed: boolean
  notes: string | null
  deployedBy: string | null
  deployedAt: string | null
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
  }

  await ensureComplianceTables()
  const pool = getPool()
  const client = await pool.connect()
  try {
    // Ensure the table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_company_tools (
        id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "companyId" TEXT NOT NULL,
        "toolId"    TEXT NOT NULL,
        deployed    BOOLEAN NOT NULL DEFAULT false,
        notes       TEXT,
        "deployedBy" TEXT,
        "deployedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("companyId", "toolId")
      )
    `)

    const res = await client.query<CompanyToolRow>(
      `SELECT id, "companyId", "toolId", deployed, notes, "deployedBy", "deployedAt"
       FROM compliance_company_tools WHERE "companyId" = $1`,
      [companyId]
    )
    return NextResponse.json({ success: true, data: res.rows })
  } catch (err) {
    console.error('[compliance/company-tools] GET error:', err)
    return NextResponse.json({ error: 'Failed to load tool status' }, { status: 500 })
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
    const body = (await request.json()) as {
      companyId: string
      toolId: string
      deployed: boolean
      notes?: string
    }

    if (!body.companyId || !body.toolId) {
      return NextResponse.json({ error: 'companyId and toolId are required' }, { status: 400 })
    }

    await ensureComplianceTables()
    const pool = getPool()
    const client = await pool.connect()
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_company_tools (
          id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "companyId" TEXT NOT NULL,
          "toolId"    TEXT NOT NULL,
          deployed    BOOLEAN NOT NULL DEFAULT false,
          notes       TEXT,
          "deployedBy" TEXT,
          "deployedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE ("companyId", "toolId")
        )
      `)

      await client.query(
        `INSERT INTO compliance_company_tools ("companyId", "toolId", deployed, notes, "deployedBy", "deployedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, ${body.deployed ? 'NOW()' : 'NULL'}, NOW())
         ON CONFLICT ("companyId", "toolId")
         DO UPDATE SET deployed = $3, notes = $4, "deployedBy" = $5, "deployedAt" = ${body.deployed ? 'NOW()' : 'NULL'}, "updatedAt" = NOW()`,
        [body.companyId, body.toolId, body.deployed, body.notes ?? null, session.user.email]
      )

      return NextResponse.json({ success: true })
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[compliance/company-tools] POST error:', err)
    return NextResponse.json({ error: 'Failed to update tool status' }, { status: 500 })
  }
}
