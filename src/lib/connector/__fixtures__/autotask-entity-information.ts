// src/lib/connector/__fixtures__/autotask-entity-information.ts
//
// REAL entityInformation responses captured from the live TCT Autotask instance
// on 2026-07-28 via the connector's own autotask_entity_capabilities tool.
//
// These are fixtures, not invented shapes. The classification tests assert
// against the same metadata production reads, so a test passing here means the
// logic is right about THIS instance — not about a hand-written idealisation of
// it. Field lists are trimmed to the fields the tests reason about; the flags on
// each retained field are verbatim.
//
// Re-capture with:  autotask_entity_capabilities { entity: "<Name>" }

type Field = {
  name: string
  dataType: string
  isRequired: boolean
  isReadOnly: boolean
  isQueryable?: boolean
  isPickList?: boolean
  picklistValueCount?: number
  isReference?: boolean
  referenceEntityType?: string | null
}

const f = (
  name: string,
  dataType: string,
  isRequired: boolean,
  isReadOnly: boolean,
  extra: Partial<Field> = {},
): Field => ({ name, dataType, isRequired, isReadOnly, isQueryable: true, ...extra })

/** Services: canDelete FALSE. markupRate + periodType read-only. */
export const SERVICES = {
  entity: 'Services',
  capabilities: {
    canQuery: true,
    canCreate: true,
    canUpdate: true,
    canDelete: false,
    hasUserDefinedFields: false,
    supportsWebhookCallouts: false,
  },
  fields: [
    f('billingCodeID', 'integer', true, false, { isReference: true, referenceEntityType: 'BillingCode' }),
    f('catalogNumberPartNumber', 'string', false, false),
    f('createDate', 'datetime', false, true),
    f('creatorResourceID', 'integer', false, true, { isReference: true, referenceEntityType: 'Resource' }),
    f('description', 'string', false, false),
    f('externalID', 'string', false, false),
    f('id', 'long', true, true),
    f('internalID', 'string', false, false),
    f('invoiceDescription', 'string', false, false),
    f('isActive', 'boolean', false, false),
    f('lastModifiedDate', 'datetime', false, true),
    f('manufacturerServiceProvider', 'string', false, false),
    f('manufacturerServiceProviderProductNumber', 'string', false, false),
    // The bug this whole exercise started from: read-only upstream, yet the old
    // service_pricing allowlist accepted it.
    f('markupRate', 'decimal', false, true),
    f('name', 'string', true, false),
    // Contradictory: required AND read-only at once.
    f('periodType', 'integer', true, true, { isPickList: true, picklistValueCount: 4 }),
    f('serviceLevelAgreementID', 'long', false, false, { isPickList: true, picklistValueCount: 3 }),
    f('sku', 'string', false, false),
    f('unitCost', 'decimal', false, false),
    f('unitPrice', 'decimal', true, false),
    f('updateResourceID', 'integer', false, true, { isReference: true, referenceEntityType: 'Resource' }),
    f('url', 'string', false, false),
    f('vendorCompanyID', 'integer', false, false, { isReference: true, referenceEntityType: 'Company' }),
  ],
  userDefinedFields: [],
}

/** ServiceBundles: canDelete TRUE. unitCost read-only (rolls up from members). */
export const SERVICE_BUNDLES = {
  entity: 'ServiceBundles',
  capabilities: {
    canQuery: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    hasUserDefinedFields: false,
    supportsWebhookCallouts: false,
  },
  fields: [
    f('billingCodeID', 'integer', true, false, { isReference: true, referenceEntityType: 'BillingCode' }),
    f('catalogNumberPartNumber', 'string', false, false),
    f('createDate', 'datetime', false, true),
    f('creatorResourceID', 'integer', false, true, { isReference: true, referenceEntityType: 'Resource' }),
    f('description', 'string', false, false),
    f('externalID', 'string', false, false),
    f('id', 'long', true, true),
    f('internalID', 'string', false, false),
    f('invoiceDescription', 'string', false, false),
    f('isActive', 'boolean', false, false),
    f('lastModifiedDate', 'datetime', false, true),
    f('manufacturerServiceProvider', 'string', false, false),
    f('manufacturerServiceProviderProductNumber', 'string', false, false),
    f('name', 'string', true, false),
    f('percentageDiscount', 'decimal', false, false),
    f('periodType', 'integer', true, true, { isPickList: true, picklistValueCount: 4 }),
    f('serviceLevelAgreementID', 'long', false, false, { isPickList: true, picklistValueCount: 3 }),
    f('sku', 'string', false, false),
    f('unitCost', 'decimal', false, true),
    f('unitDiscount', 'decimal', false, false),
    f('unitPrice', 'decimal', false, false),
    f('updateResourceID', 'integer', false, true, { isReference: true, referenceEntityType: 'Resource' }),
    f('url', 'string', false, false),
  ],
  userDefinedFields: [],
}

/**
 * ServiceBundleServices (bundle membership): canCreate TRUE, canUpdate FALSE,
 * canDelete TRUE — so membership is add/remove, never edit.
 *
 * Note every field is isReadOnly true while the entity is creatable. That
 * combination is only coherent if isReadOnly means "immutable once written"
 * rather than "never settable" — which is the strongest available evidence for
 * how to read the same flags on periodType.
 */
export const SERVICE_BUNDLE_SERVICES = {
  entity: 'ServiceBundleServices',
  capabilities: {
    canQuery: true,
    canCreate: true,
    canUpdate: false,
    canDelete: true,
    hasUserDefinedFields: false,
    supportsWebhookCallouts: false,
  },
  fields: [
    f('id', 'long', true, true),
    f('serviceBundleID', 'long', true, true, { isReference: true, referenceEntityType: 'ServiceBundle' }),
    f('serviceID', 'long', true, true, { isReference: true, referenceEntityType: 'Service' }),
  ],
  userDefinedFields: [],
}

/**
 * BillingCodes: read-only at the ENTITY level (canCreate/canUpdate/canDelete
 * all false) even though most of its FIELDS report isReadOnly false. Entity
 * capability wins — this fixture exists to lock that precedence in.
 */
export const BILLING_CODES = {
  entity: 'BillingCodes',
  capabilities: {
    canQuery: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    hasUserDefinedFields: false,
    supportsWebhookCallouts: false,
  },
  fields: [
    f('billingCodeType', 'integer', false, false, { isPickList: true, picklistValueCount: 3 }),
    f('description', 'string', false, false),
    f('id', 'long', true, true),
    f('isActive', 'boolean', true, false),
    f('markupRate', 'decimal', false, true),
    f('name', 'string', false, false),
    f('unitCost', 'decimal', true, false),
    f('unitPrice', 'decimal', true, false),
    f('useType', 'integer', false, false, { isPickList: true, picklistValueCount: 10 }),
  ],
  userDefinedFields: [],
}

/**
 * Products: the SECOND instance of the markupRate bug — isReadOnly true here
 * too, while the old product_pricing allowlist accepted it. Found by running the
 * drift report over the existing allowlists rather than by being told.
 *
 * Also worth keeping: Products.periodType is isReadOnly FALSE and isRequired
 * false — the opposite of Services/ServiceBundles. Autotask genuinely varies
 * this field's writability per entity, which is why periodType must be settled
 * per entity from live metadata and never assumed.
 */
export const PRODUCTS = {
  entity: 'Products',
  capabilities: {
    canQuery: true,
    canCreate: true,
    canUpdate: true,
    canDelete: false,
    hasUserDefinedFields: false,
    supportsWebhookCallouts: false,
  },
  fields: [
    f('billingType', 'integer', false, true, { isPickList: true, picklistValueCount: 3 }),
    f('description', 'string', false, false),
    f('id', 'long', true, true),
    f('isActive', 'boolean', true, false),
    f('markupRate', 'decimal', false, true),
    f('msrp', 'decimal', false, false),
    f('name', 'string', true, false),
    f('periodType', 'integer', false, false, { isPickList: true, picklistValueCount: 4 }),
    f('priceCostMethod', 'integer', false, true, { isPickList: true, picklistValueCount: 3 }),
    f('productBillingCodeID', 'integer', true, false, { isReference: true, referenceEntityType: 'BillingCode' }),
    f('sku', 'string', false, false),
    f('unitCost', 'decimal', false, false),
    f('unitPrice', 'decimal', false, false),
  ],
  userDefinedFields: [],
}

/** Entities with no REST surface at all — entityInformation 404s. */
export const NOT_FOUND_ENTITIES = ['NotificationTemplates', 'WorkflowRules'] as const

/** The exact 404 body Autotask returns, abbreviated but structurally faithful. */
export const AUTOTASK_404_MESSAGE =
  'Autotask API GET /v1.0/NotificationTemplates/entityInformation failed (404): ' +
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">' +
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>404 - File or directory not found.</title>' +
  '<style type="text/css">body{margin:0;font-size:.7em;}</style></head><body>' +
  '<div id="header"><h1>Server Error</h1></div><div id="content"><h2>404 - File or directory not found.</h2>' +
  '<h3>The resource you are looking for might have been removed, had its name changed, or is temporarily unavailable.</h3></div></body></html>'

export const FIXTURES: Record<string, Record<string, unknown>> = {
  services: SERVICES,
  servicebundles: SERVICE_BUNDLES,
  servicebundleservices: SERVICE_BUNDLE_SERVICES,
  billingcodes: BILLING_CODES,
  products: PRODUCTS,
}

/** A fetcher over the fixtures above, for __setCapabilityFetcher(). */
export function fixtureFetcher(entity: string): Promise<Record<string, unknown>> {
  const hit = FIXTURES[entity.toLowerCase()]
  if (!hit) {
    return Promise.reject(
      new Error(`Autotask API GET /v1.0/${entity}/entityInformation failed (404): not found`),
    )
  }
  return Promise.resolve(hit)
}
