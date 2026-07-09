/**
 * The "shared" display state (Ally / co-managed) is presentation-only: the
 * three TCT services listed in packages.json → comanaged.sharedServices must
 * render as "shared" WITHOUT changing how the pricing engine treats them
 * (helpdesk + remote support stay hourly/billable, vendor management stays
 * included). If these fail, quote math or the comparison icons drifted.
 */
import { describe, it, expect } from 'vitest'
import {
  getServices,
  getPackages,
  serviceDisplayState,
  serviceInclusionState,
} from './config'
import { buildAllQuotes } from './calc'
import { defaultInput } from './defaults'

const byId = (id: string) => {
  const s = getServices().find((x) => x.id === id)
  if (!s) throw new Error(`service ${id} missing from services.json`)
  return s
}

describe('serviceDisplayState — Ally shared trio', () => {
  const shared = ['helpdesk', 'unlimitedSupport', 'vendorMgmt']

  it('packages.json marks exactly the three TCT services shared for comanaged only', () => {
    const pkgs = getPackages()
    const comanaged = pkgs.find((p) => p.id === 'comanaged')
    expect(comanaged?.sharedServices).toEqual(shared)
    for (const p of pkgs.filter((x) => x.id !== 'comanaged')) {
      expect(p.sharedServices).toBeUndefined()
    }
  })

  it.each(shared)('%s displays as "shared" for comanaged', (id) => {
    expect(serviceDisplayState(byId(id), 'comanaged')).toBe('shared')
  })

  it('other packages are untouched', () => {
    expect(serviceDisplayState(byId('helpdesk'), 'complete')).toBe('included')
    expect(serviceDisplayState(byId('helpdesk'), 'comprehensive')).toBe('billable')
    expect(serviceDisplayState(byId('unlimitedSupport'), 'basic')).toBe('none')
    expect(serviceDisplayState(byId('vendorMgmt'), 'comprehensive')).toBe('none')
    // Non-shared service in the comanaged column keeps its plain state
    expect(serviceDisplayState(byId('rmm'), 'comanaged')).toBe('included')
  })

  it('a shared service that is not available would still display "none"', () => {
    // vendorMgmt is unavailable for basic; even if basic ever listed it as
    // shared, display must not claim availability.
    const fake = { ...byId('vendorMgmt') }
    expect(serviceDisplayState(fake, 'basic')).toBe('none')
  })

  it('underlying inclusion (money) state is unchanged by the display overlay', () => {
    expect(serviceInclusionState(byId('helpdesk'), 'comanaged')).toBe('billable')
    expect(serviceInclusionState(byId('unlimitedSupport'), 'comanaged')).toBe('billable')
    expect(serviceInclusionState(byId('vendorMgmt'), 'comanaged')).toBe('included')
  })
})

describe('quote engine still prices the Ally trio exactly as before', () => {
  const ally = buildAllQuotes(defaultInput()).find((q) => q.packageId === 'comanaged')!

  it('helpdesk + remote support remain hourly (billable) on the Ally quote', () => {
    expect(ally.billableServices).toContain('Helpdesk Support')
    expect(ally.billableServices).toContain('Remote Support')
    expect(ally.includedServices).not.toContain('Helpdesk Support')
    expect(ally.includedServices).not.toContain('Remote Support')
  })

  it('vendor management remains included in the Ally bundle', () => {
    expect(ally.includedServices).toContain('Vendor Management')
    expect(ally.billableServices).not.toContain('Vendor Management')
    expect(ally.missingServices).not.toContain('Vendor Management')
  })
})
