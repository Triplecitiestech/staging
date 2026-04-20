import { test, expect } from '@playwright/test'

/**
 * Sales Agent Portal — auth boundary smoke tests.
 *
 * These intentionally do NOT exercise the full agent flow (which would require
 * provisioning a real agent in the test database). They verify that:
 *   - Public agent portal pages render OK and don't crash.
 *   - Authenticated agent pages redirect to /agents/login when no session is set.
 *   - The new admin pages are wired up and return < 500 (the existing M365
 *     auth setup determines whether they then redirect or render).
 *   - Agent API endpoints reject unauthenticated requests with 401.
 */

test.describe('Sales Agent Portal — Public Pages', () => {
  test('login page renders', async ({ page }) => {
    const res = await page.goto('/agents/login')
    expect(res?.status()).toBeLessThan(500)
    await expect(page.getByRole('heading', { name: /Agent Portal Sign In/i })).toBeVisible()
  })

  test('forgot-password page renders', async ({ page }) => {
    const res = await page.goto('/agents/forgot-password')
    expect(res?.status()).toBeLessThan(500)
    await expect(page.getByRole('heading', { name: /Reset Your Password/i })).toBeVisible()
  })

  test('set-password without token shows fallback message', async ({ page }) => {
    const res = await page.goto('/agents/set-password')
    expect(res?.status()).toBeLessThan(500)
    await expect(page.getByText(/requires a valid token/i)).toBeVisible()
  })
})

test.describe('Sales Agent Portal — Auth Redirects', () => {
  const PROTECTED = [
    '/agents/dashboard',
    '/agents/refer',
    '/agents/agreement',
    '/agents/training',
    '/agents/training/about-tct',
    '/agents/training/faq',
  ]

  for (const path of PROTECTED) {
    test(`${path} redirects to /agents/login when unauthenticated`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/agents\/login$/)
    })
  }

  test('/agents (root) redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/agents')
    await expect(page).toHaveURL(/\/agents\/login$/)
  })
})

test.describe('Sales Agent Portal — Admin Pages', () => {
  const ADMIN_PAGES = [
    '/admin/sales-agents',
    '/admin/sales-agents/new',
    '/admin/sales-referrals',
  ]
  for (const path of ADMIN_PAGES) {
    test(`${path} loads without 500`, async ({ page }) => {
      const res = await page.goto(path)
      expect(res?.status()).toBeLessThan(500)
    })
  }
})

test.describe('Sales Agent Portal — API Auth', () => {
  test('GET /api/agent-portal/me returns 401 without session', async ({ request }) => {
    const res = await request.get('/api/agent-portal/me')
    expect(res.status()).toBe(401)
  })

  test('GET /api/agent-portal/referrals returns 401 without session', async ({ request }) => {
    const res = await request.get('/api/agent-portal/referrals')
    expect(res.status()).toBe(401)
  })

  test('GET /api/agent-portal/agreement returns 401 without session', async ({ request }) => {
    const res = await request.get('/api/agent-portal/agreement')
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin/sales-agents returns 401 without staff session', async ({ request }) => {
    const res = await request.get('/api/admin/sales-agents')
    expect(res.status()).toBe(401)
  })

  test('login with bogus credentials returns 401 (not 500)', async ({ request }) => {
    const res = await request.post('/api/agent-portal/login', {
      data: { email: 'definitely-not-a-real-agent@example.com', password: 'nope-not-real-pw-12345' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect([401, 403, 429]).toContain(res.status())
  })
})
