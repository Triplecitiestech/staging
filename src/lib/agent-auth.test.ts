import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, validatePasswordStrength, generatePasswordToken } from './agent-auth'

describe('validatePasswordStrength', () => {
  it('rejects short passwords', () => {
    expect(validatePasswordStrength('Short1!')).toMatch(/at least 12/)
  })

  it('rejects passwords with too few character classes', () => {
    expect(validatePasswordStrength('alllowercase1')).toMatch(/three of/)
    expect(validatePasswordStrength('ALLUPPER12345')).toMatch(/three of/)
  })

  it('accepts a strong password', () => {
    expect(validatePasswordStrength('Strong-Password-123')).toBeNull()
  })

  it('rejects non-string input', () => {
    // @ts-expect-error testing invalid input
    expect(validatePasswordStrength(undefined)).toMatch(/required/)
  })
})

describe('hashPassword + verifyPassword', () => {
  it('round-trips a password through bcrypt', async () => {
    const hash = await hashPassword('My-Strong-Password-1')
    expect(hash).not.toBe('My-Strong-Password-1')
    expect(await verifyPassword('My-Strong-Password-1', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })
})

describe('generatePasswordToken', () => {
  it('produces a 64-char hex token and an expiry > now', () => {
    const { token, expiresAt } = generatePasswordToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('produces unique tokens on repeated calls', () => {
    const a = generatePasswordToken().token
    const b = generatePasswordToken().token
    expect(a).not.toBe(b)
  })
})
