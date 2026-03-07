/**
 * Browserbase integration for Playwright tests.
 *
 * When BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are set,
 * tests connect to a remote Browserbase browser session instead
 * of launching a local browser.
 *
 * Usage:
 *   import { getBrowserbaseContext } from './browserbase.setup'
 *
 *   test('example', async () => {
 *     const { context, cleanup } = await getBrowserbaseContext()
 *     const page = context.pages()[0] || await context.newPage()
 *     // ... run test ...
 *     await cleanup()
 *   })
 *
 * Environment variables:
 *   BROWSERBASE_API_KEY       - API key from browserbase.com/settings
 *   BROWSERBASE_PROJECT_ID    - Project ID from Browserbase dashboard
 *   PLAYWRIGHT_BASE_URL       - App URL to test against (default: http://localhost:3000)
 */

import { chromium, type BrowserContext } from '@playwright/test'

interface BrowserbaseSession {
  context: BrowserContext
  cleanup: () => Promise<void>
}

export function isBrowserbaseEnabled(): boolean {
  return !!(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID)
}

export async function getBrowserbaseContext(): Promise<BrowserbaseSession> {
  const Browserbase = (await import('@browserbasehq/sdk')).default
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY,
  })

  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  })

  const browser = await chromium.connectOverCDP(session.connectUrl)
  const context = browser.contexts()[0] || await browser.newContext()

  return {
    context,
    cleanup: async () => {
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}
