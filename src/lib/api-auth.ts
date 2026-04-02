/**
 * Shared API route authentication helpers.
 *
 * Provides consistent auth patterns for routes that use secret-based auth
 * (cron jobs, migration endpoints, diagnostic routes).
 *
 * Preferred auth order:
 * 1. Authorization: Bearer <secret> (header — preferred, not logged)
 * 2. ?secret=<secret> (query param — legacy, logged in URLs)
 *
 * Both MIGRATION_SECRET and CRON_SECRET are accepted for flexibility.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Check if a request is authorized via secret (header or query param).
 * Returns null if authorized, or a 401 NextResponse if not.
 *
 * Usage:
 *   const denied = checkSecretAuth(request)
 *   if (denied) return denied
 */
export function checkSecretAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const secret = request.nextUrl.searchParams.get('secret');

  const migrationSecret = process.env.MIGRATION_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    (authHeader && migrationSecret && authHeader === `Bearer ${migrationSecret}`) ||
    (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (secret && migrationSecret && secret === migrationSecret) ||
    (secret && cronSecret && secret === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
