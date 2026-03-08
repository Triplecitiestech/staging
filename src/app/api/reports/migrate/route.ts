import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Inlined migration SQL — does not depend on filesystem access.
 * Each statement uses IF NOT EXISTS so this is fully idempotent.
 */
const MIGRATION_STATEMENTS = [
  // ---- Tables ----
  `CREATE TABLE IF NOT EXISTS "tickets" (
    "id" TEXT NOT NULL,
    "autotaskTicketId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" INTEGER NOT NULL,
    "statusLabel" TEXT,
    "priority" INTEGER NOT NULL,
    "priorityLabel" TEXT,
    "queueId" INTEGER,
    "queueLabel" TEXT,
    "source" INTEGER,
    "sourceLabel" TEXT,
    "issueType" INTEGER,
    "subIssueType" INTEGER,
    "assignedResourceId" INTEGER,
    "creatorResourceId" INTEGER,
    "contactId" INTEGER,
    "contractId" INTEGER,
    "slaId" INTEGER,
    "dueDateTime" TIMESTAMP(3),
    "estimatedHours" DOUBLE PRECISION,
    "createDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "lastActivityDate" TIMESTAMP(3),
    "autotaskLastSync" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ticket_notes" (
    "id" TEXT NOT NULL,
    "autotaskNoteId" TEXT NOT NULL,
    "autotaskTicketId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "noteType" INTEGER,
    "publish" INTEGER,
    "creatorResourceId" INTEGER,
    "creatorContactId" INTEGER,
    "createDateTime" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ticket_time_entries" (
    "id" TEXT NOT NULL,
    "autotaskTimeEntryId" TEXT NOT NULL,
    "autotaskTicketId" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "dateWorked" TIMESTAMP(3) NOT NULL,
    "startDateTime" TIMESTAMP(3),
    "endDateTime" TIMESTAMP(3),
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "summaryNotes" TEXT,
    "isNonBillable" BOOLEAN NOT NULL DEFAULT false,
    "createDateTime" TIMESTAMP(3),
    CONSTRAINT "ticket_time_entries_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "resources" (
    "id" TEXT NOT NULL,
    "autotaskResourceId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" INTEGER,
    "autotaskLastSync" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ticket_status_history" (
    "id" TEXT NOT NULL,
    "autotaskTicketId" TEXT NOT NULL,
    "previousStatus" INTEGER,
    "newStatus" INTEGER NOT NULL,
    "previousStatusLabel" TEXT,
    "newStatusLabel" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_status_history_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ticket_lifecycle" (
    "id" TEXT NOT NULL,
    "autotaskTicketId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assignedResourceId" INTEGER,
    "priority" INTEGER NOT NULL,
    "queueId" INTEGER,
    "createDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "firstResponseMinutes" DOUBLE PRECISION,
    "firstResolutionMinutes" DOUBLE PRECISION,
    "fullResolutionMinutes" DOUBLE PRECISION,
    "activeResolutionMinutes" DOUBLE PRECISION,
    "waitingCustomerMinutes" DOUBLE PRECISION,
    "techNoteCount" INTEGER NOT NULL DEFAULT 0,
    "customerNoteCount" INTEGER NOT NULL DEFAULT 0,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "totalHoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billableHoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFirstTouchResolution" BOOLEAN NOT NULL DEFAULT false,
    "slaResponseMet" BOOLEAN,
    "slaResolutionMet" BOOLEAN,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_lifecycle_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "technician_metrics_daily" (
    "id" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "ticketsAssigned" INTEGER NOT NULL DEFAULT 0,
    "ticketsCreated" INTEGER NOT NULL DEFAULT 0,
    "ticketsClosed" INTEGER NOT NULL DEFAULT 0,
    "ticketsReopened" INTEGER NOT NULL DEFAULT 0,
    "hoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billableHoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nonBillableHoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgFirstResponseMinutes" DOUBLE PRECISION,
    "avgResolutionMinutes" DOUBLE PRECISION,
    "firstTouchResolutions" INTEGER NOT NULL DEFAULT 0,
    "totalResolutions" INTEGER NOT NULL DEFAULT 0,
    "openTicketCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "technician_metrics_daily_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "company_metrics_daily" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ticketsCreated" INTEGER NOT NULL DEFAULT 0,
    "ticketsClosed" INTEGER NOT NULL DEFAULT 0,
    "ticketsReopened" INTEGER NOT NULL DEFAULT 0,
    "ticketsCreatedUrgent" INTEGER NOT NULL DEFAULT 0,
    "ticketsCreatedHigh" INTEGER NOT NULL DEFAULT 0,
    "ticketsCreatedMedium" INTEGER NOT NULL DEFAULT 0,
    "ticketsCreatedLow" INTEGER NOT NULL DEFAULT 0,
    "supportHoursConsumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billableHoursConsumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgFirstResponseMinutes" DOUBLE PRECISION,
    "avgResolutionMinutes" DOUBLE PRECISION,
    "firstTouchResolutionRate" DOUBLE PRECISION,
    "reopenRate" DOUBLE PRECISION,
    "slaResponseCompliance" DOUBLE PRECISION,
    "slaResolutionCompliance" DOUBLE PRECISION,
    "backlogCount" INTEGER NOT NULL DEFAULT 0,
    "backlogUrgent" INTEGER NOT NULL DEFAULT 0,
    "backlogHigh" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_metrics_daily_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "customer_health_scores" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "trend" TEXT NOT NULL,
    "previousScore" DOUBLE PRECISION,
    "ticketVolumeTrendScore" DOUBLE PRECISION NOT NULL,
    "reopenRateScore" DOUBLE PRECISION NOT NULL,
    "priorityMixScore" DOUBLE PRECISION NOT NULL,
    "supportHoursTrendScore" DOUBLE PRECISION NOT NULL,
    "avgResolutionTimeScore" DOUBLE PRECISION NOT NULL,
    "agingTicketsScore" DOUBLE PRECISION NOT NULL,
    "slaComplianceScore" DOUBLE PRECISION NOT NULL,
    "ticketCountCurrent" INTEGER NOT NULL,
    "ticketCountPrevious" INTEGER NOT NULL,
    "reopenRateValue" DOUBLE PRECISION NOT NULL,
    "urgentHighPercent" DOUBLE PRECISION NOT NULL,
    "supportHoursCurrent" DOUBLE PRECISION NOT NULL,
    "supportHoursPrevious" DOUBLE PRECISION NOT NULL,
    "avgResolutionMinutes" DOUBLE PRECISION,
    "agingTicketCount" INTEGER NOT NULL,
    "slaCompliancePercent" DOUBLE PRECISION,
    CONSTRAINT "customer_health_scores_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "reporting_targets" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "scopeValue" TEXT NOT NULL DEFAULT '',
    "targetValue" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reporting_targets_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "report_schedules" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "monthOfQuarter" INTEGER,
    "recipients" TEXT[],
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "report_delivery_logs" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_delivery_logs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "business_reviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'customer',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reportData" JSONB NOT NULL,
    "recommendations" JSONB,
    "narrative" JSONB,
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_reviews_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "reporting_job_status" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunDurationMs" INTEGER,
    "lastRunError" TEXT,
    "lastRunMeta" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reporting_job_status_pkey" PRIMARY KEY ("id")
  )`,

  // ---- Unique indexes ----
  `CREATE UNIQUE INDEX IF NOT EXISTS "tickets_autotaskTicketId_key" ON "tickets"("autotaskTicketId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ticket_notes_autotaskNoteId_key" ON "ticket_notes"("autotaskNoteId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ticket_time_entries_autotaskTimeEntryId_key" ON "ticket_time_entries"("autotaskTimeEntryId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "resources_autotaskResourceId_key" ON "resources"("autotaskResourceId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ticket_lifecycle_autotaskTicketId_key" ON "ticket_lifecycle"("autotaskTicketId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "technician_metrics_daily_resourceId_date_key" ON "technician_metrics_daily"("resourceId", "date")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "company_metrics_daily_companyId_date_key" ON "company_metrics_daily"("companyId", "date")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "reporting_targets_metricKey_scope_scopeValue_key" ON "reporting_targets"("metricKey", "scope", "scopeValue")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "reporting_job_status_jobName_key" ON "reporting_job_status"("jobName")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "business_reviews_companyId_reportType_variant_periodStart_key" ON "business_reviews"("companyId", "reportType", "variant", "periodStart")`,

  // ---- Performance indexes ----
  `CREATE INDEX IF NOT EXISTS "tickets_companyId_idx" ON "tickets"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "tickets_assignedResourceId_idx" ON "tickets"("assignedResourceId")`,
  `CREATE INDEX IF NOT EXISTS "tickets_status_idx" ON "tickets"("status")`,
  `CREATE INDEX IF NOT EXISTS "tickets_createDate_idx" ON "tickets"("createDate")`,
  `CREATE INDEX IF NOT EXISTS "tickets_completedDate_idx" ON "tickets"("completedDate")`,
  `CREATE INDEX IF NOT EXISTS "tickets_queueId_idx" ON "tickets"("queueId")`,
  `CREATE INDEX IF NOT EXISTS "tickets_lastActivityDate_idx" ON "tickets"("lastActivityDate")`,
  `CREATE INDEX IF NOT EXISTS "ticket_notes_autotaskTicketId_idx" ON "ticket_notes"("autotaskTicketId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_notes_creatorResourceId_idx" ON "ticket_notes"("creatorResourceId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_notes_createDateTime_idx" ON "ticket_notes"("createDateTime")`,
  `CREATE INDEX IF NOT EXISTS "ticket_time_entries_autotaskTicketId_idx" ON "ticket_time_entries"("autotaskTicketId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_time_entries_resourceId_idx" ON "ticket_time_entries"("resourceId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_time_entries_dateWorked_idx" ON "ticket_time_entries"("dateWorked")`,
  `CREATE INDEX IF NOT EXISTS "resources_email_idx" ON "resources"("email")`,
  `CREATE INDEX IF NOT EXISTS "ticket_status_history_autotaskTicketId_idx" ON "ticket_status_history"("autotaskTicketId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_status_history_changedAt_idx" ON "ticket_status_history"("changedAt")`,
  `CREATE INDEX IF NOT EXISTS "ticket_lifecycle_companyId_idx" ON "ticket_lifecycle"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_lifecycle_assignedResourceId_idx" ON "ticket_lifecycle"("assignedResourceId")`,
  `CREATE INDEX IF NOT EXISTS "ticket_lifecycle_createDate_idx" ON "ticket_lifecycle"("createDate")`,
  `CREATE INDEX IF NOT EXISTS "ticket_lifecycle_isResolved_idx" ON "ticket_lifecycle"("isResolved")`,
  `CREATE INDEX IF NOT EXISTS "ticket_lifecycle_priority_idx" ON "ticket_lifecycle"("priority")`,
  `CREATE INDEX IF NOT EXISTS "technician_metrics_daily_date_idx" ON "technician_metrics_daily"("date")`,
  `CREATE INDEX IF NOT EXISTS "technician_metrics_daily_resourceId_idx" ON "technician_metrics_daily"("resourceId")`,
  `CREATE INDEX IF NOT EXISTS "company_metrics_daily_date_idx" ON "company_metrics_daily"("date")`,
  `CREATE INDEX IF NOT EXISTS "company_metrics_daily_companyId_idx" ON "company_metrics_daily"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "customer_health_scores_companyId_idx" ON "customer_health_scores"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "customer_health_scores_computedAt_idx" ON "customer_health_scores"("computedAt")`,
  `CREATE INDEX IF NOT EXISTS "report_schedules_nextRunAt_idx" ON "report_schedules"("nextRunAt")`,
  `CREATE INDEX IF NOT EXISTS "report_schedules_isActive_idx" ON "report_schedules"("isActive")`,
  `CREATE INDEX IF NOT EXISTS "report_delivery_logs_scheduleId_idx" ON "report_delivery_logs"("scheduleId")`,
  `CREATE INDEX IF NOT EXISTS "report_delivery_logs_sentAt_idx" ON "report_delivery_logs"("sentAt")`,
  `CREATE INDEX IF NOT EXISTS "business_reviews_companyId_idx" ON "business_reviews"("companyId")`,
  `CREATE INDEX IF NOT EXISTS "business_reviews_status_idx" ON "business_reviews"("status")`,
  `CREATE INDEX IF NOT EXISTS "business_reviews_periodStart_idx" ON "business_reviews"("periodStart")`,

  // ---- Foreign keys (idempotent via constraint check) ----
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_companyId_fkey') THEN
      ALTER TABLE "tickets" ADD CONSTRAINT "tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_reviews_companyId_fkey') THEN
      ALTER TABLE "business_reviews" ADD CONSTRAINT "business_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END $$`,
];

/**
 * Apply the reporting tables migration on-demand.
 * POST /api/reports/migrate?secret=MIGRATION_SECRET
 * GET  /api/reports/migrate?secret=MIGRATION_SECRET&run=true  (convenience for CLI)
 *
 * Fully idempotent — safe to run multiple times. SQL is inlined so it
 * does not depend on filesystem access (works in Vercel serverless).
 */
async function runMigration(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if tables already exist
    const existing = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('tickets', 'resources', 'ticket_lifecycle', 'reporting_job_status')
    `;

    const existingNames = existing.map(r => r.tablename);

    // Check ALL required tables, not just a subset — the old check only looked
    // at 4 tables and would skip creating the rest if those 4 existed.
    const allRequired = [
      'tickets', 'ticket_notes', 'ticket_time_entries', 'resources',
      'ticket_status_history', 'ticket_lifecycle',
      'technician_metrics_daily', 'company_metrics_daily',
      'customer_health_scores', 'reporting_job_status',
      'reporting_targets', 'report_schedules', 'report_delivery_logs',
      'business_reviews',
    ];
    const allExisting = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('tickets', 'ticket_notes', 'ticket_time_entries', 'resources',
        'ticket_status_history', 'ticket_lifecycle',
        'technician_metrics_daily', 'company_metrics_daily',
        'customer_health_scores', 'reporting_job_status',
        'reporting_targets', 'report_schedules', 'report_delivery_logs',
        'business_reviews')
    `;
    const allExistingNames = allExisting.map(r => r.tablename);
    const missingTables = allRequired.filter(t => !allExistingNames.includes(t));

    if (missingTables.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All reporting tables already exist',
        tables: allExistingNames,
      });
    }

    // Execute each statement
    const results: string[] = [];
    const errors: string[] = [];

    for (const stmt of MIGRATION_STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        const match = stmt.match(/(?:TABLE|INDEX)\s+(?:IF NOT EXISTS\s+)?(?:"?(\w+)"?)/i);
        results.push(match ? match[1] : 'OK');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already exists')) {
          results.push('skipped (already exists)');
        } else {
          errors.push(msg.slice(0, 200));
        }
      }
    }

    // Record in Prisma migration history so prisma migrate deploy doesn't re-run it
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" (id, checksum, migration_name, logs, started_at, finished_at, applied_steps_count)
        VALUES (gen_random_uuid(), 'manual-apply', '20260307100000_add_reporting_tables', NULL, NOW(), NOW(), 1)
        ON CONFLICT DO NOTHING
      `);
    } catch {
      // OK if migration history already recorded or table missing
    }

    return NextResponse.json({
      success: errors.length === 0,
      statementsExecuted: results.length,
      results: results.slice(0, 30),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Migration failed' },
      { status: 500 },
    );
  }
}

/** POST handler */
export async function POST(request: NextRequest) {
  return runMigration(request);
}

/**
 * GET /api/reports/migrate?secret=MIGRATION_SECRET
 * Check which reporting tables exist.
 * GET /api/reports/migrate?secret=MIGRATION_SECRET&run=true
 * Run the migration (convenience for CLI when POST is difficult).
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // If ?run=true, execute the migration via GET for CLI convenience
  if (request.nextUrl.searchParams.get('run') === 'true') {
    return runMigration(request);
  }

  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN (
        'tickets', 'ticket_notes', 'ticket_time_entries', 'resources',
        'ticket_status_history', 'ticket_lifecycle',
        'technician_metrics_daily', 'company_metrics_daily',
        'customer_health_scores', 'reporting_targets',
        'report_schedules', 'report_delivery_logs', 'business_reviews',
        'reporting_job_status'
      )
    `;

    const existing = tables.map(r => r.tablename);
    const required = [
      'tickets', 'ticket_notes', 'ticket_time_entries', 'resources',
      'ticket_status_history', 'ticket_lifecycle',
      'technician_metrics_daily', 'company_metrics_daily',
      'customer_health_scores', 'reporting_job_status',
    ];
    const missing = required.filter(t => !existing.includes(t));

    return NextResponse.json({
      ready: missing.length === 0,
      existing,
      missing: missing.length > 0 ? missing : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Check failed' },
      { status: 500 },
    );
  }
}
