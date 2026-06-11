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
    ['./tests/e2e/failure-reporter.ts'],
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Vercel Deployment Protection 401-walls every preview route unless the
    // automation bypass header is sent (docs/gotchas.md → CI/CD section).
    // set-bypass-cookie makes the browser's client-side fetches pass too.
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
  },
  projects: [
    // Auth setup — runs first, creates session state for authenticated tests
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // Unauthenticated tests — no session needed
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /auth\.setup\.ts|authenticated/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      testIgnore: /auth\.setup\.ts|authenticated/,
    },
    // Authenticated tests — depend on setup, use stored session
    {
      name: 'authenticated',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
      testMatch: /authenticated/,
    },
  ],
  webServer: process.env.CI || process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
