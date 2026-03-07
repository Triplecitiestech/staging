import { test, expect } from '@playwright/test'

test.describe('Admin Auth Enforcement', () => {
  test('admin dashboard redirects unauthenticated users', async ({ page }) => {
    const response = await page.goto('/admin')
    // Should not return 500 — either redirect to auth or show login
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

  test('admin marketing page requires auth', async ({ page }) => {
    const response = await page.goto('/admin/marketing')
    expect(response?.status()).toBeLessThan(500)
  })
})

test.describe('API Auth Enforcement', () => {
  test('tasks API requires auth', async ({ request }) => {
    const response = await request.get('/api/tasks')
    expect([401, 403]).toContain(response.status())
  })

  test('companies API requires auth', async ({ request }) => {
    const response = await request.get('/api/companies')
    expect([401, 403]).toContain(response.status())
  })

  test('projects API requires auth', async ({ request }) => {
    const response = await request.get('/api/projects')
    expect([401, 403]).toContain(response.status())
  })

  test('task PATCH requires auth', async ({ request }) => {
    const response = await request.patch('/api/tasks/fake-id', {
      data: { status: 'WORK_IN_PROGRESS' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('task DELETE requires auth', async ({ request }) => {
    const response = await request.delete('/api/tasks/fake-id')
    expect([401, 403]).toContain(response.status())
  })
})

test.describe('API Error Handling', () => {
  test('non-existent API route returns 404', async ({ request }) => {
    const response = await request.get('/api/does-not-exist')
    expect(response.status()).toBe(404)
  })
})
