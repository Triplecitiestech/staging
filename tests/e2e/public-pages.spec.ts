import { test, expect } from '@playwright/test'

/**
 * Public-facing pages — comprehensive health & rendering tests.
 * Every public page must load without crashes, show real content,
 * have no forbidden colors, and work at all viewports.
 */

const PUBLIC_PAGES = [
  { path: '/', name: 'Homepage' },
  { path: '/services', name: 'Services' },
  { path: '/services/co-managed-it', name: 'Co-Managed IT' },
  { path: '/contact', name: 'Contact' },
  { path: '/blog', name: 'Blog' },
  { path: '/industries', name: 'Industries' },
  { path: '/industries/construction', name: 'Construction' },
  { path: '/industries/healthcare', name: 'Healthcare' },
  { path: '/industries/manufacturing', name: 'Manufacturing' },
  { path: '/industries/professional-services', name: 'Professional Services' },
  { path: '/brand', name: 'Brand' },
  { path: '/livechat', name: 'Live Chat' },
  { path: '/msa', name: 'MSA' },
  { path: '/myglue', name: 'MyGlue' },
  { path: '/rtp', name: 'RTP' },
  { path: '/support', name: 'Support' },
]

test.describe('Public Pages — Load Health', () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) returns 200`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
    })
  }
})

test.describe('Public Pages — No Fatal JS Errors', () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) has no fatal JS errors`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      await page.goto(path)
      await page.waitForTimeout(1500)

      const criticalErrors = errors.filter(
        (e) =>
          !e.includes('chatgenie') &&
          !e.includes('turnstile') &&
          !e.includes('ChunkLoadError')
      )
      expect(criticalErrors).toEqual([])
    })
  }
})

test.describe('Public Pages — No Forbidden Colors', () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) has no yellow/amber/orange`, async ({ page }) => {
      await page.goto(path)
      const html = await page.content()
      expect(html).not.toMatch(/class="[^"]*\byellow-/)
      expect(html).not.toMatch(/class="[^"]*\bamber-/)
      expect(html).not.toMatch(/class="[^"]*\borange-/)
    })
  }
})

test.describe('Public Pages — Responsive (Mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) renders on mobile`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page.locator('body')).toBeVisible()
    })
  }
})

test.describe('Public Pages — Content Checks', () => {
  test('homepage has header and footer', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
  })

  test('contact page has a form', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('form')).toBeVisible()
  })

  test('services page has substantial content', async ({ page }) => {
    await page.goto('/services')
    const content = await page.textContent('body')
    expect(content?.length).toBeGreaterThan(100)
  })
})

test.describe('Public Pages — Security', () => {
  test('pages do not expose server environment variables', async ({ page }) => {
    for (const { path } of PUBLIC_PAGES.slice(0, 5)) {
      await page.goto(path)
      const html = await page.content()
      expect(html).not.toContain('DATABASE_URL')
      expect(html).not.toContain('NEXTAUTH_SECRET')
      expect(html).not.toContain('ANTHROPIC_API_KEY')
    }
  })
})

test.describe('404 Handling', () => {
  test('nonexistent page returns 404', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-12345')
    expect(response?.status()).toBe(404)
  })

  test('nonexistent admin subpage does not return 500', async ({ page }) => {
    const response = await page.goto('/admin/nonexistent-page-12345')
    expect(response?.status()).toBeLessThan(500)
  })
})
