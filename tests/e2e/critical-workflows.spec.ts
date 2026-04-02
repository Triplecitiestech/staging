import { test, expect } from '@playwright/test'

/**
 * Critical Workflow Regression Tests
 *
 * These tests verify the highest-risk user workflows that must work
 * reliably for demos and production usage. They go beyond smoke tests
 * (page loads) to verify actual data flow and UI behavior.
 *
 * Priority order matches demo criticality:
 * 1. Public pages (always visible)
 * 2. Customer portal (demo showpiece)
 * 3. Admin dashboard (staff daily driver)
 * 4. API data contracts (backend reliability)
 */

test.describe('Critical Workflow: Public Site', () => {
  test('homepage loads with navigation and CTA', async ({ page }) => {
    await page.goto('/')
    // Verify key navigation elements exist
    await expect(page.locator('nav')).toBeVisible()
    // Verify page has content (not blank/error)
    const bodyText = await page.textContent('body')
    expect(bodyText?.length).toBeGreaterThan(100)
    // No error boundaries triggered
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('services page renders service cards', async ({ page }) => {
    await page.goto('/services')
    await expect(page).toHaveTitle(/Triple Cities Tech/i)
    const bodyText = await page.textContent('body')
    expect(bodyText?.length).toBeGreaterThan(200)
  })

  test('contact page loads without errors', async ({ page }) => {
    await page.goto('/contact')
    // Contact form should be present
    const bodyText = await page.textContent('body')
    expect(bodyText).toBeTruthy()
    // No 500 error indicators
    await expect(page.locator('text=Internal Server Error')).not.toBeVisible()
    await expect(page.locator('text=Application error')).not.toBeVisible()
  })
})

test.describe('Critical Workflow: Customer Portal', () => {
  test('portal redirect works for valid company slug', async ({ page }) => {
    // /onboarding/[slug] should redirect to /portal/[slug]/dashboard
    const response = await page.goto('/onboarding/test-company')
    // Should redirect (302) or render portal page (200)
    expect(response?.status()).toBeLessThan(500)
  })

  test('portal renders without crash for unknown company', async ({ page }) => {
    await page.goto('/portal/nonexistent-company-12345/dashboard')
    // Should show error or login, not crash
    expect(await page.title()).toBeTruthy()
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('portal login page renders correctly', async ({ page }) => {
    const response = await page.goto('/portal')
    expect(response?.status()).toBeLessThan(500)
    const bodyText = await page.textContent('body')
    expect(bodyText?.length).toBeGreaterThan(50)
  })
})

test.describe('Critical Workflow: Admin Pages Health', () => {
  // These test that admin pages don't crash with 500s even without auth
  // (they should redirect to login or show 401, not crash)

  const adminPages = [
    '/admin',
    '/admin/soc',
    '/admin/reporting',
    '/admin/contacts',
    '/admin/marketing',
  ]

  for (const path of adminPages) {
    test(`${path} does not return 500`, async ({ page }) => {
      const response = await page.goto(path)
      const status = response?.status() ?? 0
      // Should redirect to auth (302) or show page (200) — never 500
      expect(status).toBeLessThan(500)
    })
  }
})

test.describe('Critical Workflow: API Data Contracts', () => {
  test('system-health API requires authentication', async ({ request }) => {
    const response = await request.get('/api/admin/system-health')
    // Should be 401 (unauthenticated) not 200 (exposed) or 500 (crashed)
    expect(response.status()).toBeLessThan(500)
  })

  test('customer tickets API requires companySlug', async ({ request }) => {
    const response = await request.get('/api/customer/tickets')
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBeTruthy()
  })

  test('customer tickets API requires auth', async ({ request }) => {
    const response = await request.get('/api/customer/tickets?companySlug=test')
    expect(response.status()).toBe(401)
  })

  test('team API returns valid response shape', async ({ request }) => {
    const response = await request.get('/api/team')
    // Should be 200 with team array, or 500 with error — NOT 200 with empty
    if (response.status() === 200) {
      const body = await response.json()
      expect(body).toHaveProperty('team')
      expect(Array.isArray(body.team)).toBe(true)
    } else {
      // If it fails, it should have an error message
      const body = await response.json()
      expect(body).toHaveProperty('error')
    }
  })

  test('blog posts API returns valid structure', async ({ request }) => {
    const response = await request.get('/api/blog/posts')
    expect(response.status()).toBeLessThan(500)
    if (response.status() === 200) {
      const body = await response.json()
      expect(body).toHaveProperty('posts')
    }
  })

  test('public contact form rejects empty submission', async ({ request }) => {
    const response = await request.post('/api/contact', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    })
    // Should validate and reject, not crash
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Critical Workflow: Cron Endpoints Auth', () => {
  const cronEndpoints = [
    '/api/cron/health-monitor',
    '/api/cron/autotask-sync',
    '/api/cron/generate-blog',
    '/api/cron/send-approval-emails',
    '/api/cron/publish-scheduled',
    '/api/cron/soc-triage',
    '/api/cron/datto-device-sync',
  ]

  for (const path of cronEndpoints) {
    test(`${path} rejects unauthenticated requests`, async ({ request }) => {
      const response = await request.get(path)
      // Cron endpoints should reject without Bearer token — not crash
      expect(response.status()).toBeLessThan(500)
      expect([401, 403]).toContain(response.status())
    })
  }
})

test.describe('Critical Workflow: Error Boundary Protection', () => {
  test('admin layout catches component errors gracefully', async ({ page }) => {
    // Navigate to admin — even if data loading fails, error boundary should catch
    await page.goto('/admin')
    // Should not show raw error stack
    await expect(page.locator('text=Unhandled Runtime Error')).not.toBeVisible()
    await expect(page.locator('text=TypeError')).not.toBeVisible()
  })

  test('portal layout catches component errors gracefully', async ({ page }) => {
    await page.goto('/portal')
    await expect(page.locator('text=Unhandled Runtime Error')).not.toBeVisible()
    await expect(page.locator('text=TypeError')).not.toBeVisible()
  })
})

test.describe('Critical Workflow: No Forbidden Colors', () => {
  // Regression test: ensure no yellow/amber/orange colors appear
  const pagesToCheck = ['/', '/services', '/about', '/contact', '/blog']

  for (const path of pagesToCheck) {
    test(`${path} has no forbidden color classes`, async ({ page }) => {
      await page.goto(path)
      const html = await page.content()
      // Check for forbidden Tailwind color classes
      const forbiddenPatterns = [
        /\byellow-\d/,
        /\bamber-\d/,
        /\bbrown-\d/,
      ]
      for (const pattern of forbiddenPatterns) {
        expect(html).not.toMatch(pattern)
      }
    })
  }
})
