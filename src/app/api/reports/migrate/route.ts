import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Apply the reporting tables migration on-demand.
 * POST /api/reports/migrate?secret=MIGRATION_SECRET
 *
 * This is safe to run multiple times — all statements use IF NOT EXISTS
 * or will be no-ops if the tables already exist.
 */
export async function POST(request: NextRequest) {
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

    if (existingNames.includes('tickets') && existingNames.includes('resources') && existingNames.includes('ticket_lifecycle')) {
      return NextResponse.json({
        success: true,
        message: 'Reporting tables already exist',
        tables: existingNames,
      });
    }

    // Read and execute the migration SQL
    const migrationPath = path.join(process.cwd(), 'prisma/migrations/20260307100000_add_reporting_tables/migration.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Split by statement and execute each (skip empty)
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    const results: string[] = [];
    const errors: string[] = [];

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        // Extract table/index name from the statement for reporting
        const match = stmt.match(/(?:TABLE|INDEX)\s+(?:IF NOT EXISTS\s+)?(?:"?(\w+)"?)/i);
        results.push(match ? match[1] : 'OK');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Skip "already exists" errors — these are expected if partially applied
        if (msg.includes('already exists')) {
          results.push(`skipped (already exists)`);
        } else {
          errors.push(`${msg.slice(0, 200)}`);
        }
      }
    }

    // Record in Prisma migration history so future deploys don't re-run it
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" (id, checksum, migration_name, logs, started_at, finished_at, applied_steps_count)
        VALUES (gen_random_uuid(), 'manual-apply', '20260307100000_add_reporting_tables', NULL, NOW(), NOW(), 1)
        ON CONFLICT DO NOTHING
      `);
    } catch {
      // Migration history table might not exist or migration already recorded — OK
    }

    return NextResponse.json({
      success: errors.length === 0,
      statementsExecuted: results.length,
      results: results.slice(0, 20),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Migration failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reports/migrate?secret=MIGRATION_SECRET
 * Check which reporting tables exist.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
