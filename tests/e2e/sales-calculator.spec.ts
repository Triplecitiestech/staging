import { test, expect } from '@playwright/test'

/**
 * Sales Calculator access gate (unauthenticated).
 *
 * /admin/sales-calculator exposes vendor costs and margins, so an anonymous
 * visitor must only ever see the sign-in card — never the calculator itself —
 * and the route must be explicitly noindex.
 */

test.describe('Sales Calculator — access gate', () => {
  test('anonymous visitor gets the sign-in card, not the calculator', async ({ page }) => {
    const response = await page.goto('/admin/sales-calculator')
    expect(response?.status()).toBeLessThan(500)

    // Sign-in gate is shown…
    await expect(
      page.getByText('Internal tool — sign in with your Microsoft account to continue')
    ).toBeVisible()

    // …and nothing internal leaks
    const content = (await page.textContent('body')) ?? ''
    expect(content).not.toContain('INTERNAL ONLY')
    expect(content).not.toContain('vendor costs and margins')
    expect(content).not.toContain('Quote Comparison')
    expect(content).not.toContain('Line-Item Cost')
  })

  test('route is noindex', async ({ page }) => {
    await page.goto('/admin/sales-calculator')
    const robots = page.locator('meta[name="robots"]')
    await expect(robots).toHaveAttribute('content', /noindex/)
  })

  test('pricing editor is gated and noindex', async ({ page }) => {
    const response = await page.goto('/admin/sales-calculator/pricing')
    expect(response?.status()).toBeLessThan(500)
    await expect(
      page.getByText('Internal tool — sign in with your Microsoft account to continue')
    ).toBeVisible()
    const content = (await page.textContent('body')) ?? ''
    expect(content).not.toContain('Pricing Editor')
    expect(content).not.toContain('Default:')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('pricing API rejects anonymous requests', async ({ request }) => {
    const res = await request.get('/api/admin/sales-calculator/pricing')
    expect(res.status()).toBe(401)
    const put = await request.put('/api/admin/sales-calculator/pricing', {
      data: { overrides: { 'packages.basic.perUser.price': 1 } },
    })
    expect(put.status()).toBe(401)
  })

  test('saved quotes API rejects anonymous requests', async ({ request }) => {
    expect((await request.get('/api/admin/sales-calculator/quotes')).status()).toBe(401)
    expect(
      (await request.post('/api/admin/sales-calculator/quotes', { data: { name: 'x', input: {} } })).status()
    ).toBe(401)
    const id = '00000000-0000-0000-0000-000000000000'
    expect((await request.get(`/api/admin/sales-calculator/quotes/${id}`)).status()).toBe(401)
    expect((await request.put(`/api/admin/sales-calculator/quotes/${id}`, { data: { name: 'x', input: {} } })).status()).toBe(401)
    expect((await request.delete(`/api/admin/sales-calculator/quotes/${id}`)).status()).toBe(401)
  })
})
