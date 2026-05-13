/**
 * Remediation Action Catalog — Validators
 *
 * Two purposes:
 *   1. CI / build-time check: every action must declare non-empty
 *      impact.userFacing. Used by scripts/validate-action-catalog.ts.
 *   2. Runtime guard rails: callers can invoke validateAction() before
 *      staging a pending change to surface configuration drift early.
 *
 * The build-time check is the source of truth for the "no customer-impacting
 * change without plain-English impact analysis" guarantee.
 */

import type { CatalogValidationIssue, RemediationAction } from './types'

/**
 * Validate a single action. Returns issues; empty array = valid.
 */
export function validateAction(action: RemediationAction): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = []

  if (!action.id || !action.id.trim()) {
    issues.push({ actionId: action.id ?? '<unknown>', field: 'id', message: 'id is required' })
  }
  if (!action.name || !action.name.trim()) {
    issues.push({ actionId: action.id, field: 'name', message: 'name is required' })
  }
  if (!action.version || !action.version.trim()) {
    issues.push({ actionId: action.id, field: 'version', message: 'version is required' })
  }

  // The core guarantee: every action must surface a plain-English customer
  // impact summary. Empty / whitespace-only strings are a build error.
  if (!action.impact || !action.impact.userFacing || !action.impact.userFacing.trim()) {
    issues.push({
      actionId: action.id,
      field: 'impact.userFacing',
      message: 'impact.userFacing is required and must be non-empty (plain-English customer impact)',
    })
  }

  // userFacing must not embed jargon that won't make sense to a customer.
  // Heuristic checks only — exhaustive lint is out of scope.
  if (action.impact?.userFacing) {
    const forbidden = ['conditional access', 'graph api', 'intune policy', 'tenant.id', '$ref', 'CA policy']
    const lower = action.impact.userFacing.toLowerCase()
    for (const term of forbidden) {
      if (lower.includes(term.toLowerCase())) {
        issues.push({
          actionId: action.id,
          field: 'impact.userFacing',
          message: `impact.userFacing contains technical jargon "${term}" — should be plain English for the customer`,
        })
      }
    }
  }

  if (!action.impact?.operational || !action.impact.operational.trim()) {
    issues.push({
      actionId: action.id,
      field: 'impact.operational',
      message: 'impact.operational is required (staff-only technical notes)',
    })
  }

  // Executor must be coherent
  if (action.executor?.kind === 'manual' && !action.executor.instructions?.trim()) {
    issues.push({
      actionId: action.id,
      field: 'executor.instructions',
      message: 'manual executor requires instructions',
    })
  }
  if (action.executor?.kind === 'automated' && !action.executor.handler?.trim()) {
    issues.push({
      actionId: action.id,
      field: 'executor.handler',
      message: 'automated executor requires handler id',
    })
  }

  if (action.reversible && !action.rollbackActionId?.trim()) {
    issues.push({
      actionId: action.id,
      field: 'rollbackActionId',
      message: 'reversible=true requires rollbackActionId',
    })
  }

  if (!Array.isArray(action.satisfiesControls) || action.satisfiesControls.length === 0) {
    issues.push({
      actionId: action.id,
      field: 'satisfiesControls',
      message: 'satisfiesControls must list at least one (frameworkId, controlId, coverage) entry',
    })
  }

  if (!action.verification || !Array.isArray(action.verification.evaluatorIds)) {
    issues.push({
      actionId: action.id,
      field: 'verification.evaluatorIds',
      message: 'verification.evaluatorIds is required',
    })
  }

  return issues
}

/**
 * Validate the entire catalog. Returns issues across every action plus
 * a duplicate-id check.
 */
export function validateCatalog(actions: readonly RemediationAction[]): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = []
  const seen = new Set<string>()
  for (const a of actions) {
    if (seen.has(a.id)) {
      issues.push({ actionId: a.id, field: 'id', message: 'duplicate action id in catalog' })
    } else {
      seen.add(a.id)
    }
    issues.push(...validateAction(a))
  }
  return issues
}
