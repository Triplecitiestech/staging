import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pto/migrate
 * Creates all PTO system tables and enums (idempotent).
 * Safe to call multiple times — every statement uses IF NOT EXISTS
 * or an exception handler for duplicate objects.
 *
 * Auth: Bearer MIGRATION_SECRET (preferred) or ?secret=<MIGRATION_SECRET>
 *
 * Example (PowerShell):
 *   Invoke-RestMethod -Method Post `
 *     -Uri "https://www.triplecitiestech.com/api/pto/migrate" `
 *     -Headers @{ Authorization = "Bearer <MIGRATION_SECRET>" }
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('secret')
  const expected = process.env.MIGRATION_SECRET
  const authorized =
    expected &&
    ((authHeader && authHeader === `Bearer ${expected}`) ||
      (queryToken && queryToken === expected))
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const applied: string[] = []

  try {
    // -------------------------------------------------------------------
    // Enums (idempotent via DO block)
    // -------------------------------------------------------------------
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "TimeOffRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    applied.push('enum: TimeOffRequestStatus')

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "TimeOffRequestKind" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'BEREAVEMENT', 'JURY_DUTY', 'UNPAID', 'OTHER');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    applied.push('enum: TimeOffRequestKind')

    // Extend enum with two-stage workflow values (idempotent)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_INTAKE';
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TYPE "TimeOffRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    applied.push('enum values: PENDING_INTAKE, PENDING_APPROVAL')

    // -------------------------------------------------------------------
    // gusto_connections
    // -------------------------------------------------------------------
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "gusto_connections" (
        "id" TEXT NOT NULL,
        "environment" TEXT NOT NULL,
        "companyUuid" TEXT,
        "companyName" TEXT,
        "accessToken" TEXT NOT NULL,
        "refreshToken" TEXT NOT NULL,
        "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
        "scope" TEXT,
        "connectedByEmail" TEXT NOT NULL,
        "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastRefreshedAt" TIMESTAMP(3),
        "lastSyncAt" TIMESTAMP(3),
        "lastSyncStatus" TEXT,
        "lastSyncError" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "gusto_connections_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "gusto_connections_isActive_idx" ON "gusto_connections"("isActive")`
    )
    applied.push('table: gusto_connections')

    // -------------------------------------------------------------------
    // pto_employee_mappings
    // -------------------------------------------------------------------
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "pto_employee_mappings" (
        "id" TEXT NOT NULL,
        "staffUserId" TEXT NOT NULL,
        "staffEmail" TEXT NOT NULL,
        "gustoEmployeeUuid" TEXT NOT NULL,
        "gustoWorkEmail" TEXT,
        "gustoPersonalEmail" TEXT,
        "gustoFirstName" TEXT,
        "gustoLastName" TEXT,
        "matchMethod" TEXT NOT NULL,
        "mappedByStaffId" TEXT,
        "lastGustoSyncAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pto_employee_mappings_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "pto_employee_mappings_staffUserId_key" ON "pto_employee_mappings"("staffUserId")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "pto_employee_mappings_gustoEmployeeUuid_key" ON "pto_employee_mappings"("gustoEmployeeUuid")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pto_employee_mappings_staffEmail_idx" ON "pto_employee_mappings"("staffEmail")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pto_employee_mappings_gustoEmployeeUuid_idx" ON "pto_employee_mappings"("gustoEmployeeUuid")`
    )
    applied.push('table: pto_employee_mappings')

    // -------------------------------------------------------------------
    // time_off_requests
    // -------------------------------------------------------------------
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "time_off_requests" (
        "id" TEXT NOT NULL,
        "mappingId" TEXT NOT NULL,
        "employeeStaffId" TEXT NOT NULL,
        "employeeEmail" TEXT NOT NULL,
        "employeeName" TEXT NOT NULL,
        "gustoEmployeeUuid" TEXT NOT NULL,
        "kind" "TimeOffRequestKind" NOT NULL DEFAULT 'VACATION',
        "gustoPolicyUuid" TEXT,
        "gustoPolicyName" TEXT,
        "startDate" DATE NOT NULL,
        "endDate" DATE NOT NULL,
        "hoursPerDay" JSONB DEFAULT '{}',
        "totalHours" DECIMAL(7, 2) NOT NULL,
        "notes" TEXT,
        "coverage" TEXT,
        "status" "TimeOffRequestStatus" NOT NULL DEFAULT 'PENDING',
        "reviewedByStaffId" TEXT,
        "reviewedByName" TEXT,
        "reviewedAt" TIMESTAMP(3),
        "managerNotes" TEXT,
        "gustoBalanceAdjustmentAt" TIMESTAMP(3),
        "gustoSyncStatus" TEXT,
        "gustoSyncError" TEXT,
        "gustoSyncAttempts" INTEGER NOT NULL DEFAULT 0,
        "graphEventId" TEXT,
        "graphInviteEventId" TEXT,
        "graphSyncStatus" TEXT,
        "graphSyncError" TEXT,
        "graphSyncAttempts" INTEGER NOT NULL DEFAULT 0,
        "submitterNotifiedAt" TIMESTAMP(3),
        "approversNotifiedAt" TIMESTAMP(3),
        "employeeNotifiedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id")
      )
    `)
    // Add FK only if the referenced table exists and the constraint isn't there yet
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "time_off_requests"
          ADD CONSTRAINT "time_off_requests_mappingId_fkey"
          FOREIGN KEY ("mappingId") REFERENCES "pto_employee_mappings"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "time_off_requests_employeeStaffId_status_idx" ON "time_off_requests"("employeeStaffId", "status")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "time_off_requests_status_startDate_idx" ON "time_off_requests"("status", "startDate")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "time_off_requests_startDate_endDate_idx" ON "time_off_requests"("startDate", "endDate")`
    )
    applied.push('table: time_off_requests')

    // -------------------------------------------------------------------
    // Two-stage workflow columns (intake + gusto-recorded) — idempotent
    // -------------------------------------------------------------------
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ALTER COLUMN "mappingId" DROP NOT NULL`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ALTER COLUMN "gustoEmployeeUuid" DROP NOT NULL`).catch(() => {})
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeByStaffId" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeByName" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeAt" TIMESTAMP(3)`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeLastTimeOffNotes" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeBalanceNotes" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeCoverageConfirmed" BOOLEAN`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeCoverageNotes" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeAdditionalNotes" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeSkipped" BOOLEAN NOT NULL DEFAULT false`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "intakeNotifiedAt" TIMESTAMP(3)`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedAt" TIMESTAMP(3)`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedByStaffId" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "gustoRecordedByName" TEXT`)
    // Coverage approval flow columns
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageStaffId" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageStaffName" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageStaffEmail" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageResponse" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageRespondedAt" TIMESTAMP(3)`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageResponseNotes" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageToken" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageRequestSentAt" TIMESTAMP(3)`)
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "time_off_requests_coverageToken_key" ON "time_off_requests"("coverageToken")`
    )
    // Migrate any legacy PENDING rows to PENDING_INTAKE
    await prisma.$executeRawUnsafe(
      `UPDATE "time_off_requests" SET "status" = 'PENDING_INTAKE' WHERE "status" = 'PENDING'`
    ).catch(() => {})
    applied.push('alter: two-stage workflow columns')

    // -------------------------------------------------------------------
    // time_off_audit_logs
    // -------------------------------------------------------------------
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "time_off_audit_logs" (
        "id" TEXT NOT NULL,
        "requestId" TEXT NOT NULL,
        "actorStaffId" TEXT,
        "actorEmail" TEXT NOT NULL,
        "actorName" TEXT,
        "action" TEXT NOT NULL,
        "details" JSONB,
        "severity" TEXT NOT NULL DEFAULT 'info',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "time_off_audit_logs_pkey" PRIMARY KEY ("id")
      )
    `)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "time_off_audit_logs"
          ADD CONSTRAINT "time_off_audit_logs_requestId_fkey"
          FOREIGN KEY ("requestId") REFERENCES "time_off_requests"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "time_off_audit_logs_requestId_createdAt_idx" ON "time_off_audit_logs"("requestId", "createdAt" DESC)`
    )
    applied.push('table: time_off_audit_logs')

    // Verify
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('gusto_connections', 'pto_employee_mappings', 'time_off_requests', 'time_off_audit_logs')
      ORDER BY table_name
    `

    return NextResponse.json({
      ok: true,
      applied,
      tablesPresent: tables.map((t) => t.table_name),
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        applied,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

/** GET — quick status check: which PTO tables exist */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('secret')
  const expected = process.env.MIGRATION_SECRET
  const authorized =
    expected &&
    ((authHeader && authHeader === `Bearer ${expected}`) ||
      (queryToken && queryToken === expected))
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('gusto_connections', 'pto_employee_mappings', 'time_off_requests', 'time_off_audit_logs')
      ORDER BY table_name
    `
    const expectedNames = [
      'gusto_connections',
      'pto_employee_mappings',
      'time_off_audit_logs',
      'time_off_requests',
    ]
    const present = tables.map((t) => t.table_name)
    const missing = expectedNames.filter((n) => !present.includes(n))

    // Env var presence report (no values, just boolean presence) so an
    // admin can diagnose misconfigurations without secrets leaking into logs.
    const checkVar = (name: string) => {
      const v = process.env[name]
      return { set: !!v && v.length > 0, length: v ? v.length : 0 }
    }
    // Surface any env key starting with GUSTO_ or containing REDIRECT so typos
    // (GUSTO_REDIRECT_URL, GUSTO_OAUTH_REDIRECT_URL, trailing space, etc.) show up.
    const gustoLikeKeys = Object.keys(process.env)
      .filter((k) => k.startsWith('GUSTO') || k.toUpperCase().includes('REDIRECT'))
      .sort()

    // Resolve the redirect URI the same way the live code does
    const { getGustoRedirectUri } = await import('@/lib/gusto/config')
    const resolvedRedirectUri = getGustoRedirectUri()

    const env = {
      GUSTO_ENV: process.env.GUSTO_ENV ?? '(unset)',
      GUSTO_CLIENT_ID: checkVar('GUSTO_CLIENT_ID'),
      GUSTO_CLIENT_SECRET: checkVar('GUSTO_CLIENT_SECRET'),
      GUSTO_OAUTH_REDIRECT_URI: process.env.GUSTO_OAUTH_REDIRECT_URI ?? '(unset)',
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? '(unset)',
      RESOLVED_REDIRECT_URI: resolvedRedirectUri,
      GUSTO_LIKE_KEYS_PRESENT: gustoLikeKeys,
      PTO_CALENDAR_MAILBOX: process.env.PTO_CALENDAR_MAILBOX ?? '(unset)',
      PTO_CALENDAR_TYPE: process.env.PTO_CALENDAR_TYPE ?? '(unset — defaults to user)',
      PTO_FROM_EMAIL: process.env.PTO_FROM_EMAIL ?? '(unset)',
      PTO_HR_GROUP_MAIL: process.env.PTO_HR_GROUP_MAIL ?? '(unset)',
      PTO_APPROVER_FALLBACK_EMAIL: process.env.PTO_APPROVER_FALLBACK_EMAIL ?? '(unset)',
      AZURE_AD_TENANT_ID: checkVar('AZURE_AD_TENANT_ID'),
      AZURE_AD_CLIENT_ID: checkVar('AZURE_AD_CLIENT_ID'),
      AZURE_AD_CLIENT_SECRET: checkVar('AZURE_AD_CLIENT_SECRET'),
      RESEND_API_KEY: checkVar('RESEND_API_KEY'),
      NEXTAUTH_SECRET: checkVar('NEXTAUTH_SECRET'),
      VERCEL_ENV: process.env.VERCEL_ENV ?? '(unset)',
      VERCEL_GIT_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? '(unset)').slice(0, 12),
    }

    return NextResponse.json({
      present,
      missing,
      ready: missing.length === 0,
      env,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
