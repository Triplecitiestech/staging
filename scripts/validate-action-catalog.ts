#!/usr/bin/env node
/**
 * Remediation Action Catalog Validator
 *
 * Build-time check that every remediation action declares a non-empty
 * `impact.userFacing` (plain-English customer-impact statement) plus the
 * other required fields. Exit code 1 on any issue.
 *
 * Run via:
 *   npx tsx scripts/validate-action-catalog.ts
 *
 * Wire into CI alongside `npm run lint` / `npm run build` to enforce the
 * "no customer-impacting change without plain-English impact analysis"
 * guarantee. See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §3.4.
 */

import { REMEDIATION_ACTIONS } from '../src/lib/compliance/actions/catalog'
import { validateCatalog } from '../src/lib/compliance/actions/validators'

function main(): void {
  const issues = validateCatalog(REMEDIATION_ACTIONS)

  if (issues.length === 0) {
    console.log(`OK — ${REMEDIATION_ACTIONS.length} remediation actions validated.`)
    process.exit(0)
  }

  console.error(`Catalog validation failed (${issues.length} issue(s)):\n`)
  for (const issue of issues) {
    console.error(`  [${issue.actionId}] ${issue.field}: ${issue.message}`)
  }
  console.error('')
  process.exit(1)
}

main()
