#!/usr/bin/env tsx
/**
 * Reporting Validation CLI
 *
 * Runs all reporting query functions against the live database and reports results.
 * No dev server needed — connects directly via Prisma.
 *
 * Usage:
 *   npm run validate:reports          # Pretty-printed output
 *   npm run validate:reports -- --json  # JSON output (for piping)
 */

// Load .env before any imports that use env vars
import 'dotenv/config';

import { runAllValidationTests } from '../src/lib/reporting/validation-tests';
import type { TestResult, CheckResult } from '../src/lib/reporting/validation-tests';

const isJson = process.argv.includes('--json');

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const ORANGE = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function statusColor(status: string): string {
  switch (status) {
    case 'PASS': return GREEN;
    case 'FAIL': return RED;
    case 'WARN': return ORANGE;
    default: return RESET;
  }
}

function formatCheck(c: CheckResult): string {
  const icon = c.passed ? `${GREEN}+${RESET}` : `${RED}x${RESET}`;
  const val = typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value);
  return `    ${icon} ${c.check}: ${DIM}${val}${RESET} ${DIM}(expected ${c.expected})${RESET}`;
}

function formatResult(r: TestResult): string {
  const color = statusColor(r.status);
  const lines = [`${color}[${r.status}]${RESET} ${BOLD}${r.name}${RESET} ${DIM}(${r.durationMs}ms)${RESET}`];
  if (r.error) {
    lines.push(`    ${RED}Error: ${r.error}${RESET}`);
  }
  for (const c of r.checks) {
    lines.push(formatCheck(c));
  }
  return lines.join('\n');
}

async function main() {
  if (!isJson) {
    console.log(`\n${BOLD}=== Reporting Validation ===${RESET}\n`);
  }

  try {
    const report = await runAllValidationTests();

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Date range: ${report.dateRange.from} to ${report.dateRange.to}\n`);

      for (const r of report.results) {
        console.log(formatResult(r));
        console.log('');
      }

      console.log(`${BOLD}============================${RESET}`);
      console.log(`Results: ${GREEN}${report.passed} PASS${RESET}, ${RED}${report.failed} FAIL${RESET}, ${ORANGE}${report.warned} WARN${RESET}`);
      console.log(`Total time: ${report.totalDurationMs}ms`);
      console.log(`Overall: ${statusColor(report.overall)}${BOLD}${report.overall}${RESET}\n`);
    }

    process.exit(report.failed > 0 ? 1 : 0);
  } catch (err) {
    if (isJson) {
      console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    } else {
      console.error(`${RED}Fatal error: ${err instanceof Error ? err.message : String(err)}${RESET}`);
    }
    process.exit(2);
  }
}

main();
