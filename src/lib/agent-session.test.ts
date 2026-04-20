import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import { createAgentSession, validateAgentSession } from './agent-session'

beforeAll(() => {
  process.env.AGENT_SIGNING_KEY = 'test-key-for-agent-session-tests-1234567890'
})

describe('agent-session', () => {
  it('round-trips an agent ID through sign + verify', () => {
    const id = 'agent-abc-123'
    const token = createAgentSession(id)
    expect(validateAgentSession(token)).toBe(id)
  })

  it('rejects a token with a tampered signature', () => {
    const token = createAgentSession('agent-abc-123')
    const [payloadB64, sig] = token.split('.')
    // Flip the last hex char to corrupt the signature
    const corrupted = sig.slice(0, -1) + (sig.slice(-1) === '0' ? '1' : '0')
    expect(validateAgentSession(`${payloadB64}.${corrupted}`)).toBeNull()
  })

  it('rejects a token whose payload was modified', () => {
    const token = createAgentSession('agent-abc-123')
    const [payload, sig] = token.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ agentId: 'attacker', expires: Date.now() + 999999 })).toString('base64')
    expect(validateAgentSession(`${tamperedPayload}.${sig}`)).toBeNull()
  })

  it('rejects an expired token', () => {
    // Build a token directly with an expired timestamp
    const payload = JSON.stringify({ agentId: 'agent-abc', expires: Date.now() - 1000 })
    const sig = crypto.createHmac('sha256', process.env.AGENT_SIGNING_KEY!).update(payload).digest('hex')
    const token = Buffer.from(payload).toString('base64') + '.' + sig
    expect(validateAgentSession(token)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(validateAgentSession('')).toBeNull()
    expect(validateAgentSession('not-a-token')).toBeNull()
    expect(validateAgentSession('only-one-part.')).toBeNull()
    expect(validateAgentSession('.no-payload')).toBeNull()
  })
})
