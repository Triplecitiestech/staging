import { describe, it, expect } from 'vitest'
import {
  CONFIG_WRITE_AREAS,
  UNIFI_WRITE_AREAS,
  buildDiff,
  buildTargetLabel,
  buildUnifiEntityPath,
  detectDrift,
  parseUnifiEntityPath,
  snapshotFields,
  validateSlaOverlayMappings,
  validateStagedChange,
  validateUnifiStagedChange,
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

describe('validateUnifiStagedChange', () => {
  const base = { consoleId: 'F4E2C6:1815664374', siteId: 'site-a' }

  it('rejects unknown areas with the allowlist in the message', () => {
    expect(() => validateUnifiStagedChange({ area: 'unifi_port_forward', operation: 'update', ...base, targetId: 'x', changes: { enabled: false } }))
      .toThrow(/Unknown UniFi write area/)
  })

  it('rejects operations an area does not support — WLAN create is deliberately absent (passphrase secret)', () => {
    expect(() => validateUnifiStagedChange({ area: 'unifi_wlan', operation: 'create', ...base, changes: { name: 'Guest' } }))
      .toThrow(/not supported/)
  })

  it('requires exactly one consoleId, one siteId, one targetId', () => {
    expect(() => validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'update', consoleId: '', siteId: 'site-a', targetId: 'x', changes: { enabled: false } }))
      .toThrow(/consoleId is required/)
    expect(() => validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'update', consoleId: 'c1', siteId: ' ', targetId: 'x', changes: { enabled: false } }))
      .toThrow(/siteId is required/)
    expect(() => validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'delete', ...base, changes: {} }))
      .toThrow(/requires targetId/)
  })

  it('rejects ids containing "/" — they cannot round-trip through entityPath', () => {
    expect(() => validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'update', consoleId: 'a/b', siteId: 'site-a', targetId: 'x', changes: { enabled: false } }))
      .toThrow(/must not contain/)
    expect(() => validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'update', consoleId: 'c1', siteId: 's/1', targetId: 'x', changes: { enabled: false } }))
      .toThrow(/must not contain/)
    expect(() => validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'update', ...base, targetId: 'x/y', changes: { enabled: false } }))
      .toThrow(/no "\/"/)
  })

  it('rejects non-allowlisted fields — securityConfiguration (passphrase) is not writable', () => {
    expect(() => validateUnifiStagedChange({ area: 'unifi_wlan', operation: 'update', ...base, targetId: 'w1', changes: { securityConfiguration: { type: 'OPEN' } } }))
      .toThrow(/not writable/)
  })

  it('requires the create-required fields', () => {
    expect(() => validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'create', ...base, changes: { name: 'Block guest' } }))
      .toThrow(/requires:/)
  })

  it('accepts a valid firewall policy update and returns the spec', () => {
    const spec = validateUnifiStagedChange({ area: 'unifi_firewall_policy', operation: 'update', ...base, targetId: 'fp-1', changes: { enabled: false } })
    expect(spec.risk).toBe('high')
    expect(spec.collectionPath('site-a')).toBe('/sites/site-a/firewall/policies')
  })

  it('has no write area for anything outside the official Integration API', () => {
    const areas = Object.keys(UNIFI_WRITE_AREAS).join(' ')
    expect(areas).not.toMatch(/port_forward|route|port_profile|gateway_setting|firmware|locate|block/i)
  })

  it('labels every area with a risk tier and a per-site collection path', () => {
    for (const spec of Object.values(UNIFI_WRITE_AREAS)) {
      expect(['low', 'medium', 'high']).toContain(spec.risk)
      expect(spec.collectionPath('SITE')).toMatch(/^\/sites\/SITE\//)
    }
  })
})

describe('UniFi entityPath round-trip', () => {
  it('encodes and parses console + resource path, including colon console ids', () => {
    const entityPath = buildUnifiEntityPath('F4E2C6C798B9:1815664374', '/sites/site-a/firewall/policies/fp-1')
    expect(parseUnifiEntityPath(entityPath)).toEqual({
      consoleId: 'F4E2C6C798B9:1815664374',
      resourcePath: '/sites/site-a/firewall/policies/fp-1',
    })
  })

  it('returns null for unparseable paths instead of guessing', () => {
    expect(parseUnifiEntityPath('HolidaySets/3/Holidays')).toBeNull()
    expect(parseUnifiEntityPath('consoles/only-console-no-path')).toBeNull()
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
