// src/lib/mcp-config-read-tools.ts
//
// Read tools for Autotask INSTANCE CONFIGURATION (statuses, categories,
// queues, billing codes, catalog, UDFs, business hours, notification
// history). All reads are LIVE against the Autotask REST API — nothing is
// cached or served from our database, except the clearly-labelled
// status→SLA-event overlay, which is owner-maintained because Autotask's
// REST API does not expose that admin setting at all.
//
// Verified API boundaries (do NOT "fix" these by deriving values): no
// workflow-rule, notification-template, dashboard/widget, SLA-definition,
// or status→SLA-event surface exists in the REST API.

import { z } from 'zod'
import { AutotaskClient } from '@/lib/autotask'
import { getStatusSlaOverlay } from '@/lib/connector/staged-writes'
import { FAILURE_ENVELOPE_TOOL_NOTE, toolFailure } from '@/lib/connector/failure-envelope'
import { buildAutotaskDriftReport, checkAutotaskCapability, connectorAutotaskEntities } from '@/lib/connector/autotask-drift'
import { capabilityCacheStats } from '@/lib/connector/autotask-capability'

let _client: AutotaskClient | null = null
function autotask(): AutotaskClient {
  if (!_client) _client = new AutotaskClient()
  return _client
}

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }
// Failures return the shared structured envelope (see failure-envelope.ts) so a
// caller can tell a vendor limit from a connector gap from a guardrail. Success
// responses are untouched.
function fail(err: unknown) { return toolFailure(err, { surface: 'autotask' }) }

// Entities readable through autotask_config_query. Every name verified to be
// a queryable REST entity (API schema, July 2026). This is a CONFIG allowlist
// — operational data (tickets, time entries, contacts…) has dedicated tools.
export const CONFIG_QUERY_ENTITIES = [
  'ActionTypes', 'ChecklistLibraries', 'ChecklistLibraryChecklistItems', 'ClassificationIcons',
  'CompanyCategories', 'ConfigurationItemCategories', 'ConfigurationItemTypes', 'ContactGroups',
  'ContractExclusionBillingCodes', 'ContractExclusionRoles', 'ContractExclusionSets', 'Countries',
  'Currencies', 'Departments', 'DomainRegistrars', 'Holidays', 'HolidaySets',
  'InternalLocationWithBusinessHours', 'InvoiceTemplates', 'NotificationHistory', 'OpportunityCategories',
  'PaymentTerms', 'Products', 'QuoteTemplates', 'ResourceRoleDepartments', 'ResourceRoleQueues',
  'ResourceServiceDeskRoles', 'Roles', 'ServiceBundles', 'ServiceBundleServices', 'Services', 'ShippingTypes', 'Skills',
  'Surveys', 'TagGroups', 'Tags', 'TaxCategories', 'TaxRegions', 'Taxes', 'TicketCategories',
  'TicketCategoryFieldDefaults', 'UserDefinedFieldDefinitions', 'UserDefinedFieldListItems', 'WorkTypeModifiers',
] as const

const FILTER_OPS = ['eq', 'noteq', 'gt', 'gte', 'lt', 'lte', 'contains', 'beginsWith', 'endsWith', 'exist', 'notExist', 'in'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerConfigReadTools(server: any) {
  server.registerTool(
    'autotask_ticket_statuses',
    {
      title: 'Autotask: ticket statuses (full config)',
      description: 'LIVE read of this instance\'s ticket status picklist with FULL API metadata: id, label, isActive, isSystem, isDefaultValue, sortOrder. HONEST LIMIT: the status→SLA-event mapping (Admin > Service Desk > Task & Ticket Statuses) is NOT exposed by the Autotask REST API — verified against the API schema. slaEventMapping is therefore either the owner-maintained overlay from OUR database (clearly labelled manual_overlay, with last-verified date; update it via the gated write flow, area status_sla_overlay) or an explicit not-available notice. Never treat overlay values as API data.',
      inputSchema: { includeInactive: z.boolean().optional().describe('Include inactive status values (default false)') },
    },
    async ({ includeInactive }: { includeInactive?: boolean }) => {
      try {
        const picklist = await autotask().getEntityPicklistDetailed('Tickets', 'status', includeInactive ?? false)
        const overlay = await getStatusSlaOverlay()
        return ok({
          statuses: picklist.options,
          slaEventMapping: overlay ?? {
            available: false,
            reason: 'Autotask\'s REST API does not expose the status→SLA-event mapping (no status entity; picklist metadata carries no SLA field). It lives only in Admin > Features & Settings > Service Desk (Tickets) > Task & Ticket Statuses. An owner-maintained overlay can be staged via autotask_stage_config_write (area: status_sla_overlay).',
          },
        })
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_entity_picklist',
    {
      title: 'Autotask: any picklist (full metadata)',
      description: 'LIVE full-metadata picklist for ANY entity field on this instance: id, label, isActive, isSystem, isDefaultValue, sortOrder, and parent linkage (e.g. entity Tickets field subIssueType returns each sub-issue with its parent issueType id + label). Common Tickets fields: status, priority, queueID, source, issueType, subIssueType, ticketType, ticketCategory, serviceLevelAgreementID. Use autotask_entity_capabilities to discover an entity\'s picklist fields. Read-only.',
      inputSchema: {
        entity: z.string().describe('REST entity name, e.g. Tickets, Companies, Contracts, Projects'),
        field: z.string().describe('Field name, e.g. subIssueType'),
        includeInactive: z.boolean().optional().describe('Include inactive values (default false)'),
      },
    },
    async ({ entity, field, includeInactive }: { entity: string; field: string; includeInactive?: boolean }) => {
      try {
        if (!/^[A-Za-z]+$/.test(entity)) throw new Error('entity must be a bare REST entity name, e.g. "Tickets".')
        return ok(await autotask().getEntityPicklistDetailed(entity, field, includeInactive ?? false))
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_list_ticket_categories',
    {
      title: 'Autotask: ticket categories + field defaults',
      description: 'LIVE ticket categories (name, nickname, active, global default, display color) with each category\'s FIELD DEFAULTS resolved to labels — including the default SLA, status, queue, priority, source, issue/sub-issue type, work type, title/description/resolution boilerplate. This answers "which SLA/queue does the X category apply by default". Category display/UI layout beyond these defaults is not exposed by the API. Read-only.',
      inputSchema: {
        includeDefaults: z.boolean().optional().describe('Include per-category field defaults (default true)'),
        includeInactive: z.boolean().optional().describe('Include inactive categories (default false)'),
      },
    },
    async ({ includeDefaults, includeInactive }: { includeDefaults?: boolean; includeInactive?: boolean }) => {
      try { return ok(await autotask().getTicketCategoriesWithDefaults(includeDefaults ?? true, includeInactive ?? false)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_list_queues',
    {
      title: 'Autotask: queues (config + membership)',
      description: 'LIVE ticket queues with full picklist metadata (id, label, isSystem, isDefaultValue, sortOrder) PLUS queue membership — which active technicians work each queue, from ResourceRoleQueues. HONEST LIMIT: queue routing, inbound-email processing, and queue notification settings are UI-only (not in the REST API). Read-only.',
      inputSchema: { includeMembers: z.boolean().optional().describe('Include per-queue technician membership (default true)') },
    },
    async ({ includeMembers }: { includeMembers?: boolean }) => {
      try { return ok(await autotask().getQueuesDetailed(includeMembers ?? true)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_list_billing_codes',
    {
      title: 'Autotask: billing codes (all types) + work type modifiers',
      description: 'LIVE billing codes as CONFIGURATION across ALL use types (labor/work types, material, milestone, service, internal…), with useType/billingCodeType labels, unit cost/price, markup, GL account, tax category, and contract-exclusion flag — plus the instance\'s WorkTypeModifiers. Filter with useType (numeric id from the useType labels in the output). NOTE: BillingCodes are READ-ONLY in the Autotask REST API (no write surface exists). WorkTypeModifiers carry no billing-code link field in the API, so they are listed unjoined. Read-only.',
      inputSchema: {
        useType: z.number().int().optional().describe('Limit to one use type id (e.g. 1 = labor/work types on this instance — verify via output labels)'),
        includeInactive: z.boolean().optional().describe('Include inactive codes (default false)'),
      },
    },
    async ({ useType, includeInactive }: { useType?: number; includeInactive?: boolean }) => {
      try { return ok(await autotask().getBillingCodesDetailed({ useType, includeInactive })) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_list_products',
    {
      title: 'Autotask: product catalog (config)',
      description: 'LIVE product catalog as configuration: name, SKU, manufacturer, unit cost/price/MSRP, markup, period type, billing type, price-cost method, category (labels resolved), procurement + serialization flags. Returns one API page (up to 500) with hasMore — narrow with search when true. Read-only (updates go through the gated write flow, area product_pricing).',
      inputSchema: {
        activeOnly: z.boolean().optional().describe('Default true'),
        search: z.string().optional().describe('Substring match on product name'),
      },
    },
    async ({ activeOnly, search }: { activeOnly?: boolean; search?: string }) => {
      try { return ok(await autotask().getProductsList({ activeOnly, search })) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_list_services',
    {
      title: 'Autotask: services + bundles (config)',
      description: 'LIVE recurring-service catalog and service bundles as configuration: name, description, invoice description, unit cost/price, markup, period type — and the SLA each service carries (serviceLevelAgreementID resolved to its name). Read-only (updates go through the gated write flow, area service_pricing).',
      inputSchema: { activeOnly: z.boolean().optional().describe('Default true') },
    },
    async ({ activeOnly }: { activeOnly?: boolean }) => {
      try { return ok(await autotask().getServicesList({ activeOnly })) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_list_udf_definitions',
    {
      title: 'Autotask: user-defined field definitions',
      description: 'LIVE user-defined field DEFINITIONS across the instance: name, udfType (Ticket/Company/CI/…), data type, display format, required/private/protected/portal-visible flags, default value, sort order, merge variable name, and — for list-type UDFs — every list option. Filter by udfType label substring (e.g. "ticket"). Read-only (list options are editable via the gated write flow, area udf_list_item).',
      inputSchema: { udfType: z.string().optional().describe('Filter by udfType label substring, e.g. "ticket"') },
    },
    async ({ udfType }: { udfType?: string }) => {
      try { return ok(await autotask().getUdfDefinitions({ udfType })) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_business_hours_holidays',
    {
      title: 'Autotask: business hours + holiday sets (SLA clock inputs)',
      description: 'LIVE internal locations with weekly business/extended hours, timezone, and holiday behaviour, plus every holiday set and its dated holidays. These are the inputs the SLA clock runs on. HONEST LIMIT: the SLA definitions themselves (per-SLA event targets like "first response in 1h") are NOT exposed by the REST API — only per-ticket SLA results are (autotask_ticket_sla_results). Read-only (editable via gated write areas business_hours / holiday / holiday_set).',
      inputSchema: {},
    },
    async () => {
      try { return ok(await autotask().getBusinessHoursAndHolidays()) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_notification_history',
    {
      title: 'Autotask: notification history (what actually fired)',
      description: 'LIVE log of notifications Autotask actually SENT: template name, type, recipient, sent time, and the ticket/project/task/company it came from. This is the closest the REST API gets to workflow-rule and notification-template visibility — rule definitions (Events/conditions/actions) and template content are NOT exposed by the API at all (verified). Use this to answer "which template/rule fired on X". Defaults to the last 7 days; returns whatever history the instance retains. Read-only.',
      inputSchema: {
        from: z.string().optional().describe('Window start, YYYY-MM-DD (default 7 days ago)'),
        to: z.string().optional().describe('Window end, YYYY-MM-DD (default now)'),
        ticketId: z.number().int().optional().describe('Limit to one ticket'),
        companyId: z.number().int().optional().describe('Limit to one company'),
        templateName: z.string().optional().describe('Substring match on template name'),
        max: z.number().int().optional().describe('Max rows (default 200, cap 500)'),
      },
    },
    async ({ from, to, ticketId, companyId, templateName, max }: { from?: string; to?: string; ticketId?: number; companyId?: number; templateName?: string; max?: number }) => {
      try {
        return ok(await autotask().getNotificationHistory({
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          ticketId, companyId, templateName, max,
        }))
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_config_query',
    {
      title: 'Autotask: query any config entity',
      description: `LIVE generic read over the instance's CONFIGURATION entities (allowlisted): ${CONFIG_QUERY_ENTITIES.join(', ')}. Optional server-side filters ({field, op, value}; ops ${FILTER_OPS.join('/')}) and includeFields. Returns one API page (≤500 rows) with hasMore. Ids in results are picklist/reference values — resolve labels with autotask_entity_picklist. Use autotask_entity_capabilities first to see an entity's fields. Read-only.`,
      inputSchema: {
        entity: z.enum(CONFIG_QUERY_ENTITIES).describe('Config entity to query'),
        filters: z.array(z.object({
          field: z.string(),
          op: z.enum(FILTER_OPS),
          value: z.unknown().optional().describe('Omit for exist/notExist'),
        })).optional().describe('Server-side filters, ANDed (default: all rows)'),
        includeFields: z.array(z.string()).optional().describe('Limit returned fields'),
        max: z.number().int().optional().describe('Max rows (default/cap 500)'),
      },
    },
    async ({ entity, filters, includeFields, max }: { entity: string; filters?: Array<{ field: string; op: string; value?: unknown }>; includeFields?: string[]; max?: number }) => {
      try { return ok(await autotask().queryConfigEntity(entity, filters ?? [], includeFields, max ?? 500)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_entity_capabilities',
    {
      title: 'Autotask: entity capabilities (live API metadata)',
      description: 'LIVE metadata for ANY REST entity, from the API\'s own entityInformation endpoints: can it be queried/created/updated/deleted, does it support UDFs/webhooks, and every field with type, required/read-only flags, picklist + parent-picklist info, and reference targets. Answers "can the API even see/change X?" authoritatively for this instance. Read-only.',
      inputSchema: { entity: z.string().describe('REST entity name, e.g. TicketCategories') },
    },
    async ({ entity }: { entity: string }) => {
      try { return ok(await autotask().getEntityCapabilities(entity)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_capability_check',
    {
      title: 'Autotask: can this be done? (ask BEFORE attempting)',
      description:
        'PRE-FLIGHT capability check — call this BEFORE attempting an Autotask action, instead of attempting it and interpreting the failure. ' +
        'Answers "can this instance create a Service?" (entity + operation) or "is Services.periodType writable?" (entity + field) from LIVE entityInformation, cached briefly. ' +
        'Returns a verdict in four buckets: SUPPORTED_AND_IMPLEMENTED (go ahead), SUPPORTED_NOT_IMPLEMENTED (the API allows it, the connector has not built it — a Claude Code task), ' +
        'UPSTREAM_UNSUPPORTED (the Autotask API cannot do it — do not promise it and do not seek a workaround), POLICY_GATED (built, but staged human approval is required), or UNKNOWN. ' +
        'Also returns reasonCodeIfAttempted + fixableBy, so you can tell the user WHO fixes it before anything is tried. ' +
        'Vendor limitations are always derived live and never hardcoded — if a lookup fails, you get TRANSIENT rather than a false "unsupported". ' +
        `Read-only; writes nothing. ${FAILURE_ENVELOPE_TOOL_NOTE}`,
      inputSchema: {
        entity: z.string().describe('REST entity name, e.g. Services, ServiceBundles, BillingCodes'),
        operation: z.enum(['query', 'create', 'update', 'delete']).optional().describe('Operation to check (default query when no field is given)'),
        field: z.string().optional().describe('Field name to check for writability, e.g. markupRate. Takes precedence over operation.'),
      },
    },
    async ({ entity, operation, field }: { entity: string; operation?: 'query' | 'create' | 'update' | 'delete'; field?: string }) => {
      try { return ok(await checkAutotaskCapability({ entity, operation, field })) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_surface_drift_report',
    {
      title: 'Autotask: connector-vs-API drift report (tracked backlog)',
      description:
        'Diffs what the connector EXPOSES for Autotask against what LIVE entityInformation says the API now permits, and lists every gap. ' +
        'Turns "the MCP is not built out" from a mid-task surprise into a backlog: gaps[] carries missingOperations (the API allows create/update/delete, no connector area offers it) ' +
        'and missingWritableFields (the API reports the field writable, no allowlist includes it) — each a NOT_IMPLEMENTED candidate build task. ' +
        'suspectAllowlistedFields is the inverse and more urgent: a field the connector claims to accept that the API reports read-only or does not have, i.e. a latent bug that would fail or silently no-op at execute time. ' +
        'unchecked[] lists entities whose live lookup failed — never read those as "no gaps". Both sides are derived from live data and the connector\'s own constants, so this cannot go stale. ' +
        `Read-only; writes nothing. Slow on a full sweep (one metadata lookup per entity, cached). ${FAILURE_ENVELOPE_TOOL_NOTE}`,
      inputSchema: {
        entities: z.array(z.string()).optional().describe(`Limit the sweep to these entities. Default: all ${connectorAutotaskEntities().length} Autotask entities the connector touches.`),
        includeAligned: z.boolean().optional().describe('List entities with no gaps by name (default true)'),
        forceRefresh: z.boolean().optional().describe('Bypass the metadata cache and re-read live (default false)'),
      },
    },
    async ({ entities, includeAligned, forceRefresh }: { entities?: string[]; includeAligned?: boolean; forceRefresh?: boolean }) => {
      try {
        const report = await buildAutotaskDriftReport({ entities, includeAligned, forceRefresh })
        return ok({ ...report, capabilityCache: capabilityCacheStats() })
      } catch (e) { return fail(e) }
    }
  )
}
