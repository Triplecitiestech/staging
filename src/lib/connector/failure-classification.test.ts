// src/lib/connector/failure-classification.test.ts
//
// Locks the failure taxonomy against the OWNER'S ACCEPTANCE CASES.
//
// Every capability assertion here runs against real entityInformation captured
// from the live TCT instance (see __fixtures__/autotask-entity-information.ts),
// so a green run means the classification is right about this instance's actual
// metadata — not about an idealised version of it.
//
// The cases are named to match the brief's acceptance table one-for-one, so a
// future change that reclassifies one of them fails loudly with the owner's own
// wording in the failure output.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ClassifiedConnectorError,
  FIXABLE_BY,
  classifyThrown,
  condenseVendorError,
  connectorFailure,
  extractVendorRule,
  scrubSecrets,
  toolFailure,
  type ConnectorReasonCode,
} from './failure-envelope'
import { classifyError } from '@/lib/resilience'
import {
  __setCapabilityFetcher,
  capabilityCacheStats,
  checkField,
  checkOperation,
  classifyEntityInformationError,
  clearCapabilityCache,
  getEntityCapabilitySnapshot,
} from './autotask-capability'
import {
  classifyRejectedFields,
  classifyUnsupportedOperation,
  stagedWriteDriftedFailure,
  stagedWriteNotApprovedFailure,
} from './autotask-write-validation'
import {
  CONFIG_WRITE_AREAS,
  FieldsNotAllowlistedError,
  fieldSupplyRoutes,
  resolveConfigArea,
  validateStagedChange,
} from './staged-writes-core'
import { buildAutotaskDriftReport, checkAutotaskCapability } from './autotask-drift'
import { AUTOTASK_404_MESSAGE, fixtureFetcher } from './__fixtures__/autotask-entity-information'

/**
 * Run a thrower and return the RENDERED envelope it produced.
 *
 * Renders through connectorFailure() rather than returning the raw thrown input,
 * so every assertion here sees exactly what a caller sees — including the
 * derived fixableBy and the defaulted remediation.
 */
async function failureFrom(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    expect(e, 'expected a ClassifiedConnectorError').toBeInstanceOf(ClassifiedConnectorError)
    return connectorFailure((e as ClassifiedConnectorError).failure)
  }
  throw new Error('expected the call to throw, but it resolved')
}

beforeEach(() => {
  clearCapabilityCache()
  __setCapabilityFetcher(fixtureFetcher)
})

afterEach(() => {
  __setCapabilityFetcher(null)
  clearCapabilityCache()
})

// ---------------------------------------------------------------------------
// The owner's acceptance cases
// ---------------------------------------------------------------------------

describe('acceptance cases', () => {
  it('Delete a Service → UPSTREAM_UNSUPPORTED (canDelete false)', async () => {
    const spec = CONFIG_WRITE_AREAS.service
    expect(spec.operations).not.toContain('delete')

    const failure = await failureFrom(() =>
      classifyUnsupportedOperation('service', 'Services', 'delete', spec.operations),
    )
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('UPSTREAM_UNSUPPORTED')
    // Evidence must be specific and cite the metadata, not hand-wave.
    expect(failure.evidence).toMatch(/Services\.canDelete false/)
    // And it must point at deactivation rather than implying the attempt failed.
    expect(failure.remediation).toMatch(/isActive/)
  })

  it('Delete a ServiceBundle → offered by the connector, then POLICY_BLOCKED until approved (canDelete true)', async () => {
    // Half one: the API and the connector both allow it.
    expect(CONFIG_WRITE_AREAS.service_bundle.operations).toContain('delete')
    const verdict = await checkOperation('ServiceBundles', 'delete')
    expect(verdict.apiPermits).toBe(true)

    // Half two: executing it before a human approves is POLICY_BLOCKED, and the
    // remediation returns the approval URL.
    const failure = connectorFailure(
      stagedWriteNotApprovedFailure({
        id: 'sw_123',
        status: 'pending_approval',
        targetLabel: 'Service bundle: Example (id 42)',
        approvalUrl: 'https://www.triplecitiestech.com/admin/connector/staged-writes',
      }),
    )
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('POLICY_BLOCKED')
    expect(failure.fixableBy).toBe('tct_human')
    expect(failure.remediation).toContain('/admin/connector/staged-writes')
  })

  it('Create a Service → implemented (the companion task shipped), so it is POLICY_GATED not NOT_IMPLEMENTED', async () => {
    const result = await checkAutotaskCapability({ entity: 'Services', operation: 'create' })
    expect(result.api.permits).toBe(true)
    expect(result.connector.implemented).toBe(true)
    expect(result.verdict).toBe('POLICY_GATED')
    expect(result.reasonCodeIfAttempted).toBe('POLICY_BLOCKED')
  })

  it('Update Services.markupRate → not offered at all; if attempted, INVALID_INPUT with entityInformation as evidence', async () => {
    // Not offered: it is absent from the allowlist entirely.
    expect(CONFIG_WRITE_AREAS.service.allowedFields).not.toContain('markupRate')
    expect(CONFIG_WRITE_AREAS.service.createOnlyFields ?? []).not.toContain('markupRate')

    // If attempted anyway, the validator rejects it...
    let thrown: unknown
    try {
      validateStagedChange({ area: 'service', operation: 'update', entityId: 7, changes: { markupRate: 20 } })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(FieldsNotAllowlistedError)

    // ...and the rejection is classified INVALID_INPUT with the live metadata.
    const failure = await failureFrom(() => classifyRejectedFields(thrown as FieldsNotAllowlistedError))
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('INVALID_INPUT')
    expect(failure.fixableBy).toBe('caller')
    expect(failure.evidence).toMatch(/Services\.markupRate isReadOnly true/)
    expect(failure.remediation).toMatch(/unitPrice and unitCost/)
  })

  it('Write a BillingCode → UPSTREAM_UNSUPPORTED (read-only in REST, entity capability beats field flags)', async () => {
    // The trap: BillingCodes.name/unitPrice report isReadOnly FALSE...
    const nameField = await checkField('BillingCodes', 'name')
    expect(nameField.apiWritable).toBe(true)
    // ...but the ENTITY forbids every write, and that must win.
    for (const op of ['create', 'update', 'delete'] as const) {
      const verdict = await checkOperation('BillingCodes', op)
      expect(verdict.apiPermits, `BillingCodes.${op}`).toBe(false)
    }
    const result = await checkAutotaskCapability({ entity: 'BillingCodes', operation: 'update' })
    expect(result.verdict).toBe('UPSTREAM_UNSUPPORTED')
    expect(result.reasonCodeIfAttempted).toBe('UPSTREAM_UNSUPPORTED')
    expect(result.fixableBy).toBe('vendor')
    expect(result.api.evidence).toMatch(/BillingCodes\.canUpdate false/)
  })

  it('Write a notification template → UPSTREAM_UNSUPPORTED (no REST surface at all)', async () => {
    const failure = await failureFrom(() => getEntityCapabilitySnapshot('NotificationTemplates'))
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('UPSTREAM_UNSUPPORTED')
    expect(failure.evidence).toMatch(/entityInformation returned 404/)
    expect(failure.fixableBy).toBe('vendor')
  })

  it('Write a workflow rule / Event → UPSTREAM_UNSUPPORTED (no REST surface at all)', async () => {
    const failure = await failureFrom(() => getEntityCapabilitySnapshot('WorkflowRules'))
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('UPSTREAM_UNSUPPORTED')
    expect(failure.evidence).toMatch(/404/)
  })

  it('an absent entity gets ONE verdict, whichever tool asked — regression lock', async () => {
    // Found by live verification after the first deploy: the raw
    // entityInformation read classified a missing entity as INVALID_INPUT (a
    // bare 404 → "validation") while the capability layer called it
    // UPSTREAM_UNSUPPORTED. One fact, two reason codes, depending on the tool.
    const viaCapabilityLayer = await failureFrom(() => getEntityCapabilitySnapshot('NotificationTemplates'))
    const viaRawRead = connectorFailure(
      classifyEntityInformationError('NotificationTemplates', new Error(AUTOTASK_404_MESSAGE))!,
    )
    expect(viaRawRead.reasonCode).toBe(viaCapabilityLayer.reasonCode)
    expect(viaRawRead.reasonCode).toBe<ConnectorReasonCode>('UPSTREAM_UNSUPPORTED')
    expect(viaRawRead.evidence).toBe(viaCapabilityLayer.evidence)
    expect(viaRawRead.remediation).toBe(viaCapabilityLayer.remediation)
  })

  it('a non-404 entityInformation failure is left to normal classification', () => {
    // The shared 404 verdict must not swallow real transport errors — a timeout
    // is TRANSIENT, not a vendor limitation.
    expect(classifyEntityInformationError('Services', new Error('ETIMEDOUT'))).toBeNull()
  })

  it('Execute an unapproved staged write → POLICY_BLOCKED, remediation returns the approval URL', () => {
    const url = 'https://www.triplecitiestech.com/admin/connector/staged-writes'
    const failure = connectorFailure(stagedWriteNotApprovedFailure({ id: 'sw_9', status: 'pending_approval', approvalUrl: url }))
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('POLICY_BLOCKED')
    expect(failure.remediation).toContain(url)
    // The guardrail must never read as something to work around.
    expect(failure.remediation).toMatch(/intentional|do not look for another write path/i)
  })

  it('Execute a staged write whose record changed since staging → PRECONDITION_FAILED (drift)', () => {
    const failure = connectorFailure(
      stagedWriteDriftedFailure({ id: 'sw_10', targetLabel: 'Service: X (id 7)', driftedFields: ['unitPrice'], verb: 'written' }),
    )
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('PRECONDITION_FAILED')
    expect(failure.fixableBy).toBe('tct_human')
    expect(failure.message).toMatch(/unitPrice/)
    expect(failure.remediation).toMatch(/re-?stage/i)
  })

  it('Any call while rate-limited → TRANSIENT', () => {
    const failure = classifyThrown(new Error('Autotask API query failed (429): Rate limit exceeded'), { surface: 'autotask' })
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('TRANSIENT')
    expect(failure.fixableBy).toBe('retry')
  })
})

// ---------------------------------------------------------------------------
// The design rule: never manufacture a vendor-limitation claim
// ---------------------------------------------------------------------------

describe('UPSTREAM_UNSUPPORTED is never asserted without evidence', () => {
  it('cold cache + failed lookup returns TRANSIENT, not UPSTREAM_UNSUPPORTED', async () => {
    __setCapabilityFetcher(() => Promise.reject(new Error('socket hang up')))
    const failure = await failureFrom(() => getEntityCapabilitySnapshot('Services'))
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('TRANSIENT')
    // The remediation must explicitly forbid the wrong inference.
    expect(failure.remediation).toMatch(/not.*evidence/i)
  })

  it('an uncited UPSTREAM_UNSUPPORTED is downgraded rather than emitted', () => {
    // Simulates a JS caller or a cast bypassing the compile-time requirement.
    const failure = connectorFailure({
      reasonCode: 'UPSTREAM_UNSUPPORTED',
      message: 'Autotask cannot do this.',
      evidence: '   ',
      surface: 'autotask',
    } as Parameters<typeof connectorFailure>[0])
    expect(failure.reasonCode).not.toBe('UPSTREAM_UNSUPPORTED')
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('TRANSIENT')
    expect(failure.unclassified).toBe(true)
  })

  it('an unclassifiable error never becomes UPSTREAM_UNSUPPORTED even when asked to', () => {
    const failure = classifyThrown(new Error('something odd happened'), {
      surface: 'autotask',
      fallback: 'UPSTREAM_UNSUPPORTED',
    })
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('NOT_IMPLEMENTED')
    expect(failure.unclassified).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cache behaviour
// ---------------------------------------------------------------------------

describe('capability cache', () => {
  it('cold lookup hits the API, warm lookup does not', async () => {
    const spy = vi.fn(fixtureFetcher)
    __setCapabilityFetcher(spy)

    const first = await getEntityCapabilitySnapshot('Services')
    expect(first.cache).toBe('miss')
    expect(spy).toHaveBeenCalledTimes(1)

    const second = await getEntityCapabilitySnapshot('Services')
    expect(second.cache).toBe('hit')
    expect(spy, 'a warm hit must not re-read live metadata').toHaveBeenCalledTimes(1)

    expect(capabilityCacheStats().entries.map((e) => e.entity)).toContain('services')
  })

  it('forceRefresh bypasses a warm entry', async () => {
    const spy = vi.fn(fixtureFetcher)
    __setCapabilityFetcher(spy)
    await getEntityCapabilitySnapshot('Services')
    await getEntityCapabilitySnapshot('Services', { forceRefresh: true })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('a failed lookup falls back to a stale entry and says so, rather than failing', async () => {
    await getEntityCapabilitySnapshot('Services')
    // Expire everything, then break the fetcher.
    clearCapabilityCacheKeepingStale()
    __setCapabilityFetcher(() => Promise.reject(new Error('ETIMEDOUT')))

    const result = await getEntityCapabilitySnapshot('Services')
    expect(result.cache).toBe('stale-fallback')
    expect(result.staleWarning).toMatch(/strong prior, not a settled fact/)
    expect(result.snapshot.capabilities.canDelete).toBe(false)
  })
})

/**
 * Force every cache entry to look expired without dropping it, so the
 * stale-fallback path can be exercised. Reaches into the same globalThis map the
 * module uses; there is no public API for "age the cache" and adding one purely
 * for a test would be worse than this.
 */
function clearCapabilityCacheKeepingStale(): void {
  const g = globalThis as unknown as { __atCapabilityCache?: Map<string, { expiresAt: number }> }
  for (const entry of g.__atCapabilityCache?.values() ?? []) entry.expiresAt = 0
}

// ---------------------------------------------------------------------------
// Envelope invariants
// ---------------------------------------------------------------------------

describe('envelope invariants', () => {
  it('fixableBy is derived from reasonCode and cannot be set independently', () => {
    for (const [code, owner] of Object.entries(FIXABLE_BY)) {
      const failure = connectorFailure({
        reasonCode: code as Exclude<ConnectorReasonCode, 'UPSTREAM_UNSUPPORTED'>,
        message: 'x',
        evidence: 'cited',
        surface: 'autotask',
      })
      expect(failure.fixableBy).toBe(owner)
    }
  })

  it('remediation is never empty', () => {
    for (const code of Object.keys(FIXABLE_BY) as ConnectorReasonCode[]) {
      const failure = connectorFailure({
        reasonCode: code as Exclude<ConnectorReasonCode, 'UPSTREAM_UNSUPPORTED'>,
        message: 'x',
        evidence: 'cited',
        surface: 'autotask',
      })
      expect(failure.remediation.length, code).toBeGreaterThan(10)
    }
  })

  it('credentials never reach an envelope field', () => {
    const prev = process.env.ITGLUE_API_KEY
    process.env.ITGLUE_API_KEY = 'ITG-super-secret-key-value-1234'
    try {
      const failure = connectorFailure({
        reasonCode: 'PERMISSION_DENIED',
        message: 'Rejected for key ITG-super-secret-key-value-1234',
        evidence: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef',
        surface: 'itglue',
        vendorError: 'GET https://user:pw@api.itglue.com/x?api_key=ITG-super-secret-key-value-1234 → 403',
      })
      const blob = JSON.stringify(failure)
      expect(blob).not.toContain('ITG-super-secret-key-value-1234')
      expect(blob).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef')
      expect(blob).toContain('[REDACTED')
    } finally {
      if (prev === undefined) delete process.env.ITGLUE_API_KEY
      else process.env.ITGLUE_API_KEY = prev
    }
  })

  it('scrubSecrets leaves ordinary text alone', () => {
    const text = 'Services.markupRate is read-only on this instance.'
    expect(scrubSecrets(text)).toBe(text)
  })

  it("an HTML error body is condensed instead of burying the envelope", () => {
    const condensed = condenseVendorError(AUTOTASK_404_MESSAGE)
    expect(condensed).not.toContain('<html')
    expect(condensed).not.toContain('margin:0')
    expect(condensed).toMatch(/404/)
    expect(condensed.length).toBeLessThanOrEqual(620)
  })

  it('a tool failure keeps the legacy "Error: " first line AND adds the envelope', () => {
    const result = toolFailure(new Error('Autotask API query failed (503): upstream'), { surface: 'autotask' })
    expect(result.isError).toBe(true)
    const text = result.content[0].text
    expect(text.startsWith('Error: ')).toBe(true)
    const parsed = JSON.parse(text.slice(text.indexOf('\n\n') + 2)) as { failure: { reasonCode: string } }
    expect(parsed.failure.reasonCode).toBe('TRANSIENT')
  })

  it('a pre-classified error survives classifyThrown unchanged', () => {
    const original = new ClassifiedConnectorError({
      reasonCode: 'POLICY_BLOCKED',
      message: 'gate held',
      surface: 'autotask',
    })
    expect(classifyThrown(original, { surface: 'autotask' }).reasonCode).toBe('POLICY_BLOCKED')
  })
})

// ---------------------------------------------------------------------------
// Connector-gap classification, and the periodType question
// ---------------------------------------------------------------------------

describe('connector gaps are distinguished from vendor limits', () => {
  it('a writable field the allowlist omits is NOT_IMPLEMENTED, naming what to add', async () => {
    // Deliberately uses a real Services field that is writable upstream but not
    // in any allowlist, so this test tracks the real surface.
    const err = new FieldsNotAllowlistedError('service', 'Services', ['unitCost2'], CONFIG_WRITE_AREAS.service.allowedFields)
    // unitCost2 does not exist → INVALID_INPUT, proving the "unknown" branch.
    const unknownFailure = await failureFrom(() => classifyRejectedFields(err))
    expect(unknownFailure.reasonCode).toBe<ConnectorReasonCode>('INVALID_INPUT')

    // A field that IS writable upstream but absent from the allowlist.
    const gap = new FieldsNotAllowlistedError('service_bundle_member', 'ServiceBundles', ['percentageDiscount'], ['serviceID'])
    const gapFailure = await failureFrom(() => classifyRejectedFields(gap))
    expect(gapFailure.reasonCode).toBe<ConnectorReasonCode>('NOT_IMPLEMENTED')
    expect(gapFailure.fixableBy).toBe('claude_code')
    expect(gapFailure.remediation).toMatch(/staged-writes-core\.ts/)
    expect(gapFailure.remediation).toMatch(/percentageDiscount/)
  })

  it('an operation the API permits but no area offers is NOT_IMPLEMENTED', async () => {
    // ServiceBundleServices permits delete; pretend an area offered only create.
    const failure = await failureFrom(() =>
      classifyUnsupportedOperation('service_bundle_member', 'ServiceBundleServices', 'delete', ['create']),
    )
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('NOT_IMPLEMENTED')
    expect(failure.evidence).toMatch(/ServiceBundleServices\.canDelete true/)
  })

  it('periodType surfaces its contradictory flags instead of silently picking a side', async () => {
    const verdict = await checkField('Services', 'periodType')
    expect(verdict.isRequired).toBe(true)
    expect(verdict.isReadOnly).toBe(true)
    expect(verdict.contradictoryFlags).toMatch(/isRequired true AND isReadOnly true/)
    expect(verdict.contradictoryFlags).toMatch(/established empirically/)
  })

  it('periodType is create-only: accepted on create, refused on update', () => {
    expect(CONFIG_WRITE_AREAS.service.createOnlyFields).toContain('periodType')
    // Accepted on create.
    expect(() =>
      validateStagedChange({
        area: 'service',
        operation: 'create',
        changes: { name: 'X', billingCodeID: 1, unitPrice: 1, periodType: 5 },
      }),
    ).not.toThrow()
    // Refused on update.
    expect(() =>
      validateStagedChange({ area: 'service', operation: 'update', entityId: 7, changes: { periodType: 5 } }),
    ).toThrow(FieldsNotAllowlistedError)
  })

  it('a create missing a required field fails at stage time with a useful message', () => {
    expect(() =>
      validateStagedChange({ area: 'service', operation: 'create', changes: { name: 'ZZ-CONNECTOR-TEST' } }),
    ).toThrow(/requires: billingCodeID, unitPrice, periodType/)
  })

  // -------------------------------------------------------------------------
  // The create-only field regression, found in production 2026-07-28.
  //
  // autotask_capability_check answered "Services.periodType is read-only in the
  // Autotask API, so it cannot be written by anyone / Do not offer to change
  // this field" for a field that is REQUIRED on create. A caller obeying that
  // omits periodType and every Service create fails — which is exactly the
  // false vendor-limitation claim this layer was built to eliminate, produced
  // by the layer itself. Live proof it is settable: service ids 131-136 created
  // with periodType 2 and read back Monthly; the one create that omitted it got
  // Autotask's own "Missing Required Field: periodType".
  // -------------------------------------------------------------------------

  it('a create-only field is never reported as an upstream limitation', async () => {
    const v = await checkAutotaskCapability({ entity: 'Services', field: 'periodType' })
    expect(v.verdict).not.toBe('UPSTREAM_UNSUPPORTED')
    expect(v.message).not.toMatch(/cannot be written by anyone/)
    expect(v.remediation).not.toMatch(/Do not offer to change this field/)
    // It must say the thing that makes a create succeed.
    expect(v.message).toMatch(/IS settable when creating/)
    expect(v.message).toMatch(/REQUIRED on create/)
    expect(v.remediation).toMatch(/Include periodType/)
  })

  it('a create-only field answers per operation, not with one flat verdict', async () => {
    const onCreate = await checkAutotaskCapability({ entity: 'Services', field: 'periodType', operation: 'create' })
    expect(onCreate.api.permits).toBe(true)
    expect(onCreate.verdict).toBe('POLICY_GATED')
    expect(onCreate.reasonCodeIfAttempted).toBe('POLICY_BLOCKED')

    const onUpdate = await checkAutotaskCapability({ entity: 'Services', field: 'periodType', operation: 'update' })
    expect(onUpdate.api.permits).toBe(false)
    expect(onUpdate.verdict).toBe('UPSTREAM_UNSUPPORTED')
    // Still must not claim it is unwritable outright — only immutable after create.
    expect(onUpdate.message).toMatch(/cannot be changed afterwards/)
    expect(onUpdate.message).toMatch(/not unwritable/)
    expect(onUpdate.remediation).toMatch(/Drop periodType from the update/)
  })

  it('the create-only carve-out does NOT soften a genuinely unwritable field', async () => {
    // The guard against over-correcting: markupRate is read-only and is NOT a
    // createOnlyField anywhere, so it must still come back UPSTREAM_UNSUPPORTED.
    const v = await checkAutotaskCapability({ entity: 'Services', field: 'markupRate' })
    expect(v.verdict).toBe('UPSTREAM_UNSUPPORTED')
    expect(v.message).toMatch(/cannot be written by anyone/)
    expect(v.remediation).toMatch(/computed from unitPrice and unitCost/)
    // Even when create is named explicitly — read-only here means read-only.
    const onCreate = await checkAutotaskCapability({ entity: 'Services', field: 'markupRate', operation: 'create' })
    expect(onCreate.verdict).toBe('UPSTREAM_UNSUPPORTED')
    expect(onCreate.api.permits).toBe(false)
  })

  it('periodType is required on create in every area that accepts it', () => {
    // Autotask rejects a create without it, so the connector must too — at stage
    // time, before a human spends an approval on a write that cannot succeed.
    for (const spec of Object.values(CONFIG_WRITE_AREAS)) {
      if (!(spec.createOnlyFields ?? []).includes('periodType')) continue
      expect(spec.requiredOnCreate, `${spec.area} accepts periodType on create`).toContain('periodType')
    }
  })

  it('the drift report still flags a create-only field the API has never heard of', async () => {
    // createOnlyFields used to skip the suspect check entirely, so a typo in one
    // was unreportable. Only the read-only half of the check should be skipped.
    const spec = CONFIG_WRITE_AREAS.service
    const original = spec.createOnlyFields
    spec.createOnlyFields = [...(original ?? []), 'periodTypo']
    try {
      const report = await buildAutotaskDriftReport({ entities: ['Services'] })
      const suspects = report.gaps.flatMap((g) => g.suspectAllowlistedFields)
      expect(suspects).toContainEqual({ field: 'periodTypo', area: 'service', problem: 'unknown to the API' })
      // …while the legitimate create-only field stays unflagged.
      expect(suspects.map((s) => s.field)).not.toContain('periodType')
    } finally {
      spec.createOnlyFields = original
    }
  })

  it('no allowlist anywhere accepts a markupRate — both instances of the bug are closed', async () => {
    // Regression lock for BOTH occurrences: service_pricing (reported) and
    // product_pricing (found by the drift report). Asserted over every area
    // rather than the two by name, so a third cannot be introduced quietly.
    for (const spec of Object.values(CONFIG_WRITE_AREAS)) {
      const fields = [...spec.allowedFields, ...(spec.createOnlyFields ?? [])]
      expect(fields, `${spec.area} must not allowlist markupRate`).not.toContain('markupRate')
    }
    // And live metadata is why: read-only on both entities.
    for (const entity of ['Services', 'Products'] as const) {
      const verdict = await checkField(entity, 'markupRate')
      expect(verdict.isReadOnly, `${entity}.markupRate`).toBe(true)
    }
  })

  it('the drift report finds no suspect allowlisted field on any fixture entity', async () => {
    // The check that caught markupRate twice. Kept as a test so a future
    // allowlist edit that adds a read-only field fails here rather than at
    // execute time in production.
    const report = await buildAutotaskDriftReport({
      entities: ['Services', 'ServiceBundles', 'ServiceBundleServices', 'BillingCodes', 'Products'],
    })
    expect(report.unchecked).toEqual([])
    expect(report.summary.suspectAllowlistedFields, JSON.stringify(report.gaps, null, 2)).toBe(0)
  })

  it('periodType writability is decided per entity from live metadata, never assumed', async () => {
    // Services says read-only; Products says writable. Any code that assumed one
    // answer for "periodType" across entities would be wrong half the time.
    expect((await checkField('Services', 'periodType')).isReadOnly).toBe(true)
    expect((await checkField('Products', 'periodType')).isReadOnly).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Parent-id fields: settable through the connector, but not via `changes`.
  //
  // Found by running the drift report the checklist asked for. Nothing consulted
  // parentIdField, so three separate surfaces made a confident false claim about
  // a field the connector has always written. ServiceBundleServices
  // .serviceBundleID is the worst of them: isReadOnly true upstream, REQUIRED on
  // every bundle-membership create, and answered as "cannot be written by
  // anyone" — the periodType bug a second time.
  // -------------------------------------------------------------------------

  it('a read-only parent-id field is never reported as unwritable by anyone', async () => {
    // The exact wording that was wrong. serviceBundleID is written into the
    // create payload by executeStagedWrite on every bundle-membership create.
    const create = await checkAutotaskCapability({
      entity: 'ServiceBundleServices',
      field: 'serviceBundleID',
      operation: 'create',
    })
    expect(create.verdict).toBe('POLICY_GATED')
    expect(create.api.permits).toBe(true)
    expect(create.connector.implemented).toBe(true)
    expect(create.connector.areas).toContain('service_bundle_member')
    expect(create.fixableBy).toBe('tct_human')
    expect(create.message).not.toMatch(/cannot be written by anyone/i)
    expect(create.remediation).toMatch(/parentId/)
    // And it must not send the caller to put it in changes, where it is refused.
    expect(create.remediation).toMatch(/NOT inside changes/)
  })

  it('a parent-id field is immutable on update without being called an Autotask limit on create', async () => {
    const update = await checkAutotaskCapability({
      entity: 'ServiceBundleServices',
      field: 'serviceBundleID',
      operation: 'update',
    })
    // Honest on update: fixed once created. Still not "unwritable".
    expect(update.verdict).toBe('UPSTREAM_UNSUPPORTED')
    expect(update.api.permits).toBe(false)
    expect(update.message).toMatch(/not unwritable/i)
    expect(update.reasonCodeIfAttempted).toBe('INVALID_INPUT')
  })

  it('a writable parent-id field is not reported as an unbuilt connector gap', async () => {
    // Holidays.holidaySetID: writable upstream, supplied as the holiday area's
    // parentId. This answered SUPPORTED_NOT_IMPLEMENTED / fixableBy claude_code,
    // and the remediation told someone to add an allowlist entry for a field
    // that has always worked.
    const create = await checkAutotaskCapability({
      entity: 'Holidays',
      field: 'holidaySetID',
      operation: 'create',
    })
    expect(create.verdict).toBe('POLICY_GATED')
    expect(create.reasonCodeIfAttempted).toBe('POLICY_BLOCKED')
    expect(create.fixableBy).toBe('tct_human')
    expect(create.connector.areas).toContain('holiday')
    expect(create.remediation).toMatch(/parentId/)
  })

  it('the drift report does not list a parent-id field as a missing writable field', async () => {
    const report = await buildAutotaskDriftReport({ entities: ['Holidays', 'ServiceBundleServices'] })
    expect(report.unchecked).toEqual([])
    const missing = report.gaps.flatMap((g) => g.missingWritableFields)
    expect(missing).not.toContain('holidaySetID')
    expect(missing).not.toContain('serviceBundleID')
    // ...and it is not laundered into the suspect list either: read-only upstream
    // is expected for a parent link and is not a latent bug.
    expect(report.summary.suspectAllowlistedFields, JSON.stringify(report.gaps, null, 2)).toBe(0)
  })

  it('the drift report still flags a parent-id field the API has never heard of', async () => {
    // The half of the suspect check that DOES apply to parent-id fields: a typo
    // here breaks every create in the area, so it must stay reportable.
    const spec = CONFIG_WRITE_AREAS.holiday
    const original = spec.parentIdField
    spec.parentIdField = 'holidaySetTypo'
    try {
      const report = await buildAutotaskDriftReport({ entities: ['Holidays'] })
      const suspects = report.gaps.flatMap((g) => g.suspectAllowlistedFields)
      expect(suspects).toContainEqual({ field: 'holidaySetTypo', area: 'holiday', problem: 'unknown to the API' })
    } finally {
      spec.parentIdField = original
    }
  })

  it('naming a parent-id field in changes is a misplaced argument, not a connector gap', async () => {
    const failure = await failureFrom(() =>
      classifyRejectedFields(
        new FieldsNotAllowlistedError('holiday', 'Holidays', ['holidaySetID'], CONFIG_WRITE_AREAS.holiday.allowedFields),
      ),
    )
    expect(failure.reasonCode).toBe<ConnectorReasonCode>('INVALID_INPUT')
    expect(failure.fixableBy).toBe(FIXABLE_BY.INVALID_INPUT)
    expect(failure.remediation).toMatch(/parentId/)
    expect(failure.remediation).toMatch(/do NOT report it as a connector gap/i)
    // The claim that was wrong: this is not something Claude Code has to build.
    expect(failure.reasonCode).not.toBe('NOT_IMPLEMENTED')
  })

  it('an allowlist entry spelled differently from the API is not reported as a missing field', () => {
    // The two halves of the drift report disagreed on case: missingWritableFields
    // matched exactly while suspectAllowlistedFields matched case-insensitively,
    // so ticket_category's 'displayColorRGB' vs Autotask's 'displayColorRgb' was
    // reported as an unbuilt gap by one half and passed over by the other.
    // Asserted through the shared helper both halves now use.
    expect(fieldSupplyRoutes(CONFIG_WRITE_AREAS.ticket_category, 'displayColorRgb')).toContain('changes')
    expect(fieldSupplyRoutes(CONFIG_WRITE_AREAS.ticket_category, 'displayColorRGB')).toContain('changes')
  })

  it('every parent-id field is discoverable in the stage tool description', () => {
    // A settable field the description never mentions is a field callers guess
    // at — and guessing `changes` is rejected.
    for (const spec of Object.values(CONFIG_WRITE_AREAS)) {
      if (!spec.parentIdField) continue
      expect(
        fieldSupplyRoutes(spec, spec.parentIdField),
        `${spec.area} parentIdField must resolve as a parent_id route`,
      ).toContain('parent_id')
    }
  })

  it('the retired service_pricing area still resolves to the one implementation', () => {
    expect(resolveConfigArea('service_pricing')).toBe('service')
    const spec = validateStagedChange({
      area: 'service_pricing',
      operation: 'update',
      entityId: 7,
      changes: { unitPrice: 10 },
    })
    expect(spec.area).toBe('service')
  })
})

// ---------------------------------------------------------------------------
// Schema violations are permanent, whatever status the vendor answers with
// ---------------------------------------------------------------------------
//
// Reproduced live on 2026-07-29: Autotask answers a broken schema rule with
// HTTP 500 and a "Data violation" body. classifyError() saw the 500, called it
// server_error, and the envelope came back TRANSIENT / fixableBy "retry" /
// "Wait briefly and retry the same call" — advice that can never succeed, on a
// failure the caller then retried in a loop. The body decides now, not the
// status.

describe('a data violation is never TRANSIENT', () => {
  // The exact string the connector saw, wrapped the way autotask-write.ts wraps it.
  const AUTOTASK_DATA_VIOLATION =
    'Autotask PATCH Tickets failed (500): {"errors":["Data violation: When assigning a Resource, you must assign both a assignedResourceID and assignedResourceRoleID."]}'

  it('classifyError does not call it a retryable server error', () => {
    const classified = classifyError(new Error(AUTOTASK_DATA_VIOLATION))
    expect(classified.category).toBe('data_violation')
    expect(classified.isTransient).toBe(false)
  })

  it('the envelope is PRECONDITION_FAILED, and never advises a retry', () => {
    const failure = classifyThrown(new Error(AUTOTASK_DATA_VIOLATION), { surface: 'autotask', tool: 'autotask_assign_ticket' })
    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.fixableBy).not.toBe('retry')
    expect(failure.remediation).not.toMatch(/wait briefly and retry/i)
    expect(failure.details).toMatchObject({ retryable: false })
  })

  it("puts the VENDOR'S OWN message in remediation, field names intact", () => {
    const failure = classifyThrown(new Error(AUTOTASK_DATA_VIOLATION), { surface: 'autotask' })
    expect(failure.remediation).toContain('you must assign both a assignedResourceID and assignedResourceRoleID')
    expect(failure.details).toMatchObject({
      vendorRule: 'Data violation: When assigning a Resource, you must assign both a assignedResourceID and assignedResourceRoleID.',
    })
  })

  it('routes the caller to a schema fix, not to a permissions or outage story', () => {
    const failure = classifyThrown(new Error(AUTOTASK_DATA_VIOLATION), { surface: 'autotask' })
    expect(failure.message).toMatch(/NOT transient/)
    expect(failure.remediation).toMatch(/connector gap for Claude Code/)
  })

  it('handles the create-time variant too (Missing Required Field: periodType)', () => {
    // The 2026-07-28b case, which cost a spent human approval. Same shape.
    const failure = classifyThrown(
      new Error('Autotask POST Services failed (500): Missing Required Field: periodType'),
      { surface: 'autotask' },
    )
    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.remediation).toContain('Missing Required Field: periodType')
  })

  it('extractVendorRule reads both a JSON errors array and bare text', () => {
    expect(extractVendorRule('POST failed (500): {"errors":["Data violation: field X is required."]}'))
      .toBe('Data violation: field X is required.')
    expect(extractVendorRule('500: Data violation: field X is required.'))
      .toBe('Data violation: field X is required.')
    expect(extractVendorRule('503 Service Unavailable')).toBeUndefined()
  })

  it('leaves a GENUINE 5xx outage classified as TRANSIENT', () => {
    // The fix must not blunt the retry advice that is correct for real outages.
    const failure = classifyThrown(new Error('Autotask API query failed (503): Service Unavailable'), { surface: 'autotask' })
    expect(failure.reasonCode).toBe('TRANSIENT')
    expect(failure.fixableBy).toBe('retry')
  })

  it('leaves an ordinary 400 as INVALID_INPUT for the caller to fix', () => {
    // A plain bad argument is still the caller's to correct — this change is
    // about 5xx bodies that lie about being transient, nothing wider.
    const failure = classifyThrown(new Error('Autotask API error 400: dueDateTime is required'), { surface: 'autotask' })
    expect(failure.reasonCode).toBe('INVALID_INPUT')
    expect(failure.fixableBy).toBe('caller')
  })
})
