import { describe, it, expect } from 'vitest'
import { recordGraphGap } from './m365-identity'
import { tokenRoles } from '@/lib/graph'

const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`
const forbidden = new Error('Graph request failed (403): Authorization_RequestDenied Insufficient privileges to complete the operation.')

describe('Graph refusals are explained from the token (T20260930.0005: "grant these permissions" right after a re-consent)', () => {
  it('reads the application permissions out of an app-only token', () => {
    expect(tokenRoles(jwt({ roles: ['User.Read.All', 'AuditLog.Read.All'] }))).toEqual(['User.Read.All', 'AuditLog.Read.All'])
    expect(tokenRoles(jwt({}))).toEqual([])
    expect(tokenRoles('not-a-jwt')).toBeNull()
  })

  it('a role missing from the token is named as missing, with what the token does carry', () => {
    const gaps: string[] = []
    recordGraphGap('AuditLog.Read.All (directory audits)', forbidden, gaps, ['User.Read.All'], 'AuditLog.Read.All')
    expect(gaps[0]).toMatch(/AuditLog\.Read\.All is NOT in the access token Entra issued for this tenant \(token carries: User\.Read\.All\)/)
  })

  it('a role that IS granted is never reported as a missing permission — Microsoft\'s own reason is shown', () => {
    const gaps: string[] = []
    const licence = new Error('Graph request failed (403): Authentication_RequestFromNonPremiumTenantOrB2CTenant Neither tenant is B2C or tenant doesn\'t have premium license')
    recordGraphGap('AuditLog.Read.All / Entra ID P1 (sign-in logs)', licence, gaps, ['AuditLog.Read.All'], 'AuditLog.Read.All')
    expect(gaps[0]).toMatch(/AuditLog\.Read\.All IS granted, but Microsoft still refused: .*premium license/)
    expect(gaps[0]).not.toMatch(/NOT in the access token/)
  })

  it('without a readable token it still keeps Microsoft\'s message instead of a bare scope name', () => {
    const gaps: string[] = []
    recordGraphGap('AuditLog.Read.All (directory audits)', forbidden, gaps)
    expect(gaps[0]).toMatch(/refused by Microsoft: .*Insufficient privileges/)
  })
})

import { isPrivilegeActivity, toPrivilegeEvent } from './m365-identity'

describe('privilege / app-grant audit records (what a Stage 3c alert actually did)', () => {
  it('keeps consent, role and app records; drops ordinary activity', () => {
    expect(isPrivilegeActivity({ activityDisplayName: 'Consent to application', category: 'ApplicationManagement' })).toBe(true)
    expect(isPrivilegeActivity({ activityDisplayName: 'Add member to role', category: 'RoleManagement' })).toBe(true)
    expect(isPrivilegeActivity({ activityDisplayName: 'Add delegated permission grant', category: 'ApplicationManagement' })).toBe(true)
    expect(isPrivilegeActivity({ activityDisplayName: 'Update user', category: 'UserManagement' })).toBe(false)
    expect(isPrivilegeActivity({ activityDisplayName: 'Add member to group', category: 'GroupManagement' })).toBe(false)
  })

  it('records the app, the permissions and the IP Entra logged', () => {
    const e = toPrivilegeEvent({
      activityDisplayName: 'Consent to application', activityDateTime: '2026-09-30T12:35:01.123Z', category: 'ApplicationManagement', result: 'success',
      initiatedBy: { user: { id: 'x', userPrincipalName: 'user@example.com', ipAddress: '2001:4453:658:2800::1' } },
      targetResources: [{ type: 'ServicePrincipal', displayName: 'Example Sync App', modifiedProperties: [
        { displayName: 'ConsentContext.IsAdminConsent', newValue: '"True"' },
        { displayName: 'ConsentAction.Permissions', newValue: '"Scope: Mail.Read, offline_access"' },
        { displayName: 'SomethingIrrelevant', newValue: '"x"' },
      ] }],
    })
    expect(e.targets).toEqual(['ServicePrincipal: Example Sync App'])
    expect(e.ip).toBe('2001:4453:658:2800::1')
    expect(e.details).toEqual(['ConsentContext.IsAdminConsent: True', 'ConsentAction.Permissions: Scope: Mail.Read, offline_access'])
  })
})
