/**
 * Tenant License Detection
 *
 * Maps the customer's Microsoft 365 subscribedSkus into the logical
 * LicenseSku tiers used by Precondition declarations in the action
 * catalog. Handles Microsoft's SKU renames + license inclusion chains
 * (e.g. M365 Business Premium implies Entra ID P1 + Intune + Defender
 * for Business).
 *
 * Used by src/lib/compliance/actions/preconditions.ts. Read-only —
 * never mutates tenant state.
 *
 * Permission requirements:
 *   /subscribedSkus requires Organization.Read.All or Directory.Read.All.
 *   When that permission isn't granted, getTenantLicenses returns
 *   `unknown_permission_required`. Callers should treat this as
 *   "indeterminate — manual review required" rather than as a license
 *   failure; the tech still sees a clear signal.
 */

import { getTenantCredentials, createGraphClient } from '@/lib/graph'
import type { LicenseSku } from './actions/types'

/**
 * Maps our logical LicenseSku → Microsoft's `skuPartNumber` values.
 * Multiple Microsoft SKUs can map to one logical license because
 * Microsoft has renamed and re-bundled offerings over time. Match is
 * case-insensitive.
 */
const SKU_TO_MICROSOFT: Record<LicenseSku, readonly string[]> = {
  entra_id_p1: ['AAD_PREMIUM'],
  entra_id_p2: ['AAD_PREMIUM_P2'],
  m365_business_basic: ['O365_BUSINESS_ESSENTIALS', 'M365_BUSINESS_BASIC'],
  m365_business_standard: ['O365_BUSINESS_PREMIUM', 'M365_BUSINESS_STANDARD'],
  m365_business_premium: ['SPB'],
  m365_e3: ['SPE_E3'],
  m365_e5: ['SPE_E5'],
  office_365_e3: ['ENTERPRISEPACK'],
  office_365_e5: ['ENTERPRISEPREMIUM', 'ENTERPRISEPREMIUM_NOPSTNCONF'],
  intune: ['INTUNE_A', 'INTUNE_A_VL', 'INTUNE_A_D'],
  defender_endpoint_p1: ['DEFENDER_ENDPOINT_P1', 'WIN_DEF_ATP'],
  defender_endpoint_p2: ['DEFENDER_ENDPOINT_P2', 'WIN10_PRO_ENT_SUB'],
}

/**
 * License inclusion: holding the key license implies you also have all
 * the values. Resolved after raw SKU detection so a single subscribed
 * SKU surfaces every logical license it covers.
 *
 * Sources: Microsoft 365 service description tables and the M365 admin
 * "What's included" listings.
 */
const SKU_IMPLIES: Partial<Record<LicenseSku, readonly LicenseSku[]>> = {
  m365_business_premium: ['entra_id_p1', 'intune', 'defender_endpoint_p1'],
  m365_e3: ['entra_id_p1', 'intune'],
  m365_e5: ['entra_id_p2', 'intune', 'defender_endpoint_p2', 'defender_endpoint_p1'],
  office_365_e5: ['defender_endpoint_p1'],
}

/** Human-friendly display name for a logical license. */
export const LICENSE_DISPLAY_NAMES: Record<LicenseSku, string> = {
  entra_id_p1: 'Microsoft Entra ID P1',
  entra_id_p2: 'Microsoft Entra ID P2',
  m365_business_basic: 'Microsoft 365 Business Basic',
  m365_business_standard: 'Microsoft 365 Business Standard',
  m365_business_premium: 'Microsoft 365 Business Premium',
  m365_e3: 'Microsoft 365 E3',
  m365_e5: 'Microsoft 365 E5',
  office_365_e3: 'Office 365 E3',
  office_365_e5: 'Office 365 E5',
  intune: 'Microsoft Intune',
  defender_endpoint_p1: 'Microsoft Defender for Endpoint P1',
  defender_endpoint_p2: 'Microsoft Defender for Endpoint P2',
}

export interface TenantLicenseSnapshot {
  kind: 'licensed'
  /** Raw Microsoft skuPartNumber values returned by /subscribedSkus. */
  rawSkus: string[]
  /** Logical licenses detected (including ones implied via inclusion chains). */
  detected: LicenseSku[]
  /** Total seats consumed per Microsoft SKU. */
  seatCounts: Record<string, number>
}

export interface UnknownLicenseSnapshot {
  kind: 'unknown_permission_required'
  reason: string
}

export interface MissingCredentialsSnapshot {
  kind: 'no_credentials'
}

export type LicenseDetectionResult =
  | TenantLicenseSnapshot
  | UnknownLicenseSnapshot
  | MissingCredentialsSnapshot

/**
 * Detect the customer's M365 licenses. Returns one of three states so
 * callers can distinguish "licensed but missing license X" from
 * "we couldn't even check — Organization.Read.All not granted".
 */
export async function getTenantLicenses(companyId: string): Promise<LicenseDetectionResult> {
  const creds = await getTenantCredentials(companyId)
  if (!creds) return { kind: 'no_credentials' }

  const graph = createGraphClient(creds)
  let skus
  try {
    skus = await graph.getLicenseSkus()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // /subscribedSkus needs Organization.Read.All. If that's the only thing
    // missing, surface a useful state — don't conflate with "we couldn't
    // connect at all".
    if (msg.includes('Authorization_RequestDenied') || msg.includes('(403)')) {
      return {
        kind: 'unknown_permission_required',
        reason:
          'Microsoft Graph /subscribedSkus requires Organization.Read.All. ' +
          'Grant it on the TCT Customer Portal app registration and ask the ' +
          'customer admin to re-consent. Until then, license-aware preconditions ' +
          'will surface as "indeterminate — manual review required".',
      }
    }
    throw err
  }

  const rawSkus = skus.map((s) => s.skuPartNumber)
  const detected = new Set<LicenseSku>()

  for (const [logical, microsoftSkus] of Object.entries(SKU_TO_MICROSOFT) as Array<[
    LicenseSku,
    readonly string[],
  ]>) {
    if (microsoftSkus.some((ms) => rawSkus.some((r) => r.toLowerCase() === ms.toLowerCase()))) {
      detected.add(logical)
    }
  }

  // Apply inclusion chains. Iterate over a snapshot since we mutate the set.
  const seed = Array.from(detected)
  for (const sku of seed) {
    const implied = SKU_IMPLIES[sku] ?? []
    for (const i of implied) detected.add(i)
  }

  const seatCounts: Record<string, number> = {}
  for (const s of skus) {
    seatCounts[s.skuPartNumber] = s.consumedUnits ?? 0
  }

  return {
    kind: 'licensed',
    rawSkus,
    detected: Array.from(detected),
    seatCounts,
  }
}

/** Whether a snapshot includes a given logical license. */
export function snapshotHasLicense(
  snapshot: LicenseDetectionResult,
  license: LicenseSku
): boolean {
  return snapshot.kind === 'licensed' && snapshot.detected.includes(license)
}
