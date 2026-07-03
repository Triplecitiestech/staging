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

/** Keep only the fields the gate cares about (allowlist + label + id + parent link). */
export function snapshotFields(spec: ConfigWriteAreaSpec, row: Record<string, unknown>): Record<string, unknown> {
  const keep = new Set(['id', ...spec.allowedFields, ...spec.labelFields, ...(spec.parentIdFromField ? [spec.parentIdFromField] : [])])
  const out: Record<string, unknown> = {}
  for (const k of Array.from(keep)) if (k in row) out[k] = row[k]
  return out
}

export function buildTargetLabel(spec: ConfigWriteAreaSpec, row: Record<string, unknown> | null, entityId?: number): string {
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

/** Fields whose live value no longer matches the staged before-snapshot. */
export function detectDrift(
  snapshot: Record<string, unknown> | null,
  liveNow: Record<string, unknown> | null,
): string[] {
  if (!snapshot) return []
  if (!liveNow) return ['(record no longer exists)']
  return Object.keys(snapshot).filter((k) => JSON.stringify(snapshot[k]) !== JSON.stringify(liveNow[k]))
}
