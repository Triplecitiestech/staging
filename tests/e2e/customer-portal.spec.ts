import { test, expect } from '@playwright/test'

/**
 * Customer portal smoke tests.
 * Verifies the portal renders correctly, handles auth,
 * and displays key UI elements at all viewport sizes.
 */

test.describe('Customer Portal — Page Health', () => {
  test('portal for nonexistent company returns 404 or error page (not 500)', async ({
    page,
  }) => {
    const response = await page.goto('/onboarding/nonexistent-company-12345')
    expect(response?.status()).toBeLessThan(500)
  })

  test('portal does not leak HTML in error state', async ({ page }) => {
    await page.goto('/onboarding/nonexistent-company-12345')
    await page.waitForTimeout(1500)
    const content = await page.textContent('body')
    // Should not show raw HTML tags or stack traces
    expect(content).not.toMatch(/<div|<span|<script/)
  })

  test('portal does not expose environment variables', async ({ page }) => {
    await page.goto('/onboarding/nonexistent-company-12345')
    const html = await page.content()
    expect(html).not.toContain('DATABASE_URL')
    expect(html).not.toContain('NEXTAUTH_SECRET')
    expect(html).not.toContain('ANTHROPIC_API_KEY')
    expect(html).not.toContain('RESEND_API_KEY')
    expect(html).not.toContain('AZURE_AD_CLIENT_SECRET')
  })
})

test.describe('Customer Portal — Responsive Viewports', () => {
  const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]

  for (const viewport of viewports) {
    test(`portal loads at ${viewport.name} (${viewport.width}px) without crash`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const response = await page.goto('/onboarding/test-company')
      expect(response?.status()).toBeLessThan(500)

      const criticalErrors = errors.filter(
        (e) => !e.includes('chatgenie') && !e.includes('turnstile')
      )
      expect(criticalErrors).toEqual([])
    })
  }
})

test.describe('Customer Portal — Auth Flow', () => {
  test('login with wrong password returns error (not crash)', async ({ request }) => {
    const response = await request.post('/api/onboarding/auth', {
      data: { companySlug: 'test-company', password: 'wrongpassword' },
    })
    expect(response.status()).toBeLessThan(500)
    const body = await response.json()
    // Should have an error message, not a stack trace
    if (response.status() !== 200) {
      expect(body.error || body.message).toBeDefined()
    }
  })

  test('logout endpoint works without session', async ({ request }) => {
    const response = await request.post('/api/onboarding/logout')
    expect(response.status()).toBeLessThan(500)
  })

  test('data endpoint without auth returns error (not crash)', async ({ request }) => {
    const response = await request.get('/api/onboarding/data?company=test')
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Customer Portal — No Forbidden Colors', () => {
  test('portal page does not use yellow/amber/orange', async ({ page }) => {
    await page.goto('/onboarding/test-company')
    const html = await page.content()
    expect(html).not.toMatch(/class="[^"]*\byellow-/)
    expect(html).not.toMatch(/class="[^"]*\bamber-/)
    expect(html).not.toMatch(/class="[^"]*\borange-/)
  })
})
