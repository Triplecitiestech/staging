import { describe, it, expect } from 'vitest'
import {
  CONFIG_WRITE_AREAS,
  UNIFI_WRITE_AREAS,
  buildDiff,
  buildTargetLabel,
  buildUnifiEntityPath,
  canonicalizeKeys,
  deriveDefaultDhcpRange,
  detectDrift,
  normalizeUnifiChanges,
  parseIpv4Cidr,
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

describe('canonicalizeKeys — JSONB key-order drift defense', () => {
  it('deep-sorts object keys but preserves array element order', () => {
    const out = canonicalizeKeys({ b: 1, a: { d: 2, c: [3, 1, 2] } })
    expect(JSON.stringify(out)).toBe('{"a":{"c":[3,1,2],"d":2},"b":1}')
  })

  it('passes primitives and null through unchanged', () => {
    expect(canonicalizeKeys(null)).toBeNull()
    expect(canonicalizeKeys(42)).toBe(42)
    expect(canonicalizeKeys('x')).toBe('x')
  })

  it('resolves the phantom drift a JSONB round-trip causes on a nested object', () => {
    // Live API order vs the order JSONB gives back the stored snapshot.
    const live = { name: 'IoT', ipv4Configuration: { autoScaleEnabled: false, hostIpAddress: '10.0.0.1', prefixLength: 24 } }
    const afterJsonbRoundTrip = { ipv4Configuration: { prefixLength: 24, hostIpAddress: '10.0.0.1', autoScaleEnabled: false }, name: 'IoT' }
    // Raw compare falsely flags ipv4Configuration…
    expect(detectDrift(afterJsonbRoundTrip, live)).toContain('ipv4Configuration')
    // …canonicalizing both sides first clears it (nothing actually changed).
    expect(detectDrift(canonicalizeKeys(afterJsonbRoundTrip), canonicalizeKeys(live))).toEqual([])
  })

  it('still detects a REAL nested change after canonicalization', () => {
    const before = { ipv4Configuration: { prefixLength: 24, hostIpAddress: '10.0.0.1' } }
    const live = { ipv4Configuration: { hostIpAddress: '10.0.0.1', prefixLength: 25 } } // /24 → /25
    expect(detectDrift(canonicalizeKeys(before), canonicalizeKeys(live))).toContain('ipv4Configuration')
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

describe('UniFi network 10.4.x create schema — allowlist widening', () => {
  it('exposes the fields the 10.4.x API requires on GATEWAY create', () => {
    const fields = UNIFI_WRITE_AREAS.unifi_network.allowedFields
    for (const f of ['ipv4Configuration', 'internetAccessEnabled', 'cellularBackupEnabled', 'isolationEnabled', 'management', 'name', 'enabled', 'vlanId']) {
      expect(fields, f).toContain(f)
    }
  })

  it('only requires name + vlanId from the caller (defaults fill the rest)', () => {
    expect(UNIFI_WRITE_AREAS.unifi_network.requiredOnCreate).toEqual(['name', 'vlanId'])
  })
})

describe('parseIpv4Cidr / deriveDefaultDhcpRange', () => {
  it('parses a CIDR into gateway host IP + prefix', () => {
    expect(parseIpv4Cidr('192.168.50.1/24')).toEqual({ hostIpAddress: '192.168.50.1', prefixLength: 24 })
  })

  it('rejects malformed CIDR and out-of-range prefixes', () => {
    expect(() => parseIpv4Cidr('192.168.50.1')).toThrow(/IPv4 CIDR/)
    expect(() => parseIpv4Cidr('999.1.1.1/24')).toThrow(/valid IPv4/)
    expect(() => parseIpv4Cidr('192.168.50.1/33')).toThrow(/\/8 to \/30/)
  })

  it('derives a UniFi-style pool (network+6 … broadcast-1)', () => {
    expect(deriveDefaultDhcpRange('192.168.50.1', 24)).toEqual({ start: '192.168.50.6', stop: '192.168.50.254' })
    expect(deriveDefaultDhcpRange('10.10.0.1', 16)).toEqual({ start: '10.10.0.6', stop: '10.10.255.254' })
  })
})

describe('normalizeUnifiChanges — unifi_network create', () => {
  const create = (changes: Record<string, unknown>) => normalizeUnifiChanges('unifi_network', 'create', changes)

  it('fills GATEWAY defaults + derives subnet from vlanId for a minimal create', () => {
    const out = create({ name: 'IoT', vlanId: 99 })
    expect(out.management).toBe('GATEWAY')
    expect(out.enabled).toBe(true)
    expect(out.internetAccessEnabled).toBe(true)
    expect(out.isolationEnabled).toBe(false)
    expect(out.cellularBackupEnabled).toBe(false)
    expect(out.ipv4Configuration).toMatchObject({
      autoScaleEnabled: false,
      hostIpAddress: '192.168.99.1',
      prefixLength: 24,
      dhcpConfiguration: {
        mode: 'SERVER',
        ipAddressRange: { start: '192.168.99.6', stop: '192.168.99.254' },
        leaseTimeSeconds: 86400,
        pingConflictDetectionEnabled: false,
      },
    })
    // The API-required set is complete after normalization.
    const spec = validateUnifiStagedChange({ area: 'unifi_network', operation: 'create', consoleId: 'c', siteId: 's', changes: out })
    expect(spec.risk).toBe('high')
  })

  it('builds ipv4Configuration from an explicit subnet + DHCP range and DNS', () => {
    const out = create({ name: 'PCI', vlanId: 40, subnet: '10.40.0.1/24', dhcpStart: '10.40.0.50', dhcpStop: '10.40.0.150', dhcpDnsServers: ['10.40.0.1'], dhcpDomainName: 'pci.local' })
    expect(out.ipv4Configuration).toMatchObject({
      hostIpAddress: '10.40.0.1',
      prefixLength: 24,
      dhcpConfiguration: {
        mode: 'SERVER',
        ipAddressRange: { start: '10.40.0.50', stop: '10.40.0.150' },
        dnsServerIpAddressesOverride: ['10.40.0.1'],
        domainName: 'pci.local',
      },
    })
    // Convenience keys never leak into the payload.
    for (const k of ['subnet', 'dhcpStart', 'dhcpStop', 'dhcpDnsServers', 'dhcpDomainName']) {
      expect(out).not.toHaveProperty(k)
    }
  })

  it('honours caller-supplied flags instead of the defaults', () => {
    const out = create({ name: 'Isolated', vlanId: 66, subnet: '192.168.66.1/24', isolationEnabled: true, internetAccessEnabled: false })
    expect(out.isolationEnabled).toBe(true)
    expect(out.internetAccessEnabled).toBe(false)
  })

  it('supports dhcpMode NONE (no DHCP server) and RELAY', () => {
    const none = create({ name: 'Static', vlanId: 70, subnet: '192.168.70.1/24', dhcpMode: 'NONE' })
    expect((none.ipv4Configuration as Record<string, unknown>).dhcpConfiguration).toBeUndefined()

    const relay = create({ name: 'Relay', vlanId: 71, subnet: '192.168.71.1/24', dhcpMode: 'RELAY', dhcpRelayServers: ['10.0.0.5'] })
    expect((relay.ipv4Configuration as Record<string, unknown>).dhcpConfiguration).toEqual({ mode: 'RELAY', dhcpServerIpAddresses: ['10.0.0.5'] })
  })

  it('rejects RELAY without relay servers, and raw ipv4Configuration mixed with convenience inputs', () => {
    expect(() => create({ name: 'x', vlanId: 72, subnet: '192.168.72.1/24', dhcpMode: 'RELAY' })).toThrow(/requires dhcpRelayServers/)
    expect(() => create({ name: 'x', vlanId: 73, subnet: '192.168.73.1/24', ipv4Configuration: { autoScaleEnabled: false, hostIpAddress: '192.168.73.1', prefixLength: 24 } }))
      .toThrow(/EITHER a raw ipv4Configuration/)
  })

  it('requires an explicit subnet when the VLAN id is outside the auto-derive range', () => {
    expect(() => create({ name: 'HighVlan', vlanId: 3000 })).toThrow(/auto-derivation only covers VLAN IDs 2-254/)
  })

  it('leaves the missing-vlanId error to validateUnifiStagedChange (friendly message, not an internal invariant)', () => {
    const normalized = create({ name: 'NoVlan', subnet: '192.168.5.1/24' }) // no vlanId
    expect(() => validateUnifiStagedChange({ area: 'unifi_network', operation: 'create', consoleId: 'c', siteId: 's', changes: normalized }))
      .toThrow(/create in unifi_network requires: vlanId/)
  })

  it('passes a raw ipv4Configuration straight through (advanced callers)', () => {
    const raw = { autoScaleEnabled: false, hostIpAddress: '172.16.5.1', prefixLength: 24 }
    const out = create({ name: 'Raw', vlanId: 5, ipv4Configuration: raw })
    expect(out.ipv4Configuration).toEqual(raw)
    expect(out.internetAccessEnabled).toBe(true) // flags still defaulted
  })
})

describe('normalizeUnifiChanges — unifi_network update & passthrough', () => {
  it('builds ipv4Configuration on update from convenience inputs without injecting create-defaults', () => {
    const out = normalizeUnifiChanges('unifi_network', 'update', { subnet: '192.168.80.1/24' })
    expect(out.ipv4Configuration).toMatchObject({ hostIpAddress: '192.168.80.1', prefixLength: 24 })
    // No create-only defaults on update.
    expect(out).not.toHaveProperty('management')
    expect(out).not.toHaveProperty('internetAccessEnabled')
    expect(out).not.toHaveProperty('enabled')
  })

  it('lets a flag-only update through untouched (GET→merge→PUT preserves ipv4Configuration)', () => {
    const out = normalizeUnifiChanges('unifi_network', 'update', { internetAccessEnabled: false })
    expect(out).toEqual({ internetAccessEnabled: false })
  })

  it('requires subnet when other dhcp* inputs are given on update', () => {
    expect(() => normalizeUnifiChanges('unifi_network', 'update', { dhcpStart: '192.168.80.10', dhcpStop: '192.168.80.20' }))
      .toThrow(/requires `subnet`/)
  })

  it('never mutates the caller object and passes non-network areas through unchanged', () => {
    const input = { name: 'Zone A', networkIds: ['n1'] }
    const out = normalizeUnifiChanges('unifi_firewall_zone', 'create', input)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })
})

describe('UniFi WLAN allowlist — SSID→network binding fix', () => {
  const base = { consoleId: 'c', siteId: 's' }
  it('makes `network` (SSID→VLAN binding) writable', () => {
    expect(UNIFI_WRITE_AREAS.unifi_wlan.allowedFields).toContain('network')
    const spec = validateUnifiStagedChange({ area: 'unifi_wlan', operation: 'update', ...base, targetId: 'w1', changes: { network: { type: 'SPECIFIC', networkId: 'n-uuid' } } })
    expect(spec.area).toBe('unifi_wlan')
  })
  it('drops the phantom uapsdEnabled field (not in the current schema)', () => {
    expect(UNIFI_WRITE_AREAS.unifi_wlan.allowedFields).not.toContain('uapsdEnabled')
    expect(() => validateUnifiStagedChange({ area: 'unifi_wlan', operation: 'update', ...base, targetId: 'w1', changes: { uapsdEnabled: true } }))
      .toThrow(/not writable/)
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
