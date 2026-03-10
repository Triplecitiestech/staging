import { test, expect } from '@playwright/test'

/**
 * Blog system e2e tests.
 * Verifies blog pages, admin blog management, and blog APIs
 * all function without crashes.
 */

test.describe('Public Blog Pages', () => {
  test('blog listing page renders', async ({ page }) => {
    const response = await page.goto('/blog')
    expect(response?.status()).toBe(200)
    await expect(page.locator('body')).toBeVisible()
  })

  test('blog listing has no fatal JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/blog')
    await page.waitForTimeout(1500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('blog page for nonexistent slug returns 404', async ({ page }) => {
    const response = await page.goto('/blog/this-post-does-not-exist-12345')
    expect(response?.status()).toBe(404)
  })

  test('blog setup page renders', async ({ page }) => {
    const response = await page.goto('/blog/setup')
    expect(response?.status()).toBe(200)
  })
})

test.describe('Admin Blog Pages', () => {
  test('admin blog page loads without 500', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/blog')
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('admin blog page does not show error boundary', async ({ page }) => {
    await page.goto('/admin/blog')
    await page.waitForTimeout(1500)
    const content = await page.textContent('body')
    expect(content).not.toContain('Something went wrong')
  })

  test('admin blog settings page loads without 500', async ({ page }) => {
    const response = await page.goto('/admin/blog/settings')
    expect(response?.status()).toBeLessThan(500)
  })

  test('admin blog edit page for nonexistent post handles gracefully', async ({ page }) => {
    const response = await page.goto('/admin/blog/nonexistent-id/edit')
    expect(response?.status()).toBeLessThan(500)
  })
})

test.describe('Blog API Health', () => {
  test('blog test endpoint works', async ({ request }) => {
    const response = await request.get('/api/test/blog-system')
    expect(response.status()).toBeLessThan(500)
  })

  test('blog approval with invalid token fails gracefully', async ({ request }) => {
    const response = await request.get('/api/blog/approve?token=invalid-token-12345')
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Blog Pages — No Forbidden Colors', () => {
  test('blog pages do not use yellow/amber/orange', async ({ page }) => {
    const pages = ['/blog', '/admin/blog']
    for (const path of pages) {
      await page.goto(path)
      const html = await page.content()
      expect(html).not.toMatch(/class="[^"]*\byellow-/)
      expect(html).not.toMatch(/class="[^"]*\bamber-/)
      expect(html).not.toMatch(/class="[^"]*\borange-/)
    }
  })
})
