import { NextResponse } from 'next/server'
import { Client } from 'pg'

export async function POST(request: Request) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.MIGRATION_SECRET || 'CHANGE_ME_BEFORE_DEPLOY'

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use direct database URL (not Prisma Accelerate)
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL

    if (!databaseUrl) {
      return NextResponse.json({
        error: 'DATABASE_URL not configured'
      }, { status: 500 })
    }

    // Connect directly to database (with SSL for production)
    const client = new Client({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
    await client.connect()

    const results = []

    try {
      // Add notes column to phase_tasks
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS notes TEXT')
      results.push('✅ Added notes column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.notes: ${err.message}`)
    }

    try {
      // Add invited_at to companies
      await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP')
      results.push('✅ Added invited_at column to companies')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ companies.invited_at: ${err.message}`)
    }

    try {
      // Add invite_count to companies
      await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invite_count INTEGER DEFAULT 0')
      results.push('✅ Added invite_count column to companies')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ companies.invite_count: ${err.message}`)
    }

    // ============================================
    // COMPREHENSIVE PROJECT MANAGEMENT FEATURES
    // ============================================

    // Create TaskStatus enum
    try {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "TaskStatus" AS ENUM (
            'NOT_STARTED',
            'ASSIGNED',
            'WORK_IN_PROGRESS',
            'WAITING_ON_VENDOR',
            'WAITING_ON_CLIENT',
            'NEEDS_REVIEW',
            'STUCK',
            'INFORMATION_RECEIVED',
            'REVIEWED_AND_DONE',
            'ITG_DOCUMENTED',
            'NOT_APPLICABLE'
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `)
      results.push('✅ Created TaskStatus enum')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ TaskStatus enum: ${err.message}`)
    }

    // Create Priority enum
    try {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `)
      results.push('✅ Created Priority enum')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ Priority enum: ${err.message}`)
    }

    // Create NotificationType enum
    try {
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT', 'COMMENT', 'STATUS_CHANGE', 'MENTION');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `)
      results.push('✅ Created NotificationType enum')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ NotificationType enum: ${err.message}`)
    }

    // Add new fields to phase_tasks
    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS status "TaskStatus" DEFAULT \'NOT_STARTED\'')
      results.push('✅ Added status column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.status: ${err.message}`)
    }

    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS "isVisibleToCustomer" BOOLEAN DEFAULT true')
      results.push('✅ Added isVisibleToCustomer column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.isVisibleToCustomer: ${err.message}`)
    }

    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS "assignedTo" TEXT')
      results.push('✅ Added assignedTo column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.assignedTo: ${err.message}`)
    }

    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS "assignedToName" TEXT')
      results.push('✅ Added assignedToName column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.assignedToName: ${err.message}`)
    }

    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP')
      results.push('✅ Added dueDate column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.dueDate: ${err.message}`)
    }

    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS priority "Priority" DEFAULT \'MEDIUM\'')
      results.push('✅ Added priority column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.priority: ${err.message}`)
    }

    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW()')
      results.push('✅ Added updatedAt column to phase_tasks')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phase_tasks.updatedAt: ${err.message}`)
    }

    // Add isVisibleToCustomer to phases
    try {
      await client.query('ALTER TABLE phases ADD COLUMN IF NOT EXISTS "isVisibleToCustomer" BOOLEAN DEFAULT true')
      results.push('✅ Added isVisibleToCustomer column to phases')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ phases.isVisibleToCustomer: ${err.message}`)
    }

    // Add isVisibleToCustomer to projects. The migration file exists at
    // prisma/migrations/20260415000000_add_project_customer_visibility/ but
    // was never applied in this environment (shares a timestamp prefix with
    // add_overtime_requests and appears to have been skipped by
    // `prisma migrate deploy`). Applying it directly here unblocks admin +
    // customer-portal project views that crash on projects.isVisibleToCustomer.
    try {
      await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "isVisibleToCustomer" BOOLEAN NOT NULL DEFAULT true')
      results.push('✅ Added isVisibleToCustomer column to projects')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ projects.isVisibleToCustomer: ${err.message}`)
    }

    // Create comments table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          "phaseId" TEXT REFERENCES phases(id) ON DELETE CASCADE,
          "taskId" TEXT REFERENCES phase_tasks(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          "isInternal" BOOLEAN DEFAULT false,
          "authorEmail" TEXT NOT NULL,
          "authorName" TEXT NOT NULL,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        )
      `)
      results.push('✅ Created comments table')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ comments table: ${err.message}`)
    }

    // Create assignments table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS assignments (
          id TEXT PRIMARY KEY,
          "phaseId" TEXT REFERENCES phases(id) ON DELETE CASCADE,
          "taskId" TEXT REFERENCES phase_tasks(id) ON DELETE CASCADE,
          "assigneeEmail" TEXT NOT NULL,
          "assigneeName" TEXT NOT NULL,
          "assignedBy" TEXT NOT NULL,
          "assignedAt" TIMESTAMP DEFAULT NOW(),
          UNIQUE("phaseId", "assigneeEmail"),
          UNIQUE("taskId", "assigneeEmail")
        )
      `)
      results.push('✅ Created assignments table')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ assignments table: ${err.message}`)
    }

    // Create notifications table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          "recipientEmail" TEXT NOT NULL,
          type "NotificationType" NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          "isRead" BOOLEAN DEFAULT false,
          "linkUrl" TEXT,
          "createdAt" TIMESTAMP DEFAULT NOW()
        )
      `)
      results.push('✅ Created notifications table')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ notifications table: ${err.message}`)
    }

    // ============================================
    // MISSING COLUMNS & DATA FIXES (2026-03-23)
    // ============================================

    // Ensure staff_users has all required columns
    try {
      await client.query('ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "permissionOverrides" jsonb')
      results.push('✅ Ensured permissionOverrides column on staff_users')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ staff_users.permissionOverrides: ${err.message}`)
    }

    try {
      await client.query('ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "autotaskResourceId" TEXT')
      results.push('✅ Ensured autotaskResourceId column on staff_users')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ staff_users.autotaskResourceId: ${err.message}`)
    }

    // Add onboarding_completed_at to companies (fixes /admin/projects/new crash)
    try {
      await client.query('ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3)')
      results.push('✅ Added onboarding_completed_at column to companies')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ companies.onboarding_completed_at: ${err.message}`)
    }

    // Add companyClassification to companies. Schema field has existed for a while
    // (Autotask classification — "Platinum Managed Service", etc.) but the column
    // was never created in this environment, so any `include: { company: true }`
    // query crashes. Prisma migrate deploy has never run against this DB
    // (_prisma_migrations table doesn't exist), so migrations are applied purely
    // via this route's raw SQL.
    try {
      await client.query('ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "companyClassification" TEXT')
      results.push('✅ Added companyClassification column to companies')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ companies.companyClassification: ${err.message}`)
    }

    // Add compliancePortalEnabled to companies (same root cause as above).
    try {
      await client.query('ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "compliancePortalEnabled" BOOLEAN NOT NULL DEFAULT false')
      results.push('✅ Added compliancePortalEnabled column to companies')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ companies.compliancePortalEnabled: ${err.message}`)
    }

    // Ensure StaffRole enum has all required values
    for (const roleVal of ['SUPER_ADMIN', 'BILLING_ADMIN', 'TECHNICIAN']) {
      try {
        await client.query(`ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS '${roleVal}'`)
        results.push(`✅ Ensured StaffRole enum value: ${roleVal}`)
      } catch (error) {
        const err = error as Error
        results.push(`⚠️ StaffRole.${roleVal}: ${err.message}`)
      }
    }

    // Promote Kurtis to SUPER_ADMIN
    try {
      const res = await client.query(
        `UPDATE staff_users SET role = 'SUPER_ADMIN', "updatedAt" = NOW() WHERE email = 'kurtis@triplecitiestech.com' AND role != 'SUPER_ADMIN'`
      )
      results.push(res.rowCount && res.rowCount > 0
        ? '✅ Promoted kurtis@triplecitiestech.com to SUPER_ADMIN'
        : '✅ kurtis@triplecitiestech.com already SUPER_ADMIN')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ SUPER_ADMIN promotion: ${err.message}`)
    }

    // ============================================
    // Bootstrap tables that the Prisma schema declares but no migration ever
    // created in this DB (since prisma migrate deploy never ran here — see
    // CLAUDE.md). All idempotent via IF NOT EXISTS.
    // ============================================

    // error_logs (matches the original 20260306_add_error_logs migration)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "error_logs" (
          "id" TEXT NOT NULL,
          "level" TEXT NOT NULL DEFAULT 'error',
          "source" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "stack" TEXT,
          "path" TEXT,
          "method" TEXT,
          "statusCode" INTEGER,
          "userId" TEXT,
          "metadata" JSONB,
          "count" INTEGER NOT NULL DEFAULT 1,
          "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "resolved" BOOLEAN NOT NULL DEFAULT false,
          "resolvedAt" TIMESTAMP(3),
          "resolvedBy" TEXT,
          CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
        )
      `)
      await client.query(`CREATE INDEX IF NOT EXISTS "error_logs_source_level_idx" ON "error_logs"("source", "level")`)
      await client.query(`CREATE INDEX IF NOT EXISTS "error_logs_lastSeen_idx" ON "error_logs"("lastSeen")`)
      await client.query(`CREATE INDEX IF NOT EXISTS "error_logs_resolved_idx" ON "error_logs"("resolved")`)
      await client.query(`CREATE INDEX IF NOT EXISTS "error_logs_message_idx" ON "error_logs"("message")`)
      results.push('✅ Ensured error_logs table')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ error_logs: ${err.message}`)
    }

    // deleted_records (used by soft-delete / restore endpoint)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "deleted_records" (
          "id" TEXT NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          "entityData" JSONB NOT NULL,
          "relatedData" JSONB,
          "deletedBy" TEXT NOT NULL,
          "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "restoredAt" TIMESTAMP(3),
          "restoredBy" TEXT,
          CONSTRAINT "deleted_records_pkey" PRIMARY KEY ("id")
        )
      `)
      await client.query(`CREATE INDEX IF NOT EXISTS "deleted_records_entityType_entityId_idx" ON "deleted_records"("entityType", "entityId")`)
      await client.query(`CREATE INDEX IF NOT EXISTS "deleted_records_deletedAt_idx" ON "deleted_records"("deletedAt")`)
      results.push('✅ Ensured deleted_records table')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ deleted_records: ${err.message}`)
    }

    // test_failures (e2e failure dashboard at /admin/debug/failures)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "test_failures" (
          "id" TEXT NOT NULL,
          "testName" TEXT NOT NULL,
          "testFile" TEXT NOT NULL,
          "url" TEXT,
          "environment" TEXT NOT NULL DEFAULT 'local',
          "errorMessage" TEXT NOT NULL,
          "errorStack" TEXT,
          "consoleErrors" JSONB,
          "networkErrors" JSONB,
          "screenshotPath" TEXT,
          "tracePath" TEXT,
          "commitSha" TEXT,
          "branchName" TEXT,
          "summary" TEXT,
          "rootCauseHypothesis" TEXT,
          "suggestedFix" TEXT,
          "impactedFiles" JSONB,
          "confidence" TEXT,
          "status" TEXT NOT NULL DEFAULT 'open',
          "resolvedAt" TIMESTAMP(3),
          "resolvedBy" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "test_failures_pkey" PRIMARY KEY ("id")
        )
      `)
      await client.query(`CREATE INDEX IF NOT EXISTS "test_failures_status_idx" ON "test_failures"("status")`)
      await client.query(`CREATE INDEX IF NOT EXISTS "test_failures_createdAt_idx" ON "test_failures"("createdAt")`)
      await client.query(`CREATE INDEX IF NOT EXISTS "test_failures_testFile_idx" ON "test_failures"("testFile")`)
      results.push('✅ Ensured test_failures table')
    } catch (error) {
      const err = error as Error
      results.push(`⚠️ test_failures: ${err.message}`)
    }

    await client.end()

    return NextResponse.json({
      success: true,
      message: 'Migrations completed',
      results
    })

  } catch (error) {
    const err = error as Error
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Send POST request with Authorization header to run migrations',
    example: 'curl -X POST https://your-domain.com/api/migrations/run -H "Authorization: Bearer YOUR_SECRET"'
  })
}
