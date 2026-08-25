// src/lib/connector/known-limits.ts
//
// What the connector deliberately does NOT do, per vendor, with a reason code.
//
// This is the ONE part of tct_connector_capabilities that cannot be generated
// from the live registry: absence of code is not self-describing. Missing
// capabilities are therefore reviewed DATA — a row here is a claim someone can
// challenge in a diff, and every row carries a reason code so "no" always comes
// with a why.
//
// REASON CODES
//   NOT_BUILT      the vendor API supports this; we have not implemented it
//   VENDOR_NO_API  the vendor's API genuinely does not expose this
//   BLOCKED        implemented but non-functional, with the known failure mode
//   POLICY_GATED   deliberately restricted by our own guardrails
//
// HONESTY RULE: every row states how the claim was established (`verifiedBy`).
// A VENDOR_NO_API row asserted only from memory is worse than no row at all,
// because it is the exact stale-belief failure this whole feature exists to fix.
// Rows still awaiting the full published-spec enumeration say so, in
// `verifiedBy`, rather than implying an audit that has not happened.

export type ReasonCode = 'NOT_BUILT' | 'VENDOR_NO_API' | 'BLOCKED' | 'POLICY_GATED'

export interface KnownLimit {
  capability: string
  reason: ReasonCode
  /** How this claim was established — never leave this vague. */
  verifiedBy: string
  /** For BLOCKED: what actually goes wrong. */
  failureMode?: string
  /** For NOT_BUILT: rough build priority, so "not yet" is actionable. */
  priority?: 'high' | 'medium' | 'low'
  notes?: string
}

const SPEC_AUDIT_PENDING =
  'Carried from prior in-tenant assessment recorded in docs/gotchas.md; re-verification against the current published vendor spec is PENDING (coverage audit in progress). Treat as strong prior, not a settled fact.'

// Rows carrying this were confirmed against LIVE entityInformation on the date
// given — not from memory, not from a doc. The connector now DERIVES these
// verdicts at call time (src/lib/connector/autotask-capability.ts), so this
// string records that a check happened; it is not the mechanism. If Kaseya
// ships a change, the live lookup reports the new truth and
// autotask_surface_drift_report flags the difference, rather than this file
// quietly continuing to assert a stale limitation.
// Same contract as LIVE_VERIFIED_2026_07_28, for the project/task/CRM sweep
// that shipped the project tools. Recorded because a dated check is auditable;
// the verdict itself is still re-derived live on every call.
const LIVE_VERIFIED_2026_08_25 =
  'Confirmed against LIVE entityInformation on 2026-08-25 via autotask_entity_capabilities. Re-derived live on every call — never served from this row.'

const LIVE_VERIFIED_2026_07_28 =
  'Confirmed against LIVE entityInformation on 2026-07-28 via autotask_entity_capabilities. Re-derived live on every call — never served from this row.'

export const KNOWN_LIMITS: Record<string, KnownLimit[]> = {
  'Autotask PSA (Kaseya)': [
    {
      capability: 'Read or write workflow rule (Event) definitions — conditions and actions',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'GET /v1.0/WorkflowRules/entityInformation returns 404 — there is no such REST entity on this instance. ' + LIVE_VERIFIED_2026_07_28,
      notes: 'Closest available surface is autotask_notification_history — what actually fired, not the rule that fired it.',
    },
    {
      capability: 'Read or write notification template content',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'GET /v1.0/NotificationTemplates/entityInformation returns 404 — there is no such REST entity on this instance. ' + LIVE_VERIFIED_2026_07_28,
      notes: 'Template NAMES appear in autotask_notification_history; bodies do not.',
    },
    {
      capability: 'Read or write SLA definitions (per-event targets, e.g. "first response in 1h")',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'No standalone SLA entity in the REST API; the SLA id→name map is derived from the ticket serviceLevelAgreementID picklist. ' + SPEC_AUDIT_PENDING,
      notes: 'Per-TICKET SLA results ARE available — autotask_ticket_sla_results.',
    },
    {
      capability: 'Read or write the status→SLA-event mapping (Admin > Task & Ticket Statuses)',
      reason: 'VENDOR_NO_API',
      verifiedBy: SPEC_AUDIT_PENDING,
      notes: 'Served from an owner-maintained overlay in our own database, labelled manual_overlay. Never presented as API data.',
    },
    {
      capability: 'Read or write dashboards and widgets',
      reason: 'VENDOR_NO_API',
      verifiedBy: SPEC_AUDIT_PENDING,
    },
    {
      capability: 'Write billing codes (create, update or delete)',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports BillingCodes canCreate false, canUpdate false, canDelete false (canQuery true). ' + LIVE_VERIFIED_2026_07_28,
      notes:
        'Reads work fully via autotask_list_billing_codes. NON-OBVIOUS: most BillingCodes FIELDS report isReadOnly false (name, unitPrice, unitCost, useType…), which looks writable — the ENTITY-level capability overrides that and forbids every write. Entity capability always wins over field flags.',
    },
    {
      capability: 'Delete a Service (the catalog entity, not a ticket)',
      reason: 'VENDOR_NO_API',
      verifiedBy: 'entityInformation reports Services.canDelete false (canCreate/canUpdate/canQuery all true). ' + LIVE_VERIFIED_2026_07_28,
      notes:
        'Deactivation IS available (isActive false) through the gated write flow, area service. ServiceBundles by contrast DO support delete (canDelete true), so do not generalise from one to the other.',
    },
    {
      capability: 'Set or change Services.markupRate / ServiceBundles.unitCost',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports Services.markupRate isReadOnly true and ServiceBundles.unitCost isReadOnly true. ' + LIVE_VERIFIED_2026_07_28,
      notes:
        'Both are computed by Autotask (markup from unitPrice/unitCost; a bundle\'s unitCost rolls up from its member services). The service_pricing allowlist previously accepted markupRate — a latent bug that would have failed or silently no-opped at execute time. Removed 2026-07-28.',
    },
    {
      capability: 'Edit an existing service-bundle membership row (ServiceBundleServices update)',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports ServiceBundleServices canCreate true, canDelete true, canUpdate FALSE. ' + LIVE_VERIFIED_2026_07_28,
      notes:
        'Membership is therefore add/remove only — change a bundle by deleting the row and creating a new one. Both are implemented behind the approval gate (area service_bundle_member).',
    },
    {
      capability: 'Delete a ticket note',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports TicketNotes.canDelete false (canQuery/canCreate/canUpdate all true), confirmed against LIVE metadata on 2026-08-10 and matching the Kaseya TicketNotes entity reference, which marks the entity updatable but not deletable.',
      notes:
        'EDITING a note IS available — autotask_update_ticket_note changes description/title/publish in place, which is what a correction actually needs. A note can therefore be corrected but never removed; do not offer a delete or imply an edit failed when a delete was wanted. Removing a note is a UI action for a human with the rights to it.',
    },
    {
      capability: 'Read or write queue routing, inbound email processing, queue notification settings',
      reason: 'VENDOR_NO_API',
      verifiedBy: SPEC_AUDIT_PENDING,
      notes: 'Queue membership IS readable via ResourceRoleQueues (autotask_list_queues).',
    },
    // The row that used to sit here claimed "Update project tasks — BLOCKED,
    // task PATCH returns 404 on all 3 entity paths". It was wrong, and it is
    // replaced rather than softened: autotask_update_task ships and works.
    // What the 404 actually was is recorded in docs/gotchas.md → Autotask.
    {
      capability: 'Delete a project, phase, task, task note or project note',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports canDelete FALSE on Projects, Phases, Tasks, TaskNotes and ProjectNotes (canQuery/canCreate/canUpdate all true on each). Read live on 2026-08-25 via autotask_entity_capabilities. ' + LIVE_VERIFIED_2026_08_25,
      notes:
        'UPDATE works on all five and is implemented — autotask_update_project / _project_phase / _task / _task_note. Retire a project by setting status 0 (Inactive) and a task by completing it; a note can be corrected in place but never removed. Do not offer a delete, and do not read a failed delete as a bug.',
    },
    {
      capability: 'Move a project to a different company, a phase to a different project, or a contact to a different company',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports Projects.companyID, Phases.projectID and Contacts.companyID each isRequired TRUE and isReadOnly TRUE — the parent is supplied by the create URL and is immutable thereafter. Read live on 2026-08-25. ' + LIVE_VERIFIED_2026_08_25,
      notes:
        'Contrast Tasks.projectID, which is required but NOT read-only. The connector therefore offers no parameter for any of the three, rather than accepting one and silently dropping it — the failure mode that let the IT Glue folder-move defect survive twelve days.',
    },
    {
      capability: 'Edit an existing task secondary-resource row (change its role in place)',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports TaskSecondaryResources canCreate true, canDelete true, canUpdate FALSE. Read live on 2026-08-25. ' + LIVE_VERIFIED_2026_08_25,
      notes:
        'Membership is add/remove only: change a secondary resource\'s role by removing the row and adding a new one. Both are implemented (autotask_add_task_secondary_resource / autotask_remove_task_secondary_resource). Same shape as ServiceBundleServices — do not generalise the other way, TaskPredecessors DOES support update.',
    },
    {
      capability: 'Re-point an existing task dependency to a different task',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports TaskPredecessors.predecessorTaskID and .successorTaskID both isReadOnly true (the entity itself is canCreate/canUpdate/canDelete true — only lagDays is mutable). Read live on 2026-08-25. ' + LIVE_VERIFIED_2026_08_25,
      notes: 'Remove the dependency and add the new one instead. Both are implemented.',
    },
    {
      capability: 'Delete a company',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'entityInformation reports Companies.canDelete FALSE (canQuery/canCreate/canUpdate true). Read live on 2026-08-25. ' + LIVE_VERIFIED_2026_08_25,
      notes:
        'Deactivation (isActive false) via autotask_update_company is the only retirement path. This is why autotask_create_company REFUSES a duplicate company name by default — an accidental company is permanent.',
    },
    {
      capability: 'Delete a contact, or delete a time entry',
      reason: 'POLICY_GATED',
      verifiedBy:
        'NOT a vendor limit — entityInformation reports Contacts.canDelete TRUE and TimeEntries.canDelete TRUE (read live 2026-08-25). No connector tool calls either, deliberately.',
      notes:
        'Deleting a contact drops its association with the ticket history irrecoverably; deleting billable time silently changes what a customer owes. Both have a safe alternative that preserves the record — isActive false on a contact, autotask_update_time_entry on an entry — so the destructive form is withheld until someone asks for it with a concrete need. This is a blast-radius decision, not an API gap: say so rather than reporting it as impossible.',
    },
    {
      capability: 'Read or write project CHARGES, expenses, or the project schedule/Gantt layout',
      reason: 'NOT_BUILT',
      verifiedBy:
        'No such tool in the live registry. The REST write surface for ProjectCharges/ExpenseItems has NOT been assessed against entityInformation — this row is a scope statement, not a capability claim.',
      priority: 'low',
      notes: 'Task dependencies and phases ARE implemented; scheduling beyond that (baselines, resource levelling) has not been looked at.',
    },
    {
      capability: 'Contract, invoice, opportunity and quote WRITES',
      reason: 'NOT_BUILT',
      verifiedBy: 'No such tool in the live registry; REST write surface not yet assessed.',
      priority: 'low',
      notes: 'Reads exist for contracts. Financial writes are deliberately last in line.',
    },
  ],

  'IT Glue': [
    {
      capability: 'Read or write passwords / credentials',
      reason: 'POLICY_GATED',
      verifiedBy:
        'Structural: no tool in src/lib/mcp-itglue-tools.ts ever calls the /passwords resource, and passwords are excluded on both ends of itglue_relate_items and itglue_upload_attachment.',
      notes: 'This is a deliberate blast-radius decision, not an API limitation. Do not "fix" it.',
    },
    {
      capability: 'Delete or archive a document',
      reason: 'NOT_BUILT',
      verifiedBy: 'Absent from the live registry (confirmed against the recorded tool list).',
      priority: 'medium',
      notes: 'Archiving is the safer of the two and the more useful for SOP cleanup. Live re-test of the API surface pending.',
    },
    {
      capability: 'Create or update Configuration Items (equipment records)',
      reason: 'NOT_BUILT',
      verifiedBy: 'Only itglue_org_configurations (read) is registered; no POST/PATCH tool exists.',
      priority: 'medium',
    },
    {
      capability: 'Move an existing document into a different folder (or back to the org root)',
      reason: 'VENDOR_NO_API',
      verifiedBy:
        'IT Glue\'s developer reference (api.itglue.com/developer, Documents resource) marks data[attributes][document_folder_id] "Not permitted in PUT/PATCH, optional in POST" on BOTH PATCH /documents/:id and the bulk PATCH /documents. Confirmed live against org 6942365: PATCH returns 200, IT Glue drops the attribute, the folder is unchanged (doc 24262329 → folder 5301326 on 2026-07-17; doc 24227609 → folder 6255494 on 2026-07-29).',
      notes:
        'Folder placement is CREATE-ONLY: pass documentFolderId to itglue_create_document. itglue_move_document stays registered but writes nothing and returns UPSTREAM_UNSUPPORTED, because a silent no-op cost twelve days of believing the move had worked. Existing documents are moved by a human in the IT Glue UI (Documents list → tick → Move).',
    },
    {
      capability: 'Delete a document folder',
      reason: 'POLICY_GATED',
      verifiedBy: 'Deliberately omitted when folder create was added; folder deletion is left to the IT Glue UI.',
      notes: 'Folder CREATE is supported. Document MOVE is NOT — see the row above; that is a vendor limit, not this policy choice.',
    },
    {
      capability: 'Account-wide document search across all organizations at once',
      reason: 'VENDOR_NO_API',
      verifiedBy: 'IT Glue exposes no account-wide search endpoint; itglue_global_search scopes to the TCT SOP org plus one passed org.',
    },
    {
      capability: 'Per-technician attribution on writes',
      reason: 'VENDOR_NO_API',
      verifiedBy: 'IT Glue has no impersonation mechanism (unlike Autotask). Writes record the API key identity.',
      notes: 'Autotask writes ARE attributed to the individual signed-in tech.',
    },
  ],

  'Datto RMM': [
    {
      capability: 'Any write at all — run a quick job, set a UDF, move a device, resolve an alert, set variables',
      reason: 'POLICY_GATED',
      verifiedBy:
        'Structural: every call routes through DattoRmmClient.getV2(), which accepts no method or body and can only issue GET against /api/v2/. A unit test proxies the client and fails on any other method.',
      priority: 'medium',
      notes: 'The vendor API DOES support these. Exposing them is a deliberate future decision requiring the staged-approval gate, not an API gap.',
    },
  ],

  'UniFi / Ubiquiti': [
    {
      capability: 'Port forwards, static routes, port profiles, gateway settings',
      reason: 'VENDOR_NO_API',
      verifiedBy: 'Absent from the official Integration API (OpenAPI 10.1.84 review, July 2026, recorded in docs/unifi-site-tools.md). ' + SPEC_AUDIT_PENDING,
    },
    {
      capability: 'Events / alarms, site health, ISP performance metrics',
      reason: 'VENDOR_NO_API',
      verifiedBy: 'Absent from the official Integration API. ' + SPEC_AUDIT_PENDING,
      notes: 'Site-level connectivity and outage history come from Domotz instead — but Domotz is not exposed through this connector yet.',
    },
    {
      capability: 'Locate/LED, client block/unblock/reconnect, firmware upgrade triggers',
      reason: 'VENDOR_NO_API',
      verifiedBy: 'Absent from the official Integration API. ' + SPEC_AUDIT_PENDING,
    },
    {
      capability: 'Multi-site or fleet-wide config changes in one call',
      reason: 'POLICY_GATED',
      verifiedBy:
        'Structural: every write tool takes exactly one consoleId, one siteId and one target by schema — no arrays, no wildcards.',
      notes: 'Deliberate. With ~85 client networks, mass changes are done by a human in unifi.ui.com. unifi_probe_consoles is the sole fleet-wide READ.',
    },
  ],

  'Microsoft Graph — TCT HumanResources SharePoint': [
    {
      capability: 'Anything outside TCT\'s own HumanResources SharePoint site',
      reason: 'POLICY_GATED',
      verifiedBy:
        'The connector authenticates with a dedicated Entra app holding Sites.Selected granted write on ONLY that one site — not the staff-SSO app.',
      notes: 'Chosen deliberately to keep an internet-reachable file-write credential out of the SSO/PTO/CFO secret. No mail, no Teams, no other site, no directory access.',
    },
    {
      capability: 'Mailbox conversion, delegate access, licence changes (M365 offboarding actions)',
      reason: 'POLICY_GATED',
      verifiedBy: 'Handled by the HR offboarding pipeline in the app (/api/hr/process), not exposed as connector tools.',
      notes: 'Deliberate: that pipeline enforces a required step ORDER (licence removal must follow mailbox conversion) that an ad-hoc tool call could violate.',
    },
  ],

  'TCT Sales Calculator (our own pricing)': [
    {
      capability: 'Change pricing — edit a rate, add or rename a tier, add a package or service',
      reason: 'POLICY_GATED',
      verifiedBy:
        'The connector registers only sales_pricing_catalog and sales_pricing_quote, both reads (confirmed against the recorded registry). Rate edits go through PUT /api/admin/sales-calculator/pricing, which requires a staff NextAuth session with the system_settings permission — an MCP bearer token cannot reach it.',
      notes: 'Deliberately NOT put behind the staged-write gate either: pricing is a business decision made in the editor UI, where the change is attributed and audited as an append-only row.',
    },
    {
      capability: 'Read, create or update SAVED customer quotes (sales_calc_saved_quotes)',
      reason: 'NOT_BUILT',
      verifiedBy:
        'The table and its CRUD API exist (/api/admin/sales-calculator/quotes) and are used by the calculator UI; no connector tool touches them. sales_pricing_quote is stateless — it computes and returns, it never persists.',
      priority: 'low',
      notes: 'Quoting a set of inputs works today; recalling "the quote we sent Acme in June" does not.',
    },
    {
      capability: 'Reconcile a quote against what Autotask actually bills the customer',
      reason: 'NOT_BUILT',
      verifiedBy:
        'Quote figures come from pricing.json + overrides; contracted services and rates live in Autotask (autotask_list_services / autotask_list_contracts). Nothing joins the two — any comparison today is manual.',
      priority: 'medium',
    },
    {
      capability: 'Price a Mac, tablet, phone, network device or non-Windows endpoint',
      reason: 'NOT_BUILT',
      priority: 'medium',
      verifiedBy:
        'Not a vendor limit but a MODEL limit: calc.ts totalDevices() counts devices.windowsPCs only, and pricing.json has no rate for any other endpoint class. Verified by reading the engine, not inferred.',
      notes: 'Quote those separately by hand. A quote for a Mac-heavy customer will understate the device line.',
    },
  ],

  // Whole vendors with app-side clients but ZERO connector tools. Called out as
  // their own section because this is the single largest coverage gap and it was
  // previously believed these WERE connected.
  'Not connected at all (client exists in the app, no MCP tools)': [
    {
      capability: 'RocketCyber — SOC alerts, incidents, agents',
      reason: 'NOT_BUILT',
      verifiedBy: 'src/lib/rocketcyber.ts exists and the SOC engine uses it; zero tools registered in the connector (confirmed against the recorded registry).',
      priority: 'high',
    },
    {
      capability: 'Datto EDR — endpoint detections, threats, isolation state',
      reason: 'NOT_BUILT',
      verifiedBy: 'src/lib/datto-edr.ts exists, SOC-only; zero tools registered.',
      priority: 'high',
    },
    {
      capability: 'SaaS Alerts — ITDR alerts and events',
      reason: 'NOT_BUILT',
      verifiedBy: 'src/lib/saas-alerts.ts exists; zero tools registered.',
      priority: 'high',
    },
    {
      capability: 'DNSFilter — query logs, blocked-domain breakdown, policies',
      reason: 'NOT_BUILT',
      verifiedBy: 'src/lib/dnsfilter.ts exists; zero tools registered.',
      priority: 'medium',
    },
    {
      capability: 'Domotz — site connectivity, outage history, device reachability',
      reason: 'NOT_BUILT',
      verifiedBy: 'src/lib/domotz.ts exists and powers the Site Connectivity report; zero tools registered.',
      priority: 'medium',
      notes: 'Would fill the UniFi VENDOR_NO_API gap on site health and outage history.',
    },
    {
      capability: 'Datto SaaS Protection and Datto BCDR — backup status and verification',
      reason: 'NOT_BUILT',
      verifiedBy: 'src/lib/datto-saas.ts and src/lib/datto-bcdr.ts exist; zero tools registered.',
      priority: 'medium',
    },
  ],
}
