// This file runs once when the Next.js server starts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Run migrations automatically on server startup (only in production)
    if (process.env.NODE_ENV === 'production') {
      await runMigrations().catch(err => {
        console.error('Migration failed:', err)
      })
    }
  }
}

async function runMigrations() {
  try {
    // Dynamic import to avoid bundling issues
    const pg = await import('pg')
    const Client = pg.default.Client || pg.Client

    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL

    if (!databaseUrl) {
      console.log('⚠️ No DATABASE_URL found, skipping migrations')
      return
    }

    console.log('🔄 Running database migrations...')
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()

    // Add notes column to phase_tasks
    try {
      await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS notes TEXT')
      console.log('✅ Added notes column to phase_tasks')
    } catch (error) {
      const err = error as Error
      console.log(`⚠️ phase_tasks.notes: ${err.message}`)
    }

    // Add invited_at to companies
    try {
      await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP')
      console.log('✅ Added invited_at column to companies')
    } catch (error) {
      const err = error as Error
      console.log(`⚠️ companies.invited_at: ${err.message}`)
    }

    // Add invite_count to companies
    try {
      await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invite_count INTEGER DEFAULT 0')
      console.log('✅ Added invite_count column to companies')
    } catch (error) {
      const err = error as Error
      console.log(`⚠️ companies.invite_count: ${err.message}`)
    }

    await client.end()
    console.log('✅ Migrations completed')
  } catch (error) {
    const err = error as Error
    console.error('❌ Migration error:', err.message)
    // Don't throw - let the app start even if migrations fail
  }
}
