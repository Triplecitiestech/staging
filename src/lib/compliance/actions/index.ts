/**
 * Compliance Remediation Actions — public API surface.
 */

export type {
  CapabilityId,
  RemediationAction,
  ActionControlCoverage,
  ActionImpact,
  Precondition,
  ActionExecutor,
  ActionVerification,
  CatalogValidationIssue,
} from './types'

export {
  REMEDIATION_ACTIONS,
  REMEDIATION_ACTIONS_BY_ID,
  getRemediationAction,
  suggestActionsForControl,
} from './catalog'

export { validateAction, validateCatalog } from './validators'

export type { ExecutorContext, ExecutorResult, ExecutorHandler } from './executors'
export { executeAction, hasRealHandler } from './executors'

export type { AffectedEntity, ImpactPreview, PreviewerContext, PreviewerHandler } from './previewers'
export { previewImpact, hasRealPreviewer } from './previewers'
