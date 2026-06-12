import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'tests/e2e/.auth/admin.json'

/**
 * Authentication setup for e2e tests.
 *
 * Creates an authenticated admin session via the test auth endpoint.
 * Saves the browser storage state (cookies) to a file that other tests
 * can use via `storageState`.
 *
 * Requires E2E_TEST_SECRET env var to be set on both the server and test runner.
 * Locally it skips silently if not configured (unauthenticated tests still run).
 * In CI a missing/broken secret FAILS the gate — a silent skip here means all
 * authenticated specs fail with a missing storage-state file (seen 2026-06-12).
 */
setup('authenticate as admin', async ({ request }) => {
  const testSecret = process.env.E2E_TEST_SECRET
  if (!testSecret) {
    if (process.env.CI) {
      throw new Error(
        'E2E_TEST_SECRET is not set in CI. Add the GitHub Actions repo secret ' +
          '(value must match the Vercel E2E_TEST_SECRET env var) so authenticated specs can run.',
      )
    }
    setup.skip()
    return
  }

  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

  const response = await request.post(`${baseURL}/api/test/auth`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${testSecret}`,
    },
    data: {
      email: 'e2e-test@triplecitiestech.com',
      role: 'SUPER_ADMIN',
    },
  })

  if (response.status() === 404) {
    // Test auth endpoint not available (E2E_TEST_SECRET not set on server)
    if (process.env.CI) {
      throw new Error(
        '/api/test/auth returned 404 on the target deployment — the server-side ' +
          'E2E_TEST_SECRET env var is missing for this Vercel environment.',
      )
    }
    setup.skip()
    return
  }

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)

  // Save the authenticated state
  await request.storageState({ path: AUTH_FILE })
})
