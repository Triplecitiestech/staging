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
 * Accepted secrets:
 *   MIGRATION_SECRET      — primary migration/admin gate
 *   CRON_SECRET           — Vercel cron header value
 *   MIGRATION_SECRET_NEW  — rotation-window replacement for MIGRATION_SECRET
 *   CRON_SECRET_NEW       — rotation-window replacement for CRON_SECRET
 *
 * During a rotation, both the old and the _NEW variant are accepted so
 * traffic doesn't drop between the code deploy and the Vercel env cutover.
 * Once Vercel has been flipped and a full cron cycle has run on the new
 * value, the _NEW variables (and this dual-accept support) should be
 * removed — see docs/runbooks/CREDENTIALS_MIGRATION.md.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Environment variable names this helper consults. Order is intentional:
 * primary secrets first, _NEW rotation variants after. Callers should not
 * rely on order for any purpose other than introspection output.
 */
const ACCEPTED_SECRET_ENV_VARS = [
  'MIGRATION_SECRET',
  'CRON_SECRET',
  'MIGRATION_SECRET_NEW',
  'CRON_SECRET_NEW',
] as const;

type AcceptedSecretEnv = (typeof ACCEPTED_SECRET_ENV_VARS)[number];

/**
 * Collect the currently-configured secrets from the environment. Empty or
 * unset values are filtered out so they never accidentally match an empty
 * request. Deduplicated in case the same value is set in two slots.
 */
function getAcceptedSecrets(): string[] {
  const seen = new Set<string>();
  for (const name of ACCEPTED_SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value && value.length > 0) seen.add(value);
  }
  return Array.from(seen);
}

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
  const queryParam = request.nextUrl.searchParams.get('secret');

  // Pull the bearer token out of the header, if present.
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;

  const accepted = getAcceptedSecrets();

  // No secrets configured at all — deny. This guards against a misconfigured
  // environment where checkSecretAuth would otherwise succeed with an empty
  // header value matching an empty accepted secret.
  if (accepted.length === 0) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAuthorized =
    (bearerToken !== null && accepted.includes(bearerToken)) ||
    (queryParam !== null && accepted.includes(queryParam));

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/** Constant-time string comparison that doesn't leak length via early exit. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Compare b against itself to keep timing uniform, then fail.
    crypto.timingSafeEqual(bBuf, bBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Check if a request carries the Thread automation key.
 * Returns null if authorized, or a 401 NextResponse if not.
 *
 * Thread's Magic Agents "Automation URL" feature POSTs a bare JSON body and
 * cannot attach auth headers or signatures
 * (https://docs.getthread.com/article/7vxm10v3zj-magic-agents-automation-url),
 * so the key rides in the URL: ?key=<THREAD_AUTOMATION_KEY>. The full URL
 * including the key is pasted into the intent's Automation URL field in
 * Thread and must be treated as a credential. Programmatic (non-Thread)
 * callers may send the same value in an `x-automation-key` header instead,
 * which keeps it out of request logs.
 *
 * FAIL CLOSED: when THREAD_AUTOMATION_KEY is unset, every request is
 * rejected — there is no unauthenticated fallback.
 */
export function checkAutomationKey(request: NextRequest): NextResponse | null {
  const expected = process.env.THREAD_AUTOMATION_KEY;

  if (!expected || expected.length === 0) {
    console.error(
      '[api-auth] THREAD_AUTOMATION_KEY is not set — rejecting automation request. ' +
        'Set it in Vercel env vars to enable the Thread integration.'
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const provided =
    request.headers.get('x-automation-key') ??
    request.nextUrl.searchParams.get('key');

  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Introspection helper — reports which secret slots are currently
 * populated, without ever revealing the secret values. Used by the
 * rotation runbook and any diagnostic endpoint that wants to confirm
 * "old and new are both set" before starting the Vercel cutover.
 *
 * Not auth-gated itself; expose only from routes that already require
 * auth.
 */
export function getSecretAuthStatus(): {
  accepted: Array<{ slot: AcceptedSecretEnv; configured: boolean }>;
  rotationMode: boolean;
} {
  const accepted = ACCEPTED_SECRET_ENV_VARS.map((slot) => ({
    slot,
    configured: !!(process.env[slot] && process.env[slot]!.length > 0),
  }));
  const rotationMode =
    accepted.some((s) => s.slot === 'MIGRATION_SECRET_NEW' && s.configured) ||
    accepted.some((s) => s.slot === 'CRON_SECRET_NEW' && s.configured);
  return { accepted, rotationMode };
}
