import { NextResponse } from 'next/server'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

/**
 * Migration endpoint for Autotask integration fields.
 * Adds autotask ID columns to companies, contacts, projects, phases, tasks
 * and creates the autotask_sync_logs table.
 *
 * POST /api/migrations/autotask
 * Authorization: Bearer <MIGRATION_SECRET>
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.MIGRATION_SECRET || 'CHANGE_ME_BEFORE_DEPLOY'

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL

    if (!databaseUrl) {
      return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 })
    }

    const client = new Client({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
    await client.connect()

    const results: string[] = []

    // === COMPANIES ===
    try {
      await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS "autotaskCompanyId" TEXT')
      results.push('Added autotaskCompanyId to companies')
    } catch (error) {
      results.push(`companies.autotaskCompanyId: ${(error as Error).message}`)
    }

    try {
      await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS "autotaskLastSync" TIMESTAMP(3)')
      results.push('Added autotaskLastSync to companies')
    } catch (error) {
      results.push(`companies.autotaskLastSync: ${(error as Error).message}`)
    }

    try {
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "companies_autotaskCompanyId_key" ON companies("autotaskCompanyId")')
      results.push('Created unique index on companies.autotaskCompanyId')
    } catch (error) {
      results.push(`companies index: ${(error as Error).message}`)
    }

    // === COMPANY CONTACTS ===
    try {
      await client.query('ALTER TABLE company_contacts ADD COLUMN IF NOT EXISTS "autotaskContactId" TEXT')
      results.push('Added autotaskContactId to company_contacts')
    } catch (error) {
      results.push(`company_contacts.autotaskContactId: ${(error as Error).message}`)
    }

    try {
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "company_contacts_autotaskContactId_key" ON company_contacts("autotaskContactId")')
      results.push('Created unique index on company_contacts.autotaskContactId')
    } catch (error) {
      results.push(`company_contacts index: ${(error as Error).message}`)
    }

    // === PROJECTS ===
    try {
      await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "autotaskProjectId" TEXT')
      results.push('Added autotaskProjectId to projects')
    } catch (error) {
      results.push(`projects.autotaskProjectId: ${(error as Error).message}`)
    }

    try {
      await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS "autotaskLastSync" TIMESTAMP(3)')
      results.push('Added autotaskLastSync to projects')
    } catch (error) {
      results.push(`projects.autotaskLastSync: ${(error as Error).message}`)
    }

    try {
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "projects_autotaskProjectId_key" ON projects("autotaskProjectId")')
      results.push('Created unique index on projects.autotaskProjectId')
    } catch (error) {
      results.push(`projects index: ${(error as Error).message}`)
    }

    // === PHASES ===
    try {
      await client.query('ALTER TABLE phases ADD COLUMN IF NOT EXISTS "autotaskPhaseId" TEXT')
      results.push('Added autotaskPhaseId to phases')
    } catch (error) {
      results.push(`phases.autotaskPhaseId: ${(error as Error).message}`)
    }

    try {
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "phases_autotaskPhaseId_key" ON phases("autotaskPhaseId")')
      results.push('Created unique index on phases.autotaskPhaseId')
    } catch (error) {
      results.push(`phases index: ${(error as Error).message}`)
    }

    // === PHASE TASKS ===
    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS "autotaskTaskId" TEXT')
      results.push('Added autotaskTaskId to phase_tasks')
    } catch (error) {
      results.push(`phase_tasks.autotaskTaskId: ${(error as Error).message}`)
    }

    try {
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "phase_tasks_autotaskTaskId_key" ON phase_tasks("autotaskTaskId")')
      results.push('Created unique index on phase_tasks.autotaskTaskId')
    } catch (error) {
      results.push(`phase_tasks index: ${(error as Error).message}`)
    }

    // === AUTOTASK SYNC LOGS TABLE ===
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS autotask_sync_logs (
          id TEXT PRIMARY KEY,
          "syncType" TEXT NOT NULL,
          status TEXT NOT NULL,
          "companiesCreated" INTEGER NOT NULL DEFAULT 0,
          "companiesUpdated" INTEGER NOT NULL DEFAULT 0,
          "projectsCreated" INTEGER NOT NULL DEFAULT 0,
          "projectsUpdated" INTEGER NOT NULL DEFAULT 0,
          "contactsCreated" INTEGER NOT NULL DEFAULT 0,
          "contactsUpdated" INTEGER NOT NULL DEFAULT 0,
          "tasksCreated" INTEGER NOT NULL DEFAULT 0,
          "tasksUpdated" INTEGER NOT NULL DEFAULT 0,
          errors TEXT,
          "durationMs" INTEGER,
          "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completedAt" TIMESTAMP(3)
        )
      `)
      results.push('Created autotask_sync_logs table')
    } catch (error) {
      results.push(`autotask_sync_logs table: ${(error as Error).message}`)
    }

    try {
      await client.query('CREATE INDEX IF NOT EXISTS "autotask_sync_logs_startedAt_idx" ON autotask_sync_logs("startedAt")')
      results.push('Created index on autotask_sync_logs.startedAt')
    } catch (error) {
      results.push(`autotask_sync_logs index: ${(error as Error).message}`)
    }

    await client.end()

    return NextResponse.json({
      success: true,
      message: 'Autotask migration completed',
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Autotask migration endpoint. Send a POST request with Authorization header to run.',
    usage: 'curl -X POST https://www.triplecitiestech.com/api/migrations/autotask -H "Authorization: Bearer YOUR_MIGRATION_SECRET"',
  })
}
