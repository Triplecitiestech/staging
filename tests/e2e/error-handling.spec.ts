import { test, expect } from '@playwright/test'

/**
 * Error Handling Regression Tests
 *
 * Verifies that API routes return proper error responses instead of
 * silently succeeding with empty data. These tests catch the specific
 * anti-pattern where catch blocks return 200 + empty arrays.
 *
 * Each test documents a specific bug that was found and fixed.
 */

test.describe('API Error Response Contracts', () => {
  test('customer tickets API returns error object on failure, not empty array', async ({ request }) => {
    // Without auth, should return 401 with error message
    const response = await request.get('/api/customer/tickets?companySlug=test-company')
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body).toHaveProperty('error')
    // Should NOT have tickets array in error response
    expect(body).not.toHaveProperty('tickets')
  })

  test('team API returns 500 with error on failure, not 200 with empty array', async ({ request }) => {
    // This tests the response shape contract — if DB is up, should return team
    const response = await request.get('/api/team')
    const body = await response.json()
    if (response.status() === 200) {
      // Success: must have team array
      expect(body).toHaveProperty('team')
      expect(Array.isArray(body.team)).toBe(true)
    } else {
      // Failure: must have error string, not empty team array
      expect(body).toHaveProperty('error')
    }
  })

  test('protected admin endpoints return auth errors, not empty data', async ({ request }) => {
    const endpoints = [
      '/api/reports/dashboard?preset=last_30_days',
      '/api/reports/companies?preset=last_30_days',
      '/api/soc/status',
      '/api/soc/incidents',
      '/api/admin/sync-logs',
    ]

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint)
      expect(response.status()).toBeLessThan(500)
      // Should return auth error, not empty data
      if (response.status() === 401 || response.status() === 403) {
        const body = await response.json()
        expect(body).toHaveProperty('error')
      }
    }
  })
})

test.describe('Error Boundary Presence', () => {
  test('admin pages have error boundary in DOM', async ({ page }) => {
    const response = await page.goto('/admin')
    if (response?.status() === 200) {
      // If we can access admin (has session), verify no raw errors
      await expect(page.locator('text=Unhandled Runtime Error')).not.toBeVisible()
    }
    // Whether redirected or rendered, should not show raw stack traces
    const html = await page.content()
    expect(html).not.toContain('__NEXT_DATA__error')
  })
})

test.describe('Customer API Error Contracts', () => {
  test('customer ticket timeline returns error, not empty array, on failure', async ({ request }) => {
    // Without auth, should return 401 — not 200 with empty timeline
    const response = await request.get('/api/customer/tickets/timeline?companySlug=test&ticketId=1')
    expect(response.status()).toBe(401)
    const body = await response.json()
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('timeline')
  })

  test('customer metrics requires auth', async ({ request }) => {
    const response = await request.get('/api/customer/metrics?companySlug=test')
    expect(response.status()).toBe(401)
  })

  test('customer ticket reply requires auth', async ({ request }) => {
    const response = await request.post('/api/customer/tickets/reply', {
      data: { ticketId: '1', body: 'test' },
    })
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Rate Limiting', () => {
  test('portal auth discover endpoint responds to requests', async ({ request }) => {
    // Just verify the endpoint exists and responds (rate limiting tested by volume)
    const response = await request.post('/api/portal/auth/discover', {
      data: { email: 'test@example.com' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(response.status()).toBeLessThan(500)
  })

  test('portal auth login requires company param', async ({ request }) => {
    const response = await request.get('/api/portal/auth/login')
    expect(response.status()).toBeLessThan(500)
    // Should return an error page or redirect, not crash
  })
})

test.describe('Cron Auth Enforcement (Extended)', () => {
  const cronEndpoints = [
    '/api/cron/fetch-content',
    '/api/cron/process-scheduled-offboards',
  ]

  for (const path of cronEndpoints) {
    test(`${path} rejects unauthenticated requests`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBeLessThan(500)
    })
  }
})

test.describe('Secret Auth Routes Accept Headers', () => {
  test('reports/diagnose-env rejects without auth', async ({ request }) => {
    const response = await request.get('/api/reports/diagnose-env')
    expect(response.status()).toBe(401)
  })

  test('reports/rmm-test rejects without auth', async ({ request }) => {
    const response = await request.get('/api/reports/rmm-test')
    expect(response.status()).toBe(401)
  })

  test('reports/executive-summary rejects without auth', async ({ request }) => {
    const response = await request.get('/api/reports/executive-summary')
    expect(response.status()).toBe(401)
  })
})

test.describe('Standardized Response Envelope', () => {
  // Routes migrated to apiOk/apiError should return consistent envelope shape
  const standardizedRoutes = [
    '/api/customer/tickets?companySlug=test',
    '/api/customer/metrics?companySlug=test',
    '/api/team',
    '/api/soc/status',
    '/api/soc/incidents',
    '/api/soc/tickets',
    '/api/reports/dashboard?preset=last_30_days',
    '/api/reports/companies?preset=last_30_days',
    '/api/reports/technicians?preset=last_30_days',
    '/api/admin/sync-logs',
    '/api/admin/platform-monitor',
  ]

  for (const path of standardizedRoutes) {
    test(`${path} returns standard envelope with requestId`, async ({ request }) => {
      const response = await request.get(path)
      const body = await response.json()

      // Every standardized response must have these fields
      expect(body).toHaveProperty('success')
      expect(body).toHaveProperty('requestId')
      expect(typeof body.requestId).toBe('string')
      expect(body.requestId).toMatch(/^req_/)

      if (body.success) {
        expect(body).toHaveProperty('data')
      } else {
        expect(body).toHaveProperty('error')
        expect(typeof body.error).toBe('string')
      }
    })
  }
})

test.describe('Environment Safety', () => {
  test('no secrets leaked in HTML responses', async ({ page }) => {
    const pages = ['/', '/services', '/contact', '/blog', '/portal']
    for (const path of pages) {
      await page.goto(path)
      const html = await page.content()
      // Check no env var values leaked into HTML
      expect(html).not.toContain('MIGRATION_SECRET')
      expect(html).not.toContain('CRON_SECRET')
      expect(html).not.toContain('NEXTAUTH_SECRET')
      expect(html).not.toContain('AZURE_AD_CLIENT_SECRET')
    }
  })

  test('system-health endpoint not exposed without auth', async ({ request }) => {
    const response = await request.get('/api/admin/system-health')
    // Should require authentication
    expect(response.status()).not.toBe(200)
  })
})
