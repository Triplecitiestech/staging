/**
 * Precondition Checker
 *
 * Runs every Precondition declared on a remediation action against the
 * customer's live state and returns a structured pass/fail per check.
 *
 * Used by:
 *   - previewers.ts — to surface precondition failures BEFORE staff
 *     attempts deploy
 *   - the /deploy route — to refuse hard-fail preconditions (license
 *     missing, tool not deployed, etc.) rather than let the executor
 *     hit an opaque vendor error
 *
 * Read-only. Never mutates tenant state.
 */

import { getPool } from '@/lib/db-pool'
import type { PoolClient } from 'pg'
import {
  getTenantLicenses,
  LICENSE_DISPLAY_NAMES,
  snapshotHasLicense,
  type LicenseDetectionResult,
} from '../licenses'
import {
  computeProfileCompletion,
  getCustomerProfileAnswers,
} from '../customer-profile-schema'
import type { Precondition, RemediationAction } from './types'

export interface PreconditionResult {
  precondition: Precondition
  /**
   * pass     — verified satisfied; deploy may proceed
   * fail     — verified NOT satisfied; deploy must refuse
   * unknown  — couldn't determine (e.g. permission missing); surface as
   *            warning, do NOT block deploy automatically. Staff decides
   *            whether the unknown is acceptable.
   */
  status: 'pass' | 'fail' | 'unknown'
  /** Human-readable explanation surfaced to the tech. */
  message: string
}

export interface PreconditionRunResult {
  results: PreconditionResult[]
  /** True when every precondition is `pass`. */
  allPass: boolean
  /** True when at least one precondition is `fail` — deploy MUST refuse. */
  anyHardFail: boolean
  /** True when at least one is `unknown` and none are `fail`. */
  anyUnknown: boolean
}

/**
 * Evaluate every precondition for an action against the named company.
 * Each precondition variant has its own checker; missing variants default
 * to `unknown` so adding a new kind never silently passes.
 */
export async function checkPreconditions(
  companyId: string,
  action: RemediationAction
): Promise<PreconditionRunResult> {
  // Cache the license snapshot — multiple license_required preconditions
  // on one action share the same /subscribedSkus call.
  let licenseSnapshot: LicenseDetectionResult | undefined

  const pool = getPool()
  const client = await pool.connect()
  try {
    const results: PreconditionResult[] = []
    for (const pre of action.preconditions) {
      const res = await checkOne(pre, companyId, client, () =>
        licenseSnapshot
          ? Promise.resolve(licenseSnapshot)
          : getTenantLicenses(companyId).then((s) => {
              licenseSnapshot = s
              return s
            })
      )
      results.push(res)
    }
    return {
      results,
      allPass: results.every((r) => r.status === 'pass'),
      anyHardFail: results.some((r) => r.status === 'fail'),
      anyUnknown: results.some((r) => r.status === 'unknown') && !results.some((r) => r.status === 'fail'),
    }
  } finally {
    client.release()
  }
}

async function checkOne(
  pre: Precondition,
  companyId: string,
  client: PoolClient,
  loadLicenses: () => Promise<LicenseDetectionResult>
): Promise<PreconditionResult> {
  switch (pre.kind) {
    case 'connector_verified': {
      try {
        const r = await client.query<{ status: string }>(
          `SELECT status FROM compliance_connectors WHERE "companyId" = $1 AND "connectorType" = $2`,
          [companyId, pre.connectorType]
        )
        const status = r.rows[0]?.status
        if (status === 'verified') {
          return { precondition: pre, status: 'pass', message: `${pre.connectorType} connector is verified.` }
        }
        return {
          precondition: pre,
          status: 'fail',
          message: `${pre.connectorType} connector status is "${status ?? 'not configured'}" — must be verified before deploying this action.`,
        }
      } catch {
        return {
          precondition: pre,
          status: 'unknown',
          message: `Could not read connector status for ${pre.connectorType} (table missing or DB error).`,
        }
      }
    }

    case 'tool_deployed': {
      try {
        const r = await client.query<{ deployed: boolean }>(
          `SELECT deployed FROM compliance_company_tools WHERE "companyId" = $1 AND "toolId" = $2`,
          [companyId, pre.toolId]
        )
        if (r.rows[0]?.deployed === true) {
          return { precondition: pre, status: 'pass', message: `${pre.toolId} is marked deployed for this customer.` }
        }
        return {
          precondition: pre,
          status: 'fail',
          message: `${pre.toolId} is not marked deployed for this customer — toggle it in Tool Inventory before deploying.`,
        }
      } catch {
        return {
          precondition: pre,
          status: 'unknown',
          message: `Could not read tool deployment status for ${pre.toolId}.`,
        }
      }
    }

    case 'break_glass_accounts_excluded': {
      // Today we don't track break-glass accounts in the platform; surface
      // as `unknown` so the tech is reminded to verify manually. When
      // a break-glass-accounts table lands, this checker upgrades to `pass`.
      return {
        precondition: pre,
        status: 'unknown',
        message:
          'Break-glass account exclusion cannot be verified automatically yet. ' +
          'Confirm manually that the customer\'s break-glass accounts are excluded from this policy before deploying.',
      }
    }

    case 'customer_profile_complete': {
      const answers = await getCustomerProfileAnswers(companyId)
      const pct = computeProfileCompletion(answers)
      if (pct >= pre.minimumCompletionPct) {
        return {
          precondition: pre,
          status: 'pass',
          message: `Customer Profile is ${pct}% complete (required: ${pre.minimumCompletionPct}%).`,
        }
      }
      return {
        precondition: pre,
        status: 'fail',
        message: `Customer Profile is only ${pct}% complete — needs ${pre.minimumCompletionPct}% before deploying this action.`,
      }
    }

    case 'license_required': {
      const snap = await loadLicenses()
      if (snap.kind === 'no_credentials') {
        return {
          precondition: pre,
          status: 'fail',
          message: 'No M365 credentials available for this customer — cannot check licenses.',
        }
      }
      if (snap.kind === 'unknown_permission_required') {
        return { precondition: pre, status: 'unknown', message: snap.reason }
      }
      const matched = pre.anyOf.find((l) => snapshotHasLicense(snap, l))
      if (matched) {
        return {
          precondition: pre,
          status: 'pass',
          message: `Customer has ${LICENSE_DISPLAY_NAMES[matched]}.`,
        }
      }
      const required = pre.anyOf.map((l) => LICENSE_DISPLAY_NAMES[l]).join(' OR ')
      return {
        precondition: pre,
        status: 'fail',
        message:
          `Customer does not have any of the required licenses (${required}). ` +
          'This action will fail at deploy time. Recommend upgrading the customer to a tier that includes one of those licenses.',
      }
    }

    default: {
      // Exhaustiveness sentinel — TypeScript narrows `pre` to `never` here
      // if every variant is handled above.
      const _exhaustive: never = pre
      void _exhaustive
      return {
        precondition: pre,
        status: 'unknown',
        message: 'Unhandled precondition kind — update src/lib/compliance/actions/preconditions.ts.',
      }
    }
  }
}
