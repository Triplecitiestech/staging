/**
 * Cockpit landing page — unauthenticated regression.
 *
 * The cockpit at /admin/compliance/[companyId] is a server component that
 * calls auth() and redirect('/admin') when there's no session. This spec
 * makes sure an unauthenticated GET never leaks data — the page must
 * either redirect to the admin sign-in or return a non-2xx response.
 *
 * Run via:
 *   PLAYWRIGHT_BASE_URL=https://www.triplecitiestech.com npx playwright test \
 *     tests/e2e/compliance-cockpit.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test'

const SAMPLE_COMPANY_ID = '00000000-0000-0000-0000-000000000000'

test.describe('Compliance Cockpit — Unauthenticated', () => {
  test('GET /admin/compliance/<companyId> redirects unauth users', async ({ page }) => {
    const response = await page.goto(`/admin/compliance/${SAMPLE_COMPANY_ID}`, {
      waitUntil: 'domcontentloaded',
    })
    // The page calls redirect('/admin') server-side, so the final URL should
    // not be the cockpit. Acceptable end-states:
    //   - redirected to /admin (sign-in)
    //   - 403 from the edge host-allowlist (when probed from outside)
    //   - any non-2xx
    if (response) {
      expect(response.status()).toBeLessThan(500)
    }
    // Final URL should never be the cockpit path itself (would mean we leaked
    // the admin page to an unauth visitor).
    expect(page.url()).not.toContain(`/admin/compliance/${SAMPLE_COMPANY_ID}`)
  })

  test('GET /admin/compliance/<companyId> does not expose data in page source', async ({ page }) => {
    await page.goto(`/admin/compliance/${SAMPLE_COMPANY_ID}`, { waitUntil: 'domcontentloaded' })
    const html = await page.content()
    // Sentinels for accidental data leak. None of these strings should appear
    // in the response body for an unauth visitor.
    expect(html.toLowerCase()).not.toContain('bootstrap progress')
    expect(html.toLowerCase()).not.toContain('change queue')
    expect(html.toLowerCase()).not.toContain('needs attention')
  })
})
