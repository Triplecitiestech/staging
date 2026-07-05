import { describe, it, expect } from 'vitest'
import {
  isExoAutomationEnabled,
  signExoCallback,
  verifyExoCallback,
  resolveOnMicrosoftDomain,
} from './exchange-online'

describe('isExoAutomationEnabled', () => {
  const base = {
    EXO_AUTOMATION_ENABLED: 'true',
    EXO_AUTOMATION_WEBHOOK_URL: 'https://example.azure-automation.net/webhooks?token=x',
  }

  it('is off by default (kill switch)', () => {
    expect(isExoAutomationEnabled('dan-brown-construction', {})).toBe(false)
    expect(isExoAutomationEnabled('dan-brown-construction', { ...base, EXO_AUTOMATION_ENABLED: 'false' })).toBe(false)
  })

  it('requires the webhook URL to be configured', () => {
    expect(isExoAutomationEnabled('x', { EXO_AUTOMATION_ENABLED: 'true' })).toBe(false)
  })

  it('honors the per-tenant allowlist (case-insensitive)', () => {
    const env = { ...base, EXO_ENABLED_TENANTS: 'Dan-Brown-Construction, other-co' }
    expect(isExoAutomationEnabled('dan-brown-construction', env)).toBe(true)
    expect(isExoAutomationEnabled('OTHER-CO', env)).toBe(true)
    expect(isExoAutomationEnabled('not-enabled', env)).toBe(false)
  })

  it('supports the wildcard allowlist', () => {
    expect(isExoAutomationEnabled('anyone', { ...base, EXO_ENABLED_TENANTS: '*' })).toBe(true)
  })

  it('denies everything when the allowlist is empty', () => {
    expect(isExoAutomationEnabled('anyone', base)).toBe(false)
  })
})

describe('callback HMAC (per-job token)', () => {
  it('round-trips sign -> verify', () => {
    const body = JSON.stringify({ jobId: 'abc', ok: true })
    const sig = signExoCallback(body, 'job-secret-token')
    expect(verifyExoCallback(body, sig, 'job-secret-token')).toBe(true)
  })

  it('rejects a tampered body, wrong token, or malformed signature', () => {
    const body = JSON.stringify({ jobId: 'abc', ok: true })
    const sig = signExoCallback(body, 'job-secret-token')
    expect(verifyExoCallback(body + ' ', sig, 'job-secret-token')).toBe(false)
    expect(verifyExoCallback(body, sig, 'other-token')).toBe(false)
    expect(verifyExoCallback(body, 'short', 'job-secret-token')).toBe(false)
    expect(verifyExoCallback(body, '', 'job-secret-token')).toBe(false)
  })
})

describe('resolveOnMicrosoftDomain', () => {
  it('prefers the initial domain', () => {
    expect(
      resolveOnMicrosoftDomain([
        { name: 'danbrownconstruction.com', isInitial: false },
        { name: 'netorgft1991975.onmicrosoft.com', isInitial: true },
      ])
    ).toBe('netorgft1991975.onmicrosoft.com')
  })

  it('falls back to any .onmicrosoft.com domain, skipping .mail.onmicrosoft.com', () => {
    expect(
      resolveOnMicrosoftDomain([
        { name: 'contoso.com' },
        { name: 'contoso.mail.onmicrosoft.com' },
        { name: 'contoso.onmicrosoft.com' },
      ])
    ).toBe('contoso.onmicrosoft.com')
  })

  it('returns null when nothing usable exists', () => {
    expect(resolveOnMicrosoftDomain(undefined)).toBeNull()
    expect(resolveOnMicrosoftDomain([])).toBeNull()
    expect(resolveOnMicrosoftDomain([{ name: 'contoso.com' }])).toBeNull()
  })
})
