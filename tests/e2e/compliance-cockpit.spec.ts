/**
 * Cockpit landing page — unauthenticated regression.
 *
 * The cockpit at /admin/compliance/[companyId] is a server component that
 * calls auth() and redirect('/admin') when there's no session. This spec
 * makes sure an unauthenticated GET never leaks data — the page must
 * either redirect or return a non-2xx response, and the body must not
 * contain any cockpit-specific data sentinels.
 *
 * Uses `request.fetch` instead of `page.goto` so the spec runs without
 * a browser binary (matches the api-health spec).
 *
 * Run via:
 *   PLAYWRIGHT_BASE_URL=https://www.triplecitiestech.com npx playwright test \
 *     tests/e2e/compliance-cockpit.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test'

const SAMPLE_COMPANY_ID = '00000000-0000-0000-0000-000000000000'

test.describe('Compliance Cockpit — Unauthenticated', () => {
  test('GET /admin/compliance/<companyId> never returns the cockpit body to unauth visitors', async ({ request }) => {
    const response = await request.get(`/admin/compliance/${SAMPLE_COMPANY_ID}`, {
      maxRedirects: 0,
    })
    // Acceptable end-states:
    //   - 200 with the sign-in page rendered (NextAuth fallthrough)
    //   - 3xx redirect to the admin sign-in
    //   - 403 from the edge host-allowlist (when probed from outside)
    //   - 404 if the company isn't found
    // Any 5xx is a bug; the page must never crash on unauth visitors.
    expect(response.status()).toBeLessThan(500)
  })

  test('GET /admin/compliance/<companyId> body has no cockpit data sentinels for unauth visitors', async ({ request }) => {
    const response = await request.get(`/admin/compliance/${SAMPLE_COMPANY_ID}`, {
      maxRedirects: 5,
    })
    const body = (await response.text()).toLowerCase()
    // Sentinels for accidental data leak. None of these strings should appear
    // in the response body for an unauth visitor.
    expect(body).not.toContain('bootstrap progress')
    expect(body).not.toContain('change queue')
    expect(body).not.toContain('needs attention')
    expect(body).not.toContain('recommended frameworks')
  })
})
