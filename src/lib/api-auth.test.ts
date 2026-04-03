import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock NextRequest
function makeRequest(options: {
  searchParams?: Record<string, string>
  headers?: Record<string, string>
}) {
  const url = new URL('http://localhost:3000/api/test')
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value)
    }
  }
  return {
    nextUrl: url,
    headers: {
      get: (name: string) => options.headers?.[name.toLowerCase()] ?? null,
    },
  }
}

describe('checkSecretAuth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      MIGRATION_SECRET: 'test-migration-secret',
      CRON_SECRET: 'test-cron-secret',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('allows Authorization header with MIGRATION_SECRET', async () => {
    const { checkSecretAuth } = await import('@/lib/api-auth')
    const req = makeRequest({
      headers: { authorization: 'Bearer test-migration-secret' },
    })
    const result = checkSecretAuth(req as never)
    expect(result).toBeNull()
  })

  it('allows Authorization header with CRON_SECRET', async () => {
    const { checkSecretAuth } = await import('@/lib/api-auth')
    const req = makeRequest({
      headers: { authorization: 'Bearer test-cron-secret' },
    })
    const result = checkSecretAuth(req as never)
    expect(result).toBeNull()
  })

  it('allows query param with MIGRATION_SECRET', async () => {
    const { checkSecretAuth } = await import('@/lib/api-auth')
    const req = makeRequest({
      searchParams: { secret: 'test-migration-secret' },
    })
    const result = checkSecretAuth(req as never)
    expect(result).toBeNull()
  })

  it('allows query param with CRON_SECRET', async () => {
    const { checkSecretAuth } = await import('@/lib/api-auth')
    const req = makeRequest({
      searchParams: { secret: 'test-cron-secret' },
    })
    const result = checkSecretAuth(req as never)
    expect(result).toBeNull()
  })

  it('rejects with wrong secret', async () => {
    const { checkSecretAuth } = await import('@/lib/api-auth')
    const req = makeRequest({
      searchParams: { secret: 'wrong-secret' },
    })
    const result = checkSecretAuth(req as never)
    expect(result).not.toBeNull()
    // Should be a 401 response
  })

  it('rejects with no auth at all', async () => {
    const { checkSecretAuth } = await import('@/lib/api-auth')
    const req = makeRequest({})
    const result = checkSecretAuth(req as never)
    expect(result).not.toBeNull()
  })

  it('rejects with wrong Authorization header format', async () => {
    const { checkSecretAuth } = await import('@/lib/api-auth')
    const req = makeRequest({
      headers: { authorization: 'Basic dGVzdDp0ZXN0' },
    })
    const result = checkSecretAuth(req as never)
    expect(result).not.toBeNull()
  })
})
