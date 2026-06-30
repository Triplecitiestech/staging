// This file runs once when the Next.js server starts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate environment variables before anything else
    const { validateEnvironment } = await import('@/lib/env-validation')
    validateEnvironment()

    // NOTE: We intentionally do NOT run schema migrations here.
    //
    // register() fires on every serverless COLD START. A fresh deploy boots
    // many instances at once, and each one opened its own DB connection on the
    // direct Prisma Postgres role (`prisma_migration`) to run the same handful
    // of idempotent `ALTER TABLE ... IF NOT EXISTS` statements. That role's
    // connection limit is shared across ALL instances, so the boot-time storm
    // exhausted it ("too many connections for role prisma_migration"), which
    // took down NextAuth (it reads sessions from the DB) and the customer
    // portal. The columns those ALTERs added are long-applied in production,
    // and schema changes are applied via POST /api/migrations/run — the
    // project's documented source of truth for migrations (see docs/gotchas.md).
    // Migrations must never run on boot.
  }
}
