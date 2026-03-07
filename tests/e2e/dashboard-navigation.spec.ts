import { test, expect } from '@playwright/test'

test.describe('Public Page Rendering', () => {
  test('homepage loads with header and footer', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
  })

  test('services page loads with content', async ({ page }) => {
    await page.goto('/services')
    await expect(page.locator('body')).toBeVisible()
    const content = await page.textContent('body')
    expect(content?.length).toBeGreaterThan(100)
  })

  test('contact page loads with form', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('form')).toBeVisible()
  })

  test('blog page loads', async ({ page }) => {
    const response = await page.goto('/blog')
    expect(response?.status()).toBe(200)
    await expect(page.locator('body')).toBeVisible()
  })

  test('industry pages all return 200', async ({ page }) => {
    const industries = [
      '/industries/healthcare',
      '/industries/manufacturing',
      '/industries/construction',
      '/industries/professional-services',
    ]
    for (const path of industries) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
    }
  })
})

test.describe('Navigation', () => {
  test('header navigation links are present', async ({ page }) => {
    await page.goto('/')
    const header = page.locator('header')
    await expect(header).toBeVisible()
    // Header should contain clickable links
    const links = header.locator('a')
    expect(await links.count()).toBeGreaterThan(0)
  })

  test('footer contains company info', async ({ page }) => {
    await page.goto('/')
    const footer = page.locator('footer')
    await expect(footer).toBeVisible()
  })

  test('clicking a navigation link navigates to target', async ({ page }) => {
    await page.goto('/')
    // Find a services link in header or body and click it
    const servicesLink = page.locator('a[href="/services"]').first()
    if (await servicesLink.isVisible()) {
      await servicesLink.click()
      await page.waitForURL('**/services')
      expect(page.url()).toContain('/services')
    }
  })
})

test.describe('No Console Errors on Public Pages', () => {
  test('homepage has no JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter out known third-party errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })
})

test.describe('No Forbidden Colors in Public Pages', () => {
  test('homepage does not use yellow/amber classes', async ({ page }) => {
    await page.goto('/')
    const html = await page.content()
    // Check that forbidden Tailwind color classes are not present
    expect(html).not.toMatch(/class="[^"]*yellow-/)
    expect(html).not.toMatch(/class="[^"]*amber-/)
  })
})
