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

    console.log('Starting database migration...')

    const results = []

    // Check if notes column exists in phase_tasks table
    try {
      const checkColumn = await prisma.$executeRaw`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'phase_tasks'
        AND column_name = 'notes'
      `

      if (checkColumn === 0) {
        // Add notes column if it doesn't exist
        console.log('Adding notes column to phase_tasks table...')
        await prisma.$executeRaw`
          ALTER TABLE phase_tasks
          ADD COLUMN IF NOT EXISTS notes TEXT
        `
        results.push('Added notes column to phase_tasks')
      } else {
        results.push('notes column already exists in phase_tasks')
      }
    } catch (error) {
      console.error('Error with notes column:', error)
      results.push(`Error with notes column: ${error}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Database migration completed successfully',
      results
    })
  } catch (error) {
    console.error('Migration failed:', error)
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
