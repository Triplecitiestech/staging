import { describe, it, expect } from 'vitest'
import {
  CONFIG_WRITE_AREAS,
  buildDiff,
  buildTargetLabel,
  detectDrift,
  snapshotFields,
  validateSlaOverlayMappings,
  validateStagedChange,
} from './staged-writes-core'

describe('validateStagedChange', () => {
  it('rejects unknown areas with the allowlist in the message', () => {
    expect(() => validateStagedChange({ area: 'workflow_rule', operation: 'update', entityId: 1, changes: { name: 'x' } }))
      .toThrow(/Unknown config area/)
  })

  it('rejects operations an area does not support', () => {
    expect(() => validateStagedChange({ area: 'ticket_category', operation: 'delete', entityId: 1, changes: {} }))
      .toThrow(/not supported/)
  })

  it('rejects non-allowlisted fields, naming the allowed ones', () => {
    expect(() => validateStagedChange({ area: 'ticket_category', operation: 'update', entityId: 1, changes: { slaEvent: 'Resolved' } }))
      .toThrow(/not writable.*Allowed: name, nickname, isActive, displayColorRGB/s)
  })

  it('requires entityId on update and parentId on child create', () => {
    expect(() => validateStagedChange({ area: 'ticket_category', operation: 'update', changes: { name: 'x' } }))
      .toThrow(/requires entityId/)
    expect(() => validateStagedChange({ area: 'holiday', operation: 'create', changes: { holidayName: 'x', holidayDate: '2027-07-04' } }))
      .toThrow(/requires parentId/)
  })

  it('requires the create-required fields', () => {
    expect(() => validateStagedChange({ area: 'holiday', operation: 'create', parentId: 1, changes: { holidayName: 'x' } }))
      .toThrow(/requires: holidayDate/)
  })

  it('accepts a valid update', () => {
    const spec = validateStagedChange({ area: 'ticket_category', operation: 'update', entityId: 5, changes: { nickname: 'HD' } })
    expect(spec.entity).toBe('TicketCategories')
  })

  it('has no write area for the API-unwritable config (templates, workflow rules, statuses)', () => {
    const areas = Object.keys(CONFIG_WRITE_AREAS).join(' ')
    expect(areas).not.toMatch(/template|workflow|notification/i)
    // the only status-related area is the OVERLAY, which targets our DB
    expect(CONFIG_WRITE_AREAS.status_sla_overlay.targetSystem).toBe('overlay')
  })
})

describe('buildDiff', () => {
  it('renders update diffs field-by-field with before → after', () => {
    const diff = buildDiff('update', { nickname: 'Support', isActive: true }, { nickname: 'Help Desk', isActive: true })
    expect(diff).toContain('~ nickname: "Support" → "Help Desk"')
    expect(diff).toContain('= isActive: true (no change)')
  })

  it('renders create and delete diffs', () => {
    expect(buildDiff('create', null, { holidayName: 'Test', holidayDate: '2027-07-04' }))
      .toBe('+ holidayName: "Test"\n+ holidayDate: "2027-07-04"')
    expect(buildDiff('delete', { holidayName: 'Test' }, {})).toContain('- holidayName: "Test"')
  })
})

describe('detectDrift', () => {
  it('flags fields whose live value moved since staging', () => {
    expect(detectDrift({ nickname: 'A', name: 'Cat' }, { nickname: 'B', name: 'Cat' })).toEqual(['nickname'])
    expect(detectDrift({ nickname: 'A' }, { nickname: 'A' })).toEqual([])
    expect(detectDrift({ nickname: 'A' }, null)).toEqual(['(record no longer exists)'])
  })
})

describe('snapshot + label helpers', () => {
  it('snapshots only gate-relevant fields', () => {
    const spec = CONFIG_WRITE_AREAS.ticket_category
    const snap = snapshotFields(spec, { id: 3, name: 'Standard', nickname: null, isActive: true, createDate: 'x', secret: 'y' })
    expect(snap).toEqual({ id: 3, name: 'Standard', nickname: null, isActive: true })
  })

  it('builds readable target labels', () => {
    const spec = CONFIG_WRITE_AREAS.ticket_category
    expect(buildTargetLabel(spec, { name: 'Standard' }, 3)).toBe('Ticket category: Standard (id 3)')
  })
})

describe('validateSlaOverlayMappings', () => {
  const live = [{ id: 1, label: 'New' }, { id: 7, label: 'Waiting Customer' }]

  it('accepts valid mappings', () => {
    const out = validateSlaOverlayMappings([{ statusId: 7, slaEvent: 'Waiting Customer' }], live)
    expect(out).toEqual([{ statusId: 7, slaEvent: 'Waiting Customer' }])
  })

  it('rejects status ids that are not live statuses', () => {
    expect(() => validateSlaOverlayMappings([{ statusId: 99, slaEvent: 'Resolved' }], live))
      .toThrow(/not an active ticket status/)
  })

  it('rejects invented SLA event names', () => {
    expect(() => validateSlaOverlayMappings([{ statusId: 1, slaEvent: 'Pause Forever' }], live))
      .toThrow(/invalid/)
  })
})
