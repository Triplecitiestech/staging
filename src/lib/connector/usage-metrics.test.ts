// src/lib/connector/usage-metrics.test.ts
//
// The dashboard's first render on a fresh install has ZERO rows: no calls, no
// bytes, no actors. Every helper here has to survive that without producing
// "NaN%", "Infinity", "Invalid Date", or a divide-by-zero crash — the acceptance
// bar for the page, pinned as a test because a zero-row state is exactly what
// nobody exercises by hand.

import { describe, it, expect } from 'vitest'
import {
  ERROR_CLASS_LABELS,
  REFUSAL_KIND_LABELS,
  USAGE_WINDOWS,
  formatBytes,
  formatCount,
  formatDuration,
  formatShare,
  formatTimestamp,
  parseUsageWindow,
  share,
  usageWindowHours,
  usageWindowLabel,
} from './usage-metrics'

describe('time window parsing', () => {
  it('accepts the three offered windows', () => {
    expect(parseUsageWindow('24h')).toBe('24h')
    expect(parseUsageWindow('7d')).toBe('7d')
    expect(parseUsageWindow('30d')).toBe('30d')
  })

  it('falls back to 7d for anything else, including junk and SQL-ish input', () => {
    for (const input of [null, undefined, '', 'all', '90d', "1h' OR 1=1--"]) {
      expect(parseUsageWindow(input)).toBe('7d')
    }
  })

  it('maps every window to real hours and a label', () => {
    for (const w of USAGE_WINDOWS) {
      expect(usageWindowHours(w.key)).toBe(w.hours)
      expect(usageWindowHours(w.key)).toBeGreaterThan(0)
      expect(usageWindowLabel(w.key)).toBe(w.label)
    }
  })
})

describe('zero-row safety', () => {
  it('never renders NaN% when there is nothing to divide by', () => {
    expect(share(0, 0)).toBeNull()
    expect(formatShare(0, 0)).toBe('—')
    expect(formatShare(5, 0)).toBe('—')
    expect(formatShare(0, 0, 1)).toBe('—')
    // Non-finite inputs (a missing aggregate read as undefined) are the same case.
    expect(formatShare(Number.NaN, 10)).toBe('—')
    expect(formatShare(10, Number.NaN)).toBe('—')
  })

  it('computes a real share when there is a denominator', () => {
    expect(share(1, 4)).toBe(25)
    expect(formatShare(1, 4)).toBe('25%')
    expect(formatShare(1, 3, 1)).toBe('33.3%')
    expect(formatShare(7, 7)).toBe('100%')
  })

  it('formats zero and empty aggregates without NaN or Infinity', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(Number.NaN)).toBe('0')
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
    expect(formatTimestamp(null)).toBe('—')
    expect(formatTimestamp(undefined)).toBe('—')
    expect(formatTimestamp('not a date')).toBe('—')

    const rendered = [
      formatBytes(0),
      formatCount(0),
      formatDuration(0),
      formatShare(0, 0),
      formatTimestamp(null),
    ].join(' ')
    expect(rendered).not.toMatch(/NaN|Infinity|Invalid/)
  })

  it('labels bytes as bytes — never tokens, never dollars', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    for (const value of [0, 900, 2048, 5_242_880]) {
      expect(formatBytes(value)).not.toMatch(/\$|token/i)
    }
  })

  it('formats durations and counts that do exist', () => {
    expect(formatDuration(250)).toBe('250 ms')
    expect(formatDuration(2500)).toBe('2.5 s')
    expect(formatCount(1234)).toBe('1,234')
    expect(formatTimestamp('2026-07-28T12:00:00.000Z')).not.toBe('—')
  })
})

describe('label coverage', () => {
  it('labels every error class and refusal kind the capture layer can emit', () => {
    expect(Object.keys(ERROR_CLASS_LABELS).sort()).toEqual([
      'auth',
      'bad_input',
      'other',
      'rate_limit',
      'vendor_unavailable',
    ])
    expect(Object.keys(REFUSAL_KIND_LABELS).sort()).toEqual([
      'approval_required',
      'kill_switch',
      'not_configured',
    ])
  })
})
