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
  /**
   * Human-facing note about convenience inputs the payload builder accepts
   * (see normalizeUnifiChanges) that are NOT raw allowlist fields — surfaced in
   * the unifi_stage_config_write tool description so callers know they exist.
   */
  inputHint?: string
  labelFields: string[]
  risk: UnifiWriteRisk
}

// Field lists below were extracted from the official UniFi Network API
// OpenAPI spec. Base surface (firewall policies, DNS policies, adopt/forget)
// verified against 10.1.84; the network create/update schema was re-verified
// against the current published spec (v10.3.58, the newest developer.ui.com
// publishes — 10.4.x docs are not published, but a live 10.4.57 console
// enforces the same required set). 10.2+ made ipv4Configuration,
// internetAccessEnabled, isolationEnabled and cellularBackupEnabled mandatory
// on GATEWAY network create; those are exposed here and defaulted/derived by
// normalizeUnifiChanges(). NOT writable through the official API and therefore
// absent: port forwards, static routes, port profiles, site/gateway settings,
// firmware triggers, WLAN passphrases (securityConfiguration — a secret; the
// audit row must never store one), and policy/rule reordering (an ordered id
// ARRAY — multi-target by construction). Full omission list:
// docs/unifi-site-tools.md.
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
    // Real Integration API fields. On GATEWAY create the API requires
    // ipv4Configuration + internetAccessEnabled + isolationEnabled +
    // cellularBackupEnabled (10.2+); normalizeUnifiChanges() supplies safe
    // defaults and derives ipv4Configuration from the `subnet`/`dhcp*`
    // convenience inputs, so a caller only has to pass name + vlanId.
    // mdnsForwardingEnabled, zoneId and ipv6Configuration are optional raw
    // passthroughs. (management defaults to GATEWAY; SWITCH/UNMANAGED creation
    // is not defaulted — pass a raw ipv4Configuration or use unifi.ui.com.)
    allowedFields: ['management', 'name', 'enabled', 'vlanId', 'dhcpGuarding', 'isolationEnabled', 'internetAccessEnabled', 'cellularBackupEnabled', 'ipv4Configuration', 'ipv6Configuration', 'mdnsForwardingEnabled', 'zoneId'],
    requiredOnCreate: ['name', 'vlanId'],
    inputHint:
      'network create/update also accepts convenience inputs (inside `changes`) that expand into ipv4Configuration with sensible defaults: ' +
      'subnet (IPv4 CIDR = gateway host IP + prefix, e.g. "192.168.50.1/24"; on create, if omitted it is derived from vlanId as 192.168.<vlanId>.1/24 for vlanId 2-254), ' +
      'dhcpMode ("SERVER" default | "RELAY" | "NONE"), dhcpStart + dhcpStop (DHCP pool; auto-derived from the subnet when omitted), dhcpLeaseTimeSeconds (default 86400), ' +
      'dhcpDnsServers (string[]), dhcpDomainName, dhcpRelayServers (string[], required when dhcpMode=RELAY). ' +
      'Create defaults when omitted: management=GATEWAY, enabled=true, internetAccessEnabled=true, isolationEnabled=false, cellularBackupEnabled=false. ' +
      'For full control pass a raw ipv4Configuration object instead of the convenience inputs (not both).',
    labelFields: ['name'],
    risk: 'high',
  },
  unifi_wlan: {
    area: 'unifi_wlan',
    label: 'UniFi WLAN (WiFi broadcast)',
    collectionPath: (siteId) => `/sites/${encodeURIComponent(siteId)}/wifi/broadcasts`,
    // No create: the API requires securityConfiguration on create, which
    // carries the passphrase — a secret this gate must never persist.
    // `network` binds the SSID to a network/VLAN: { type: "NATIVE" } or
    // { type: "SPECIFIC", networkId: "<uuid>" } — the SSID→VLAN binding a
    // segmentation project needs. `uapsdEnabled` was removed: it is not in the
    // current WiFi broadcast schema (it silently drifted; setting it 400s).
    operations: ['update', 'delete'],
    allowedFields: ['name', 'enabled', 'hideName', 'clientIsolationEnabled', 'multicastToUnicastConversionEnabled', 'network'],
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
  // '/' is rejected because ids are embedded in entityPath / resource paths —
  // real UniFi ids (hex:number consoles, uuid sites/objects) never contain it.
  if (typeof input.consoleId !== 'string' || !input.consoleId.trim() || input.consoleId.includes('/')) {
    throw new Error('consoleId is required and must not contain "/" (one console — resolve it with unifi_resolve_site).')
  }
  if (typeof input.siteId !== 'string' || !input.siteId.trim() || input.siteId.includes('/')) {
    throw new Error('siteId is required and must not contain "/" (one site — resolve it with unifi_resolve_site).')
  }
  if (input.operation === 'update' || input.operation === 'delete') {
    if (typeof input.targetId !== 'string' || !input.targetId.trim() || input.targetId.includes('/')) {
      throw new Error(`${input.operation} requires targetId (the ${spec.label} id, no "/").`)
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

// ---------------------------------------------------------------------------
// Payload building / normalization (UniFi network create+update, 10.4.x)
// ---------------------------------------------------------------------------
//
// The Integration API's GATEWAY network create requires a full ipv4Configuration
// object (subnet + gateway host IP + prefix, optional DHCP scope) plus the
// internetAccessEnabled / isolationEnabled / cellularBackupEnabled flags. Hand-
// building that for every call is error-prone, so normalizeUnifiChanges()
// accepts a small set of CONVENIENCE inputs and expands them into the real API
// payload with safe defaults BEFORE validation/staging. Convenience keys are
// consumed here (never stored or sent as-is); what the gate validates, diffs,
// snapshots and PUT/POSTs is always real allowlisted API fields. Only
// unifi_network is transformed — every other area passes through unchanged.

/** Convenience keys accepted on unifi_network (expanded into ipv4Configuration). */
export const UNIFI_NETWORK_CONVENIENCE_KEYS = [
  'subnet', 'dhcpMode', 'dhcpStart', 'dhcpStop', 'dhcpLeaseTimeSeconds', 'dhcpDnsServers', 'dhcpDomainName', 'dhcpRelayServers',
] as const

const DEFAULT_DHCP_LEASE_SECONDS = 86400

function takeString(o: Record<string, unknown>, k: string): string | undefined {
  if (!(k in o)) return undefined
  const v = o[k]; delete o[k]
  if (v == null) return undefined
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${k} must be a non-empty string.`)
  return v.trim()
}

function takeNumber(o: Record<string, unknown>, k: string): number | undefined {
  if (!(k in o)) return undefined
  const v = o[k]; delete o[k]
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new Error(`${k} must be a number.`)
  return n
}

function takeStringArray(o: Record<string, unknown>, k: string): string[] | undefined {
  if (!(k in o)) return undefined
  const v = o[k]; delete o[k]
  if (v == null) return undefined
  if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== 'string' || !x.trim())) {
    throw new Error(`${k} must be a non-empty array of strings.`)
  }
  return (v as string[]).map((s) => s.trim())
}

function parseIpv4Octets(ip: string): number[] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return nums
}

const ipToInt = (o: number[]): number => (((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3]) >>> 0
const intToIp = (n: number): string => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')

/** Parse an IPv4 CIDR ("192.168.50.1/24") → gateway host IP + prefix (8..30). */
export function parseIpv4Cidr(cidr: string): { hostIpAddress: string; prefixLength: number } {
  const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})\s*$/.exec(cidr)
  if (!m) throw new Error(`subnet must be an IPv4 CIDR like "192.168.50.1/24" (got "${cidr}").`)
  if (!parseIpv4Octets(m[1])) throw new Error(`subnet host IP "${m[1]}" is not a valid IPv4 address.`)
  const prefixLength = Number(m[2])
  if (prefixLength < 8 || prefixLength > 30) {
    throw new Error(`subnet prefix /${prefixLength} is out of range — the Integration API allows /8 to /30.`)
  }
  return { hostIpAddress: m[1], prefixLength }
}

/** UniFi-style default DHCP pool for a subnet: network+6 … broadcast-1 (clamped). */
export function deriveDefaultDhcpRange(hostIpAddress: string, prefixLength: number): { start: string; stop: string } {
  const octets = parseIpv4Octets(hostIpAddress)
  if (!octets) throw new Error(`Cannot derive a DHCP range from "${hostIpAddress}".`)
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
  const network = (ipToInt(octets) & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const stop = broadcast - 1
  const start = Math.min(network + 6, stop)
  return { start: intToIp(start), stop: intToIp(stop) }
}

interface NetworkIpv4Inputs {
  subnet: string
  dhcpMode?: string
  dhcpStart?: string
  dhcpStop?: string
  dhcpLeaseTimeSeconds?: number
  dhcpDnsServers?: string[]
  dhcpDomainName?: string
  dhcpRelayServers?: string[]
}

/** Build a GATEWAY ipv4Configuration object from convenience inputs. */
function buildGatewayIpv4Configuration(input: NetworkIpv4Inputs): Record<string, unknown> {
  const { hostIpAddress, prefixLength } = parseIpv4Cidr(input.subnet)
  const ipv4: Record<string, unknown> = { autoScaleEnabled: false, hostIpAddress, prefixLength }

  const mode = (input.dhcpMode ?? 'SERVER').toUpperCase()
  if (mode === 'NONE') {
    // No dhcpConfiguration → DHCP disabled on this network.
    if (input.dhcpStart || input.dhcpStop || input.dhcpDnsServers || input.dhcpDomainName || input.dhcpRelayServers || input.dhcpLeaseTimeSeconds != null) {
      throw new Error('dhcpMode "NONE" disables DHCP — do not also pass dhcpStart/dhcpStop/dhcpDnsServers/dhcpDomainName/dhcpRelayServers/dhcpLeaseTimeSeconds.')
    }
  } else if (mode === 'RELAY') {
    if (!input.dhcpRelayServers?.length) throw new Error('dhcpMode "RELAY" requires dhcpRelayServers (one or more DHCP server IPs).')
    ipv4.dhcpConfiguration = { mode: 'RELAY', dhcpServerIpAddresses: input.dhcpRelayServers }
  } else if (mode === 'SERVER') {
    if ((input.dhcpStart && !input.dhcpStop) || (!input.dhcpStart && input.dhcpStop)) {
      throw new Error('Provide both dhcpStart and dhcpStop, or neither (the pool is auto-derived from the subnet when both are omitted).')
    }
    const range = input.dhcpStart && input.dhcpStop
      ? { start: input.dhcpStart, stop: input.dhcpStop }
      : deriveDefaultDhcpRange(hostIpAddress, prefixLength)
    const dhcp: Record<string, unknown> = {
      mode: 'SERVER',
      ipAddressRange: range,
      leaseTimeSeconds: input.dhcpLeaseTimeSeconds ?? DEFAULT_DHCP_LEASE_SECONDS,
      pingConflictDetectionEnabled: false,
    }
    if (input.dhcpDnsServers?.length) dhcp.dnsServerIpAddressesOverride = input.dhcpDnsServers
    if (input.dhcpDomainName) dhcp.domainName = input.dhcpDomainName
    ipv4.dhcpConfiguration = dhcp
  } else {
    throw new Error(`dhcpMode must be SERVER, RELAY, or NONE (got "${input.dhcpMode}").`)
  }
  return ipv4
}

/** On minimal create, derive a subnet from the VLAN id (UniFi convention). */
function deriveSubnetFromVlan(vlanId: unknown): string {
  const v = Number(vlanId)
  if (!Number.isInteger(v) || v < 2 || v > 254) {
    throw new Error(
      `Cannot auto-derive a subnet for VLAN ${JSON.stringify(vlanId)}. Pass an explicit subnet (CIDR, e.g. "10.20.30.1/24") — ` +
      'auto-derivation only covers VLAN IDs 2-254 (→ 192.168.<vlanId>.1/24).',
    )
  }
  return `192.168.${v}.1/24`
}

// Fields normalization is responsible for filling on a GATEWAY create (defense
// in depth — a bug here would otherwise surface as a raw API 400). name/vlanId
// are the caller's and get the friendlier requiredOnCreate message downstream.
const NETWORK_CREATE_NORMALIZED_REQUIRED = ['management', 'enabled', 'internetAccessEnabled', 'isolationEnabled', 'cellularBackupEnabled', 'ipv4Configuration'] as const

/**
 * Expand convenience inputs and apply safe create-defaults for unifi_network;
 * pass every other area through unchanged. Returns a NEW object (never mutates
 * the caller's changes). Run this BEFORE validateUnifiStagedChange so the gate
 * only ever sees real allowlisted API fields.
 */
export function normalizeUnifiChanges(
  area: string,
  operation: ConfigWriteOperation,
  changesIn: Record<string, unknown>,
): Record<string, unknown> {
  const changes: Record<string, unknown> = { ...(changesIn ?? {}) }
  if (area !== 'unifi_network' || operation === 'delete') return changes

  // Pull (and remove) convenience inputs so only real API fields remain.
  const subnet = takeString(changes, 'subnet')
  const dhcpMode = takeString(changes, 'dhcpMode')
  const dhcpStart = takeString(changes, 'dhcpStart')
  const dhcpStop = takeString(changes, 'dhcpStop')
  const dhcpLeaseTimeSeconds = takeNumber(changes, 'dhcpLeaseTimeSeconds')
  const dhcpDnsServers = takeStringArray(changes, 'dhcpDnsServers')
  const dhcpDomainName = takeString(changes, 'dhcpDomainName')
  const dhcpRelayServers = takeStringArray(changes, 'dhcpRelayServers')
  const hasConvenience =
    subnet != null || dhcpMode != null || dhcpStart != null || dhcpStop != null ||
    dhcpLeaseTimeSeconds != null || dhcpDnsServers != null || dhcpDomainName != null || dhcpRelayServers != null
  const hasRawIpv4 = changes.ipv4Configuration != null
  if (hasConvenience && hasRawIpv4) {
    throw new Error('Pass EITHER a raw ipv4Configuration object OR the subnet/dhcp* convenience inputs, not both.')
  }
  const buildInputs = (cidr: string): NetworkIpv4Inputs => ({
    subnet: cidr, dhcpMode, dhcpStart, dhcpStop, dhcpLeaseTimeSeconds, dhcpDnsServers, dhcpDomainName, dhcpRelayServers,
  })

  if (operation === 'create') {
    const management = typeof changes.management === 'string' && changes.management.trim() ? changes.management : 'GATEWAY'
    changes.management = management
    if (changes.enabled == null) changes.enabled = true

    if (management === 'GATEWAY') {
      if (changes.internetAccessEnabled == null) changes.internetAccessEnabled = true
      if (changes.isolationEnabled == null) changes.isolationEnabled = false
      if (changes.cellularBackupEnabled == null) changes.cellularBackupEnabled = false
      if (!hasRawIpv4) {
        const cidr = subnet ?? deriveSubnetFromVlan(changes.vlanId)
        changes.ipv4Configuration = buildGatewayIpv4Configuration(buildInputs(cidr))
      }
      // Invariant: everything normalization is responsible for is now present
      // (name/vlanId stay the caller's job — validateUnifiStagedChange reports those).
      const missing = NETWORK_CREATE_NORMALIZED_REQUIRED.filter((k) => changes[k] == null)
      if (missing.length) throw new Error(`Internal: normalized network create is missing ${missing.join(', ')}.`)
    } else if (hasConvenience) {
      throw new Error(
        `subnet/dhcp* convenience inputs only apply to GATEWAY-managed networks (management="${management}"). ` +
        'Pass a raw ipv4Configuration (or manage SWITCH/UNMANAGED networks in unifi.ui.com).',
      )
    }
  } else if (operation === 'update' && hasConvenience) {
    if (!subnet) {
      throw new Error('Updating the subnet/DHCP scope requires `subnet` (CIDR) — or pass a full raw ipv4Configuration object.')
    }
    changes.ipv4Configuration = buildGatewayIpv4Configuration(buildInputs(subnet))
  }

  return changes
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

/**
 * Deep-sort object keys so a JSON.stringify comparison is insensitive to key
 * ORDER (array element order is preserved — order is meaningful there).
 *
 * detectDrift compares snapshot fields with JSON.stringify, which is
 * order-sensitive. The staged `before` snapshot round-trips through a JSONB
 * column, and JSONB does not preserve object key order, so a nested-object
 * field (e.g. a UniFi network's ipv4Configuration) comes back in a different
 * key order than the live API returns it — making detectDrift report a
 * phantom change on every update/delete even when nothing actually changed.
 * Canonicalizing BOTH sides at compare time removes that false positive
 * without weakening the guard: any real value change is still detected.
 * detectDrift itself is intentionally left unchanged; callers that persist
 * snapshots through JSONB feed it canonicalized inputs.
 */
export function canonicalizeKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => canonicalizeKeys(v)) as unknown as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonicalizeKeys((value as Record<string, unknown>)[k])
    }
    return out as T
  }
  return value
}
