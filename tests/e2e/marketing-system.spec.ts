import { test, expect } from '@playwright/test'

/**
 * Marketing & campaigns system tests.
 * Verifies marketing pages and APIs work without crashes.
 */

test.describe('Marketing Admin Pages', () => {
  const pages = [
    '/admin/marketing',
    '/admin/marketing/campaigns',
    '/admin/marketing/audiences',
  ]

  for (const path of pages) {
    test(`${path} loads without 500`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const response = await page.goto(path)
      expect(response?.status()).toBeLessThan(500)

      const criticalErrors = errors.filter(
        (e) => !e.includes('chatgenie') && !e.includes('turnstile')
      )
      expect(criticalErrors).toEqual([])
    })

    test(`${path} does not show error boundary`, async ({ page }) => {
      await page.goto(path)
      await page.waitForTimeout(1500)
      const content = await page.textContent('body')
      expect(content).not.toContain('Something went wrong')
    })

    test(`${path} has no forbidden colors`, async ({ page }) => {
      await page.goto(path)
      const html = await page.content()
      expect(html).not.toMatch(/class="[^"]*\byellow-/)
      expect(html).not.toMatch(/class="[^"]*\bamber-/)
      expect(html).not.toMatch(/class="[^"]*\borange-/)
    })
  }
})

test.describe('Marketing API Health', () => {
  test('audience sources API requires auth (not 500)', async ({ request }) => {
    const response = await request.get('/api/marketing/audiences/sources')
    expect(response.status()).toBeLessThan(500)
  })
})
