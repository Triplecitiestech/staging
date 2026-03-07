import { test, expect } from '@playwright/test'

/**
 * Reporting system smoke tests.
 *
 * These tests verify that reporting pages load without fatal errors,
 * API endpoints respond correctly, and key UI elements render.
 *
 * Note: These require authentication. When run against a deployed preview
 * without login, some tests will be skipped. When run locally with a
 * dev server and auth bypass, they run fully.
 */

test.describe('Reporting API Endpoints', () => {
  test('dashboard API returns 200 or 401 (not 500)', async ({ request }) => {
    const response = await request.get('/api/reports/dashboard?preset=last_30_days')
    // Must be 200 (authenticated) or 401 (not authenticated) — never 500
    expect([200, 401]).toContain(response.status())
    if (response.status() === 500) {
      const body = await response.json()
      throw new Error(`Dashboard API returned 500: ${body.error || 'unknown error'}`)
    }
  })

  test('selectors API returns 200 or 401 (not 500)', async ({ request }) => {
    const response = await request.get('/api/reports/selectors')
    expect([200, 401]).toContain(response.status())
    if (response.status() === 200) {
      const body = await response.json()
      // If authenticated, verify response shape
      expect(body).toHaveProperty('companies')
      expect(body).toHaveProperty('technicians')
      expect(Array.isArray(body.companies)).toBe(true)
      expect(Array.isArray(body.technicians)).toBe(true)
    }
  })

  test('companies API returns 200 or 401 (not 500)', async ({ request }) => {
    const response = await request.get('/api/reports/companies?preset=last_30_days')
    expect([200, 401]).toContain(response.status())
  })

  test('technicians API returns 200 or 401 (not 500)', async ({ request }) => {
    const response = await request.get('/api/reports/technicians?preset=last_30_days')
    expect([200, 401]).toContain(response.status())
  })

  test('customer-health API returns 200 or 401 (not 500)', async ({ request }) => {
    const response = await request.get('/api/reports/customer-health?preset=last_30_days')
    expect([200, 401]).toContain(response.status())
  })

  test('business-review API returns 200 or 401 (not 500)', async ({ request }) => {
    const response = await request.get('/api/reports/business-review')
    expect([200, 401]).toContain(response.status())
  })
})

test.describe('Reporting Page Rendering', () => {
  test('reporting dashboard page loads without fatal error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/reporting')
    // Should either show the page (200) or redirect to login
    expect(response?.status()).toBeLessThan(500)

    // No fatal JS errors should occur on page load
    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('business review page loads without fatal error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/reporting/business-review')
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('technician report page loads without fatal error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/reporting/technicians')
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('company report page loads without fatal error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/reporting/companies')
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('health report page loads without fatal error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/reporting/health')
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })
})

test.describe('Reporting No Fatal States', () => {
  test('reporting dashboard does not show "Failed to load dashboard data" at page level', async ({ page }) => {
    await page.goto('/admin/reporting')
    // Wait for initial content to render
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    // The old generic error message should not appear
    expect(content).not.toContain('Failed to load dashboard data')
    // If there IS an error, it should be a specific descriptive one
    // (which means the improved error handling is working)
  })

  test('business review page does not render with empty required dropdown and no error', async ({ page }) => {
    await page.goto('/admin/reporting/business-review')
    await page.waitForTimeout(2000)

    const content = await page.textContent('body')
    // The page should load — it shouldn't have an empty company dropdown
    // with no explanation. If companies can't load, an error should appear.
    // We check that the page doesn't have the broken state of an empty
    // dropdown with no error message.
    if (content?.includes('Select company...')) {
      // If we see the dropdown, companies should be loaded OR an error shown
      const hasCompanyOptions = await page.locator('select option').count()
      const hasError = content.includes('Unable to load companies') ||
                       content.includes('No companies') ||
                       content.includes('failed to load') ||
                       hasCompanyOptions > 1 // has real options besides placeholder
      expect(hasError).toBe(true)
    }
  })
})

test.describe('Reporting No Forbidden Colors', () => {
  test('reporting pages do not use yellow/amber classes', async ({ page }) => {
    const pages = [
      '/admin/reporting',
      '/admin/reporting/business-review',
      '/admin/reporting/technicians',
      '/admin/reporting/companies',
      '/admin/reporting/health',
    ]

    for (const path of pages) {
      await page.goto(path)
      const html = await page.content()
      expect(html).not.toMatch(/class="[^"]*yellow-/)
      expect(html).not.toMatch(/class="[^"]*amber-/)
    }
  })
})
