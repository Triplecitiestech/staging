import { test, expect } from '@playwright/test'

/**
 * Admin Contacts system tests.
 * Verifies the contacts page, company detail contacts, and related APIs
 * all load without server component crashes or 500 errors.
 */

test.describe('Admin Contacts Page', () => {
  test('contacts page loads without server error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const response = await page.goto('/admin/contacts')
    // Should render or redirect to login — never 500
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })

  test('contacts page does not show error boundary', async ({ page }) => {
    await page.goto('/admin/contacts')
    await page.waitForTimeout(1500)
    const content = await page.textContent('body')
    expect(content).not.toContain('Something went wrong')
    expect(content).not.toContain('unexpected error occurred')
  })
})

test.describe('Admin Company Detail Page', () => {
  test('company detail page loads without server error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Use a UUID that likely doesn't exist — should 404, not 500
    const response = await page.goto('/admin/companies/00000000-0000-0000-0000-000000000000')
    expect(response?.status()).toBeLessThan(500)

    const criticalErrors = errors.filter(
      (e) => !e.includes('chatgenie') && !e.includes('turnstile')
    )
    expect(criticalErrors).toEqual([])
  })
})

test.describe('Contacts API Security', () => {
  test('contacts invite API requires authentication', async ({ request }) => {
    const response = await request.post('/api/contacts/invite', {
      data: { contactIds: ['test'] },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('contacts invite PATCH requires authentication', async ({ request }) => {
    const response = await request.patch('/api/contacts/invite', {
      data: { contactId: 'test', customerRole: 'CLIENT_USER' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('company contacts API requires authentication', async ({ request }) => {
    const response = await request.get('/api/companies/test-id/contacts')
    expect([401, 403]).toContain(response.status())
  })

  test('company contacts POST requires authentication', async ({ request }) => {
    const response = await request.post('/api/companies/test-id/contacts', {
      data: { name: 'Test', email: 'test@test.com' },
    })
    expect([401, 403]).toContain(response.status())
  })

  test('impersonate API requires authentication', async ({ request }) => {
    const response = await request.post('/api/onboarding/impersonate', {
      data: { companySlug: 'test' },
    })
    expect([401, 403]).toContain(response.status())
  })
})
