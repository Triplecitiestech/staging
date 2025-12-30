// ONE-TIME SETUP ROUTE - DELETE AFTER USE
// This route runs the database migration
// Call this once after deploying to create all database tables

import { exec } from 'child_process'
import { promisify } from 'util'
import { NextResponse } from 'next/server'

const execAsync = promisify(exec)

export async function POST(request: Request) {
  try {
    // Security check - only allow in development or with secret token
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.MIGRATION_SECRET || 'CHANGE_ME_BEFORE_DEPLOY'

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting database migration...')

    // Run prisma db push
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss')

    console.log('Migration stdout:', stdout)
    if (stderr) console.error('Migration stderr:', stderr)

    return NextResponse.json({
      success: true,
      message: 'Database migration completed successfully',
      output: stdout,
      stderr: stderr || null
    })
  } catch (error) {
    console.error('Migration failed:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorObj = error as { stdout?: string; stderr?: string }
    return NextResponse.json({
      success: false,
      error: errorMessage,
      stdout: errorObj.stdout,
      stderr: errorObj.stderr
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST request with Authorization header to run migration',
    example: 'curl -X POST https://your-domain.vercel.app/api/setup/migrate -H "Authorization: Bearer YOUR_SECRET"'
  })
}
