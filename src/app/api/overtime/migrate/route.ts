import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/overtime/migrate — idempotently creates overtime tables.
 * GET — returns presence/missing report.
 *
 * Auth: Bearer MIGRATION_SECRET or ?secret=
 */
function authorize(request: Request): boolean {
  const auth = request.headers.get('authorization')
  const url = new URL(request.url)
  const q = url.searchParams.get('secret')
  const expected = process.env.MIGRATION_SECRET
  if (!expected) return false
  return auth === `Bearer ${expected}` || q === expected
}

export async function POST(request: Request) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const applied: string[] = []
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING_INTAKE', 'PENDING_APPROVAL', 'APPROVED', 'DENIED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    applied.push('enum: OvertimeRequestStatus')

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "overtime_requests" (
        "id" TEXT NOT NULL,
        "employeeStaffId" TEXT NOT NULL,
        "employeeEmail" TEXT NOT NULL,
        "employeeName" TEXT NOT NULL,
        "workDate" DATE NOT NULL,
        "startTime" TEXT,
        "estimatedHours" DECIMAL(5,2) NOT NULL,
        "reason" TEXT NOT NULL,
        "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING_INTAKE',
        "intakeByStaffId" TEXT,
        "intakeByName" TEXT,
        "intakeAt" TIMESTAMP(3),
        "intakeNotes" TEXT,
        "intakeSkipped" BOOLEAN NOT NULL DEFAULT false,
        "intakeNotifiedAt" TIMESTAMP(3),
        "reviewedByStaffId" TEXT,
        "reviewedByName" TEXT,
        "reviewedAt" TIMESTAMP(3),
        "managerNotes" TEXT,
        "actualHoursWorked" DECIMAL(5,2),
        "payrollRecordedAt" TIMESTAMP(3),
        "payrollRecordedByStaffId" TEXT,
        "payrollRecordedByName" TEXT,
        "submitterNotifiedAt" TIMESTAMP(3),
        "approversNotifiedAt" TIMESTAMP(3),
        "employeeNotifiedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "overtime_requests_employeeStaffId_status_idx" ON "overtime_requests"("employeeStaffId", "status")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "overtime_requests_status_workDate_idx" ON "overtime_requests"("status", "workDate")`
    )
    applied.push('table: overtime_requests')

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "overtime_audit_logs" (
        "id" TEXT NOT NULL,
        "requestId" TEXT NOT NULL,
        "actorStaffId" TEXT,
        "actorEmail" TEXT NOT NULL,
        "actorName" TEXT,
        "action" TEXT NOT NULL,
        "details" JSONB,
        "severity" TEXT NOT NULL DEFAULT 'info',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "overtime_audit_logs_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "overtime_audit_logs"
          ADD CONSTRAINT "overtime_audit_logs_requestId_fkey"
          FOREIGN KEY ("requestId") REFERENCES "overtime_requests"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "overtime_audit_logs_requestId_createdAt_idx" ON "overtime_audit_logs"("requestId", "createdAt" DESC)`
    )
    applied.push('table: overtime_audit_logs')

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('overtime_requests', 'overtime_audit_logs')
      ORDER BY table_name
    `
    return NextResponse.json({ ok: true, applied, tablesPresent: tables.map((t) => t.table_name) })
  } catch (err) {
    return NextResponse.json(
      { ok: false, applied, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('overtime_requests', 'overtime_audit_logs')
      ORDER BY table_name
    `
    const expected = ['overtime_audit_logs', 'overtime_requests']
    const present = tables.map((t) => t.table_name)
    return NextResponse.json({
      present,
      missing: expected.filter((n) => !present.includes(n)),
      ready: expected.every((n) => present.includes(n)),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
