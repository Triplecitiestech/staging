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
