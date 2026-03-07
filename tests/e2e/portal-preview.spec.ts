import { test, expect } from '@playwright/test'

test.describe('Customer Portal', () => {
  test('onboarding route handles non-existent company gracefully', async ({ page }) => {
    const response = await page.goto('/onboarding/test-company-does-not-exist')
    // Should not return 500
    expect(response?.status()).toBeLessThan(500)
  })

  test('portal page does not leak internal data in HTML', async ({ page }) => {
    const response = await page.goto('/onboarding/test-company-does-not-exist')
    if (response?.status() === 200) {
      const content = await page.content()
      // Internal system fields should never appear in portal HTML
      expect(content).not.toContain('isInternal')
      expect(content).not.toContain('AutotaskSyncLog')
      expect(content).not.toContain('MIGRATION_SECRET')
      expect(content).not.toContain('NEXTAUTH_SECRET')
      expect(content).not.toContain('ANTHROPIC_API_KEY')
      expect(content).not.toContain('AUTOTASK_API_SECRET')
    }
  })

  test('portal does not expose env vars in page source', async ({ page }) => {
    await page.goto('/')
    const content = await page.content()
    expect(content).not.toContain('NEXTAUTH_SECRET')
    expect(content).not.toContain('DATABASE_URL')
    expect(content).not.toContain('RESEND_API_KEY')
  })
})

test.describe('Responsive Layout — Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('homepage renders on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('body')).toBeVisible()
  })

  test('contact page form is usable on mobile', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('form')).toBeVisible()
    // Form should be within viewport width
    const formBox = await page.locator('form').boundingBox()
    if (formBox) {
      expect(formBox.width).toBeLessThanOrEqual(375)
    }
  })
})

test.describe('Responsive Layout — Tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('homepage renders on tablet', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
  })
})

test.describe('Responsive Layout — Desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('homepage renders on desktop', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
  })
})
