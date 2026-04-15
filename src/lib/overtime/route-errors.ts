import { NextResponse } from 'next/server'

const MISSING_TABLE_PATTERNS = [
  'does not exist',
  'relation "overtime_',
]

export function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return MISSING_TABLE_PATTERNS.some((p) => msg.includes(p))
}

export function overtimeRouteErrorResponse(err: unknown): NextResponse {
  if (isMissingTableError(err)) {
    return NextResponse.json(
      {
        error:
          'Overtime database tables are not installed yet. An admin must run POST /api/overtime/migrate with Bearer MIGRATION_SECRET.',
        detail: err instanceof Error ? err.message : String(err),
        code: 'overtime_migration_missing',
      },
      { status: 503 }
    )
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Unexpected server error' },
    { status: 500 }
  )
}
