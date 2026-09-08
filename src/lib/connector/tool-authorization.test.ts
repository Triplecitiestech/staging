// src/lib/connector/tool-authorization.test.ts
//
// Per-surface caller authorization. The properties that matter:
//
//   1. It is DERIVED, not listed — a scan_* tool nobody has written yet is
//      already restricted, and the authorised caller follows SCAN_MAILBOX.
//   2. It FAILS CLOSED on every unhappy path. A misconfiguration must never
//      read as permission.
//   3. It BLOCKS EXECUTION, not just reporting — pinned in
//      capability-registry.test.ts against the real wrapper.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  authorizeToolCall,
  normalizeCaller,
  restrictedToolNames,
  restrictionFor,
  SURFACE_RESTRICTIONS,
} from './tool-authorization'

const OWNER = 'kurtis@triplecitiestech.com'
let savedMailbox: string | undefined

beforeEach(() => {
  savedMailbox = process.env.SCAN_MAILBOX
})
afterEach(() => {
  if (savedMailbox === undefined) delete process.env.SCAN_MAILBOX
  else process.env.SCAN_MAILBOX = savedMailbox
})

function reason(v: ReturnType<typeof authorizeToolCall>): string {
  return v.allowed ? '' : v.failure.reasonCode
}

describe('which tools are restricted is derived from the prefix', () => {
  it('covers every scan tool, including ones not written yet', () => {
    for (const name of [
      'scan_probe_render',
      'scan_render_attachment',
      'scan_list_attachments',
      'scan_file_attachment',
      'scan_log_append',
      'scan_log_columns',
      // The point of prefix derivation: this does not exist and is still covered.
      'scan_some_tool_added_next_year',
    ]) {
      expect(restrictionFor(name), name).toBeDefined()
    }
  })

  it('does not restrict any other surface', () => {
    for (const name of [
      'autotask_get_ticket',
      'itglue_search_documents',
      'datto_rmm_alerts',
      'unifi_list_sites',
      'hr_er_log_append',
      'kqm_quotes',
      'sales_pricing_quote',
      'tct_connector_capabilities',
      // Near-misses that must NOT match the scan_ prefix.
      'scanner_tool',
      'autotask_scan_something',
    ]) {
      expect(restrictionFor(name), name).toBeUndefined()
    }
  })

  it('restrictedToolNames picks exactly the restricted ones out of a mixed list', () => {
    expect(
      restrictedToolNames(['autotask_get_ticket', 'scan_log_append', 'hr_er_log_append', 'scan_x'])
    ).toEqual(['scan_log_append', 'scan_x'])
  })

  it('holds no list of individual tool names — that is the part that rots', () => {
    const serialized = JSON.stringify(SURFACE_RESTRICTIONS.map((r) => r.prefix))
    expect(serialized).not.toContain('scan_log_append')
    expect(serialized).not.toContain('scan_render_attachment')
    expect(SURFACE_RESTRICTIONS.every((r) => r.prefix.endsWith('_'))).toBe(true)
  })
})

describe('who is authorised is derived from SCAN_MAILBOX', () => {
  it('allows the mailbox owner', () => {
    process.env.SCAN_MAILBOX = OWNER
    expect(authorizeToolCall('scan_render_attachment', OWNER)).toEqual({
      allowed: true,
      restricted: true,
    })
  })

  it('is case- and whitespace-insensitive about the identity', () => {
    process.env.SCAN_MAILBOX = OWNER
    expect(authorizeToolCall('scan_render_attachment', '  KURTIS@TripleCitiesTech.COM ').allowed).toBe(
      true
    )
  })

  it('DENIES another employee holding a perfectly valid token', () => {
    process.env.SCAN_MAILBOX = OWNER
    const v = authorizeToolCall('scan_render_attachment', 'alex@triplecitiestech.com')
    expect(v.allowed).toBe(false)
    expect(reason(v)).toBe('PERMISSION_DENIED')
    if (!v.allowed) {
      // The refusal must say it is an authorisation decision, not a bad token —
      // otherwise the reader goes and re-authenticates forever.
      expect(v.failure.evidence).toContain('Token verification')
      expect(v.failure.remediation).toContain('Do not retry')
    }
  })

  it('follows a re-scoped mailbox rather than a hardcoded address', () => {
    // This is the whole reason the allowed caller is derived: move the mailbox
    // and the authorised caller moves with it, in one place.
    process.env.SCAN_MAILBOX = 'someone.else@triplecitiestech.com'
    expect(authorizeToolCall('scan_log_columns', 'someone.else@triplecitiestech.com').allowed).toBe(true)
    expect(authorizeToolCall('scan_log_columns', OWNER).allowed).toBe(false)
  })
})

describe('fail-closed', () => {
  it('denies a token carrying no identity', () => {
    process.env.SCAN_MAILBOX = OWNER
    for (const identity of [undefined, null, '', '   ', 42, {}]) {
      const v = authorizeToolCall('scan_file_attachment', identity)
      expect(v.allowed, String(identity)).toBe(false)
      expect(reason(v)).toBe('PERMISSION_DENIED')
    }
  })

  it('denies EVERYONE when the authorised list cannot be resolved', () => {
    process.env.SCAN_MAILBOX = '   '
    const v = authorizeToolCall('scan_file_attachment', OWNER)
    expect(v.allowed).toBe(false)
    expect(reason(v)).toBe('POLICY_BLOCKED')
    if (!v.allowed) expect(v.failure.remediation).toContain('SCAN_MAILBOX')
  })

  it('allows an unrestricted tool regardless of identity', () => {
    expect(authorizeToolCall('autotask_get_ticket', undefined)).toEqual({
      allowed: true,
      restricted: false,
    })
  })
})

describe('normalizeCaller', () => {
  it('lowercases and trims, and treats non-strings as no identity', () => {
    expect(normalizeCaller(' A@B.com ')).toBe('a@b.com')
    expect(normalizeCaller(undefined)).toBe('')
    expect(normalizeCaller(123)).toBe('')
  })
})
