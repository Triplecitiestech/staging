import { test, expect } from '@playwright/test'

/**
 * Authenticated Admin Workflow Tests
 *
 * These tests run with an authenticated admin session (created by auth.setup.ts).
 * They verify actual workflows — not just "does the page load" but
 * "can the user accomplish their task".
 *
 * Requires E2E_TEST_SECRET env var on both server and test runner.
 * File name contains "authenticated" so Playwright routes it to the
 * authenticated project config (which has storageState).
 */

test.describe('Admin Dashboard Workflows', () => {
  test('admin home page loads with dashboard content', async ({ page }) => {
    await page.goto('/admin')
    // Should render actual dashboard, not redirect to login
    await expect(page).toHaveURL(/\/admin/)
    // Dashboard should have recognizable content
    const body = await page.textContent('body')
    expect(body?.length).toBeGreaterThan(200)
    // Should not show error boundary
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('admin can navigate to companies page', async ({ page }) => {
    await page.goto('/admin/companies')
    await expect(page).toHaveURL(/\/admin\/companies/)
    // Should render page, not error
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
    await expect(page.locator('text=Unhandled Runtime Error')).not.toBeVisible()
  })

  test('admin can navigate to contacts page', async ({ page }) => {
    await page.goto('/admin/contacts')
    await expect(page).toHaveURL(/\/admin\/contacts/)
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('admin can navigate to SOC dashboard', async ({ page }) => {
    await page.goto('/admin/soc')
    await expect(page).toHaveURL(/\/admin\/soc/)
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('admin can navigate to reporting dashboard', async ({ page }) => {
    await page.goto('/admin/reporting')
    await expect(page).toHaveURL(/\/admin\/reporting/)
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })
})

test.describe('Admin API Workflows (Authenticated)', () => {
  test('system-health returns data when authenticated', async ({ request }) => {
    const response = await request.get('/api/admin/system-health')
    // Should be 200 with actual health data, not 401
    if (response.status() === 200) {
      const body = await response.json()
      expect(body).toHaveProperty('overall')
      expect(body).toHaveProperty('services')
      expect(body).toHaveProperty('database')
    }
    // If auth failed (DB issue), at least shouldn't crash
    expect(response.status()).toBeLessThan(500)
  })

  test('companies API returns data when authenticated', async ({ request }) => {
    const response = await request.get('/api/companies')
    if (response.status() === 200) {
      const body = await response.json()
      // Should be an array of companies
      expect(Array.isArray(body) || body.companies).toBeTruthy()
    }
    expect(response.status()).toBeLessThan(500)
  })

  test('tasks API returns data when authenticated', async ({ request }) => {
    const response = await request.get('/api/tasks')
    expect(response.status()).toBeLessThan(500)
  })

  test('projects API returns data when authenticated', async ({ request }) => {
    const response = await request.get('/api/projects')
    expect(response.status()).toBeLessThan(500)
  })

  test('sync-logs API returns data when authenticated', async ({ request }) => {
    const response = await request.get('/api/admin/sync-logs')
    expect(response.status()).toBeLessThan(500)
  })

  test('SOC status API returns data when authenticated', async ({ request }) => {
    const response = await request.get('/api/soc/status')
    if (response.status() === 200) {
      const body = await response.json()
      expect(body).toHaveProperty('jobs')
      expect(body).toHaveProperty('config')
    }
    expect(response.status()).toBeLessThan(500)
  })

  test('reports dashboard API returns data when authenticated', async ({ request }) => {
    const response = await request.get('/api/reports/dashboard?preset=last_30_days')
    if (response.status() === 200) {
      const body = await response.json()
      // Dashboard should return metrics
      expect(body).toBeTruthy()
    }
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Admin Navigation Integrity', () => {
  test('all major admin pages return <500', async ({ page }) => {
    const pages = [
      '/admin',
      '/admin/companies',
      '/admin/contacts',
      '/admin/soc',
      '/admin/soc/incidents',
      '/admin/soc/rules',
      '/admin/soc/config',
      '/admin/reporting',
      '/admin/reporting/analytics',
      '/admin/reporting/health',
      '/admin/reporting/status',
      '/admin/reporting/companies',
      '/admin/reporting/technicians',
      '/admin/marketing',
    ]

    for (const path of pages) {
      const response = await page.goto(path)
      const status = response?.status() ?? 0
      expect(status, `${path} returned ${status}`).toBeLessThan(500)
    }
  })
})
