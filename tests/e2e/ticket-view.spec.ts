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

test.describe('Sensitive Data Protection', () => {
  test('autotask sync trigger requires secret', async ({ request }) => {
    const response = await request.get('/api/autotask/trigger')
    // Should reject without proper secret
    expect([401, 403]).toContain(response.status())
  })

  test('migration endpoint requires authorization', async ({ request }) => {
    const response = await request.post('/api/setup/migrate')
    expect([401, 403]).toContain(response.status())
  })
})
