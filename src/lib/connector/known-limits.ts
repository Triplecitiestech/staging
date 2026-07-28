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

export const KNOWN_LIMITS: Record<string, KnownLimit[]> = {
  'Autotask PSA (Kaseya)': [
    {
      capability: 'Read or write workflow rule (Event) definitions — conditions and actions',
      reason: 'VENDOR_NO_API',
      verifiedBy: SPEC_AUDIT_PENDING,
      notes: 'Closest available surface is autotask_notification_history — what actually fired, not the rule that fired it.',
    },
    {
      capability: 'Read or write notification template content',
      reason: 'VENDOR_NO_API',
      verifiedBy: SPEC_AUDIT_PENDING,
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
      capability: 'Write billing codes',
      reason: 'VENDOR_NO_API',
      verifiedBy: 'BillingCodes expose no write surface in the REST API. ' + SPEC_AUDIT_PENDING,
      notes: 'Reads work fully via autotask_list_billing_codes.',
    },
    {
      capability: 'Read or write queue routing, inbound email processing, queue notification settings',
      reason: 'VENDOR_NO_API',
      verifiedBy: SPEC_AUDIT_PENDING,
      notes: 'Queue membership IS readable via ResourceRoleQueues (autotask_list_queues).',
    },
    {
      capability: 'Update project tasks (PATCH to task entities)',
      reason: 'BLOCKED',
      verifiedBy: 'Live 404 on task PATCH write-back, recorded in CLAUDE.md critical gotchas.',
      failureMode: 'Task PATCH returns 404. Notes and time entries POST to tasks fine — it is specifically the task-record update that fails.',
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
      capability: 'Delete a document folder',
      reason: 'POLICY_GATED',
      verifiedBy: 'Deliberately omitted when folder create was added; folder deletion is left to the IT Glue UI.',
      notes: 'Folder CREATE and document MOVE are both supported.',
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
