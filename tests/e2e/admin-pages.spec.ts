import { test, expect } from '@playwright/test'

/**
 * Comprehensive admin page health tests.
 * Ensures every admin page loads without server component crashes (500)
 * and never shows the error boundary. These tests catch missing DB columns,
 * broken imports, and other server-side render failures.
 */

const ADMIN_PAGES = [
  '/admin',
  '/admin/contacts',
  '/admin/companies',
  '/admin/projects',
  '/admin/blog',
  '/admin/blog/settings',
  '/admin/marketing',
  '/admin/marketing/campaigns',
  '/admin/marketing/audiences',
  '/admin/reporting',
  '/admin/reporting/business-review',
  '/admin/reporting/technicians',
  '/admin/reporting/companies',
  '/admin/reporting/health',
  '/admin/soc',
]

test.describe('Admin Pages — No Server Crashes', () => {
  for (const path of ADMIN_PAGES) {
    test(`${path} loads without 500`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const response = await page.goto(path)
      // Must not be 500 — either 200 (rendered) or redirect to login
      expect(response?.status()).toBeLessThan(500)

      const criticalErrors = errors.filter(
        (e) =>
          !e.includes('chatgenie') &&
          !e.includes('turnstile') &&
          !e.includes('ChunkLoadError')
      )
      expect(criticalErrors).toEqual([])
    })
  }
})

test.describe('Admin Pages — No Error Boundary', () => {
  for (const path of ADMIN_PAGES) {
    test(`${path} does not show error boundary`, async ({ page }) => {
      await page.goto(path)
      await page.waitForTimeout(1500)
      const content = await page.textContent('body')
      expect(content).not.toContain('Something went wrong')
      expect(content).not.toContain('unexpected error occurred in the admin')
    })
  }
})

test.describe('Admin Pages — No Forbidden Colors', () => {
  for (const path of ADMIN_PAGES) {
    test(`${path} has no yellow/amber/orange classes`, async ({ page }) => {
      await page.goto(path)
      const html = await page.content()
      expect(html).not.toMatch(/class="[^"]*\byellow-/)
      expect(html).not.toMatch(/class="[^"]*\bamber-/)
      expect(html).not.toMatch(/class="[^"]*\borange-/)
    })
  }
})
