// src/lib/scan-filing/graph.test.ts
//
// The gates in front of the scan surface. Both must fail CLOSED and both must
// say which environment variable is missing — an unconfigured connector that
// throws a bare Graph error routes nobody anywhere.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  assertScanReady,
  isScanFilerConfigured,
  scanToolsEnabled,
  MAX_SCAN_BYTES,
  SIMPLE_UPLOAD_MAX_BYTES,
} from './graph'

const KEYS = [
  'CONNECTOR_SCAN_WRITES_ENABLED',
  'SCAN_FILER_TENANT_ID',
  'SCAN_FILER_CLIENT_ID',
  'SCAN_FILER_CLIENT_SECRET',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function credentials() {
  process.env.SCAN_FILER_TENANT_ID = 't'
  process.env.SCAN_FILER_CLIENT_ID = 'c'
  process.env.SCAN_FILER_CLIENT_SECRET = 's'
}

describe('scanToolsEnabled', () => {
  it('is off unless the switch is exactly "true"', () => {
    expect(scanToolsEnabled()).toBe(false)
    for (const v of ['1', 'yes', 'TRUE', 'true ', '']) {
      process.env.CONNECTOR_SCAN_WRITES_ENABLED = v
      expect(scanToolsEnabled()).toBe(false)
    }
    process.env.CONNECTOR_SCAN_WRITES_ENABLED = 'true'
    expect(scanToolsEnabled()).toBe(true)
  })
})

describe('isScanFilerConfigured', () => {
  it('needs all three credentials, not some of them', () => {
    expect(isScanFilerConfigured()).toBe(false)
    process.env.SCAN_FILER_TENANT_ID = 't'
    process.env.SCAN_FILER_CLIENT_ID = 'c'
    expect(isScanFilerConfigured()).toBe(false)
    process.env.SCAN_FILER_CLIENT_SECRET = 's'
    expect(isScanFilerConfigured()).toBe(true)
  })
})

describe('assertScanReady', () => {
  it('refuses with POLICY_BLOCKED and names the kill switch when it is off', () => {
    credentials()
    expect(() => assertScanReady()).toThrowError(
      expect.objectContaining({
        failure: expect.objectContaining({
          reasonCode: 'POLICY_BLOCKED',
          remediation: expect.stringContaining('CONNECTOR_SCAN_WRITES_ENABLED'),
        }),
      })
    )
  })

  it('refuses and names the missing credentials when the switch is on but the app is not configured', () => {
    process.env.CONNECTOR_SCAN_WRITES_ENABLED = 'true'
    expect(() => assertScanReady()).toThrowError(
      expect.objectContaining({
        failure: expect.objectContaining({
          reasonCode: 'POLICY_BLOCKED',
          remediation: expect.stringContaining('SCAN_FILER_CLIENT_SECRET'),
        }),
      })
    )
  })

  it('never puts the secret itself in the remediation, only the variable name', () => {
    process.env.CONNECTOR_SCAN_WRITES_ENABLED = 'true'
    process.env.SCAN_FILER_TENANT_ID = 't'
    process.env.SCAN_FILER_CLIENT_ID = 'c'
    let message = ''
    try {
      assertScanReady()
    } catch (e) {
      message = JSON.stringify((e as { failure?: unknown }).failure ?? e)
    }
    expect(message).toContain('SCAN_FILER_CLIENT_SECRET')
    expect(message).toContain('never passes through a conversation')
  })

  it('passes once both gates are satisfied', () => {
    process.env.CONNECTOR_SCAN_WRITES_ENABLED = 'true'
    credentials()
    expect(() => assertScanReady()).not.toThrow()
  })
})

describe('upload thresholds', () => {
  it('keeps the simple-upload limit at the documented Graph boundary', () => {
    expect(SIMPLE_UPLOAD_MAX_BYTES).toBe(4 * 1024 * 1024)
  })

  it('caps a scan well below anything that would need chunked resume logic', () => {
    expect(MAX_SCAN_BYTES).toBeGreaterThan(SIMPLE_UPLOAD_MAX_BYTES)
    expect(MAX_SCAN_BYTES).toBe(60 * 1024 * 1024)
  })
})
