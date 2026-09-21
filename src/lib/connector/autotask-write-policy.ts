// src/lib/connector/autotask-write-policy.ts
//
// Which Autotask entities a caller may write DIRECTLY, and which go through the
// staged human-approval gate.
//
// The existing rule, unchanged: the approval gate is for instance
// CONFIGURATION — things that change how the PSA behaves for everyone. Writes
// to operational RECORDS (a ticket, a note, an hour of time, a charge on a
// ticket) are single rows a technician could type by hand, correctable in the
// UI, and they stay ungated.
//
// THE DEFAULT IS THE GATE, AND THAT IS THE DESIGN
// ----------------------------------------------
// This map lists the OPERATIONAL entities. Everything else — including every
// entity Kaseya adds after this file was written — defaults to `staged`.
//
// That direction matters. If the default were `direct`, a new Autotask entity
// would arrive unreviewed with full write access. If the default were "not
// exposed", we would be back to the hand-picked surface this whole change
// exists to abolish, and the next $45 shipping charge would be blocked again.
// `staged` is the only default that is both SAFE and NON-BLOCKING: the
// capability exists from the day Kaseya ships it, and its first use costs one
// human approval at /admin/connector/staged-writes.
//
// So a missing entry here degrades to "needs a click", never to "cannot be
// done" — which is the opposite of how every previous gap behaved.
//
// This is REVIEWED DATA, in the same sense as TOOL_FACTS and DIRECT_WRITE_TOOLS:
// deciding that an entity is operational rather than configuration is a
// judgement that belongs in a diff, not in a regex over entity names.

import { canonicalEntityName, catalogueEntityNames } from './autotask-catalogue'

export type WritePolicy = 'direct' | 'staged'

/**
 * Entities whose rows are OPERATIONAL records, written directly and attributed
 * to the signed-in technician by Autotask resource impersonation.
 *
 * Every one of these is a record a technician creates in the normal course of a
 * working day, and every one is correctable or removable afterwards in the UI.
 */
export const OPERATIONAL_ENTITIES: readonly string[] = [
  // Service desk
  'Tickets',
  'TicketNotes',
  'TicketCharges',
  'TicketChecklistItems',
  'TicketSecondaryResources',
  'TicketAdditionalContacts',
  'TicketAdditionalConfigurationItems',
  'TicketAttachments',
  'TicketNoteAttachments',
  'TicketHistory',
  'TicketRmaCredits',
  // Time and expense
  'TimeEntries',
  'TimeEntryAttachments',
  'ExpenseItems',
  'ExpenseReports',
  'ExpenseItemAttachments',
  'ExpenseReportAttachments',
  // Projects
  'Projects',
  'ProjectNotes',
  'ProjectAttachments',
  'ProjectCharges',
  'Phases',
  'Tasks',
  'TaskNotes',
  'TaskAttachments',
  'TaskSecondaryResources',
  'TaskPredecessors',
  // Scheduling
  'ServiceCalls',
  'ServiceCallTickets',
  'ServiceCallTasks',
  'ServiceCallTicketResources',
  'ServiceCallTaskResources',
  'Appointments',
  'CompanyToDos',
  'ResourceTimeOffBalances',
  // CRM and quote-to-cash
  'Companies',
  'CompanyNotes',
  'CompanyAttachments',
  'CompanyLocations',
  'CompanySiteConfigurations',
  'Contacts',
  'ContactBillingProductAssociations',
  'Opportunities',
  'OpportunityAttachments',
  'Quotes',
  'QuoteItems',
  'SalesOrders',
  // Assets
  'ConfigurationItems',
  'ConfigurationItemNotes',
  'ConfigurationItemAttachments',
  'ConfigurationItemRelatedItems',
  'ConfigurationItemBillingProductAssociations',
  'ConfigurationItemDnsRecords',
  'ConfigurationItemSslSubjectAlternativeNames',
  // Procurement and inventory
  'PurchaseOrders',
  'PurchaseOrderItems',
  'PurchaseOrderItemReceiving',
  'InventoryItems',
  'InventoryItemSerialNumbers',
  'InventoryTransfers',
  'InventoryLocations',
  // Attachments and documents on operational records
  'AttachmentInfo',
  'DocumentAttachments',
  'CompanyAttachments',
  'CompanyNoteAttachments',
  'ContractNotes',
  'ContractNoteAttachments',
  'ConfigurationItemNoteAttachments',
  'ProjectNoteAttachments',
  'TaskNoteAttachments',
  'ResourceAttachments',
  'SalesOrderAttachments',
] as const

const operationalSet = new Set(OPERATIONAL_ENTITIES.map((e) => e.toLowerCase()))

/**
 * The write policy for one entity.
 *
 * Never throws and never returns "unavailable": an unknown entity is `staged`,
 * because a capability that needs a click is a capability, and a capability
 * that does not exist is the bug.
 */
export function writePolicyFor(entity: string): WritePolicy {
  return operationalSet.has(canonicalEntityName(entity).toLowerCase()) ? 'direct' : 'staged'
}

/**
 * Operational entity names listed here that the live catalogue does not have.
 *
 * A name in this list that Autotask has never heard of is dead weight that
 * silently does nothing — the same class of defect as a typo in a
 * `parentIdField`, which is reportable for exactly that reason. Surfaced by the
 * coverage test rather than left to review.
 */
export function unknownOperationalEntities(): string[] {
  const known = new Set(catalogueEntityNames().map((n) => n.toLowerCase()))
  return OPERATIONAL_ENTITIES.filter((e) => !known.has(e.toLowerCase()))
}
