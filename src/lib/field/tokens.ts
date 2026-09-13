// src/lib/field/tokens.ts
//
// Code / token primitives for the contractor portal. Node `crypto` only — no
// new dependency. Everything stored in the database is a SHA-256 of the value
// the user holds; comparison is constant-time.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'

export const LOGIN_CODE_LENGTH = 6
/** Session cookie value: 32 random bytes as 64 lowercase hex characters. */
export const SESSION_TOKEN_HEX_LENGTH = 64

/** 6-digit numeric code, zero-padded, from a CSPRNG. */
export function generateLoginCode(): string {
  return randomInt(0, 10 ** LOGIN_CODE_LENGTH).toString().padStart(LOGIN_CODE_LENGTH, '0')
}

/** Random 32-byte session token, hex-encoded (the cookie value). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Constant-time equality of two hex digests. Unequal lengths are simply false. */
export function digestsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length === 0 || bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function isWellFormedLoginCode(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`).test(value)
}

/** Normalise an email the way the store expects it: trimmed and lowercased. */
export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed.length > 0 && trimmed.length <= 254 ? trimmed : null
}
