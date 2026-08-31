import { test, expect } from '@playwright/test'

/**
 * Wilmar public onboarding status page (/status/[token]).
 *
 * Focused, cheap spec — this route reads Autotask live on every request, so
 * we don't exercise the full data pipeline here (that's covered by build +
 * manual verification against the deployed preview). We only pin the access
 * gate: a wrong or unconfigured token must be indistinguishable from a route
 * that doesn't exist.
 */

test.describe('Wilmar status page access gate', () => {
  test('wrong token returns 404, not a hint that the route exists', async ({ page }) => {
    const response = await page.goto('/status/definitely-not-the-real-token')
    expect(response?.status()).toBe(404)
  })

  test('empty-looking token also 404s', async ({ page }) => {
    const response = await page.goto('/status/x')
    expect(response?.status()).toBe(404)
  })

  // Only runs when the real token is available to the test process AND the
  // server under test was started with the same value — true on a preview
  // deploy once WILMAR_STATUS_TOKEN is set in Vercel, not in a bare local run.
  test('correct token, no code yet, renders the code gate (not the status data), noindex', async ({ page }) => {
    test.skip(!process.env.WILMAR_STATUS_TOKEN, 'WILMAR_STATUS_TOKEN not set for this test run')

    const response = await page.goto(`/status/${process.env.WILMAR_STATUS_TOKEN}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Enter your access code' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ally Co-Managed Onboarding' })).not.toBeVisible()

    const robots = page.locator('meta[name="robots"]')
    await expect(robots).toHaveAttribute('content', /noindex/)
  })

  // Wrong-code path doesn't need WILMAR_STATUS_CODE to be set — the check
  // fails closed either way, so this only needs the token to reach the gate.
  test('wrong code shows a plain error and stays on the gate', async ({ page }) => {
    test.skip(!process.env.WILMAR_STATUS_TOKEN, 'WILMAR_STATUS_TOKEN not set for this test run')

    await page.goto(`/status/${process.env.WILMAR_STATUS_TOKEN}`)
    await page.getByLabel('6-digit access code').fill('000000')
    await page.getByRole('button', { name: 'View status' }).click()

    await expect(page.getByText('Incorrect code, try again.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Enter your access code' })).toBeVisible()
  })

  // Full happy path — needs both secrets set to the same values the running
  // server was started with, so it only runs against a real preview/prod
  // deploy, never a bare local run.
  test('correct token + correct code renders the status page', async ({ page }) => {
    test.skip(
      !process.env.WILMAR_STATUS_TOKEN || !process.env.WILMAR_STATUS_CODE,
      'WILMAR_STATUS_TOKEN / WILMAR_STATUS_CODE not set for this test run'
    )

    await page.goto(`/status/${process.env.WILMAR_STATUS_TOKEN}`)
    await page.getByLabel('6-digit access code').fill(process.env.WILMAR_STATUS_CODE!)
    await page.getByRole('button', { name: 'View status' }).click()

    await expect(page.getByRole('heading', { name: 'Ally Co-Managed Onboarding' })).toBeVisible()
  })
})
