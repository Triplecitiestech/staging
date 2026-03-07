/**
 * Playwright Custom Reporter — Test Failure Capture
 *
 * Automatically captures failure artifacts and writes structured
 * debug summaries when tests fail. Summaries are stored as JSON
 * files in test-results/failures/ for Claude to consume.
 *
 * Usage: Add to playwright.config.ts reporters array:
 *   reporter: [['./tests/e2e/failure-reporter.ts'], ['html']]
 */

import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  Suite,
} from '@playwright/test/reporter'
import { execSync } from 'child_process'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  generateDebugSummary,
  formatSummaryAsMarkdown,
  type TestFailureData,
} from '../../src/lib/test-failure-capture'

const FAILURES_DIR = join(process.cwd(), 'test-results', 'failures')

function getGitInfo(): { commitSha?: string; branchName?: string } {
  try {
    const commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
    const branchName = execSync('git branch --show-current', { encoding: 'utf-8' }).trim()
    return { commitSha, branchName }
  } catch {
    return {}
  }
}

function getEnvironment(): string {
  if (process.env.CI) return 'ci'
  if (process.env.PLAYWRIGHT_BASE_URL?.includes('vercel.app')) return 'preview'
  if (process.env.PLAYWRIGHT_BASE_URL?.includes('triplecitiestech.com')) return 'production'
  return 'local'
}

class FailureReporter implements Reporter {
  private failures: Array<{ data: TestFailureData; summary: ReturnType<typeof generateDebugSummary> }> = []

  onBegin(_config: unknown, _suite: Suite) {
    // Ensure failures directory exists
    if (!existsSync(FAILURES_DIR)) {
      mkdirSync(FAILURES_DIR, { recursive: true })
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'failed' && result.status !== 'timedOut') return

    const gitInfo = getGitInfo()
    const error = result.errors[0]

    // Collect attachment paths
    let screenshotPath: string | undefined
    let tracePath: string | undefined
    for (const attachment of result.attachments) {
      if (attachment.name === 'screenshot' && attachment.path) {
        screenshotPath = attachment.path
      }
      if (attachment.name === 'trace' && attachment.path) {
        tracePath = attachment.path
      }
    }

    const failureData: TestFailureData = {
      testName: test.title,
      testFile: test.location.file.replace(process.cwd() + '/', ''),
      url: undefined, // URL captured via test annotations if available
      environment: getEnvironment(),
      errorMessage: error?.message || 'Unknown error',
      errorStack: error?.stack,
      consoleErrors: [], // Populated by test-level capture
      networkErrors: [],
      screenshotPath,
      tracePath,
      commitSha: gitInfo.commitSha,
      branchName: gitInfo.branchName,
    }

    const summary = generateDebugSummary(failureData)
    this.failures.push({ data: failureData, summary })

    // Write individual failure file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = test.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)
    const filename = `${timestamp}_${safeName}`

    writeFileSync(
      join(FAILURES_DIR, `${filename}.json`),
      JSON.stringify({ failure: failureData, summary, generatedAt: new Date().toISOString() }, null, 2)
    )

    writeFileSync(
      join(FAILURES_DIR, `${filename}.md`),
      formatSummaryAsMarkdown(summary)
    )
  }

  onEnd(_result: FullResult) {
    if (this.failures.length === 0) return

    // Write consolidated failure report
    const report = {
      totalFailures: this.failures.length,
      environment: getEnvironment(),
      timestamp: new Date().toISOString(),
      ...getGitInfo(),
      failures: this.failures.map(f => ({
        testName: f.data.testName,
        testFile: f.data.testFile,
        errorMessage: f.data.errorMessage.substring(0, 200),
        confidence: f.summary.confidence,
        probableRootCause: f.summary.probableRootCause,
      })),
    }

    writeFileSync(
      join(FAILURES_DIR, 'latest-report.json'),
      JSON.stringify(report, null, 2)
    )

    console.log(`\n[FailureReporter] ${this.failures.length} failure(s) captured in ${FAILURES_DIR}`)
    console.log('[FailureReporter] Review with: npm run debug:failures')
  }
}

export default FailureReporter
