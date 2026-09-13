import { describe, expect, it } from 'vitest'
import {
  digestsMatch,
  generateLoginCode,
  generateSessionToken,
  isWellFormedLoginCode,
  normaliseEmail,
  sha256Hex,
} from './tokens'
import { isFieldPath, isFieldPublicPath, isWellFormedSessionToken } from './edge'

describe('field tokens', () => {
  it('login codes are exactly 6 digits, zero-padded', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateLoginCode()
      expect(code).toMatch(/^\d{6}$/)
      expect(isWellFormedLoginCode(code)).toBe(true)
    }
  })

  it('session tokens are 32 random bytes as 64 lowercase hex chars', () => {
    const a = generateSessionToken()
    const b = generateSessionToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(isWellFormedSessionToken(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('malformed cookie values are treated as missing', () => {
    expect(isWellFormedSessionToken(undefined)).toBe(false)
    expect(isWellFormedSessionToken('')).toBe(false)
    expect(isWellFormedSessionToken('abc')).toBe(false)
    expect(isWellFormedSessionToken('A'.repeat(64))).toBe(false) // uppercase
    expect(isWellFormedSessionToken('0'.repeat(63))).toBe(false)
    expect(isWellFormedSessionToken('0'.repeat(65))).toBe(false)
  })

  it('digestsMatch is exact and false on length mismatch', () => {
    const h = sha256Hex('123456')
    expect(digestsMatch(h, sha256Hex('123456'))).toBe(true)
    expect(digestsMatch(h, sha256Hex('123457'))).toBe(false)
    expect(digestsMatch(h, h.slice(0, 60))).toBe(false)
    expect(digestsMatch('', '')).toBe(false)
  })

  it('normaliseEmail trims and lowercases', () => {
    expect(normaliseEmail('  Rio@Example.COM ')).toBe('rio@example.com')
    expect(normaliseEmail(42)).toBeNull()
    expect(normaliseEmail('')).toBeNull()
  })
})

describe('field path rules (edge-safe)', () => {
  it('matches /field and children only', () => {
    expect(isFieldPath('/field')).toBe(true)
    expect(isFieldPath('/field/playbook')).toBe(true)
    expect(isFieldPath('/fieldwork')).toBe(false)
    expect(isFieldPath('/admin')).toBe(false)
  })

  it('exempts the login flow, logout and the staff admin page', () => {
    expect(isFieldPublicPath('/field/login')).toBe(true)
    expect(isFieldPublicPath('/field/login/code')).toBe(true)
    expect(isFieldPublicPath('/field/logout')).toBe(true)
    expect(isFieldPublicPath('/field/admin')).toBe(true)
    expect(isFieldPublicPath('/field')).toBe(false)
    expect(isFieldPublicPath('/field/playbook')).toBe(false)
    expect(isFieldPublicPath('/field/loginx')).toBe(false)
  })
})
