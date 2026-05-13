/**
 * Build the BundleReportData payload from the database.
 *
 * Used by both the preview endpoint (returns HTML) and the send endpoint
 * (renders HTML + emails it). Keeping the data assembly here means the
 * template files can stay pure.
 */

import type { PoolClient } from 'pg'
import { getRemediationAction } from '../actions/catalog'
import type { ActionImpact } from '../actions/types'
import type { BundleReportData, BundleReportItem } from './types'

export async function buildBundleReportData(
  client: PoolClient,
  companyId: string,
  bundleId: string,
  staffEmail: string
): Promise<BundleReportData | null> {
  // Bundle + company
  const bundleRes = await client.query<{
    id: string
    title: string
    status: string
    customerFacingNotes: string | null
    sentBy: string | null
    sentAt: string | null
    companyDisplayName: string
  }>(
    `SELECT b.id, b.title, b.status, b."customerFacingNotes", b."sentBy", b."sentAt",
            c."displayName" AS "companyDisplayName"
     FROM compliance_change_bundles b
     JOIN companies c ON c.id = b."companyId"
     WHERE b.id = $1 AND b."companyId" = $2`,
    [bundleId, companyId]
  )
  if (bundleRes.rows.length === 0) return null
  const bundle = bundleRes.rows[0]

  // Items with their pending-change snapshots
  const itemsRes = await client.query<{
    displayOrder: number
    actionId: string
    actionVersion: string
    customerImpactSummary: string
    scheduledFor: string | null
    customerDecision: BundleReportItem['customerDecision']
    customerNote: string | null
    agreedDeploymentDate: string | null
  }>(
    `SELECT bi."displayOrder", pc."actionId", pc."actionVersion",
            pc."customerImpactSummary", pc."scheduledFor",
            bi."customerDecision", bi."customerNote", bi."agreedDeploymentDate"
     FROM compliance_change_bundle_items bi
     JOIN compliance_pending_changes pc ON pc.id = bi."pendingChangeId"
     WHERE bi."bundleId" = $1
     ORDER BY bi."displayOrder"`,
    [bundleId]
  )

  const items: BundleReportItem[] = itemsRes.rows.map((row) => {
    const action = getRemediationAction(row.actionId)
    // Defensive: if an action has been removed from the catalog after staging,
    // we still want to render the bundle with a fallback impact block rather
    // than crash. Staff sees this and can decide whether to send.
    const impact: ActionImpact = action?.impact ?? {
      userFacing: row.customerImpactSummary,
      operational: '(catalog entry no longer available)',
      blastRadius: 'none',
      estimatedDisruptionMinutes: 0,
      sessionDisruptive: false,
      requiresEndUserAction: false,
    }
    const frameworkLabels = (action?.satisfiesControls ?? []).map(
      (c) => `${frameworkLabel(c.frameworkId)} ${c.controlId}`
    )

    return {
      displayOrder: row.displayOrder,
      actionName: action?.name ?? `Unknown action: ${row.actionId}`,
      actionId: row.actionId,
      customerImpactSummary: row.customerImpactSummary,
      impact,
      frameworkLabels,
      proposedDate: row.scheduledFor,
      customerDecision: row.customerDecision,
      customerNote: row.customerNote,
      agreedDeploymentDate: row.agreedDeploymentDate,
    }
  })

  // Primary customer contact (best-effort). Falls back gracefully if no
  // primary contact is set; the bundle-send route validates a recipient
  // address before actually emailing.
  const contactRes = await client.query<{ name: string | null; email: string | null }>(
    `SELECT COALESCE("firstName" || ' ' || "lastName", "firstName", "lastName", email) AS name,
            email
     FROM company_contacts
     WHERE "companyId" = $1 AND ("isPrimary" = true OR "customerRole" = 'CLIENT_MANAGER')
     ORDER BY "isPrimary" DESC NULLS LAST, "createdAt" ASC
     LIMIT 1`,
    [companyId]
  )

  // Staff sender resolution — pull display name from staff_users if present.
  const staffRes = await client.query<{ name: string | null }>(
    `SELECT name FROM staff_users WHERE email = $1 LIMIT 1`,
    [staffEmail]
  )

  return {
    companyId,
    companyName: bundle.companyDisplayName,
    bundleId: bundle.id,
    bundleTitle: bundle.title,
    bundleStatus: bundle.status,
    customerFacingNotes: bundle.customerFacingNotes,
    sentBy: bundle.sentBy,
    sentAt: bundle.sentAt,
    items,
    staffSender: {
      name: staffRes.rows[0]?.name ?? 'Triple Cities Tech',
      email: staffEmail,
    },
    customerContact: {
      name: contactRes.rows[0]?.name ?? null,
      email: contactRes.rows[0]?.email ?? null,
    },
  }
}

function frameworkLabel(id: string): string {
  switch (id) {
    case 'cis-v8':
    case 'cis-v8-ig1':
    case 'cis-v8-ig2':
    case 'cis-v8-ig3':
      return 'CIS v8'
    case 'cmmc-l1':
      return 'CMMC L1'
    case 'cmmc-l2':
      return 'CMMC L2'
    case 'nist-800-171':
      return 'NIST 800-171'
    case 'hipaa':
      return 'HIPAA'
    case 'pci':
      return 'PCI DSS'
    default:
      return id
  }
}
