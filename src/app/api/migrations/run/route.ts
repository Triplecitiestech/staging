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

    // Connect directly to database
    const client = new Client({ connectionString: databaseUrl })
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
