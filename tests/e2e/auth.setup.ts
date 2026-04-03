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
 * Skips silently if not configured (unauthenticated tests still run).
 */
setup('authenticate as admin', async ({ request }) => {
  const testSecret = process.env.E2E_TEST_SECRET
  if (!testSecret) {
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
    setup.skip()
    return
  }

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)

  // Save the authenticated state
  await request.storageState({ path: AUTH_FILE })
})
