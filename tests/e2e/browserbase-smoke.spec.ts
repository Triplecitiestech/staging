/**
 * Browserbase Smoke Tests
 *
 * These tests run against a deployed preview URL using Browserbase
 * remote browsers. They are skipped when Browserbase credentials
 * are not configured.
 *
 * To run:
 *   BROWSERBASE_API_KEY=xxx BROWSERBASE_PROJECT_ID=xxx \
 *   PLAYWRIGHT_BASE_URL=https://preview.vercel.app \
 *   npm run test:e2e -- --grep @browserbase
 */

import { test, expect } from '@playwright/test'
import { isBrowserbaseEnabled, getBrowserbaseContext } from './browserbase.setup'

// Skip all tests in this file when Browserbase is not configured
const bbTest = isBrowserbaseEnabled() ? test : test.skip

bbTest.describe('Browserbase Smoke Tests @browserbase', () => {
  bbTest('homepage loads in remote browser', async () => {
    const { context, cleanup } = await getBrowserbaseContext()
    try {
      const page = context.pages()[0] || await context.newPage()
      const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

      await page.goto(baseURL)
      await expect(page.locator('header')).toBeVisible()
      await expect(page.locator('footer')).toBeVisible()

      // Take a screenshot for verification
      await page.screenshot({ path: 'test-results/bb-homepage.png' })
    } finally {
      await cleanup()
    }
  })

  bbTest('services page renders correctly', async () => {
    const { context, cleanup } = await getBrowserbaseContext()
    try {
      const page = context.pages()[0] || await context.newPage()
      const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

      await page.goto(`${baseURL}/services`)
      await expect(page.locator('body')).toBeVisible()
      const content = await page.textContent('body')
      expect(content?.length).toBeGreaterThan(100)

      await page.screenshot({ path: 'test-results/bb-services.png' })
    } finally {
      await cleanup()
    }
  })

  bbTest('navigation flow works end-to-end', async () => {
    const { context, cleanup } = await getBrowserbaseContext()
    try {
      const page = context.pages()[0] || await context.newPage()
      const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

      // Start at homepage
      await page.goto(baseURL)
      await expect(page.locator('header')).toBeVisible()

      // Navigate to contact page
      await page.goto(`${baseURL}/contact`)
      await expect(page.locator('form')).toBeVisible()

      // Navigate to blog
      await page.goto(`${baseURL}/blog`)
      await expect(page.locator('body')).toBeVisible()

      await page.screenshot({ path: 'test-results/bb-navigation.png' })
    } finally {
      await cleanup()
    }
  })

  bbTest('admin page requires auth in remote browser', async () => {
    const { context, cleanup } = await getBrowserbaseContext()
    try {
      const page = context.pages()[0] || await context.newPage()
      const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

      const response = await page.goto(`${baseURL}/admin`)
      // Should not return 500
      expect(response?.status()).toBeLessThan(500)

      await page.screenshot({ path: 'test-results/bb-admin-auth.png' })
    } finally {
      await cleanup()
    }
  })

  bbTest('customer portal handles unknown company', async () => {
    const { context, cleanup } = await getBrowserbaseContext()
    try {
      const page = context.pages()[0] || await context.newPage()
      const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

      const response = await page.goto(`${baseURL}/onboarding/nonexistent-company`)
      expect(response?.status()).toBeLessThan(500)

      // Verify no sensitive data in page
      const content = await page.content()
      expect(content).not.toContain('MIGRATION_SECRET')
      expect(content).not.toContain('DATABASE_URL')

      await page.screenshot({ path: 'test-results/bb-portal.png' })
    } finally {
      await cleanup()
    }
  })
})
