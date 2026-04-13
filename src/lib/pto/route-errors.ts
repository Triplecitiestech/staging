/**
 * Shared error handling for PTO API routes.
 *
 * Detects when the PTO tables haven't been migrated yet (so the UI can show
 * a helpful message) and guarantees every route returns JSON rather than
 * an HTML error page.
 */

import { NextResponse } from 'next/server'

export interface RouteErrorBody {
  error: string
  code?: string
  [key: string]: unknown
}

const MISSING_TABLE_PATTERNS = [
  'does not exist',                        // Postgres "relation X does not exist"
  'table does not exist',
  'relation "time_off',
  'relation "pto_employee',
  'relation "gusto_connections',
]

export function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return MISSING_TABLE_PATTERNS.some((p) => msg.includes(p))
}

/**
 * Wrap a handler so it always returns a JSON NextResponse, including on
 * otherwise-uncaught errors. Preserves the user-visible error body shape.
 */
export function ptoRouteErrorResponse(
  err: unknown,
  fallback: RouteErrorBody = { error: 'Unexpected server error' }
): NextResponse {
  if (isMissingTableError(err)) {
    return NextResponse.json(
      {
        error:
          'PTO database tables are not installed yet. An admin must run the 20260413000000_add_pto_system migration.',
        code: 'pto_migration_missing',
      },
      { status: 503 }
    )
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error'
  return NextResponse.json({ ...fallback, error: message }, { status: 500 })
}
