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

// Pages that should never reveal data to unauth visitors.
const COCKPIT_PAGES: Array<{ path: string; sentinels: string[] }> = [
  {
    path: `/admin/compliance/${SAMPLE_COMPANY_ID}`,
    sentinels: ['bootstrap progress', 'change queue', 'needs attention', 'recommended frameworks'],
  },
  {
    path: `/admin/compliance/${SAMPLE_COMPANY_ID}/findings`,
    sentinels: ['accepted-risk rationale', 'lifecycle status', 'internal notes (staff only)'],
  },
  {
    path: `/admin/compliance/${SAMPLE_COMPANY_ID}/assessments`,
    sentinels: ['run another framework', 're-run', 'compliance evidence engine'],
  },
  {
    path: `/admin/compliance/${SAMPLE_COMPANY_ID}/changes`,
    sentinels: ['change queue', 'pending changes', 'new bundle'],
  },
  {
    path: `/admin/compliance/${SAMPLE_COMPANY_ID}/changes/new`,
    sentinels: ['bundle title (internal)', 'customer-facing intro', 'create bundle'],
  },
  {
    path: `/admin/compliance/${SAMPLE_COMPANY_ID}/connections`,
    sentinels: ['integration connections', 'tool inventory', 'platform mappings'],
  },
  {
    path: `/admin/compliance/${SAMPLE_COMPANY_ID}/policies`,
    sentinels: ['policy library', 'ai-generated', 'pending generation'],
  },
  {
    path: `/admin/compliance/diagnostics`,
    sentinels: ['compliance diagnostics', 'schema presence', 'connector errors', 'stuck in'],
  },
]

test.describe('Compliance Cockpit — Unauthenticated', () => {
  for (const { path, sentinels } of COCKPIT_PAGES) {
    test(`GET ${path} returns < 500`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      // Acceptable end-states:
      //   - 200 with the sign-in page (NextAuth fallthrough)
      //   - 3xx redirect to the admin sign-in
      //   - 403 from the edge host-allowlist (when probed from outside)
      //   - 404 if the company isn't found
      // Any 5xx is a bug; the page must never crash on unauth visitors.
      expect(response.status()).toBeLessThan(500)
    })

    test(`GET ${path} body has no data sentinels for unauth visitors`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 5 })
      const body = (await response.text()).toLowerCase()
      for (const sentinel of sentinels) {
        expect(body, `sentinel "${sentinel}" should not appear in unauth response body`).not.toContain(sentinel)
      }
    })
  }
})
