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
      // Ensure rotation vars are unset by default; individual tests set them
      // as needed so we never leak state across cases.
      MIGRATION_SECRET_NEW: undefined,
      CRON_SECRET_NEW: undefined,
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

  // ---------------------------------------------------------------------
  // Rotation window — both old and _NEW values must work simultaneously
  // ---------------------------------------------------------------------

  describe('rotation window (MIGRATION_SECRET_NEW / CRON_SECRET_NEW)', () => {
    beforeEach(() => {
      process.env = {
        ...originalEnv,
        MIGRATION_SECRET: 'test-migration-secret',
        CRON_SECRET: 'test-cron-secret',
        MIGRATION_SECRET_NEW: 'test-migration-secret-new',
        CRON_SECRET_NEW: 'test-cron-secret-new',
      }
    })

    it('still allows the original MIGRATION_SECRET via Bearer header', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer test-migration-secret' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('still allows the original CRON_SECRET via Bearer header', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer test-cron-secret' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('allows MIGRATION_SECRET_NEW via Bearer header', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer test-migration-secret-new' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('allows CRON_SECRET_NEW via Bearer header', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer test-cron-secret-new' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('allows MIGRATION_SECRET_NEW via query param', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        searchParams: { secret: 'test-migration-secret-new' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('allows CRON_SECRET_NEW via query param', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        searchParams: { secret: 'test-cron-secret-new' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('rejects a value that does not match any of the four secrets', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer completely-wrong' },
      })
      expect(checkSecretAuth(req as never)).not.toBeNull()
    })

    it('does not match a secret that only differs by the "_NEW" variant (no substring bleed)', async () => {
      // Regression guard: naive string includes/contains would wrongly match
      // "test-migration-secret" to "test-migration-secret-new" or vice versa.
      process.env = {
        ...originalEnv,
        MIGRATION_SECRET: 'abc',
        CRON_SECRET: 'xyz',
        MIGRATION_SECRET_NEW: 'abc-new',
        CRON_SECRET_NEW: 'xyz-new',
      }
      const { checkSecretAuth } = await import('@/lib/api-auth')
      // A value that is a prefix of one of the accepted secrets must NOT match
      const req = makeRequest({ headers: { authorization: 'Bearer abc-n' } })
      expect(checkSecretAuth(req as never)).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------------
  // Post-rotation: only the _NEW values are configured (simulating the
  // state after the Vercel cutover, before the _NEW suffix is removed)
  // ---------------------------------------------------------------------

  describe('post-rotation (only _NEW configured)', () => {
    beforeEach(() => {
      process.env = {
        ...originalEnv,
        MIGRATION_SECRET: undefined,
        CRON_SECRET: undefined,
        MIGRATION_SECRET_NEW: 'rotated-migration',
        CRON_SECRET_NEW: 'rotated-cron',
      }
    })

    it('allows the rotated MIGRATION_SECRET_NEW value', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer rotated-migration' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('allows the rotated CRON_SECRET_NEW value', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer rotated-cron' },
      })
      expect(checkSecretAuth(req as never)).toBeNull()
    })

    it('rejects the old MIGRATION_SECRET value (no longer configured)', async () => {
      const { checkSecretAuth } = await import('@/lib/api-auth')
      const req = makeRequest({
        headers: { authorization: 'Bearer test-migration-secret' },
      })
      expect(checkSecretAuth(req as never)).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------------
  // Failure mode: nothing configured anywhere
  // ---------------------------------------------------------------------

  it('denies all requests when no secrets are configured', async () => {
    process.env = {
      ...originalEnv,
      MIGRATION_SECRET: undefined,
      CRON_SECRET: undefined,
      MIGRATION_SECRET_NEW: undefined,
      CRON_SECRET_NEW: undefined,
    }
    const { checkSecretAuth } = await import('@/lib/api-auth')
    // Even a request with a reasonable-looking Bearer header must be denied
    const req = makeRequest({
      headers: { authorization: 'Bearer something' },
    })
    expect(checkSecretAuth(req as never)).not.toBeNull()
  })

  it('ignores empty-string secrets (does not treat "" as an accepted value)', async () => {
    process.env = {
      ...originalEnv,
      MIGRATION_SECRET: '',
      CRON_SECRET: '',
      MIGRATION_SECRET_NEW: 'the-only-real-one',
      CRON_SECRET_NEW: '',
    }
    const { checkSecretAuth } = await import('@/lib/api-auth')
    // Empty Bearer token should NOT be allowed through
    const reqEmpty = makeRequest({ headers: { authorization: 'Bearer ' } })
    expect(checkSecretAuth(reqEmpty as never)).not.toBeNull()
    // But the one configured value should still work
    const reqGood = makeRequest({
      headers: { authorization: 'Bearer the-only-real-one' },
    })
    expect(checkSecretAuth(reqGood as never)).toBeNull()
  })
})

describe('getSecretAuthStatus', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('reports rotationMode=false when no _NEW vars are set', async () => {
    process.env = {
      ...originalEnv,
      MIGRATION_SECRET: 'a',
      CRON_SECRET: 'b',
      MIGRATION_SECRET_NEW: undefined,
      CRON_SECRET_NEW: undefined,
    }
    const { getSecretAuthStatus } = await import('@/lib/api-auth')
    const status = getSecretAuthStatus()
    expect(status.rotationMode).toBe(false)
    expect(status.accepted.find((s) => s.slot === 'MIGRATION_SECRET')?.configured).toBe(true)
    expect(status.accepted.find((s) => s.slot === 'MIGRATION_SECRET_NEW')?.configured).toBe(false)
  })

  it('reports rotationMode=true when either _NEW var is set', async () => {
    process.env = {
      ...originalEnv,
      MIGRATION_SECRET: 'a',
      CRON_SECRET: 'b',
      MIGRATION_SECRET_NEW: 'a-new',
      CRON_SECRET_NEW: undefined,
    }
    const { getSecretAuthStatus } = await import('@/lib/api-auth')
    expect(getSecretAuthStatus().rotationMode).toBe(true)
  })

  it('never returns secret values, only booleans', async () => {
    process.env = {
      ...originalEnv,
      MIGRATION_SECRET: 'super-secret-value',
      CRON_SECRET: 'another-secret',
    }
    const { getSecretAuthStatus } = await import('@/lib/api-auth')
    const serialised = JSON.stringify(getSecretAuthStatus())
    expect(serialised).not.toContain('super-secret-value')
    expect(serialised).not.toContain('another-secret')
  })
})
