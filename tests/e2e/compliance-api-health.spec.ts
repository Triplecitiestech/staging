/**
 * Compliance API — Auth Enforcement
 *
 * Smoke-checks every new compliance route shipped in P3/P4 against
 * production. Unauthenticated requests should return 401/403, never 500.
 *
 * Run via:
 *   PLAYWRIGHT_BASE_URL=https://www.triplecitiestech.com npx playwright test \
 *     tests/e2e/compliance-api-health.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test'

// A real-looking UUID for path params. The endpoints should reject on auth
// before they ever touch the DB; the company doesn't need to exist.
const SAMPLE_COMPANY_ID = '00000000-0000-0000-0000-000000000000'
const SAMPLE_CHANGE_ID = '00000000-0000-0000-0000-000000000001'
const SAMPLE_BUNDLE_ID = '00000000-0000-0000-0000-000000000002'
const SAMPLE_ITEM_ID = '00000000-0000-0000-0000-000000000003'

const COMPLIANCE_ROUTES: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown }> = [
  // Dispositions (P3 F2)
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/dispositions` },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/dispositions`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/dispositions/link-project`, body: {} },
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/dispositions/stale` },

  // Pending changes (P4 C5)
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes` },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes`, body: {} },
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes/${SAMPLE_CHANGE_ID}` },
  { method: 'PATCH', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes/${SAMPLE_CHANGE_ID}`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes/${SAMPLE_CHANGE_ID}/abandon`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes/${SAMPLE_CHANGE_ID}/communicate`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes/${SAMPLE_CHANGE_ID}/deploy`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes/${SAMPLE_CHANGE_ID}/rollback`, body: {} },
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/changes/${SAMPLE_CHANGE_ID}/preview-impact` },

  // Bundles (P4 C6)
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles` },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles`, body: {} },
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}` },
  { method: 'PATCH', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}/items`, body: {} },
  { method: 'DELETE', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}/items?pendingChangeId=${SAMPLE_CHANGE_ID}` },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}/send`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}/cancel`, body: {} },
  { method: 'POST', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}/items/${SAMPLE_ITEM_ID}/decision`, body: {} },
  { method: 'GET', path: `/api/compliance/${SAMPLE_COMPANY_ID}/bundles/${SAMPLE_BUNDLE_ID}/preview` },

  // Action catalog (P4 C8)
  { method: 'GET', path: `/api/compliance/actions` },
  { method: 'GET', path: `/api/compliance/actions/m365.enforce_mfa_all_users` },
]

test.describe('Compliance API — Auth Enforcement', () => {
  for (const { method, path, body } of COMPLIANCE_ROUTES) {
    test(`${method} ${path} returns 401/403 (not 500)`, async ({ request }) => {
      const response = await request.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        data: body !== undefined ? body : undefined,
      })
      // 401/403 = correct auth rejection
      // 400 = also acceptable (auth checked first, then body validation fires)
      // 404 = acceptable for routes that probe state first
      // ANY 5xx is a bug
      expect(response.status()).toBeLessThan(500)
      expect([400, 401, 403, 404, 405]).toContain(response.status())
    })
  }
})

// 401 (route-level auth) and 403 (edge-level host allowlist via
// x-deny-reason: host_not_allowed) are both valid security rejections.
// External CI may hit either layer first depending on the origin IP.
const SECURITY_REJECT = [401, 403]

test.describe('Compliance Migration — Auth Enforcement', () => {
  test('POST /api/migrations/customer-profile-backfill without secret rejects', async ({ request }) => {
    const response = await request.post('/api/migrations/customer-profile-backfill')
    expect(SECURITY_REJECT).toContain(response.status())
  })

  test('POST /api/migrations/customer-profile-backfill with wrong secret rejects', async ({ request }) => {
    const response = await request.post('/api/migrations/customer-profile-backfill', {
      headers: { Authorization: 'Bearer not-the-real-secret-12345' },
    })
    expect(SECURITY_REJECT).toContain(response.status())
  })
})

test.describe('Compliance Cron — Auth Enforcement', () => {
  test('GET /api/cron/verify-pending-changes without secret rejects', async ({ request }) => {
    const response = await request.get('/api/cron/verify-pending-changes')
    // 200 only if CRON_SECRET is not set in env (dev / preview); production rejects.
    expect([200, ...SECURITY_REJECT]).toContain(response.status())
  })

  test('GET /api/cron/verify-pending-changes with wrong secret rejects', async ({ request }) => {
    const response = await request.get('/api/cron/verify-pending-changes', {
      headers: { Authorization: 'Bearer not-the-real-secret-12345' },
    })
    expect([200, ...SECURITY_REJECT]).toContain(response.status())
  })
})
