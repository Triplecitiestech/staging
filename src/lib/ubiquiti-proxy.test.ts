import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listUnifiConsoles,
  proxyGet,
  proxyGetAll,
  redactSecrets,
  REDACTED,
  UnifiProxyError,
} from './ubiquiti-proxy'

// The whole point of this client (vs src/lib/ubiquiti.ts) is that failures
// are TYPED and thrown, never swallowed into empty data — so most of these
// tests pin the HTTP-status → error-code mapping.

function mockFetchOnce(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return vi.mocked(fetch).mockResolvedValueOnce(
    new Response(text, { status, headers: { 'Content-Type': 'application/json', ...headers } }),
  )
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'NO_ERROR'
  } catch (err) {
    if (err instanceof UnifiProxyError) return err.code
    throw err
  }
}

describe('ubiquiti-proxy error mapping', () => {
  beforeEach(() => {
    vi.stubEnv('UBIQUITI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('throws NOT_CONFIGURED without an API key', async () => {
    vi.stubEnv('UBIQUITI_API_KEY', '')
    await expect(proxyGet('c1', '/sites')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })

  it('maps 401/403 to AUTH_FAILED', async () => {
    mockFetchOnce(401, { message: 'invalid key' })
    expect(await codeOf(proxyGet('c1', '/sites'))).toBe('AUTH_FAILED')
    mockFetchOnce(403, { message: 'no scope' })
    expect(await codeOf(proxyGet('c1', '/sites'))).toBe('AUTH_FAILED')
  })

  it('maps 404 on the capability probe to FIRMWARE_UNSUPPORTED with the fix in the message', async () => {
    mockFetchOnce(404, 'not found')
    const err = await proxyGet('c1', '/sites', { isCapabilityProbe: true }).catch((e) => e)
    expect(err).toBeInstanceOf(UnifiProxyError)
    expect(err.code).toBe('FIRMWARE_UNSUPPORTED')
    expect(err.message).toMatch(/10\.1\.84/)
    expect(err.message).toMatch(/Update/i)
  })

  it('maps 404 on a deep resource to NOT_FOUND (could be missing resource OR missing endpoint)', async () => {
    mockFetchOnce(404, { message: 'no such policy' })
    const err = await proxyGet('c1', '/sites/s1/firewall-policies/x').catch((e) => e)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toMatch(/does not exist|does not expose/)
  })

  it('maps 502/503/504 to CONSOLE_OFFLINE', async () => {
    for (const status of [502, 503, 504]) {
      mockFetchOnce(status, '')
      expect(await codeOf(proxyGet('c1', '/sites'))).toBe('CONSOLE_OFFLINE')
    }
  })

  it('maps 429 to RATE_LIMITED carrying Retry-After when too long to wait inline', async () => {
    mockFetchOnce(429, '', { 'Retry-After': '120' })
    const err = await proxyGet('c1', '/sites').catch((e) => e)
    expect(err.code).toBe('RATE_LIMITED')
    expect(err.retryAfterSeconds).toBe(120)
  })

  it('retries once on 429 when Retry-After is short, then succeeds', async () => {
    vi.useFakeTimers()
    try {
      mockFetchOnce(429, '', { 'Retry-After': '1' })
      mockFetchOnce(200, { id: 's1' })
      const pending = proxyGet('c1', '/sites/s1')
      await vi.advanceTimersByTimeAsync(1100)
      await expect(pending).resolves.toEqual({ id: 's1' })
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('maps 400 to BAD_REQUEST surfacing the API message', async () => {
    mockFetchOnce(400, { message: 'portIdx out of range' })
    const err = await proxyGet('c1', '/sites/s1/devices/d1').catch((e) => e)
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.message).toContain('portIdx out of range')
  })

  it('maps aborts/timeouts to TIMEOUT', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException('The operation was aborted', 'TimeoutError'))
    expect(await codeOf(proxyGet('c1', '/sites'))).toBe('TIMEOUT')
  })

  it('builds the Cloud Connector Proxy URL (no LAN path)', async () => {
    mockFetchOnce(200, { data: [] })
    await proxyGet('AA11:22', '/sites/s1/devices')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toBe('https://api.ui.com/v1/connector/consoles/AA11%3A22/proxy/network/integration/v1/sites/s1/devices')
  })
})

describe('proxyGetAll pagination', () => {
  beforeEach(() => {
    vi.stubEnv('UBIQUITI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('walks offset/limit pages until totalCount is reached', async () => {
    mockFetchOnce(200, { offset: 0, limit: 2, count: 2, totalCount: 3, data: [{ id: 1 }, { id: 2 }] })
    mockFetchOnce(200, { offset: 2, limit: 2, count: 1, totalCount: 3, data: [{ id: 3 }] })
    const res = await proxyGetAll('c1', '/sites/s1/clients')
    expect(res.items.map((i) => (i as { id: number }).id)).toEqual([1, 2, 3])
    expect(res.totalCount).toBe(3)
    expect(res.truncated).toBe(false)
  })

  it('reports truncation instead of silently capping', async () => {
    mockFetchOnce(200, { offset: 0, limit: 2, count: 2, totalCount: 100, data: [{ id: 1 }, { id: 2 }] })
    const res = await proxyGetAll('c1', '/sites/s1/clients', { maxItems: 2 })
    expect(res.truncated).toBe(true)
    expect(res.totalCount).toBe(100)
  })

  it('accepts endpoints that return a bare array', async () => {
    mockFetchOnce(200, [{ id: 'a' }])
    const res = await proxyGetAll('c1', '/sites/s1/whatever')
    expect(res.items).toEqual([{ id: 'a' }])
    expect(res.truncated).toBe(false)
  })

  it('throws UPSTREAM_ERROR on an unrecognized list shape (never fakes an empty list)', async () => {
    mockFetchOnce(200, { nope: true })
    expect(await codeOf(proxyGetAll('c1', '/sites/s1/clients'))).toBe('UPSTREAM_ERROR')
  })
})

describe('listUnifiConsoles', () => {
  beforeEach(() => {
    vi.stubEnv('UBIQUITI_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('extracts console identity defensively from /v1/hosts', async () => {
    mockFetchOnce(200, {
      data: [
        { id: 'F4E2:1815', reportedState: { name: 'EZ Red - New York', state: 'connected' }, ipAddress: '1.2.3.4' },
        { id: 'AB12:9999', reportedState: { hostname: 'udm-pro-office' } },
        { notAnId: true },
      ],
    })
    const consoles = await listUnifiConsoles()
    expect(consoles).toEqual([
      { consoleId: 'F4E2:1815', name: 'EZ Red - New York', ipAddress: '1.2.3.4', isOnlineInSiteManager: true },
      { consoleId: 'AB12:9999', name: 'udm-pro-office', ipAddress: null, isOnlineInSiteManager: null },
    ])
  })
})

describe('redactSecrets', () => {
  it('redacts credential-looking string values at any depth', () => {
    const out = redactSecrets({
      name: 'Corp WiFi',
      passphrase: 'hunter2',
      security: { wpa: { psk: 'abc', mode: 'wpa2' } },
      radiusProfiles: [{ authServers: [{ ip: '10.0.0.1', sharedSecret: 's3cret' }] }],
      vpn: { privateKey: 'k', presharedKey: 'p' },
    })
    expect(out).toEqual({
      name: 'Corp WiFi',
      passphrase: REDACTED,
      security: { wpa: { psk: REDACTED, mode: 'wpa2' } },
      radiusProfiles: [{ authServers: [{ ip: '10.0.0.1', sharedSecret: REDACTED }] }],
      vpn: { privateKey: REDACTED, presharedKey: REDACTED },
    })
  })

  it('leaves non-secret data and empty values untouched', () => {
    expect(redactSecrets({ password: '', vlanId: 20, enabled: true, note: null })).toEqual({
      password: '',
      vlanId: 20,
      enabled: true,
      note: null,
    })
  })
})
