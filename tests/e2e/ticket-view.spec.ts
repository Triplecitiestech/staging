import { test, expect } from '@playwright/test'

test.describe('Ticket & Task API Security', () => {
  test('ticket timeline API requires authentication', async ({ request }) => {
    const response = await request.get('/api/customer/tickets/timeline?ticketId=1')
    expect([401, 403]).toContain(response.status())
  })

  test('ticket reply API requires authentication', async ({ request }) => {
    const response = await request.post('/api/customer/tickets/reply', {
      data: { ticketId: '1', body: 'test' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('customer notes API requires authentication', async ({ request }) => {
    const response = await request.post('/api/customer/notes', {
      data: { taskId: '1', content: 'test' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('autotask notes API requires authentication', async ({ request }) => {
    const response = await request.post('/api/autotask/notes', {
      data: { taskId: 1, title: 'test', description: 'test' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('autotask time entries API requires authentication', async ({ request }) => {
    const response = await request.post('/api/autotask/time-entries', {
      data: { autotaskTaskId: '1', hoursWorked: 1, dateWorked: '2026-01-01' },
    })
    expect([401, 403]).toContain(response.status())
  })
})

test.describe('Sensitive Endpoints', () => {
  test('autotask sync trigger requires secret', async ({ request }) => {
    const response = await request.get('/api/autotask/trigger')
    expect([401, 403]).toContain(response.status())
  })

  test('autotask sync trigger rejects wrong secret', async ({ request }) => {
    const response = await request.get('/api/autotask/trigger?secret=wrong-secret')
    expect([401, 403]).toContain(response.status())
  })

  test('migration endpoint requires authorization', async ({ request }) => {
    const response = await request.post('/api/setup/migrate')
    expect([401, 403]).toContain(response.status())
  })

  test('blog approval endpoint requires valid token', async ({ request }) => {
    const response = await request.get('/api/blog/approval?token=invalid&action=approve')
    expect(response.status()).not.toBe(200)
  })
})

test.describe('API Response Format', () => {
  test('unauthenticated API returns JSON error', async ({ request }) => {
    const response = await request.get('/api/companies')
    const contentType = response.headers()['content-type'] || ''
    expect(contentType).toContain('application/json')
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })
})
