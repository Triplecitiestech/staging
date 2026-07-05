import { describe, it, expect } from 'vitest'
import {
  parseSharedMailboxRecipients,
  deriveRequestedOffboardingActions,
  reconcileOffboardingActions,
} from './offboarding-actions'

describe('parseSharedMailboxRecipients', () => {
  it('reads the current multi_select array shape', () => {
    expect(
      parseSharedMailboxRecipients({ shared_mailbox_access: ['Jking@danbrownconstruction.com'] })
    ).toEqual(['Jking@danbrownconstruction.com'])
  })

  it('reads a plain string and comma-separated strings', () => {
    expect(parseSharedMailboxRecipients({ shared_mailbox_access: 'a@x.com' })).toEqual(['a@x.com'])
    expect(parseSharedMailboxRecipients({ shared_mailbox_access: 'a@x.com, b@x.com' })).toEqual([
      'a@x.com',
      'b@x.com',
    ])
  })

  it('falls back to legacy delegate_access_to / delegate_access keys', () => {
    expect(parseSharedMailboxRecipients({ delegate_access_to: 'mgr@x.com' })).toEqual(['mgr@x.com'])
    expect(parseSharedMailboxRecipients({ delegate_access: 'mgr@x.com' })).toEqual(['mgr@x.com'])
  })

  it('de-duplicates case-insensitively across keys', () => {
    expect(
      parseSharedMailboxRecipients({
        shared_mailbox_access: ['JKing@x.com'],
        delegate_access_to: 'jking@x.com',
      })
    ).toEqual(['JKing@x.com'])
  })

  it('returns empty for missing/blank values', () => {
    expect(parseSharedMailboxRecipients({})).toEqual([])
    expect(parseSharedMailboxRecipients({ shared_mailbox_access: '  ' })).toEqual([])
    expect(parseSharedMailboxRecipients({ shared_mailbox_access: 42 })).toEqual([])
  })
})

describe('deriveRequestedOffboardingActions', () => {
  const target = 'MBeach@danbrownconstruction.com'

  // Regression: ticket T20260704.0004 — keep_accessible was requested with a
  // recipient, but the mailbox conversion appeared nowhere in the results.
  it('always includes the shared-mailbox conversion when keep_accessible is chosen', () => {
    const actions = deriveRequestedOffboardingActions(
      {
        urgency_type: 'immediate_termination',
        data_handling: 'keep_accessible',
        shared_mailbox_access: ['Jking@danbrownconstruction.com'],
        file_handling: 'archive_to_sharepoint',
        device_handling: 'return_to_office',
      },
      target
    )
    const convert = actions.find((s) => s.key === 'convert_shared_mailbox')
    expect(convert).toBeDefined()
    expect(convert!.automated).toBe(false)
    expect(convert!.label).toContain('Jking@danbrownconstruction.com')
    expect(convert!.manualInstruction).toContain('Convert the mailbox')
    expect(convert!.manualInstruction).toContain('SHARED')
    expect(convert!.manualInstruction).toContain('Jking@danbrownconstruction.com')
    // Baseline actions are present too
    for (const key of ['find_user', 'revoke_sessions', 'archive_onedrive', 'disable_account', 'remove_groups', 'remove_licenses', 'device_return']) {
      expect(actions.map((s) => s.key)).toContain(key)
    }
  })

  it('includes the conversion even when no recipient was captured (any schema shape)', () => {
    const actions = deriveRequestedOffboardingActions({ data_handling: 'keep_accessible' }, target)
    const convert = actions.find((s) => s.key === 'convert_shared_mailbox')
    expect(convert).toBeDefined()
    expect(convert!.manualInstruction).toContain('confirm with the requester')
  })

  it('records forwarding as a manual (not automated) action', () => {
    const actions = deriveRequestedOffboardingActions(
      { data_handling: 'forward_to_specific', forward_email_to: 'boss@x.com' },
      target
    )
    const fwd = actions.find((s) => s.key === 'setup_forwarding')
    expect(fwd).toBeDefined()
    expect(fwd!.automated).toBe(false)
    expect(fwd!.manualInstruction).toContain('boss@x.com')
    expect(fwd!.manualInstruction).not.toContain('Verify')
  })

  it('recognizes every delete-after-hold value across schema generations', () => {
    for (const value of ['delete_after_backup', 'delete_after_30', 'delete_after_30_days']) {
      const actions = deriveRequestedOffboardingActions({ data_handling: value }, target)
      const del = actions.find((s) => s.key === 'schedule_deletion')
      expect(del, `expected schedule_deletion for ${value}`).toBeDefined()
      expect(del!.deferred).toBe(true)
    }
  })

  it('maps device handling values from all schema generations', () => {
    for (const value of ['wipe_remote', 'remote_wipe', 'wipe']) {
      const actions = deriveRequestedOffboardingActions({ device_handling: value }, target)
      expect(actions.find((s) => s.key === 'wipe_devices')).toBeDefined()
    }
    for (const value of ['return_to_office', 'ship_to_office', 'return']) {
      const actions = deriveRequestedOffboardingActions({ device_handling: value }, target)
      expect(actions.find((s) => s.key === 'device_return')).toBeDefined()
    }
    // Keep/no-device requires no tracking entry
    const none = deriveRequestedOffboardingActions({ device_handling: 'keep_device' }, target)
    expect(none.find((s) => s.key === 'wipe_devices' || s.key === 'device_return')).toBeUndefined()
  })

  it('makes conversion an automated deferred action when Exchange automation is available', () => {
    const actions = deriveRequestedOffboardingActions(
      { data_handling: 'keep_accessible', shared_mailbox_access: ['Jking@x.com'] },
      target,
      { exchangeAutomationAvailable: true }
    )
    const convert = actions.find((s) => s.key === 'convert_shared_mailbox')
    expect(convert).toBeDefined()
    expect(convert!.automated).toBe(true)
    expect(convert!.deferred).toBe(true)
    expect(convert!.deferredDetail).toContain('Exchange Online automation')
    // License removal is deferred behind the conversion, never inline
    const licenses = actions.find((s) => s.key === 'remove_licenses')
    expect(licenses!.automated).toBe(true)
    expect(licenses!.deferred).toBe(true)
    expect(licenses!.manualInstruction).toContain('intentionally left assigned')
  })

  it('keeps conversion MANUAL with the reason when Exchange automation is unavailable', () => {
    const actions = deriveRequestedOffboardingActions(
      { data_handling: 'keep_accessible', shared_mailbox_access: ['Jking@x.com'] },
      target,
      { exchangeAutomationAvailable: false, exchangeUnavailableReason: 'tenant not enabled for Exchange automation — see the enablement runbook' }
    )
    const convert = actions.find((s) => s.key === 'convert_shared_mailbox')
    expect(convert!.automated).toBe(false)
    expect(convert!.manualInstruction).toContain('tenant not enabled for Exchange automation')
    // License stays assigned in the manual path too — instruction says remove AFTER converting
    expect(convert!.manualInstruction).toContain('still assigned')
    const licenses = actions.find((s) => s.key === 'remove_licenses')
    expect(licenses!.automated).toBe(false)
    expect(licenses!.manualInstruction).toContain('AFTER converting')
  })

  it('keeps inline license removal for non-keep_accessible offboardings', () => {
    for (const value of ['forward_to_manager', 'delete_after_30', 'no_action', undefined]) {
      const actions = deriveRequestedOffboardingActions(
        value ? { data_handling: value } : {},
        target,
        { exchangeAutomationAvailable: true }
      )
      const licenses = actions.find((s) => s.key === 'remove_licenses')
      expect(licenses!.automated).toBe(true)
      expect(licenses!.deferred).toBeUndefined()
    }
  })

  it('only includes revoke_sessions for immediate terminations (any schema key)', () => {
    expect(
      deriveRequestedOffboardingActions({ urgency_type: 'standard' }, target).map((s) => s.key)
    ).not.toContain('revoke_sessions')
    for (const answers of [
      { urgency_type: 'immediate_termination' },
      { account_action: 'immediate_termination' },
      { urgency: 'immediate_termination' },
    ]) {
      expect(deriveRequestedOffboardingActions(answers, target).map((s) => s.key)).toContain(
        'revoke_sessions'
      )
    }
  })
})

describe('reconcileOffboardingActions', () => {
  const target = 'MBeach@danbrownconstruction.com'

  it('gives every requested action exactly one status line', () => {
    const requested = deriveRequestedOffboardingActions(
      {
        urgency_type: 'immediate_termination',
        data_handling: 'keep_accessible',
        shared_mailbox_access: ['Jking@danbrownconstruction.com'],
        file_handling: 'archive_to_sharepoint',
        device_handling: 'return_to_office',
      },
      target
    )
    const result = reconcileOffboardingActions(
      requested,
      ['find_user', 'revoke_sessions', 'archive_onedrive', 'disable_account', 'remove_groups', 'remove_licenses'],
      []
    )
    expect(result.statusLines).toHaveLength(requested.length)
    // The mailbox conversion is visible as MANUAL — never silently omitted
    const mailboxLine = result.statusLines.find((l) => l.includes('Convert mailbox'))
    expect(mailboxLine).toBeDefined()
    expect(mailboxLine).toContain('[MANUAL]')
    expect(result.manualInstructions.some((m) => m.includes('Convert the mailbox'))).toBe(true)
    expect(result.unaccountedKeys).toEqual([])
  })

  it('marks failed steps as FAILED', () => {
    const requested = deriveRequestedOffboardingActions({ urgency_type: 'standard' }, target)
    const result = reconcileOffboardingActions(requested, ['find_user'], ['disable_account'])
    expect(result.statusLines.find((l) => l.includes('Disable account'))).toContain('[FAILED]')
  })

  it('flags an automated step that never ran as NOT RUN and forces a manual step', () => {
    const requested = deriveRequestedOffboardingActions(
      { file_handling: 'transfer_to_user', transfer_files_to: 'peer@x.com' },
      target
    )
    // transfer_onedrive neither completed nor failed (e.g. skipped by a gating bug)
    const result = reconcileOffboardingActions(
      requested,
      ['find_user', 'disable_account', 'remove_groups', 'remove_licenses'],
      []
    )
    const line = result.statusLines.find((l) => l.includes('Share OneDrive files'))
    expect(line).toContain('[NOT RUN]')
    expect(result.unaccountedKeys).toEqual(['transfer_onedrive'])
    expect(result.manualInstructions.some((m) => m.includes('Share OneDrive files'))).toBe(true)
  })

  it('reports deferred actions as QUEUED, not NOT RUN', () => {
    const requested = deriveRequestedOffboardingActions({ data_handling: 'delete_after_30' }, target)
    const result = reconcileOffboardingActions(
      requested,
      ['find_user', 'disable_account', 'remove_groups', 'remove_licenses'],
      []
    )
    expect(result.statusLines.find((l) => l.includes('deletion'))).toContain('[QUEUED]')
    expect(result.unaccountedKeys).toEqual([])
  })

  it('renders dispatched Exchange work as QUEUED with its detail text', () => {
    const requested = deriveRequestedOffboardingActions(
      { data_handling: 'keep_accessible', shared_mailbox_access: ['Jking@x.com'] },
      target,
      { exchangeAutomationAvailable: true }
    )
    const result = reconcileOffboardingActions(
      requested,
      ['find_user', 'disable_account', 'remove_groups'],
      [],
      ['convert_shared_mailbox', 'remove_licenses']
    )
    const convertLine = result.statusLines.find((l) => l.includes('Convert mailbox'))
    expect(convertLine).toContain('[QUEUED]')
    expect(convertLine).toContain('confirmation note will follow')
    const licenseLine = result.statusLines.find((l) => l.includes('licenses'))
    expect(licenseLine).toContain('[QUEUED]')
    expect(result.unaccountedKeys).toEqual([])
  })

  it('never claims QUEUED when the dispatch failed (deferred but not queued)', () => {
    const requested = deriveRequestedOffboardingActions(
      { data_handling: 'keep_accessible', shared_mailbox_access: ['Jking@x.com'] },
      target,
      { exchangeAutomationAvailable: true }
    )
    // Dispatch failed: conversion recorded as failed, nothing was queued
    const result = reconcileOffboardingActions(
      requested,
      ['find_user', 'disable_account', 'remove_groups'],
      ['convert_shared_mailbox'],
      []
    )
    const convertLine = result.statusLines.find((l) => l.includes('Convert mailbox'))
    expect(convertLine).toContain('[FAILED]')
    // remove_licenses was deferred behind the conversion — with no job queued it
    // must surface as NOT RUN + manual step, not silently pend forever
    const licenseLine = result.statusLines.find((l) => l.includes('licenses'))
    expect(licenseLine).toContain('[NOT RUN]')
    expect(result.unaccountedKeys).toContain('remove_licenses')
    expect(result.manualInstructions.some((m) => m.includes('intentionally left assigned'))).toBe(true)
  })

  it('keeps legacy deferred==queued behavior when queuedSteps is omitted', () => {
    const requested = deriveRequestedOffboardingActions({ data_handling: 'delete_after_30' }, target)
    const result = reconcileOffboardingActions(requested, ['find_user', 'disable_account', 'remove_groups', 'remove_licenses'], [])
    expect(result.statusLines.find((l) => l.includes('deletion'))).toContain('[QUEUED]')
  })

  it('emits only Windows-1252-safe ASCII markers (Autotask mangles ✓ / → to ?)', () => {
    const requested = deriveRequestedOffboardingActions(
      {
        urgency_type: 'immediate_termination',
        data_handling: 'keep_accessible',
        shared_mailbox_access: ['a@x.com'],
        device_handling: 'wipe_remote',
      },
      target
    )
    const result = reconcileOffboardingActions(requested, ['find_user'], ['disable_account'])
    for (const line of [...result.statusLines, ...result.manualInstructions]) {
      expect(line).not.toMatch(/[✓✗⊘→⚠]/)
    }
  })
})
