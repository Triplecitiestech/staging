/**
 * Second, lightweight gate in front of the Wilmar status page
 * (`/status/[token]`): a 6-digit numeric code Neil Cantral types in once the
 * URL token has already checked out (see page.tsx). Explicitly NOT meant to
 * be secure — the owner's words: "it's okay that the code is visible here,
 * it's not super secure, I'm okay with that, this is just a temporary
 * document." So: no rate limiting, no lockout, no brute-force protection —
 * just a timing-safe compare (same approach as `timingSafeEqual` in
 * onboarding-data.ts) and a plain, unsigned marker cookie so the code isn't
 * retyped on every visit.
 */

import crypto from 'crypto'

/** Cookie that marks this browser as having entered the correct code. */
export const WILMAR_STATUS_CODE_COOKIE = 'wilmar_status_code_ok'

/** Cookie value set on a correct submission. */
export const WILMAR_STATUS_CODE_COOKIE_VALUE = '1'

/** 30 days — plenty for a "temporary document," per the owner's stated bar. */
export const WILMAR_STATUS_CODE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Timing-safe compare — same approach as onboarding-data.ts's timingSafeEqual. */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Pad shorter buffer to prevent length oracle, then compare (will always fail)
    const padded = Buffer.alloc(bufA.length)
    bufB.copy(padded)
    crypto.timingSafeEqual(bufA, padded)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Verify a submitted code against WILMAR_STATUS_CODE. Fails closed: an
 * unconfigured env var never authenticates, matching how the URL-token check
 * in page.tsx behaves when WILMAR_STATUS_TOKEN is unset.
 */
export function verifyWilmarStatusCode(submitted: string): boolean {
  const expected = process.env.WILMAR_STATUS_CODE
  if (!expected) return false
  return timingSafeEqual(submitted, expected)
}

/** Whether a cookie value read from the request matches the expected marker. */
export function isWilmarStatusCodeCookieValid(value: string | undefined): boolean {
  return value === WILMAR_STATUS_CODE_COOKIE_VALUE
}
