/**
 * Bundle Report — data shape passed into the HTML + email templates.
 *
 * Built by the orchestrator (build-data.ts) from compliance_change_bundles
 * + compliance_change_bundle_items + compliance_pending_changes + the
 * action catalog. Templates are pure presentation; they don't touch the
 * DB or the catalog directly.
 */

import type { ActionImpact } from '../actions/types'

export interface BundleReportItem {
  /** Sort order in the report. */
  displayOrder: number
  /** Catalog action display name. */
  actionName: string
  /** Stable action id (for staff cross-reference; not shown to customers). */
  actionId: string
  /** Plain-English customer impact statement (from the pending change, possibly edited by staff). */
  customerImpactSummary: string
  /** Cached impact metadata snapshot from the catalog at staging time. */
  impact: ActionImpact
  /** Frameworks/controls satisfied — shown as "Required for: CIS v8 §6.3, CMMC L1 IA.L1-3.5.3". */
  frameworkLabels: string[]
  /** Proposed deployment date (ISO datetime). */
  proposedDate: string | null
  /** Customer decision so far (when re-rendering a partially-decided bundle). */
  customerDecision: 'approved' | 'declined' | 'deferred' | null
  customerNote: string | null
  agreedDeploymentDate: string | null
}

export interface BundleReportData {
  companyId: string
  companyName: string
  bundleId: string
  bundleTitle: string
  bundleStatus: string
  customerFacingNotes: string | null
  sentBy: string | null
  sentAt: string | null
  items: BundleReportItem[]
  /** Email of the TCT staff member to address the report from. */
  staffSender: {
    name: string
    email: string
  }
  /** Primary customer contact name + email for the salutation + delivery. */
  customerContact: {
    name: string | null
    email: string | null
  }
}

/** Plain-English blast radius label. */
export function describeBlastRadius(impact: ActionImpact): string {
  switch (impact.blastRadius) {
    case 'tenant_wide':
      return 'Everyone in your organization'
    case 'group':
      return 'Specific team or group'
    case 'per_user':
      return 'Each employee (personal action required)'
    case 'per_device':
      return 'Each company laptop or workstation'
    case 'none':
      return 'No direct end-user impact'
  }
}
