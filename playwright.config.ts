import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Triple Cities Tech e2e tests.
 *
 * Supports two modes:
 * 1. Local browser (default) — uses local Chromium
 * 2. Browserbase (remote) — set BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID
 *    Tests that need Browserbase use the helper in browserbase.setup.ts
 *
 * Run against deployed preview:
 *   PLAYWRIGHT_BASE_URL=https://preview-url.vercel.app npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: process.env.CI || process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
