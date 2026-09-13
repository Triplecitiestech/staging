// Drives requestLoginCode / verifyLoginCode against an in-memory stand-in for
// the field_* tables so the lockout, expiry and "identical response for
// unknown email" rules are locked without a database.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db-pool', () => ({ getPool: () => { throw new Error('tests must pass a db') } }))

import type { Queryable } from './store'
import { IP_CODE_REQUEST_LIMIT, MAX_CODE_ATTEMPTS, requestLoginCode, verifyLoginCode } from './login'
import { sha256Hex } from './tokens'
import type { CodeDeliveryResult } from './email'

interface Row { [k: string]: unknown }

/** Tiny fake of the SQL the store issues — matched by statement shape, not a parser. */
class FakeDb implements Queryable {
  contractors: Row[] = []
  codes: Row[] = []
  sessions: Row[] = []
  audit: Row[] = []
  private seq = 0
  id() { return `id-${++this.seq}` }

  async query(text: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    const sql = text.replace(/\s+/g, ' ').trim()
    if (sql.startsWith('SELECT COUNT(*)::int AS n FROM field_audit_log')) {
      const n = this.audit.filter((a) => a.event === 'code_requested' && (a.meta as Row).ip === params[0]).length
      return { rows: [{ n }] }
    }
    if (sql.startsWith('INSERT INTO field_audit_log')) {
      this.audit.push({ actor_type: params[0], actor_id: params[1], event: params[2], meta: JSON.parse(String(params[3])) })
      return { rows: [] }
    }
    if (sql.startsWith('SELECT id, name, email, phone, active, created_by, created_at, deactivated_at FROM field_contractors WHERE lower(email)')) {
      const row = this.contractors.find((c) => String(c.email).toLowerCase() === String(params[0]).toLowerCase() && c.active)
      return { rows: row ? [row] : [] }
    }
    if (sql.startsWith('UPDATE field_login_codes SET consumed_at = NOW() WHERE contractor_id')) {
      for (const c of this.codes) if (c.contractor_id === params[0] && !c.consumed_at) c.consumed_at = new Date()
      return { rows: [] }
    }
    if (sql.startsWith('INSERT INTO field_login_codes')) {
      const row = { id: this.id(), contractor_id: params[0], code_hash: params[1], code_ciphertext: params[2], expires_at: params[3], consumed_at: null, attempts: 0, created_at: new Date() }
      this.codes.push(row)
      return { rows: [row] }
    }
    if (sql.startsWith('SELECT id, contractor_id, code_hash, code_ciphertext, expires_at, consumed_at, attempts, created_at FROM field_login_codes')) {
      const open = this.codes.filter((c) => c.contractor_id === params[0] && !c.consumed_at).sort((a, b) => (b.created_at as Date).getTime() - (a.created_at as Date).getTime())
      return { rows: open.slice(0, 1) }
    }
    if (sql.startsWith('UPDATE field_login_codes SET attempts = attempts + 1')) {
      const row = this.codes.find((c) => c.id === params[0])!
      row.attempts = Number(row.attempts) + 1
      return { rows: [{ attempts: row.attempts }] }
    }
    if (sql.startsWith('UPDATE field_login_codes SET consumed_at = NOW() WHERE id')) {
      const row = this.codes.find((c) => c.id === params[0])!
      row.consumed_at = new Date()
      return { rows: [] }
    }
    if (sql.startsWith('INSERT INTO field_sessions')) {
      const row = { id: this.id(), contractor_id: params[0], token_hash: params[1], expires_at: params[2], user_agent: params[3], ip: params[4] }
      this.sessions.push(row)
      return { rows: [{ id: row.id }] }
    }
    throw new Error(`FakeDb: unhandled SQL: ${sql.slice(0, 80)}`)
  }
}

const ctx = { ip: '203.0.113.7', userAgent: 'vitest' }
let db: FakeDb
let sentCodes: string[]
const deliver = async (_to: string, code: string): Promise<CodeDeliveryResult> => {
  sentCodes.push(code)
  return 'sent'
}

beforeEach(() => {
  db = new FakeDb()
  sentCodes = []
  db.contractors.push({ id: 'c-1', name: 'Rio', email: 'rio@example.com', phone: null, active: true, created_by: 'kurtis@triplecitiestech.com', created_at: new Date(), deactivated_at: null })
  db.contractors.push({ id: 'c-2', name: 'Gone', email: 'gone@example.com', phone: null, active: false, created_by: 'kurtis@triplecitiestech.com', created_at: new Date(), deactivated_at: new Date() })
})

describe('requestLoginCode', () => {
  it('issues a hashed code with a 10-minute expiry for an active contractor', async () => {
    const before = Date.now()
    const result = await requestLoginCode('RIO@example.com', ctx, db, deliver)
    expect(result.outcome).toBe('issued')
    await (result as { delivery: Promise<unknown> }).delivery
    expect(db.codes).toHaveLength(1)
    const code = db.codes[0]
    expect(sentCodes).toHaveLength(1)
    expect(code.code_hash).toBe(sha256Hex(sentCodes[0]))
    expect(code.code_hash).not.toBe(sentCodes[0])
    const ttl = (code.expires_at as Date).getTime() - before
    expect(ttl).toBeGreaterThan(9.9 * 60_000)
    expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 1000)
    expect(db.audit.map((a) => a.event)).toEqual(['code_requested', 'code_issued', 'code_email_sent'])
  })

  it('unknown or deactivated email: no code row, no email, only an audit row', async () => {
    for (const email of ['nobody@example.com', 'gone@example.com']) {
      const result = await requestLoginCode(email, ctx, db, deliver)
      expect(result.outcome).toBe('unknown_email')
    }
    expect(db.codes).toHaveLength(0)
    expect(sentCodes).toHaveLength(0)
    expect(db.audit.filter((a) => a.event === 'code_requested')).toHaveLength(2)
  })

  it('a new request supersedes the previous open code', async () => {
    await requestLoginCode('rio@example.com', ctx, db, deliver)
    await requestLoginCode('rio@example.com', ctx, db, deliver)
    expect(db.codes.filter((c) => !c.consumed_at)).toHaveLength(1)
  })

  it('rate-limits the 11th request from one IP inside the window', async () => {
    for (let i = 0; i < IP_CODE_REQUEST_LIMIT; i++) {
      const r = await requestLoginCode(`x${i}@example.com`, ctx, db, deliver)
      expect(r.outcome).toBe('unknown_email')
    }
    const blocked = await requestLoginCode('rio@example.com', ctx, db, deliver)
    expect(blocked.outcome).toBe('rate_limited')
    expect(db.codes).toHaveLength(0)
    // A different IP is unaffected.
    const other = await requestLoginCode('rio@example.com', { ...ctx, ip: '198.51.100.9' }, db, deliver)
    expect(other.outcome).toBe('issued')
  })
})

describe('verifyLoginCode', () => {
  async function issue(): Promise<string> {
    const r = await requestLoginCode('rio@example.com', ctx, db, deliver)
    await (r as { delivery: Promise<unknown> }).delivery
    return sentCodes[sentCodes.length - 1]
  }

  it('correct code → consumed + session with hashed token and 30-day expiry', async () => {
    const code = await issue()
    const result = await verifyLoginCode('rio@example.com', code, ctx, db)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessionToken).toMatch(/^[0-9a-f]{64}$/)
    expect(db.sessions[0].token_hash).toBe(sha256Hex(result.sessionToken))
    expect(db.codes[0].consumed_at).toBeTruthy()
    const days = (result.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThanOrEqual(30)
    // Replaying the same code is refused.
    const replay = await verifyLoginCode('rio@example.com', code, ctx, db)
    expect(replay).toEqual({ ok: false, reason: 'no_code' })
  })

  it('wrong code → invalid; fifth wrong attempt kills the code; sixth says request a new one', async () => {
    const code = await issue()
    const wrong = code === '000000' ? '000001' : '000000'
    for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) {
      expect(await verifyLoginCode('rio@example.com', wrong, ctx, db)).toEqual({ ok: false, reason: 'invalid' })
    }
    // 5th wrong attempt
    expect(await verifyLoginCode('rio@example.com', wrong, ctx, db)).toEqual({ ok: false, reason: 'no_code' })
    expect(db.audit.some((a) => a.event === 'lockout')).toBe(true)
    // 6th attempt — even with the RIGHT code — the code is dead.
    expect(await verifyLoginCode('rio@example.com', code, ctx, db)).toEqual({ ok: false, reason: 'no_code' })
    expect(db.sessions).toHaveLength(0)
  })

  it('expired code → no_code', async () => {
    const code = await issue()
    const later = new Date(Date.now() + 11 * 60_000)
    expect(await verifyLoginCode('rio@example.com', code, ctx, db, later)).toEqual({ ok: false, reason: 'no_code' })
  })

  it('email with no enrolment → no_code, and nothing is created', async () => {
    expect(await verifyLoginCode('nobody@example.com', '123456', ctx, db)).toEqual({ ok: false, reason: 'no_code' })
    expect(db.sessions).toHaveLength(0)
  })
})
