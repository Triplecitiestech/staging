import { test, expect } from '@playwright/test'

/**
 * Autotask sync system tests.
 * Verifies sync endpoints handle auth/errors gracefully without 500s.
 */

test.describe('Autotask Sync Endpoints', () => {
  test('sync trigger without secret returns error (not 500)', async ({ request }) => {
    const response = await request.get('/api/autotask/trigger')
    expect(response.status()).toBeLessThan(500)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  test('sync trigger with wrong secret returns error', async ({ request }) => {
    const response = await request.get('/api/autotask/trigger?secret=wrong-secret')
    expect(response.status()).toBeLessThan(500)
  })

  test('sync status endpoint responds', async ({ request }) => {
    const response = await request.get('/api/autotask/status')
    // Status endpoint may or may not require auth
    expect(response.status()).toBeLessThan(500)
  })
})

test.describe('Autotask Write-back API Security', () => {
  test('autotask notes API requires auth', async ({ request }) => {
    const response = await request.post('/api/autotask/notes', {
      data: { taskId: 1, title: 'test', description: 'test' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('autotask time-entries API requires auth', async ({ request }) => {
    const response = await request.post('/api/autotask/time-entries', {
      data: { autotaskTaskId: '1', hoursWorked: 1, dateWorked: '2026-01-01' },
    })
    expect([401, 403]).toContain(response.status())
  })
})

test.describe('Autotask Migration Endpoint', () => {
  test('autotask migration endpoint responds', async ({ request }) => {
    const response = await request.get('/api/migrations/autotask')
    expect(response.status()).toBeLessThan(500)
  })
})
