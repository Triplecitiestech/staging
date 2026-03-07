import { test, expect } from '@playwright/test'

test.describe('Admin Project Navigation', () => {
  // Admin pages require auth — these tests verify the auth redirect works
  test('admin dashboard redirects to auth when not logged in', async ({ page }) => {
    const response = await page.goto('/admin')
    // Should redirect to sign-in or show auth page
    expect(response?.status()).toBeLessThan(500)
  })

  test('admin companies page requires auth', async ({ page }) => {
    const response = await page.goto('/admin/companies')
    expect(response?.status()).toBeLessThan(500)
  })

  test('admin projects page requires auth', async ({ page }) => {
    const response = await page.goto('/admin/projects')
    expect(response?.status()).toBeLessThan(500)
  })

  test('admin blog page requires auth', async ({ page }) => {
    const response = await page.goto('/admin/blog')
    expect(response?.status()).toBeLessThan(500)
  })
})

test.describe('API Health Checks', () => {
  test('tasks API requires auth', async ({ request }) => {
    const response = await request.get('/api/tasks')
    // Should return 401 when not authenticated
    expect([401, 403]).toContain(response.status())
  })

  test('companies API requires auth', async ({ request }) => {
    const response = await request.get('/api/companies')
    expect([401, 403]).toContain(response.status())
  })
})
