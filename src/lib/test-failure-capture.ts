/**
 * Test Failure Capture & Summary System
 *
 * Captures e2e test failure artifacts and generates structured
 * debugging summaries for Claude to consume.
 *
 * Used by the Playwright custom reporter (tests/e2e/failure-reporter.ts)
 * and the debug CLI (scripts/debug-failures.ts).
 */

export interface TestFailureData {
  testName: string
  testFile: string
  url?: string
  environment: string
  errorMessage: string
  errorStack?: string
  consoleErrors?: string[]
  networkErrors?: string[]
  screenshotPath?: string
  tracePath?: string
  commitSha?: string
  branchName?: string
}

export interface DebugSummary {
  whatFailed: string
  whereFailed: string
  symptoms: string[]
  consoleErrors: string[]
  networkFailures: string[]
  probableRootCause: string
  impactedFiles: string[]
  confidence: 'high' | 'medium' | 'low'
  suggestedNextSteps: string[]
}

/**
 * Generate a structured debugging summary from failure data.
 * This is a rule-based analysis — no AI call needed for the initial summary.
 */
export function generateDebugSummary(failure: TestFailureData): DebugSummary {
  const symptoms: string[] = []
  const impactedFiles: string[] = []
  let probableRootCause = 'Unknown — manual investigation needed'
  let confidence: 'high' | 'medium' | 'low' = 'low'

  // Analyze error message for common patterns
  const msg = failure.errorMessage.toLowerCase()

  if (msg.includes('timeout') || msg.includes('timed out')) {
    symptoms.push('Page or element load timeout')
    probableRootCause = 'Page took too long to load or element not found in time'
    confidence = 'medium'
    if (failure.url) {
      impactedFiles.push(urlToPageFile(failure.url))
    }
  }

  if (msg.includes('locator.tobevisible') || msg.includes('expect(locator)')) {
    symptoms.push('Expected UI element not visible on page')
    probableRootCause = 'UI element missing, hidden, or rendered with different selector'
    confidence = 'medium'
    if (failure.url) {
      impactedFiles.push(urlToPageFile(failure.url))
    }
  }

  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('403')) {
    symptoms.push('Authentication/authorization failure')
    probableRootCause = 'Auth check failing — session missing or auth middleware rejecting request'
    confidence = 'high'
    impactedFiles.push('src/auth.ts', 'src/middleware.ts')
  }

  if (msg.includes('500') || msg.includes('internal server error')) {
    symptoms.push('Server-side error (500)')
    probableRootCause = 'Unhandled exception in API route or server component'
    confidence = 'medium'
    if (failure.url) {
      impactedFiles.push(urlToApiFile(failure.url))
    }
  }

  if (msg.includes('prisma') || msg.includes('database') || msg.includes('column')) {
    symptoms.push('Database/Prisma error')
    probableRootCause = 'Schema mismatch, missing migration, or query error'
    confidence = 'high'
    impactedFiles.push('prisma/schema.prisma')
  }

  if (msg.includes('hydration') || msg.includes('hydrat')) {
    symptoms.push('React hydration mismatch')
    probableRootCause = 'Server/client HTML mismatch — likely a component using browser-only APIs without useEffect'
    confidence = 'high'
  }

  // Add console errors as symptoms
  if (failure.consoleErrors?.length) {
    symptoms.push(`${failure.consoleErrors.length} console error(s) captured`)
  }

  // Add network errors as symptoms
  if (failure.networkErrors?.length) {
    symptoms.push(`${failure.networkErrors.length} failed network request(s)`)
  }

  // Derive impacted file from test file
  impactedFiles.push(failure.testFile)

  const suggestedNextSteps = [
    `Read the test file: ${failure.testFile}`,
    ...(impactedFiles.length > 1
      ? [`Inspect impacted files: ${impactedFiles.filter(f => f !== failure.testFile).join(', ')}`]
      : []),
    ...(failure.screenshotPath ? [`Review screenshot: ${failure.screenshotPath}`] : []),
    ...(failure.tracePath ? [`Review Playwright trace: ${failure.tracePath}`] : []),
    'Identify root cause and propose a fix',
    'Implement fix and rerun the failing test to confirm resolution',
  ]

  return {
    whatFailed: `Test "${failure.testName}" in ${failure.testFile}`,
    whereFailed: failure.url || 'Unknown page',
    symptoms,
    consoleErrors: failure.consoleErrors || [],
    networkFailures: failure.networkErrors || [],
    probableRootCause,
    impactedFiles: Array.from(new Set(impactedFiles)),
    confidence,
    suggestedNextSteps,
  }
}

/**
 * Format a debug summary as markdown for Claude consumption.
 */
export function formatSummaryAsMarkdown(summary: DebugSummary): string {
  return `## Test Failure Debug Summary

**What failed**: ${summary.whatFailed}
**Where**: ${summary.whereFailed}
**Confidence**: ${summary.confidence}

### Symptoms
${summary.symptoms.map(s => `- ${s}`).join('\n') || '- None identified'}

### Console Errors
${summary.consoleErrors.length ? summary.consoleErrors.map(e => `- \`${e}\``).join('\n') : '- None'}

### Network Failures
${summary.networkFailures.length ? summary.networkFailures.map(e => `- ${e}`).join('\n') : '- None'}

### Probable Root Cause
${summary.probableRootCause}

### Impacted Files
${summary.impactedFiles.map(f => `- \`${f}\``).join('\n')}

### Suggested Next Steps
${summary.suggestedNextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`
}

/**
 * Write a failure record to a JSON file for offline review.
 * Used when database is unavailable.
 */
export function formatFailureAsJson(failure: TestFailureData, summary: DebugSummary): string {
  return JSON.stringify({
    failure,
    summary,
    generatedAt: new Date().toISOString(),
  }, null, 2)
}

// --- Helpers ---

function urlToPageFile(url: string): string {
  const path = new URL(url, 'http://localhost').pathname
  if (path === '/') return 'src/app/(marketing)/page.tsx'
  if (path.startsWith('/admin')) return `src/app${path}/page.tsx`
  if (path.startsWith('/onboarding')) return `src/app${path}/page.tsx`
  if (path.startsWith('/api/')) return `src/app${path}/route.ts`
  return `src/app/(marketing)${path}/page.tsx`
}

function urlToApiFile(url: string): string {
  const path = new URL(url, 'http://localhost').pathname
  if (path.startsWith('/api/')) return `src/app${path}/route.ts`
  return `src/app${path}/page.tsx`
}
