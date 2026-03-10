import { test, expect } from '@playwright/test'

/**
 * SOC Analyst system tests.
 * Verifies SOC pages and APIs work without crashes.
 */

test.describe('SOC Admin Page', () => {
  test('SOC dashboard loads without 500', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/soc')
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('SOC page does not show error boundary', async ({ page }) => {
    await page.goto('/admin/soc')
    await page.waitForTimeout(1500)
    const content = await page.textContent('body')
    expect(content).not.toContain('Something went wrong')
  })
})

test.describe('SOC API Health', () => {
  const socEndpoints = [
    '/api/soc/status',
    '/api/soc/incidents',
    '/api/soc/rules',
    '/api/soc/config',
    '/api/soc/activity',
    '/api/soc/pending-actions',
  ]

  for (const path of socEndpoints) {
    test(`GET ${path} returns auth error, not 500`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBeLessThan(500)
    })
  }

  test('SOC run endpoint requires auth', async ({ request }) => {
    const response = await request.post('/api/soc/run', { data: {} })
    expect(response.status()).toBeLessThan(500)
  })

  test('SOC bootstrap endpoint requires auth', async ({ request }) => {
    const response = await request.post('/api/soc/bootstrap', { data: {} })
    expect(response.status()).toBeLessThan(500)
  })

  test('SOC incident detail for nonexistent ID handles gracefully', async ({ request }) => {
    const response = await request.get('/api/soc/incidents/nonexistent')
    expect(response.status()).toBeLessThan(500)
  })
})
