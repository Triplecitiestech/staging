import { test, expect } from '@playwright/test'
import { buildAllQuotes } from '../../src/lib/sales-calculator/calc'
import { recommend } from '../../src/lib/sales-calculator/recommend'
import { defaultInput } from '../../src/lib/sales-calculator/defaults'
import { currency } from '../../src/lib/sales-calculator/format'

/**
 * Sales Calculator — authenticated functional tests.
 *
 * Expected values are computed from the calculator's own library + config at
 * test time (not hardcoded), so pricing.json edits don't break the suite —
 * these tests verify the UI shows exactly what the calculation engine returns.
 */

const expectedQuotes = buildAllQuotes(defaultInput())
const expectedRec = recommend(defaultInput())

test.describe('Sales Calculator — authenticated', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/sales-calculator')
    await expect(
      page.getByText('TCT Managed Services Sales Calculator')
    ).toBeVisible({ timeout: 15000 })
  })

  test('renders header, internal banner and discovery wizard', async ({ page }) => {
    await expect(page.getByText('INTERNAL ONLY', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Discovery' })).toBeVisible()
    // First discovery step
    await expect(page.getByText('Company profile & compliance.')).toBeVisible()
  })

  test('default recommendation matches the engine', async ({ page }) => {
    await expect(
      page.getByText(expectedRec.recommendedPackageName).first()
    ).toBeVisible()
  })

  test('all six discovery steps advance and finish on the recommendation', async ({ page }) => {
    const subtitles = [
      'Company profile & compliance.',
      'Standard and frontline users.',
      'Endpoints in scope.',
      'Servers, backup & Azure VMs.',
      'Drives the Co-Managed recommendation.',
      'Microsoft 365 and one-time onboarding.',
    ]
    for (let i = 0; i < subtitles.length; i++) {
      await expect(page.getByText(subtitles[i])).toBeVisible()
      if (i < subtitles.length - 1) {
        await page.getByRole('button', { name: 'Next', exact: true }).click()
      }
    }
    await page.getByRole('button', { name: 'View Recommendation' }).click()
    await expect(
      page.getByText(expectedRec.recommendedPackageName).first()
    ).toBeVisible()
  })

  test('quote comparison shows all five packages with engine-computed totals', async ({ page }) => {
    await page.getByRole('button', { name: 'Quote Comparison' }).click()
    await expect(page.getByText('All five packages priced against the same customer inputs.')).toBeVisible()
    for (const q of expectedQuotes) {
      await expect(page.getByText(q.packageName).first()).toBeVisible()
      // Each package's monthly managed total, exactly as the engine computes it
      await expect(page.getByText(currency(q.monthlyPrice)).first()).toBeVisible()
    }
  })

  test('remaining tabs render their sections', async ({ page }) => {
    const tabs: Array<[string, string]> = [
      ['Financial Dashboard', 'Revenue by Billing Bucket'],
      ['Current vs TCT', 'Compare their current IT spend with the TCT quote.'],
      ['Service Catalog', 'Service Catalog'],
      ['Line-Item Costs', 'Line-Item Cost Ledger'],
    ]
    for (const [tab, marker] of tabs) {
      await page.getByRole('button', { name: tab }).click()
      await expect(page.getByText(marker).first()).toBeVisible()
    }
  })

  test('internal/customer toggle hides costs and margins', async ({ page }) => {
    // Internal view shows cost columns in the line-items table
    await expect(page.getByText('Unit Cost').first()).toBeVisible()
    await page.getByRole('button', { name: 'Internal view (costs + margins)' }).click()
    await expect(page.getByRole('button', { name: 'Customer view (prices only)' })).toBeVisible()
    await expect(page.getByText('Unit Cost')).toHaveCount(0)
    await expect(page.getByText('Margin %')).toHaveCount(0)
  })

  test('JSON, CSV, Excel and PDF exports all download', async ({ page }) => {
    await page.getByRole('button', { name: 'Summaries & Export' }).click()
    await expect(page.getByText('Internal Summary')).toBeVisible()

    const cases: Array<[RegExp, RegExp]> = [
      [/JSON/, /TCT_Quote_.*\.json$/],
      [/CSV/, /TCT_Quote_.*\.csv$/],
      [/Excel/, /TCT_Quote_.*\.xlsx$/],
      [/PDF/, /TCT_.*\.pdf$/],
    ]
    for (const [button, filename] of cases) {
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: button }).click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(filename)
    }
  })
})
