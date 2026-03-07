#!/usr/bin/env tsx
/**
 * Debug Failures CLI
 *
 * Surfaces unresolved test failures for review.
 *
 * Usage:
 *   npm run debug:failures          # Show latest failure report
 *   npm run debug:failures -- list  # List all failure files
 *   npm run debug:failures -- show <filename>  # Show specific failure
 *   npm run debug:failures -- clean # Remove all failure artifacts
 */

import { readFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const FAILURES_DIR = join(process.cwd(), 'test-results', 'failures')
const args = process.argv.slice(2)
const command = args[0] || 'latest'

function printHeader(text: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${text}`)
  console.log('='.repeat(60))
}

function showLatest() {
  const reportPath = join(FAILURES_DIR, 'latest-report.json')
  if (!existsSync(reportPath)) {
    console.log('\nNo test failures found. Run tests with: npm run test:e2e')
    return
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
  printHeader(`Test Failure Report — ${report.timestamp}`)
  console.log(`Environment: ${report.environment}`)
  console.log(`Branch: ${report.branchName || 'unknown'}`)
  console.log(`Commit: ${report.commitSha || 'unknown'}`)
  console.log(`Total failures: ${report.totalFailures}`)

  if (report.failures?.length) {
    console.log('\nFailures:')
    for (const f of report.failures) {
      console.log(`\n  [${f.confidence?.toUpperCase() || '?'}] ${f.testName}`)
      console.log(`  File: ${f.testFile}`)
      console.log(`  Error: ${f.errorMessage}`)
      console.log(`  Root cause: ${f.probableRootCause}`)
    }
  }

  // Show available markdown summaries
  const mdFiles = getFailureFiles('.md')
  if (mdFiles.length) {
    console.log(`\nDetailed summaries available (${mdFiles.length}):`)
    for (const f of mdFiles) {
      console.log(`  - ${f}`)
    }
    console.log('\nView with: npm run debug:failures -- show <filename>')
  }
}

function listFailures() {
  if (!existsSync(FAILURES_DIR)) {
    console.log('\nNo failure artifacts found.')
    return
  }

  const files = readdirSync(FAILURES_DIR).sort()
  if (files.length === 0) {
    console.log('\nNo failure artifacts found.')
    return
  }

  printHeader('Failure Artifacts')
  const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'latest-report.json')
  const mdFiles = files.filter(f => f.endsWith('.md'))

  if (jsonFiles.length) {
    console.log('\nJSON records:')
    for (const f of jsonFiles) console.log(`  ${f}`)
  }
  if (mdFiles.length) {
    console.log('\nMarkdown summaries:')
    for (const f of mdFiles) console.log(`  ${f}`)
  }
  console.log(`\nTotal: ${files.length} file(s) in ${FAILURES_DIR}`)
}

function showFailure(filename: string) {
  // Try exact match or partial match
  if (!existsSync(FAILURES_DIR)) {
    console.log('\nNo failure artifacts found.')
    return
  }

  const files = readdirSync(FAILURES_DIR)
  const match = files.find(f => f === filename || f.includes(filename))

  if (!match) {
    console.log(`\nFile not found: ${filename}`)
    console.log('Available files:')
    for (const f of files) console.log(`  ${f}`)
    return
  }

  const content = readFileSync(join(FAILURES_DIR, match), 'utf-8')
  printHeader(`Failure: ${match}`)
  console.log(content)
}

function cleanFailures() {
  if (!existsSync(FAILURES_DIR)) {
    console.log('\nNothing to clean.')
    return
  }

  rmSync(FAILURES_DIR, { recursive: true, force: true })
  console.log('\nCleared all failure artifacts.')
}

function getFailureFiles(ext: string): string[] {
  if (!existsSync(FAILURES_DIR)) return []
  return readdirSync(FAILURES_DIR).filter(f => f.endsWith(ext))
}

// Main
switch (command) {
  case 'latest':
    showLatest()
    break
  case 'list':
    listFailures()
    break
  case 'show':
    if (!args[1]) {
      console.log('Usage: npm run debug:failures -- show <filename>')
    } else {
      showFailure(args[1])
    }
    break
  case 'clean':
    cleanFailures()
    break
  default:
    console.log('Usage:')
    console.log('  npm run debug:failures          # Show latest report')
    console.log('  npm run debug:failures -- list   # List all artifacts')
    console.log('  npm run debug:failures -- show <file>  # Show specific failure')
    console.log('  npm run debug:failures -- clean  # Remove all artifacts')
}
