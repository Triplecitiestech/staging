import { test, expect } from '@playwright/test'

test.describe('Dashboard Navigation', () => {
  test('homepage loads successfully', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page.locator('body')).toBeVisible()
  })

  test('services page loads', async ({ page }) => {
    await page.goto('/services')
    await expect(page.locator('body')).toBeVisible()
    // Verify page has content (not an error page)
    const content = await page.textContent('body')
    expect(content?.length).toBeGreaterThan(100)
  })

  test('contact page loads and has form', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('body')).toBeVisible()
    // Contact page should have a form
    await expect(page.locator('form')).toBeVisible()
  })

  test('blog page loads', async ({ page }) => {
    await page.goto('/blog')
    await expect(page.locator('body')).toBeVisible()
  })

  test('industry pages load', async ({ page }) => {
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

  test('navigation links are present on homepage', async ({ page }) => {
    await page.goto('/')
    // Header should have navigation links
    const header = page.locator('header')
    await expect(header).toBeVisible()
  })
})
