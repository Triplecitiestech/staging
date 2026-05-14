/**
 * LOCAL-ONLY screenshot harness for the compliance cockpit preview loop.
 * Not committed for prod use — a dev tool so Claude can SEE the pages.
 *
 * Authenticates via /api/test/auth, then screenshots every cockpit page at
 * desktop (1440) and mobile (390) widths into /tmp/shots/.
 *
 * Run:  npx tsx scripts/screenshot-cockpit.ts
 */

import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:3000'
const SECRET = 'local-dev-e2e-secret'
const COMPANY = '4944a84d-535c-4772-a7a8-affaa8376697'
const BUNDLE = 'local-seed-bundle-1'
const OUT = '/tmp/shots'

const PAGES: Array<{ name: string; path: string }> = [
  { name: '01-cockpit', path: `/admin/compliance/${COMPANY}` },
  { name: '02-findings', path: `/admin/compliance/${COMPANY}/findings` },
  { name: '03-assessments', path: `/admin/compliance/${COMPANY}/assessments` },
  { name: '04-changes', path: `/admin/compliance/${COMPANY}/changes` },
  { name: '05-changes-new', path: `/admin/compliance/${COMPANY}/changes/new` },
  { name: '06-bundle-detail', path: `/admin/compliance/${COMPANY}/changes/${BUNDLE}` },
  { name: '07-connections', path: `/admin/compliance/${COMPANY}/connections` },
  { name: '08-policies', path: `/admin/compliance/${COMPANY}/policies` },
  { name: '09-diagnostics', path: `/admin/compliance/diagnostics` },
  { name: '10-legacy-dashboard', path: `/admin/compliance` },
]

async function main() {
  mkdirSync(OUT, { recursive: true })

  // The sandbox can't download the Playwright-pinned chromium build, but an
  // older pre-installed build is present and works fine for screenshots.
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  const context = await browser.newContext()

  // 1. Authenticate — POST /api/test/auth, capture the session cookie.
  const authResp = await context.request.post(`${BASE}/api/test/auth`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    data: { email: 'e2e@triplecitiestech.com', role: 'SUPER_ADMIN' },
  })
  console.log(`auth: ${authResp.status()}`)
  if (authResp.status() !== 200) {
    console.error('auth body:', await authResp.text())
    await browser.close()
    process.exit(1)
  }

  // 2. Screenshot each page at desktop + mobile.
  for (const { name, path } of PAGES) {
    for (const [label, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const) {
      const page = await context.newPage()
      await page.setViewportSize({ width, height })
      let status = 0
      try {
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
        status = resp?.status() ?? 0
      } catch (err) {
        console.log(`  ${name} ${label}: NAV ERROR ${err instanceof Error ? err.message : err}`)
      }
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true })
      console.log(`  ${name} ${label}: ${status} → ${name}-${label}.png`)
      await page.close()
    }
  }

  await browser.close()
  console.log(`\\ndone — screenshots in ${OUT}`)
}

main().catch((err) => {
  console.error('harness failed:', err)
  process.exit(1)
})
