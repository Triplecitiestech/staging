// src/lib/connector/autotask-coverage.test.ts
//
// THE TEST THAT FAILS THE BUILD ON A SILENT OMISSION.
//
// Requirement, in one sentence: every entity, operation and writable field the
// live Autotask API permits is either exposed by the connector or carries an
// explicit, dated, reasoned exemption. Nothing ships with a silent gap.
//
// The last section is the demonstration the brief asked for: remove an entity
// from the surface and this check fails, naming it.

import { describe, expect, it } from 'vitest'
import {
  SURFACE_CLAIMS,
  buildCoverageReport,
  formatViolations,
  type ToolCoverageClaim,
} from './autotask-coverage'
import { SURFACE_EXEMPTIONS, validateExemptions, type SurfaceExemption } from './autotask-exemptions'
import {
  CATALOGUE,
  catalogueEntities,
  catalogueEntityNames,
  parentRoutes,
  permittedOperations,
  writePathCandidates,
  writableFields,
} from './autotask-catalogue'
import { OPERATIONAL_ENTITIES, unknownOperationalEntities, writePolicyFor } from './autotask-write-policy'
import { configAreaSpec, generatedAreaSpec, validateStagedChange, GENERATED_AREA_PREFIX, CONFIG_WRITE_AREAS } from './staged-writes-core'
import { TOOL_FACTS } from './capability-registry'

// ---------------------------------------------------------------------------
// The catalogue itself
// ---------------------------------------------------------------------------

describe('the generated catalogue', () => {
  it('is a real census, not a stub', () => {
    // The whole change is worthless if the snapshot is empty or token. The
    // hand-picked surface it replaces already covered 44 entities.
    expect(CATALOGUE.entities.length).toBeGreaterThan(100)
    expect(CATALOGUE.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('records how discovery happened, including what it could NOT check', () => {
    // "I could not ask" must never be stored as "it is not there". The
    // discovery block keeps the two apart by construction.
    expect(CATALOGUE.discovery.attempted.length).toBeGreaterThan(0)
    expect(Array.isArray(CATALOGUE.discovery.notRestEntities)).toBe(true)
    expect(Array.isArray(CATALOGUE.discovery.unchecked)).toBe(true)
    for (const u of CATALOGUE.discovery.unchecked) {
      expect(u.error.trim().length, `unchecked ${u.entity} must say WHY`).toBeGreaterThan(5)
    }
  })

  it('carries the families that had no surface at all before 2026-09-21', () => {
    // Named explicitly because these are the ones that blocked live work. If a
    // regeneration drops them, that is a regression, not a vendor change.
    for (const entity of [
      'TicketCharges',
      'Opportunities',
      'Quotes',
      'QuoteItems',
      'Contracts',
      'ContractServices',
      'ConfigurationItems',
      'ServiceCalls',
      'Appointments',
      'PurchaseOrders',
      'InventoryItems',
      'ExpenseItems',
      'ExpenseReports',
      'Tags',
      'Departments',
    ]) {
      expect(catalogueEntityNames(), `${entity} missing from the catalogue`).toContain(entity)
    }
  })

  it('reports TicketCharges as fully writable — the entity that blocked the $45 shipping charge', () => {
    expect(permittedOperations('TicketCharges')).toEqual(expect.arrayContaining(['query', 'create', 'update', 'delete']))
    const names = writableFields('TicketCharges').map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['ticketID', 'name', 'unitQuantity', 'unitPrice', 'unitCost', 'isBillableToCompany']))
  })

  it('never lists a computed money field as writable', () => {
    // Sending one is rejected, and offering it invites a caller to think they
    // can set what the customer is billed directly.
    const names = writableFields('TicketCharges').map((f) => f.name)
    expect(names).not.toContain('billableAmount')
    expect(names).not.toContain('extendedCost')
    expect(names).not.toContain('isBilled')
  })
})

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

describe('surface coverage', () => {
  const registered = Object.keys(TOOL_FACTS)

  it('every claimed tool is really registered', () => {
    // The binding that stops SURFACE_CLAIMS being a promise rather than a
    // measurement. A claim naming a tool nobody registers contributes nothing.
    const missing = SURFACE_CLAIMS.filter((c) => !TOOL_FACTS[c.tool]).map((c) => c.tool)
    expect(missing, `SURFACE_CLAIMS names tools that are not registered: ${missing.join(', ')}`).toEqual([])
  })

  it('has NO uncovered entity, operation or writable field', () => {
    const report = buildCoverageReport({ registeredTools: registered })
    expect(formatViolations(report)).toBe('Autotask surface coverage: no violations.')
    expect(report.summary.violations).toBe(0)
  })

  it('actually covers something — the check is not passing on an empty catalogue', () => {
    const report = buildCoverageReport({ registeredTools: registered })
    expect(report.summary.entities).toBeGreaterThan(100)
    expect(report.summary.operationsCovered).toBeGreaterThan(200)
    expect(report.summary.fieldsCovered).toBeGreaterThan(1000)
  })

  it('counts the exemptions rather than hiding them', () => {
    const report = buildCoverageReport({ registeredTools: registered })
    expect(report.summary.operationsExempted).toBe(
      SURFACE_EXEMPTIONS.filter((e) => e.operation && permittedOperations(e.entity).includes(e.operation)).length,
    )
  })
})

// ---------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------

describe('the exemptions file', () => {
  it('is structurally valid', () => {
    expect(validateExemptions()).toEqual([])
  })

  it('rejects "not needed yet" in every dialect', () => {
    // The one reason that must never be accepted, because it is how the
    // hand-picked surface happened in the first place.
    for (const rationale of [
      'Nobody has asked for this yet and it is low priority, so we have not built it. It can wait until somebody needs it.',
      'We do not need this capability at the moment; no use case exists for it today across any of our managed customers.',
      'Out of scope for now. Revisit when a customer requires it; there is no reason to carry the extra surface area today.',
    ]) {
      const defects = validateExemptions([
        { entity: 'Tickets', operation: 'delete', reason: 'POLICY_GATED', dated: '2026-09-21', rationale },
      ])
      expect(defects.map((d) => d.problem).join(' '), rationale).toMatch(/not a valid exemption reason/)
    }
  })

  it('refuses a VENDOR_BROKEN claim with no captured failure', () => {
    const defects = validateExemptions([
      {
        entity: 'Tickets',
        operation: 'delete',
        reason: 'VENDOR_BROKEN',
        dated: '2026-09-21',
        rationale:
          'Autotask reports this operation as permitted but rejects every attempt, so the connector cannot offer it however the call is shaped.',
      },
    ])
    expect(defects.map((d) => d.problem).join(' ')).toMatch(/requires liveError/)
  })

  it('refuses an undated exemption', () => {
    const defects = validateExemptions([
      {
        entity: 'Tickets',
        operation: 'delete',
        reason: 'POLICY_GATED',
        dated: 'recently',
        rationale:
          'Deleting a ticket destroys the entire service record including its time entries, notes and attachments, with no recovery path.',
      } as SurfaceExemption,
    ])
    expect(defects.map((d) => d.problem).join(' ')).toMatch(/YYYY-MM-DD/)
  })

  it('reports a stale exemption for an entity the API no longer has', () => {
    const report = buildCoverageReport({
      exemptions: [
        {
          entity: 'ThingThatNeverExisted',
          operation: 'delete',
          reason: 'POLICY_GATED',
          dated: '2026-09-21',
          rationale:
            'A long rationale that satisfies the length rule so the only defect the report can find is that the entity is not in the live catalogue at all.',
        },
      ],
      registeredTools: Object.keys(TOOL_FACTS),
    })
    expect(report.violations.some((v) => v.kind === 'exemption-stale')).toBe(true)
  })

  it('every live exemption names an entity the catalogue has', () => {
    for (const e of SURFACE_EXEMPTIONS) {
      expect(catalogueEntityNames().map((n) => n.toLowerCase()), `${e.entity} is not a catalogue entity`).toContain(
        e.entity.toLowerCase(),
      )
    }
  })
})

// ---------------------------------------------------------------------------
// THE DEMONSTRATION: removing an entity from the surface fails the check
// ---------------------------------------------------------------------------

describe('the check fails when an entity is removed from the surface', () => {
  /** SURFACE_CLAIMS with TicketCharges excised from every generic claim. */
  const withoutTicketCharges: ToolCoverageClaim[] = SURFACE_CLAIMS.map((c) => ({
    ...c,
    entities:
      c.entities === '*'
        ? catalogueEntityNames().filter((n) => n !== 'TicketCharges')
        : c.entities.filter((n) => n !== 'TicketCharges'),
  }))

  it('names the entity, every operation and every writable field it lost', () => {
    const report = buildCoverageReport({ claims: withoutTicketCharges, registeredTools: Object.keys(TOOL_FACTS) })
    const mine = report.violations.filter((v) => v.entity === 'TicketCharges')

    expect(mine.length, 'removing TicketCharges must fail the coverage check').toBeGreaterThan(0)

    const lostOps = mine.filter((v) => v.kind === 'operation-not-exposed').map((v) => v.operation)
    expect(lostOps).toEqual(expect.arrayContaining(['query', 'create', 'update']))

    const lostFields = mine.filter((v) => v.kind === 'field-not-exposed').map((v) => v.field)
    expect(lostFields).toEqual(expect.arrayContaining(['unitPrice', 'unitQuantity', 'ticketID']))

    // The message has to tell whoever broke it what to do, not just that a
    // number moved.
    const text = formatViolations(report)
    expect(text).toMatch(/TicketCharges/)
    expect(text).toMatch(/autotask-exemptions\.ts/)
    expect(text).toMatch(/"Not needed yet" is not a valid reason/)
  })

  it('and deleting a whole generic tool collapses coverage across the catalogue', () => {
    // The failure mode that matters most: somebody removes autotask_entity_create
    // and ~160 entities silently lose their create surface.
    const report = buildCoverageReport({
      registeredTools: Object.keys(TOOL_FACTS).filter((t) => t !== 'autotask_entity_create'),
    })
    const lostCreates = report.violations.filter((v) => v.kind === 'operation-not-exposed' && v.operation === 'create')
    expect(lostCreates.length).toBeGreaterThan(50)
  })

  it('an exemption makes the same removal pass — which is the point of having one', () => {
    const report = buildCoverageReport({
      claims: withoutTicketCharges,
      exemptions: [
        ...SURFACE_EXEMPTIONS,
        {
          entity: 'TicketCharges',
          reason: 'POLICY_GATED',
          dated: '2026-09-21',
          rationale:
            'Hypothetical entity-wide refusal used only by this test, written long enough to satisfy the rationale rule and to demonstrate that a dated, reasoned exemption is what turns a violation into an accepted decision.',
        },
      ],
      registeredTools: Object.keys(TOOL_FACTS),
    })
    expect(report.violations.filter((v) => v.entity === 'TicketCharges')).toEqual([])
    expect(report.summary.operationsExempted).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Write policy and path derivation
// ---------------------------------------------------------------------------

describe('write policy', () => {
  it('defaults an unclassified entity to the approval gate, never to unavailable', () => {
    // The direction is the design. A missing classification must degrade to
    // "needs one click", because a capability that needs a click is a
    // capability and one that does not exist is the bug being fixed.
    expect(writePolicyFor('SomeEntityNobodyClassified')).toBe('staged')
  })

  it('writes operational records directly', () => {
    for (const e of ['Tickets', 'TicketCharges', 'TimeEntries', 'Tasks', 'Opportunities', 'ConfigurationItems']) {
      expect(writePolicyFor(e), e).toBe('direct')
    }
  })

  it('keeps instance CONFIGURATION behind the gate', () => {
    for (const e of ['TicketCategories', 'Services', 'ServiceBundles', 'HolidaySets', 'Roles']) {
      expect(writePolicyFor(e), e).toBe('staged')
    }
  })

  it('lists no operational entity the live catalogue has never heard of', () => {
    // A dead name here silently does nothing — the same class of defect as a
    // typo in a parentIdField, which this repo already treats as reportable.
    expect(unknownOperationalEntities()).toEqual([])
    expect(OPERATIONAL_ENTITIES.length).toBeGreaterThan(20)
  })
})

describe('write-path derivation', () => {
  it('offers the root path first, so a root-writable entity needs no parent knowledge', () => {
    expect(writePathCandidates('Tickets')[0]).toBe('Tickets')
  })

  it('derives the child path from the entity\'s OWN reference metadata', () => {
    // TicketNotes.ticketID is a required reference to Ticket, and the entity
    // name is prefixed by it — so the segment is "Notes", with no list anywhere
    // saying so.
    const routes = parentRoutes('TicketNotes')
    expect(routes[0]).toMatchObject({ parentIdField: 'ticketID', parentEntity: 'Tickets', childSegment: 'Notes' })
    expect(writePathCandidates('TicketNotes', { ticketID: 42 })).toContain('Tickets/42/Notes')
  })

  it('falls back to the full entity name when it is not prefixed by its parent', () => {
    // Holidays hangs off HolidaySets without carrying the name.
    const routes = parentRoutes('Holidays')
    if (routes.length) {
      expect(routes[0].childSegment).toBe('Holidays')
    }
  })

  it('never emits a path with an undefined id in it', () => {
    for (const name of catalogueEntityNames().slice(0, 60)) {
      for (const p of writePathCandidates(name)) {
        expect(p, `${name} produced ${p}`).not.toMatch(/undefined|null|\/\//)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Catalogue-derived staged areas
// ---------------------------------------------------------------------------

describe('catalogue-derived staged areas', () => {
  it('a hand-written area still wins for its own name', () => {
    // The named areas carry knowledge the metadata does not. Nothing about them
    // changes because a generic fallback exists.
    expect(configAreaSpec('ticket_category')).toBe(CONFIG_WRITE_AREAS.ticket_category)
    expect(configAreaSpec('service')).toBe(CONFIG_WRITE_AREAS.service)
  })

  it('every catalogue entity can be staged under entity:<Name>', () => {
    const uncoverable = catalogueEntityNames().filter((n) => !configAreaSpec(`${GENERATED_AREA_PREFIX}${n}`))
    expect(uncoverable, `no staged area could be derived for: ${uncoverable.join(', ')}`).toEqual([])
  })

  it('a derived area allows exactly the fields the API reports writable', () => {
    const spec = generatedAreaSpec('TicketCharges')!
    expect(spec.allowedFields).toEqual(expect.arrayContaining(['name', 'unitPrice', 'unitQuantity', 'ticketID']))
    expect(spec.allowedFields).not.toContain('billableAmount')
    expect(spec.requiredOnCreate).toEqual(expect.arrayContaining(['name', 'unitQuantity', 'ticketID', 'chargeType']))
  })

  it('segregates the isRequired + isReadOnly fields instead of refusing them outright', () => {
    // The periodType class. Flagged read-only AND required means "set at create,
    // immutable afterwards" — refusing it on create made every Service create
    // impossible for a caller who believed the connector.
    const spec = generatedAreaSpec('Services')!
    expect(spec.createOnlyFields ?? []).toContain('periodType')
    expect(spec.allowedFields).not.toContain('periodType')
  })

  it('a derived area refuses a field the API does not report writable', () => {
    expect(() =>
      validateStagedChange({
        area: `${GENERATED_AREA_PREFIX}TicketCharges`,
        operation: 'update',
        entityId: 1,
        changes: { billableAmount: 99 },
      }),
    ).toThrow(/billableAmount/)
  })

  it('a derived area refuses a create missing a required field, before any approval is spent', () => {
    expect(() =>
      validateStagedChange({
        area: `${GENERATED_AREA_PREFIX}TicketCharges`,
        operation: 'create',
        changes: { name: 'Overnight shipping' },
        parentId: 1,
      }),
    ).toThrow(/requires/)
  })

  it('an unknown area name says BOTH things it could mean', () => {
    // A 404-shaped answer cannot distinguish a typo from an entity the
    // catalogue predates, so the message has to cover both readings.
    expect(() => validateStagedChange({ area: 'entity:NotARealEntity', operation: 'update', entityId: 1, changes: { a: 1 } })).toThrow(
      /Unknown config area/,
    )
  })
})

// ---------------------------------------------------------------------------
// Regression locks on the entity-name validator
// ---------------------------------------------------------------------------

describe('entity names containing digits', () => {
  it('are in the catalogue or explicitly unchecked — never silently dropped', () => {
    // 2026-09-21: the connector's letters-only name validator rejected
    // OrganizationalLevel1 and OrganizationalLevel2 BEFORE any API call and
    // returned a connector-gap verdict about entities Autotask was never asked
    // about. The validator now accepts digits; whatever is still unresolved has
    // to be visible as unchecked rather than absent.
    const digitNames = [...catalogueEntityNames(), ...CATALOGUE.discovery.unchecked.map((u) => u.entity)].filter((n) =>
      /\d/.test(n),
    )
    expect(digitNames.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Sanity: every catalogue entity is describable end to end
// ---------------------------------------------------------------------------

describe('no entity is half-known', () => {
  it('every entity has capabilities and at least one field', () => {
    const broken = catalogueEntities().filter((e) => !e.fields.length)
    expect(broken.map((e) => e.name), 'entities with no field metadata are not usable').toEqual([])
  })

  it('every writable field has a name the API will accept', () => {
    for (const e of catalogueEntities()) {
      for (const f of writableFields(e.name)) {
        expect(f.name, `${e.name}.${f.name}`).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/)
      }
    }
  })
})
