// ONE-TIME SETUP ROUTE - DELETE AFTER USE
// This route runs the database migration
// Call this once after deploying to add missing columns

import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

export async function POST(request: Request) {
  try {
    // Security check - only allow in development or with secret token
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.MIGRATION_SECRET || 'CHANGE_ME_BEFORE_DEPLOY'

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting database migration check...')

    const results = []
    let needsManualMigration = false
    const sqlCommands = []

    // Check if notes column exists in phase_tasks table
    try {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'phase_tasks'
        AND column_name = 'notes'
      `

      if (columns.length === 0) {
        // Column doesn't exist, try to add it
        results.push('notes column does not exist, attempting to add...')
        try {
          await prisma.$executeRaw`
            ALTER TABLE phase_tasks
            ADD COLUMN notes TEXT
          `
          results.push('✅ Successfully added notes column to phase_tasks')
        } catch (alterError: unknown) {
          const error = alterError as { code?: string; message?: string }
          if (error.code === '42501') {
            // Permission denied
            results.push('⚠️ Permission denied: Cannot alter table with current database connection')
            needsManualMigration = true
            sqlCommands.push('ALTER TABLE phase_tasks ADD COLUMN notes TEXT;')
          } else {
            throw alterError
          }
        }
      } else {
        results.push('✅ notes column already exists in phase_tasks')
      }
    } catch (error) {
      console.error('Error checking notes column:', error)
      results.push(`❌ Error: ${error}`)
      needsManualMigration = true
      sqlCommands.push('-- Run this SQL command in your database console:')
      sqlCommands.push('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS notes TEXT;')
    }

    // Check if Company invite columns exist
    try {
      const companyColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'companies'
        AND column_name IN ('invited_at', 'invite_count')
      `

      const hasInvitedAt = companyColumns.some(c => c.column_name === 'invited_at')
      const hasInviteCount = companyColumns.some(c => c.column_name === 'invite_count')

      if (!hasInvitedAt || !hasInviteCount) {
        results.push('⚠️ Company invite columns do not exist')
        needsManualMigration = true
        if (!hasInvitedAt) {
          sqlCommands.push('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;')
        }
        if (!hasInviteCount) {
          sqlCommands.push('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invite_count INTEGER DEFAULT 0;')
        }
      } else {
        results.push('✅ Company invite columns already exist')
      }
    } catch (error) {
      console.error('Error checking company columns:', error)
      results.push(`⚠️ Error checking company columns: ${error}`)
      needsManualMigration = true
      sqlCommands.push('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;')
      sqlCommands.push('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invite_count INTEGER DEFAULT 0;')
    }

    // Test if we can actually read/write to the notes column
    try {
      const testTask = await prisma.phaseTask.findFirst()
      if (testTask) {
        results.push(`✅ Can read from phase_tasks table (found ${testTask.id})`)
        // Check if notes field is accessible
        if ('notes' in testTask) {
          results.push('✅ notes field is accessible in TypeScript')
        }
      }
    } catch (error) {
      console.error('Error testing database access:', error)
      results.push(`⚠️ Could not test database access: ${error}`)
    }

    return NextResponse.json({
      success: !needsManualMigration,
      message: needsManualMigration
        ? 'Manual migration required - see SQL commands below'
        : 'Database schema is up to date',
      results,
      needsManualMigration,
      sqlCommands: sqlCommands.length > 0 ? sqlCommands : undefined,
      instructions: needsManualMigration
        ? 'Run the SQL commands in your Vercel Postgres dashboard or database console'
        : undefined
    })
  } catch (error) {
    console.error('Migration check failed:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      success: false,
      error: errorMessage,
      suggestion: 'Check Vercel logs for details'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST request with Authorization header to run migration',
    example: 'curl -X POST https://your-domain.vercel.app/api/setup/migrate -H "Authorization: Bearer YOUR_SECRET"'
  })
}
