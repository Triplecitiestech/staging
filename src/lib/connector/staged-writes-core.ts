// src/lib/connector/staged-writes-core.ts
//
// PURE logic for the connector's gated config writes: the allowlist of
// writable areas, staged-change validation, before→after diff rendering, and
// drift detection. No DB or network access — unit-tested in isolation
// (staged-writes-core.test.ts). The DB/execution half lives in
// ./staged-writes.ts.
//
// Every area below maps to an Autotask REST write path that was verified to
// exist in the API schema (swagger, July 2026). Notification templates,
// workflow rules, dashboards/widgets, and the status→SLA-event mapping have
// NO REST write surface — they are deliberately absent. The one non-Autotask
// area is `status_sla_overlay`, which writes the owner-maintained overlay
// row in our own database, never to Autotask.

export type ConfigWriteOperation = 'create' | 'update' | 'delete'

export interface ConfigWriteAreaSpec {
  area: string
  label: string
  targetSystem: 'autotask' | 'overlay'
  /** Root queryable entity used for before-snapshots (query by id). */
  entity: string
  /** REST path writes go to; child entities need the parent id. */
  writePath: (parentId?: number) => string
  /** Payload field that carries the parent id on create (child entities). */
  parentIdField?: string
  /** Snapshot field from which a missing parentId can be derived on update/delete. */
  parentIdFromField?: string
  operations: ConfigWriteOperation[]
  allowedFields: string[]
  requiredOnCreate?: string[]
  /** Fields concatenated into the human-readable target label. */
  labelFields: string[]
  risk: 'low' | 'billing'
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const BUSINESS_HOURS_FIELDS = [
  ...WEEKDAYS.flatMap((d) => [
    `${d}BusinessHoursStartTime`, `${d}BusinessHoursEndTime`,
    `${d}ExtendedHoursStartTime`, `${d}ExtendedHoursEndTime`,
  ]),
  'holidaySetID', 'holidayHoursType', 'noHoursOnHolidays',
  'holidayHoursStartTime', 'holidayHoursEndTime',
  'holidayExtendedHoursStartTime', 'holidayExtendedHoursEndTime',
]

export const CONFIG_WRITE_AREAS: Record<string, ConfigWriteAreaSpec> = {
  ticket_category: {
    area: 'ticket_category',
    label: 'Ticket category',
    targetSystem: 'autotask',
    entity: 'TicketCategories',
    writePath: () => 'TicketCategories',
    operations: ['update'],
    allowedFields: ['name', 'nickname', 'isActive', 'displayColorRGB'],
    labelFields: ['name'],
    risk: 'low',
  },
  holiday: {
    area: 'holiday',
    label: 'Holiday (in a holiday set)',
    targetSystem: 'autotask',
    entity: 'Holidays',
    writePath: (parentId) => `HolidaySets/${parentId}/Holidays`,
    parentIdField: 'holidaySetID',
    parentIdFromField: 'holidaySetID',
    operations: ['create', 'update', 'delete'],
    allowedFields: ['holidayName', 'holidayDate'],
    requiredOnCreate: ['holidayName', 'holidayDate'],
    labelFields: ['holidayName', 'holidayDate'],
    risk: 'low',
  },
  holiday_set: {
    area: 'holiday_set',
    label: 'Holiday set',
    targetSystem: 'autotask',
    entity: 'HolidaySets',
    writePath: () => 'HolidaySets',
    operations: ['create', 'update'],
    allowedFields: ['holidaySetName', 'holidaySetDescription'],
    requiredOnCreate: ['holidaySetName'],
    labelFields: ['holidaySetName'],
    risk: 'low',
  },
  business_hours: {
    area: 'business_hours',
    label: 'Internal location business hours',
    targetSystem: 'autotask',
    entity: 'InternalLocationWithBusinessHours',
    writePath: () => 'InternalLocationWithBusinessHours',
    operations: ['update'],
    allowedFields: BUSINESS_HOURS_FIELDS,
    labelFields: ['name'],
    risk: 'low',
  },
  checklist_library: {
    area: 'checklist_library',
    label: 'Checklist library',
    targetSystem: 'autotask',
    entity: 'ChecklistLibraries',
    writePath: () => 'ChecklistLibraries',
    operations: ['create', 'update'],
    allowedFields: ['name', 'description', 'isActive', 'entityType'],
    requiredOnCreate: ['name', 'entityType'],
    labelFields: ['name'],
    risk: 'low',
  },
  checklist_item: {
    area: 'checklist_item',
    label: 'Checklist library item',
    targetSystem: 'autotask',
    entity: 'ChecklistLibraryChecklistItems',
    writePath: (parentId) => `ChecklistLibraries/${parentId}/ChecklistItems`,
    parentIdField: 'checklistLibraryID',
    parentIdFromField: 'checklistLibraryID',
    operations: ['create', 'update', 'delete'],
    allowedFields: ['itemName', 'isImportant', 'position', 'knowledgebaseArticleID'],
    requiredOnCreate: ['itemName'],
    labelFields: ['itemName'],
    risk: 'low',
  },
  udf_list_item: {
    area: 'udf_list_item',
    label: 'UDF list option',
    targetSystem: 'autotask',
    entity: 'UserDefinedFieldListItems',
    writePath: (parentId) => `UserDefinedFields/${parentId}/ListItems`,
    parentIdField: 'udfFieldId',
    parentIdFromField: 'udfFieldId',
    operations: ['create', 'update'],
    allowedFields: ['valueForDisplay', 'valueForExport', 'isActive'],
    requiredOnCreate: ['valueForDisplay', 'valueForExport'],
    labelFields: ['valueForDisplay'],
    risk: 'low',
  },
  role_rate: {
    area: 'role_rate',
    label: 'Role (billing rate)',
    targetSystem: 'autotask',
    entity: 'Roles',
    writePath: () => 'Roles',
    operations: ['update'],
    allowedFields: ['hourlyRate', 'hourlyFactor', 'description', 'isActive'],
    labelFields: ['name'],
    risk: 'billing',
  },
  product_pricing: {
    area: 'product_pricing',
    label: 'Product (pricing)',
    targetSystem: 'autotask',
    entity: 'Products',
    writePath: () => 'Products',
    operations: ['update'],
    allowedFields: ['unitPrice', 'unitCost', 'msrp', 'markupRate', 'isActive'],
    labelFields: ['name'],
    risk: 'billing',
  },
  service_pricing: {
    area: 'service_pricing',
    label: 'Service (pricing)',
    targetSystem: 'autotask',
    entity: 'Services',
    writePath: () => 'Services',
    operations: ['update'],
    allowedFields: ['unitPrice', 'unitCost', 'markupRate', 'isActive', 'invoiceDescription'],
    labelFields: ['name'],
    risk: 'billing',
  },
  work_type_modifier: {
    area: 'work_type_modifier',
    label: 'Work type modifier',
    targetSystem: 'autotask',
    entity: 'WorkTypeModifiers',
    writePath: () => 'WorkTypeModifiers',
    operations: ['update'],
    allowedFields: ['modifierValue'],
    labelFields: ['id'],
    risk: 'billing',
  },
  payment_term: {
    area: 'payment_term',
    label: 'Payment term',
    targetSystem: 'autotask',
    entity: 'PaymentTerms',
    writePath: () => 'PaymentTerms',
    operations: ['create', 'update'],
    allowedFields: ['name', 'description', 'paymentDueInDays', 'isActive'],
    requiredOnCreate: ['name'],
    labelFields: ['name'],
    risk: 'billing',
  },
  status_sla_overlay: {
    area: 'status_sla_overlay',
    label: 'Status→SLA-event overlay (owner-maintained, stored in OUR database — Autotask has no API for this)',
    targetSystem: 'overlay',
    entity: 'ConnectorConfigOverlay',
    writePath: () => 'overlay:status_sla_events',
    operations: ['update'],
    allowedFields: ['mappings', 'note'],
    labelFields: [],
    risk: 'low',
  },
}

export const OVERLAY_KEY_STATUS_SLA = 'status_sla_events'

/** The SLA events Autotask's admin UI offers per status (Kaseya product docs). */
export const SLA_EVENT_NAMES = ['First Response', 'Resolution Plan', 'Waiting Customer', 'Resolved', 'Not mapped'] as const

export interface StagedChangeInput {
  area: string
  operation: ConfigWriteOperation
  entityId?: number
  parentId?: number
  changes: Record<string, unknown>
}

/** Throws a caller-actionable error if the staged change is not allowed. */
export function validateStagedChange(input: StagedChangeInput): ConfigWriteAreaSpec {
  const spec = CONFIG_WRITE_AREAS[input.area]
  if (!spec) {
    throw new Error(`Unknown config area '${input.area}'. Writable areas: ${Object.keys(CONFIG_WRITE_AREAS).join(', ')}`)
  }
  if (!spec.operations.includes(input.operation)) {
    throw new Error(`Operation '${input.operation}' is not supported for ${spec.area} (allowed: ${spec.operations.join(', ')}).`)
  }
  if ((input.operation === 'update' || input.operation === 'delete') && input.entityId == null) {
    throw new Error(`${input.operation} requires entityId (the ${spec.entity} id).`)
  }
  if (input.operation === 'create' && spec.parentIdField && input.parentId == null) {
    throw new Error(`create in ${spec.area} requires parentId (${spec.parentIdField}).`)
  }
  if (input.operation !== 'delete') {
    const keys = Object.keys(input.changes ?? {})
    if (!keys.length) throw new Error('changes must contain at least one field.')
    const bad = keys.filter((k) => !spec.allowedFields.includes(k))
    if (bad.length) {
      throw new Error(`Field(s) not writable in ${spec.area}: ${bad.join(', ')}. Allowed: ${spec.allowedFields.join(', ')}`)
    }
  }
  if (input.operation === 'create') {
    const missing = (spec.requiredOnCreate ?? []).filter((k) => input.changes?.[k] == null)
    if (missing.length) throw new Error(`create in ${spec.area} requires: ${missing.join(', ')}`)
  }
  return spec
}

export interface SlaOverlayMapping {
  statusId: number
  slaEvent: (typeof SLA_EVENT_NAMES)[number]
}

/** Validates overlay mappings against the LIVE status list (ids must exist). */
export function validateSlaOverlayMappings(
  mappings: unknown,
  liveStatuses: Array<{ id: number; label: string }>,
): SlaOverlayMapping[] {
  if (!Array.isArray(mappings) || !mappings.length) {
    throw new Error('mappings must be a non-empty array of { statusId, slaEvent }.')
  }
  const known = new Map(liveStatuses.map((s) => [s.id, s.label]))
  return mappings.map((m) => {
    const statusId = Number((m as Record<string, unknown>)?.statusId)
    const slaEvent = String((m as Record<string, unknown>)?.slaEvent ?? '')
    if (!known.has(statusId)) {
      throw new Error(`statusId ${statusId} is not an active ticket status on this instance (check autotask_ticket_statuses).`)
    }
    if (!(SLA_EVENT_NAMES as readonly string[]).includes(slaEvent)) {
      throw new Error(`slaEvent '${slaEvent}' invalid. Autotask's admin UI offers: ${SLA_EVENT_NAMES.join(' | ')}`)
    }
    return { statusId, slaEvent: slaEvent as SlaOverlayMapping['slaEvent'] }
  })
}

const show = (v: unknown): string => (v === undefined ? '(unset)' : JSON.stringify(v))

/** The subset of an area spec the snapshot/label helpers need (shared by Autotask + UniFi specs). */
type SnapshotSpec = Pick<ConfigWriteAreaSpec, 'label' | 'allowedFields' | 'labelFields'> & { parentIdFromField?: string }

/** Keep only the fields the gate cares about (allowlist + label + id + parent link). */
export function snapshotFields(spec: SnapshotSpec, row: Record<string, unknown>): Record<string, unknown> {
  const keep = new Set(['id', ...spec.allowedFields, ...spec.labelFields, ...(spec.parentIdFromField ? [spec.parentIdFromField] : [])])
  const out: Record<string, unknown> = {}
  for (const k of Array.from(keep)) if (k in row) out[k] = row[k]
  return out
}

export function buildTargetLabel(spec: SnapshotSpec, row: Record<string, unknown> | null, entityId?: number | string): string {
  const parts = spec.labelFields.map((f) => row?.[f]).filter((v) => v != null && v !== '')
  const label = parts.length ? parts.map(String).join(' · ') : null
  return `${spec.label}${label ? `: ${label}` : ''}${entityId != null ? ` (id ${entityId})` : ''}`
}

/** Human-readable field-by-field diff of exactly what will change. */
export function buildDiff(
  operation: ConfigWriteOperation,
  before: Record<string, unknown> | null,
  proposed: Record<string, unknown>,
): string {
  if (operation === 'create') {
    return Object.entries(proposed).map(([k, v]) => `+ ${k}: ${show(v)}`).join('\n')
  }
  if (operation === 'delete') {
    const rows = Object.entries(before ?? {}).map(([k, v]) => `- ${k}: ${show(v)}`)
    return ['DELETE this record:', ...rows].join('\n')
  }
  return Object.entries(proposed)
    .map(([k, v]) => {
      const prev = before?.[k]
      return JSON.stringify(prev) === JSON.stringify(v)
        ? `= ${k}: ${show(v)} (no change)`
        : `~ ${k}: ${show(prev)} → ${show(v)}`
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// UniFi tier-2 write areas (Cloud Connector Proxy → local Integration API)
// ---------------------------------------------------------------------------
//
// Same allowlist idea as CONFIG_WRITE_AREAS, adapted to UniFi: string ids,
// per-site collection paths, and risk labels. Every area below maps to a
// write path documented in the OFFICIAL UniFi Network Integration API —
// anything the official API cannot write (see docs/unifi-site-tools.md →
// "Omitted") is deliberately absent. Single-target is structural: one
// consoleId, one siteId, one targetId per staged change — no arrays.

export type UnifiWriteRisk = 'low' | 'medium' | 'high'

export interface UnifiWriteAreaSpec {
  area: string
  label: string
  /** Integration-API collection path relative to /v1 (item path = collection + /{targetId}). */
  collectionPath: (siteId: string) => string
  operations: ConfigWriteOperation[]
  allowedFields: string[]
  requiredOnCreate?: string[]
  labelFields: string[]
  risk: UnifiWriteRisk
}

// Field lists below were extracted from the official UniFi Network API
// OpenAPI spec, version 10.1.84 (developer.ui.com — the version that
// introduced firewall policies and adopt/forget). NOT writable through the
// official API and therefore absent here: port forwards, static routes,
// port profiles, site/gateway settings, firmware triggers, WLAN passphrases
// (securityConfiguration — a secret; the audit row must never store one),
// and policy/rule reordering (an ordered id ARRAY — multi-target by
// construction). Full omission list: docs/unifi-site-tools.md.
export const UNIFI_WRITE_AREAS: Record<string, UnifiWriteAreaSpec> = {
  unifi_firewall_policy: {
    area: 'unifi_firewall_policy',
    label: 'UniFi firewall policy',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/firewall/policies`,
    operations: ['create', 'update', 'delete'],
    allowedFields: ['enabled', 'name', 'description', 'action', 'source', 'destination', 'ipProtocolScope', 'connectionStateFilter', 'ipsecFilter', 'loggingEnabled', 'schedule'],
    requiredOnCreate: ['enabled', 'name', 'action', 'source', 'destination', 'ipProtocolScope', 'loggingEnabled'],
    labelFields: ['name'],
    risk: 'high',
  },
  unifi_firewall_zone: {
    area: 'unifi_firewall_zone',
    label: 'UniFi firewall zone',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/firewall/zones`,
    operations: ['create', 'update', 'delete'], // API allows deleting custom zones only
    allowedFields: ['name', 'networkIds'],
    requiredOnCreate: ['name', 'networkIds'],
    labelFields: ['name'],
    risk: 'high',
  },
  unifi_network: {
    area: 'unifi_network',
    label: 'UniFi network/VLAN',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/networks`,
    operations: ['create', 'update', 'delete'],
    allowedFields: ['management', 'name', 'enabled', 'vlanId', 'dhcpGuarding', 'isolationEnabled'],
    requiredOnCreate: ['management', 'name', 'enabled', 'vlanId'],
    labelFields: ['name'],
    risk: 'high',
  },
  unifi_wlan: {
    area: 'unifi_wlan',
    label: 'UniFi WLAN (WiFi broadcast)',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/wifi/broadcasts`,
    // No create: the API requires securityConfiguration on create, which
    // carries the passphrase — a secret this gate must never persist.
    operations: ['update', 'delete'],
    allowedFields: ['name', 'enabled', 'hideName', 'clientIsolationEnabled', 'uapsdEnabled', 'multicastToUnicastConversionEnabled'],
    labelFields: ['name'],
    risk: 'high',
  },
  unifi_acl_rule: {
    area: 'unifi_acl_rule',
    label: 'UniFi ACL rule',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/acl-rules`,
    operations: ['create', 'update', 'delete'],
    allowedFields: ['type', 'enabled', 'name', 'description', 'action', 'enforcingDeviceFilter', 'index', 'sourceFilter', 'destinationFilter'],
    requiredOnCreate: ['type', 'enabled', 'name', 'action'],
    labelFields: ['name'],
    risk: 'high',
  },
  unifi_dns_policy: {
    area: 'unifi_dns_policy',
    label: 'UniFi DNS policy',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/dns/policies`,
    operations: ['create', 'update', 'delete'],
    // Union of the record-type variants (A/AAAA/CNAME/MX/TXT/SRV/FORWARD_DOMAIN).
    allowedFields: ['type', 'enabled', 'domain', 'ipv4Address', 'ipv6Address', 'targetDomain', 'mailServerDomain', 'priority', 'text', 'serverDomain', 'service', 'protocol', 'port', 'weight', 'ipAddress', 'ttlSeconds'],
    requiredOnCreate: ['type', 'enabled'],
    labelFields: ['domain', 'type'],
    risk: 'medium',
  },
  unifi_traffic_matching_list: {
    area: 'unifi_traffic_matching_list',
    label: 'UniFi traffic matching list',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/traffic-matching-lists`,
    operations: ['create', 'update', 'delete'],
    allowedFields: ['type', 'name', 'items'],
    requiredOnCreate: ['type', 'name'],
    labelFields: ['name'],
    risk: 'medium',
  },
  unifi_device_adoption: {
    area: 'unifi_device_adoption',
    label: 'UniFi device adoption',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/devices`,
    operations: ['create', 'delete'], // create = adopt, delete = forget/unadopt
    allowedFields: ['macAddress', 'ignoreDeviceLimit'],
    requiredOnCreate: ['macAddress', 'ignoreDeviceLimit'],
    labelFields: ['name', 'macAddress'],
    risk: 'high',
  },
}

export interface UnifiStagedChangeInput {
  area: string
  operation: ConfigWriteOperation
  consoleId: string
  siteId: string
  targetId?: string
  changes: Record<string, unknown>
}

/** Throws a caller-actionable error if the staged UniFi change is not allowed. */
export function validateUnifiStagedChange(input: UnifiStagedChangeInput): UnifiWriteAreaSpec {
  const spec = UNIFI_WRITE_AREAS[input.area]
  if (!spec) {
    throw new Error(`Unknown UniFi write area '${input.area}'. Writable areas: ${Object.keys(UNIFI_WRITE_AREAS).join(', ') || '(none)'}`)
  }
  if (!spec.operations.includes(input.operation)) {
    throw new Error(`Operation '${input.operation}' is not supported for ${spec.area} (allowed: ${spec.operations.join(', ')}).`)
  }
  // Structural single-target rule: exactly one console, one site, one target.
  if (typeof input.consoleId !== 'string' || !input.consoleId.trim()) {
    throw new Error('consoleId is required (one console — resolve it with unifi_resolve_site).')
  }
  if (typeof input.siteId !== 'string' || !input.siteId.trim()) {
    throw new Error('siteId is required (one site — resolve it with unifi_resolve_site).')
  }
  if (input.operation === 'update' || input.operation === 'delete') {
    if (typeof input.targetId !== 'string' || !input.targetId.trim()) {
      throw new Error(`${input.operation} requires targetId (the ${spec.label} id).`)
    }
  }
  if (input.operation !== 'delete') {
    const keys = Object.keys(input.changes ?? {})
    if (!keys.length) throw new Error('changes must contain at least one field.')
    const bad = keys.filter((k) => !spec.allowedFields.includes(k))
    if (bad.length) {
      throw new Error(`Field(s) not writable in ${spec.area}: ${bad.join(', ')}. Allowed: ${spec.allowedFields.join(', ')}`)
    }
  }
  if (input.operation === 'create') {
    const missing = (spec.requiredOnCreate ?? []).filter((k) => input.changes?.[k] == null)
    if (missing.length) throw new Error(`create in ${spec.area} requires: ${missing.join(', ')}`)
  }
  return spec
}

/**
 * The ConnectorStagedWrite row has no UniFi-shaped columns (entityId is Int),
 * so the console + resource path are encoded into the entityPath string and
 * parsed back on execute. Round-trip is unit-tested.
 */
export function buildUnifiEntityPath(consoleId: string, resourcePath: string): string {
  return `consoles/${consoleId}${resourcePath}`
}

export function parseUnifiEntityPath(entityPath: string): { consoleId: string; resourcePath: string } | null {
  const m = /^consoles\/([^/]+)(\/.+)$/.exec(entityPath)
  return m ? { consoleId: m[1], resourcePath: m[2] } : null
}

/** Fields whose live value no longer matches the staged before-snapshot. */
export function detectDrift(
  snapshot: Record<string, unknown> | null,
  liveNow: Record<string, unknown> | null,
): string[] {
  if (!snapshot) return []
  if (!liveNow) return ['(record no longer exists)']
  return Object.keys(snapshot).filter((k) => JSON.stringify(snapshot[k]) !== JSON.stringify(liveNow[k]))
}
