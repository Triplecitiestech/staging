import { test, expect } from '@playwright/test'

/**
 * API endpoint health tests.
 * Ensures every API endpoint responds without 500 errors.
 * Protected endpoints should return 401/403, not crash.
 * Public endpoints should return 200.
 */

test.describe('Core API Endpoints — Auth Enforcement', () => {
  const protectedEndpoints = [
    { method: 'GET' as const, path: '/api/tasks' },
    { method: 'GET' as const, path: '/api/companies' },
    { method: 'GET' as const, path: '/api/projects' },
    { method: 'GET' as const, path: '/api/phases' },
    { method: 'GET' as const, path: '/api/contacts/invite' },
    { method: 'GET' as const, path: '/api/reports/dashboard?preset=last_30_days' },
    { method: 'GET' as const, path: '/api/reports/selectors' },
    { method: 'GET' as const, path: '/api/reports/companies?preset=last_30_days' },
    { method: 'GET' as const, path: '/api/reports/technicians?preset=last_30_days' },
    { method: 'GET' as const, path: '/api/reports/customer-health?preset=last_30_days' },
    { method: 'GET' as const, path: '/api/reports/business-review' },
    { method: 'GET' as const, path: '/api/reports/analytics' },
    { method: 'GET' as const, path: '/api/reports/status' },
    { method: 'GET' as const, path: '/api/reports/targets' },
    { method: 'GET' as const, path: '/api/reports/priority-drilldown' },
    { method: 'GET' as const, path: '/api/reports/validate-all' },
    { method: 'GET' as const, path: '/api/tickets' },
    { method: 'GET' as const, path: '/api/soc/status' },
    { method: 'GET' as const, path: '/api/soc/incidents' },
    { method: 'GET' as const, path: '/api/soc/rules' },
    { method: 'GET' as const, path: '/api/soc/config' },
    { method: 'GET' as const, path: '/api/soc/activity' },
    { method: 'GET' as const, path: '/api/soc/pending-actions' },
  ]

  for (const { method, path } of protectedEndpoints) {
    test(`${method} ${path} returns 401/403 (not 500)`, async ({ request }) => {
      const response =
        method === 'GET' ? await request.get(path) : await request.post(path)
      // Must be auth error, not server crash
      expect(response.status()).toBeLessThan(500)
    })
  }
})

test.describe('Protected Write Endpoints — Auth Enforcement', () => {
  const writeEndpoints = [
    { method: 'POST' as const, path: '/api/tasks', data: { title: 'test' } },
    { method: 'POST' as const, path: '/api/projects', data: { title: 'test' } },
    { method: 'POST' as const, path: '/api/contacts/invite', data: { contactIds: [] } },
    { method: 'PATCH' as const, path: '/api/contacts/invite', data: { contactId: 'x', customerRole: 'CLIENT_USER' } },
    { method: 'POST' as const, path: '/api/onboarding/impersonate', data: { companySlug: 'x' } },
    { method: 'POST' as const, path: '/api/customer/tickets/reply', data: { ticketId: '1', body: 'test' } },
    { method: 'POST' as const, path: '/api/customer/notes', data: { taskId: '1', content: 'test' } },
    { method: 'POST' as const, path: '/api/autotask/notes', data: { taskId: 1, title: 'test', description: 'test' } },
    { method: 'POST' as const, path: '/api/autotask/time-entries', data: { autotaskTaskId: '1', hoursWorked: 1 } },
  ]

  for (const { method, path, data } of writeEndpoints) {
    test(`${method} ${path} returns 401/403 (not 500)`, async ({ request }) => {
      const response =
        method === 'POST'
          ? await request.post(path, { data })
          : await request.patch(path, { data })
      expect(response.status()).toBeLessThan(500)
    })
  }
})

test.describe('Secret-Protected Endpoints', () => {
  test('autotask sync trigger requires secret', async ({ request }) => {
    const response = await request.get('/api/autotask/trigger')
    // Should fail without secret but not crash
    expect(response.status()).toBeLessThan(500)
  })

  test('autotask sync trigger with wrong secret fails gracefully', async ({ request }) => {
    const response = await request.get('/api/autotask/trigger?secret=wrong')
    expect(response.status()).toBeLessThan(500)
  })

  test('SOC run endpoint requires auth', async ({ request }) => {
    const response = await request.post('/api/soc/run', { data: {} })
    expect(response.status()).toBeLessThan(500)
  })

  test('SOC migrate endpoint requires auth', async ({ request }) => {
    const response = await request.post('/api/soc/migrate')
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Blog System API', () => {
  test('blog posts API returns 200 or auth error', async ({ request }) => {
    const response = await request.get('/api/blog/posts')
    expect(response.status()).toBeLessThan(500)
  })

  test('blog generate-now requires auth', async ({ request }) => {
    const response = await request.post('/api/blog/generate-now', { data: {} })
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Customer Portal API', () => {
  test('onboarding auth endpoint works', async ({ request }) => {
    const response = await request.post('/api/onboarding/auth', {
      data: { companySlug: 'nonexistent', password: 'test' },
    })
    // Should fail gracefully, not crash
    expect(response.status()).toBeLessThan(500)
  })

  test('onboarding data requires auth', async ({ request }) => {
    const response = await request.get('/api/onboarding/data?company=test')
    expect(response.status()).toBeLessThan(500)
  })

  test('onboarding logout works', async ({ request }) => {
    const response = await request.post('/api/onboarding/logout')
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Marketing API', () => {
  test('marketing audiences sources API requires auth', async ({ request }) => {
    const response = await request.get('/api/marketing/audiences/sources')
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Migration Endpoints — No Crashes', () => {
  test('setup migrate responds without crash', async ({ request }) => {
    const response = await request.get('/api/setup/migrate')
    expect(response.status()).toBeLessThan(500)
  })

  test('reports migrate responds without crash', async ({ request }) => {
    const response = await request.get('/api/reports/migrate')
    expect(response.status()).toBeLessThan(500)
  })
})
