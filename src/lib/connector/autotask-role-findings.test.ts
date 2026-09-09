// src/lib/connector/autotask-role-findings.test.ts
//
// Pins the empirical role result and the work-type guidance derived from it.
//
// The experiment (2026-09-09, scratch ticket 35754 on company 0): ten identical
// 1-minute time entries differing only in roleId, plus a negative control using
// a role id that does not exist. All ten real roles accepted; the control
// refused. See autotask-role-findings.ts for the full account.

import { describe, expect, it } from 'vitest'
import {
  KURTIS_DEFAULT_ROLE_ID,
  KURTIS_RESOURCE_ID,
  ROLE_IDS,
  ROLE_RATE_WARNING,
  suggestRoleForWork,
  TIME_ENTRY_ROLE_FINDING,
  TIME_ENTRY_ROLE_TRIALS,
} from './autotask-role-findings'

describe('the recorded experiment', () => {
  it('records all ten active roles as accepted, each with its time-entry id', () => {
    const accepted = TIME_ENTRY_ROLE_TRIALS.filter((t) => t.accepted)
    expect(accepted).toHaveLength(10)
    // Every acceptance must cite the row it created — an acceptance with no
    // evidence is an assertion, not a result.
    for (const t of accepted) expect(typeof t.timeEntryId).toBe('number')
  })

  it('records the negative control as refused, with the vendor\'s own message', () => {
    const control = TIME_ENTRY_ROLE_TRIALS.filter((t) => !t.accepted)
    expect(control).toHaveLength(1)
    expect(control[0].roleId).toBe(99999999)
    expect(control[0].error).toMatch(/Role does not exist or is invalid/)
  })

  it('includes Engineer as ACCEPTED — the 2026-09-04 rejection claim is retracted', () => {
    const engineer = TIME_ENTRY_ROLE_TRIALS.find((t) => t.roleId === ROLE_IDS.engineer)!
    expect(engineer.accepted).toBe(true)
    expect(engineer.timeEntryId).toBe(13856)
    expect(TIME_ENTRY_ROLE_FINDING).toMatch(/RETRACTED/)
  })

  it('carries the three 225/hr roles with their factors, since the role sets the rate', () => {
    const premium = TIME_ENTRY_ROLE_TRIALS.filter((t) => t.accepted && t.hourlyRate === 225).map((t) => t.roleId)
    expect(premium.sort()).toEqual(
      [ROLE_IDS.emergencyTechnician, ROLE_IDS.afterHoursSupport, ROLE_IDS.vcio].sort(),
    )
    expect(TIME_ENTRY_ROLE_TRIALS.find((t) => t.roleId === ROLE_IDS.afterHoursSupport)!.hourlyFactor).toBe(1.5)
    expect(TIME_ENTRY_ROLE_TRIALS.find((t) => t.roleId === ROLE_IDS.emergencyTechnician)!.hourlyFactor).toBe(1.25)
  })

  it('states what was proven AND what was not — no overclaiming', () => {
    expect(TIME_ENTRY_ROLE_FINDING).toMatch(/NOT validated against ResourceRoleDepartments/)
    // The limit that matters: this resource holds every active role, so
    // "Service Desk list" and "any active role" cannot be separated.
    expect(TIME_ENTRY_ROLE_FINDING).toMatch(/STILL NOT ESTABLISHED/)
    expect(TIME_ENTRY_ROLE_FINDING).toMatch(/TASK assignment was NOT tested/)
  })

  it('names company 0 as the scratch target, never a customer record', () => {
    // 2026-09-08 a test write went against company 436, a real customer with
    // the Client Portal active. The finding records the rule that replaced that.
    expect(TIME_ENTRY_ROLE_FINDING).toMatch(/company 0/)
    expect(TIME_ENTRY_ROLE_FINDING).toMatch(/TCT's own record/)
  })
})

describe('suggestRoleForWork', () => {
  it('maps network, infrastructure and connectivity work to Network Engineer', () => {
    for (const text of [
      'Replaced the failing switch uplink and re-tested the VLAN.',
      'Investigated packet loss on the WAN circuit with the ISP.',
      'Reconfigured the firewall rules and DNS forwarders.',
      'Adopted a new UniFi access point and set the wireless SSID.',
    ]) {
      const s = suggestRoleForWork(text)
      expect(s.roleId, text).toBe(ROLE_IDS.networkEngineer)
      expect(s.matched).toBe(true)
    }
  })

  it('maps account, billing and vendor-account administration to Administration', () => {
    for (const text of [
      'Called the vendor to obtain the account number for the portal.',
      'Reconciled the invoice and updated the licence renewal date.',
      'Documented the portal security code from the invoice.',
    ]) {
      expect(suggestRoleForWork(text).roleId, text).toBe(ROLE_IDS.administration)
    }
  })

  it('maps strategic and advisory work to vCIO', () => {
    for (const text of [
      'Ran the quarterly business review with the owner.',
      'Built the technology roadmap and budget for next year.',
      'Presented the risk assessment findings to the executive team.',
    ]) {
      const s = suggestRoleForWork(text)
      expect(s.roleId, text).toBe(ROLE_IDS.vcio)
      expect(s.hourlyRate).toBe(225)
      // A 225/hr suggestion must say so, so nobody accepts it unnoticed.
      expect(s.rationale).toMatch(/225\/hr/)
    }
  })

  it('prefers advisory over network when the work is advisory ABOUT a network', () => {
    // The ordering case: "reviewed the network strategy" is advisory work that
    // mentions a network, and billing it as Network Engineer would under-bill.
    const s = suggestRoleForWork('Reviewed the network strategy and roadmap with the owner.')
    expect(s.roleId).toBe(ROLE_IDS.vcio)
  })

  it('prefers account work over network when the work is a vendor account task', () => {
    const s = suggestRoleForWork('Obtained the ISP account number and portal login from the vendor.')
    expect(s.roleId).toBe(ROLE_IDS.administration)
  })

  it('maps routine end-user support to Help Desk', () => {
    expect(suggestRoleForWork('Reset the password and re-enrolled MFA for the user.').roleId).toBe(ROLE_IDS.helpDesk)
    expect(suggestRoleForWork('Fixed the print queue on the workstation.').roleId).toBe(ROLE_IDS.helpDesk)
  })

  it('maps cabling and camera work to Low/High Voltage Technician', () => {
    expect(suggestRoleForWork('Pulled a new cable run and terminated the patch panel.').roleId).toBe(ROLE_IDS.lowHighVoltage)
    expect(suggestRoleForWork('Installed two security cameras and aimed them.').roleId).toBe(ROLE_IDS.lowHighVoltage)
  })

  it('falls back to Network Engineer for Kurtis and Engineer for anyone else', () => {
    const vague = 'Worked on the thing we discussed.'
    const kurtis = suggestRoleForWork(vague, { resourceId: KURTIS_RESOURCE_ID })
    expect(kurtis.roleId).toBe(KURTIS_DEFAULT_ROLE_ID)
    expect(kurtis.roleId).toBe(ROLE_IDS.networkEngineer)
    expect(kurtis.matched).toBe(false)

    const other = suggestRoleForWork(vague, { resourceId: 12345 })
    expect(other.roleId).toBe(ROLE_IDS.engineer)
    expect(other.matched).toBe(false)
  })

  it('never falls back to a 225/hr role on a non-match', () => {
    // A regex that guesses a premium rate is a billing decision made by a
    // regex. Neither fallback may be one of the three 225/hr roles.
    for (const resourceId of [KURTIS_RESOURCE_ID, 12345, undefined]) {
      const s = suggestRoleForWork('nothing recognisable here at all', { resourceId })
      expect(s.matched).toBe(false)
      expect(s.hourlyRate).toBe(145)
      expect([ROLE_IDS.vcio, ROLE_IDS.afterHoursSupport, ROLE_IDS.emergencyTechnician]).not.toContain(s.roleId)
    }
  })

  it('handles empty input without throwing', () => {
    expect(suggestRoleForWork('').matched).toBe(false)
    expect(suggestRoleForWork(undefined as unknown as string).matched).toBe(false)
  })

  it('warns that the role sets the rate and that a wrong role is not refused', () => {
    expect(ROLE_RATE_WARNING).toMatch(/THE ROLE SETS THE BILL RATE/)
    expect(ROLE_RATE_WARNING).toMatch(/will NOT be refused/)
    expect(ROLE_RATE_WARNING).toMatch(/225\/hr/)
  })
})
