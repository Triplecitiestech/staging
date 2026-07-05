import { describe, it, expect } from 'vitest'
import {
  signExchangePayload,
  verifyExchangeSignature,
  evaluateExchangeJobResult,
  type ExchangeJobPayload,
} from './exchange-online'

const SECRET = 'test-secret-value'

function payload(overrides: Partial<ExchangeJobPayload> = {}): ExchangeJobPayload {
  return {
    jobId: 'job-1',
    action: 'convert_to_shared',
    tenantId: '00000000-0000-0000-0000-000000000001',
    organization: 'contoso.onmicrosoft.com',
    targetUpn: 'mbeach@contoso.com',
    delegates: [{ upn: 'jking@contoso.com', fullAccess: true, sendAs: true }],
    callbackUrl: 'https://www.triplecitiestech.com/api/hr/exchange-callback',
    issuedAt: '2026-07-05T00:00:00.000Z',
    companySlug: 'contoso',
    ...overrides,
  }
}

describe('HMAC signing / verification', () => {
  it('round-trips a signed body', () => {
    const body = JSON.stringify({ hello: 'world' })
    const sig = signExchangePayload(body, SECRET)
    expect(verifyExchangeSignature(body, sig, SECRET)).toBe(true)
  })

  it('rejects a tampered body, wrong secret, and malformed signatures', () => {
    const body = JSON.stringify({ hello: 'world' })
    const sig = signExchangePayload(body, SECRET)
    expect(verifyExchangeSignature(body + ' ', sig, SECRET)).toBe(false)
    expect(verifyExchangeSignature(body, sig, 'other-secret')).toBe(false)
    expect(verifyExchangeSignature(body, 'zz-not-hex', SECRET)).toBe(false)
    expect(verifyExchangeSignature(body, '', SECRET)).toBe(false)
    expect(verifyExchangeSignature('', sig, SECRET)).toBe(false)
  })
})

describe('evaluateExchangeJobResult — observed state must satisfy the request', () => {
  it('accepts a verified conversion with all requested grants observed', () => {
    const result = evaluateExchangeJobResult(payload(), {
      jobId: 'job-1',
      status: 'succeeded',
      observed: {
        recipientTypeDetails: 'SharedMailbox',
        grants: [{ upn: 'JKing@contoso.com', fullAccess: true, sendAs: true }],
        licenseRemovalSafe: true,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.mismatches).toEqual([])
  })

  it('rejects runner-claimed success when the mailbox is not actually shared', () => {
    const result = evaluateExchangeJobResult(payload(), {
      jobId: 'job-1',
      status: 'succeeded',
      observed: {
        recipientTypeDetails: 'UserMailbox',
        grants: [{ upn: 'jking@contoso.com', fullAccess: true, sendAs: true }],
      },
    })
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.includes('SharedMailbox'))).toBe(true)
  })

  it('rejects when a requested grant was not observed (partial success is failure)', () => {
    const result = evaluateExchangeJobResult(
      payload({
        delegates: [
          { upn: 'jking@contoso.com', fullAccess: true, sendAs: true },
          { upn: 'second@contoso.com', fullAccess: true, sendAs: false },
        ],
      }),
      {
        jobId: 'job-1',
        status: 'succeeded',
        observed: {
          recipientTypeDetails: 'SharedMailbox',
          grants: [{ upn: 'jking@contoso.com', fullAccess: true, sendAs: false }],
        },
      },
    )
    expect(result.ok).toBe(false)
    expect(result.mismatches).toContain('Send As not observed for jking@contoso.com')
    expect(result.mismatches).toContain('no access grant observed for second@contoso.com')
  })

  it('rejects success with no observed state at all', () => {
    const result = evaluateExchangeJobResult(payload(), { jobId: 'job-1', status: 'succeeded' })
    expect(result.ok).toBe(false)
    expect(result.mismatches[0]).toContain('no observed state')
  })

  it('passes through runner-reported failure with its error', () => {
    const result = evaluateExchangeJobResult(payload(), {
      jobId: 'job-1',
      status: 'failed',
      error: 'mailbox_not_found',
    })
    expect(result.ok).toBe(false)
    expect(result.mismatches).toEqual(['mailbox_not_found'])
  })

  it('validates probe jobs on probeOk', () => {
    const probe = payload({ action: 'probe', delegates: undefined, targetUpn: undefined })
    expect(
      evaluateExchangeJobResult(probe, { jobId: 'job-1', status: 'succeeded', observed: { probeOk: true } }).ok,
    ).toBe(true)
    expect(
      evaluateExchangeJobResult(probe, { jobId: 'job-1', status: 'succeeded', observed: {} }).ok,
    ).toBe(false)
  })
})
