import { test, expect, type Page } from '@playwright/test'

/**
 * The ChatGenie messenger bubble and the Apollo website tracker belong to the
 * PUBLIC site. They are rendered by `src/components/MarketingScripts.tsx`,
 * which returns nothing under /field (the Contractor Portal — plain white
 * pages, no site chrome, no tracking of subcontractors).
 *
 * These tests assert on the REQUESTS the browser issues, not on the response,
 * because the third-party hosts may be unreachable from the test runner. A
 * request event fires either way.
 */

const THIRD_PARTY_HOSTS = ['messenger.chatgenie.io', 'assets.apollo.io']

async function thirdPartyHostsRequested(page: Page, path: string): Promise<{ status: number | undefined; hosts: string[] }> {
  const hosts = new Set<string>()
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname
    if (THIRD_PARTY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) hosts.add(host)
  })
  const response = await page.goto(path)
  // ChatGenie attaches its loader on window `load`; give it time to fire.
  await page.waitForTimeout(3000)
  return { status: response?.status(), hosts: [...hosts].sort() }
}

test.describe('Marketing scripts — public site', () => {
  for (const path of ['/', '/about', '/contact']) {
    test(`${path} still loads ChatGenie and Apollo`, async ({ page }) => {
      const { status, hosts } = await thirdPartyHostsRequested(page, path)
      expect(status).toBe(200)
      expect(hosts).toEqual(['assets.apollo.io', 'messenger.chatgenie.io'])
    })
  }
})

test.describe('Marketing scripts — Contractor Portal (/field)', () => {
  for (const path of ['/field/login', '/field']) {
    test(`${path} loads neither ChatGenie nor Apollo`, async ({ page }) => {
      const probe = await page.request.get(path, { maxRedirects: 0 })
      // The Contractor Portal ships on its own branch. Until it is on the build
      // under test, /field/* is the statically prerendered 404 page, whose
      // pathname is fixed at build time as /_not-found — nothing to gate.
      test.skip(probe.status() === 404, 'Contractor Portal routes are not on this build')

      const { hosts } = await thirdPartyHostsRequested(page, path)
      expect(page.url()).toContain('/field/login')
      expect(hosts).toEqual([])
      const inline = await page.evaluate(() =>
        Array.from(document.querySelectorAll('script:not([src])')).map((s) => s.textContent || ''),
      )
      expect(inline.some((t) => t.includes('chatgenie') || t.includes('apollo.io'))).toBe(false)
    })
  }
})
