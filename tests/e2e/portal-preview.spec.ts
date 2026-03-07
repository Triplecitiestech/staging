import { test, expect } from '@playwright/test'

test.describe('Customer Portal', () => {
  test('onboarding portal route responds', async ({ page }) => {
    // Use a non-existent company to verify the route handles it gracefully
    const response = await page.goto('/onboarding/test-company-does-not-exist')
    // Should not return 500 — either 404 or a login page
    expect(response?.status()).toBeLessThan(500)
  })

  test('portal does not expose internal data in page source', async ({ page }) => {
    const response = await page.goto('/onboarding/test-company-does-not-exist')
    if (response?.status() === 200) {
      const content = await page.content()
      // Internal notes and system fields should never appear in portal HTML
      expect(content).not.toContain('isInternal')
      expect(content).not.toContain('AutotaskSyncLog')
      expect(content).not.toContain('MIGRATION_SECRET')
    }
  })
})

test.describe('Responsive Layout', () => {
  test('homepage renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
    // Header should still be visible on mobile
    const header = page.locator('header')
    await expect(header).toBeVisible()
  })

  test('homepage renders correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })

  test('homepage renders correctly on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })
})
