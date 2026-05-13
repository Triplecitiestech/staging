/**
 * Remediation Action Catalog — Types
 *
 * Declarative, versioned descriptions of what a remediation does, who it
 * affects, and how to reverse it. Lives in code (not the DB) so it ships
 * atomically with the rest of the platform and is reviewable in PRs.
 *
 * Every action MUST have a non-empty `impact.userFacing` string — this is
 * the plain-English customer-impact statement that goes into the Change
 * Bundle report. CI enforces this via scripts/validate-action-catalog.ts.
 *
 * See docs/plans/CHANGE_MANAGEMENT_AND_REMEDIATION.md §3 for the design.
 */

import type { FrameworkId } from '../types'

/** Stable id for a capability — see registry/capabilities.ts. */
export type CapabilityId = string

/**
 * Logical license tier. Each maps to one or more Microsoft `skuPartNumber`
 * values in src/lib/compliance/licenses.ts. Use the logical name in
 * Precondition declarations so the catalog stays readable; the mapping
 * layer handles Microsoft's renames (e.g. AAD_PREMIUM → Entra ID P1).
 */
export type LicenseSku =
  | 'entra_id_p1'
  | 'entra_id_p2'
  | 'm365_business_basic'
  | 'm365_business_standard'
  | 'm365_business_premium'
  | 'm365_e3'
  | 'm365_e5'
  | 'office_365_e3'
  | 'office_365_e5'
  | 'intune'
  | 'defender_endpoint_p1'
  | 'defender_endpoint_p2'

/** Coverage of a single control by this action. */
export interface ActionControlCoverage {
  frameworkId: FrameworkId
  controlId: string
  /** 'full' = this action satisfies the control on its own; 'partial' otherwise. */
  coverage: 'full' | 'partial'
}

/**
 * Mandatory customer-impact metadata. CI enforces that userFacing is non-empty.
 */
export interface ActionImpact {
  /**
   * Plain-English description of what end users will experience. Rendered
   * verbatim into the customer-facing Change Bundle report. Must NOT reference
   * Microsoft Graph endpoints, CA policies by name, or other technical jargon.
   * Required.
   */
  userFacing: string

  /** Staff-only operational notes (graph methods, CA names, etc.). */
  operational: string

  /** Who/what is affected. */
  blastRadius: 'tenant_wide' | 'group' | 'per_user' | 'per_device' | 'none'

  /** Rough estimate per affected person/device, in minutes. */
  estimatedDisruptionMinutes: number

  /** True if the action can log users out or interrupt active sessions. */
  sessionDisruptive: boolean

  /** True if end users must take action (e.g., enroll an authenticator). */
  requiresEndUserAction: boolean
}

/** Pre-flight checks that gate staging / execution of an action. */
export type Precondition =
  | { kind: 'connector_verified'; connectorType: string }
  | { kind: 'tool_deployed'; toolId: string }
  | { kind: 'break_glass_accounts_excluded' }
  | { kind: 'customer_profile_complete'; minimumCompletionPct: number }
  /**
   * Customer's M365 tenant must have at least one of the listed logical
   * licenses for this action to be technically possible. Example: applying
   * Conditional Access policies requires Entra ID P1 (included in M365
   * Business Premium, M365 E3+, etc.) — without it, Graph refuses the
   * request. Declaring this here lets the previewer short-circuit and the
   * deploy route refuse cleanly rather than surface an opaque Graph error.
   */
  | { kind: 'license_required'; anyOf: LicenseSku[] }

/** How to actually carry out the action. */
export type ActionExecutor =
  | {
      kind: 'automated'
      /** Handler id resolvable in src/lib/compliance/actions/executors/ at runtime. */
      handler: string
    }
  | {
      kind: 'manual'
      /** Staff-facing markdown instructions. Required when kind='manual'. */
      instructions: string
    }

/** Post-execution verification. */
export interface ActionVerification {
  /** Evaluator ids to re-run (matches CIS_V8_EVALUATORS keys etc.). */
  evaluatorIds: string[]
  /** Wait time before re-running (some changes need propagation). */
  delaySecondsBeforeVerify: number
}

export interface RemediationAction {
  /** Stable id — e.g. 'm365.enforce_mfa_all_users'. Used as actionId on pending changes. */
  id: string
  /** Human-readable name shown in admin UI. */
  name: string
  /** Catalog version. Bump when impact text or executor changes. */
  version: string
  /** Controls this action satisfies/partially-satisfies. */
  satisfiesControls: readonly ActionControlCoverage[]
  /** Capability id (cross-references registry/capabilities). */
  capabilityId: CapabilityId
  /** Whether the action can be undone, and via which other action id. */
  reversible: boolean
  rollbackActionId?: string
  /** Mandatory customer-impact metadata. */
  impact: ActionImpact
  /** Preconditions checked before staging / executing. */
  preconditions: readonly Precondition[]
  /** How to carry it out. */
  executor: ActionExecutor
  /** Post-execution verification. */
  verification: ActionVerification
}

/** Result of running the catalog validator (used by CI + runtime). */
export interface CatalogValidationIssue {
  actionId: string
  field: string
  message: string
}
