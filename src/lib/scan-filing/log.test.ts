// src/lib/scan-filing/log.test.ts
//
// The scan log inherits the row planner that fixed the 2026-07-30 ER width
// outage. These tests pin that inheritance for THIS sheet: the live header row
// decides the width and order, a column Kurtis adds does not break the append,
// and a column the tool has content for but the sheet lacks is a hard failure
// rather than a silently dropped value.

import { describe, it, expect } from 'vitest'
import { planWorkbookRow } from '@/lib/graph-workbook'
import {
  formatReceived,
  formatScanId,
  nextScanIdNumber,
  suppliedScanValues,
  SCAN_FIELDS,
  SCAN_LOG_HEADER_ROW,
  type ScanLogAppendInput,
} from './log'

const INPUT: ScanLogAppendInput = {
  originalFilename: '20260907_090410_Raven_Scan.pdf',
  identifiedAs: 'Form 1099-NEC 2025, Wells Family',
  sourceEmail: 'https://outlook.office.com/mail/deeplink/read/abc',
  renamedTo: 'Form 1099-NEC 2025 Wells Family $7815.15 Compensation.pdf',
  filedTo: 'https://triplecitiestechcom.sharepoint.com/sites/accounting/Shared%20Documents/x.pdf',
  rioNotified: 'Yes',
  confidence: 'High',
}

function plan(columns: readonly string[], input: ScanLogAppendInput = INPUT) {
  const supplied = suppliedScanValues(input, { scanId: 'SCAN-0007', received: '2026-09-07 09:04 EDT' })
  return planWorkbookRow(columns, supplied, { fields: SCAN_FIELDS, idColumn: 'Scan ID' })
}

describe('Scan IDs', () => {
  it('formats to SCAN-NNNN', () => {
    expect(formatScanId(1)).toBe('SCAN-0001')
    expect(formatScanId(742)).toBe('SCAN-0742')
    expect(formatScanId(0)).toBe('SCAN-0001')
  })

  it('takes the next id from the highest in the column, not the row count', () => {
    // A deleted row, or rows added out of order, must not re-issue an id.
    expect(nextScanIdNumber(['SCAN-0001', 'SCAN-0004', 'SCAN-0002'])).toBe(5)
  })

  it('starts at 1 on an empty sheet', () => {
    expect(nextScanIdNumber([])).toBe(1)
  })

  it('ignores anything that is not a SCAN id, including an ER id', () => {
    expect(nextScanIdNumber(['ER-0009', '', null, undefined, 'notes', 'SCAN-0002'])).toBe(3)
  })
})

describe('formatReceived', () => {
  it('renders a UTC ISO timestamp in Eastern with the zone shown', () => {
    // 13:04 UTC on 2026-09-07 is 09:04 EDT.
    expect(formatReceived('2026-09-07T13:04:10Z')).toBe('2026-09-07 09:04 EDT')
  })

  it('crosses the date boundary correctly rather than showing the UTC day', () => {
    // 02:30 UTC is the previous evening in Eastern.
    expect(formatReceived('2026-09-08T02:30:00Z')).toBe('2026-09-07 22:30 EDT')
  })

  it('leaves a bare date alone instead of inventing a midnight', () => {
    expect(formatReceived('2026-09-07')).toBe('2026-09-07')
  })

  it('says the time was not reported rather than fabricating one', () => {
    expect(formatReceived(undefined, new Date('2026-09-07T13:00:00Z'))).toContain(
      'received time not reported'
    )
  })

  it('returns unparseable input as-is rather than losing it', () => {
    expect(formatReceived('sometime tuesday')).toBe('sometime tuesday')
  })
})

describe('row planning against the LIVE header row', () => {
  it('builds a row exactly as wide as the sheet, in the sheet\'s order', () => {
    const columns = [...SCAN_LOG_HEADER_ROW]
    const p = plan(columns)
    expect(p.problems).toEqual([])
    expect(p.values).toHaveLength(columns.length)
    expect(p.byColumn['Scan ID']).toBe('SCAN-0007')
    expect(p.byColumn['Identified as']).toBe(INPUT.identifiedAs)
  })

  it('follows the SHEET order, not the order of SCAN_FIELDS', () => {
    const columns = ['Confidence', 'Scan ID', 'Identified as', 'Received']
    const p = plan(columns)
    expect(p.values).toEqual(['High', 'SCAN-0007', INPUT.identifiedAs, '2026-09-07 09:04 EDT'])
    expect(p.idColumnIndex).toBe(1)
  })

  it('pads a column Kurtis added — this is the whole point of the live header row', () => {
    const columns = [...SCAN_LOG_HEADER_ROW, 'Reviewed By']
    const p = plan(columns)
    expect(p.problems).toEqual([])
    expect(p.values).toHaveLength(columns.length)
    expect(p.values[p.values.length - 1]).toBe('')
    expect(p.unmappedColumns).toContain('Reviewed By')
  })

  it('matches headers case-, spacing- and punctuation-insensitively', () => {
    const p = plan(['scan id', 'received', 'ORIGINAL FILENAME', 'Identified As', 'source email'])
    expect(p.problems).toEqual([])
    expect(p.values[0]).toBe('SCAN-0007')
    expect(p.values[2]).toBe(INPUT.originalFilename)
  })

  it('accepts the alias spellings a human is likely to type', () => {
    const p = plan(['ID', 'Received At', 'Original file name', 'Document Type', 'Email link'])
    expect(p.problems).toEqual([])
    expect(p.values[3]).toBe(INPUT.identifiedAs)
    expect(p.values[4]).toBe(INPUT.sourceEmail)
  })

  it('REFUSES when the sheet lost a column that carries content', () => {
    const columns = SCAN_LOG_HEADER_ROW.filter((c) => c !== 'Identified as')
    const p = plan(columns)
    expect(p.problems).toContainEqual({ kind: 'missing_target_column', column: 'Identified as' })
  })

  it('does not refuse for a missing column whose value is empty — a blank loses nothing', () => {
    const columns = SCAN_LOG_HEADER_ROW.filter((c) => c !== 'Notes')
    const p = plan(columns)
    expect(p.problems).toEqual([])
  })

  it('locates the Scan ID column wherever it is, for read-back verification', () => {
    const columns = ['Received', 'Original filename', 'Scan ID', 'Identified as', 'Source email']
    expect(plan(columns).idColumnIndex).toBe(2)
  })

  it('reports a duplicated header instead of writing the value twice', () => {
    const p = plan(['Scan ID', 'Received', 'Received', 'Original filename', 'Identified as', 'Source email'])
    expect(p.values[1]).toBe('2026-09-07 09:04 EDT')
    expect(p.values[2]).toBe('')
    expect(p.warnings.join(' ')).toContain('more than one column matching')
  })

  it('flags an empty sheet rather than appending into nothing', () => {
    expect(plan([]).problems).toContainEqual({ kind: 'no_columns' })
  })
})

describe('value normalisation', () => {
  it('strips emoji and control characters so the log stays CSV-safe', () => {
    const supplied = suppliedScanValues(
      { ...INPUT, identifiedAs: 'Invoice \u{1F600} 2026' },
      { scanId: 'SCAN-0001', received: '2026-09-07' }
    )
    expect(supplied['Identified as']).toBe('Invoice 2026')
  })

  it('never lets the caller set the Scan ID or the Received value', () => {
    // Neither has an `input` binding, so no parameter can reach them.
    const idSpec = SCAN_FIELDS.find((f) => f.column === 'Scan ID')
    const receivedSpec = SCAN_FIELDS.find((f) => f.column === 'Received')
    expect(idSpec?.input).toBeUndefined()
    expect(idSpec?.kind).toBe('computed')
    expect(receivedSpec?.input).toBe('received')

    const supplied = suppliedScanValues(INPUT, { scanId: 'SCAN-0042', received: 'X' })
    expect(supplied['Scan ID']).toBe('SCAN-0042')
    expect(supplied['Received']).toBe('X')
  })

  it('keeps the columns the build spec named', () => {
    for (const column of [
      'Scan ID',
      'Received',
      'Original filename',
      'Identified as',
      'Renamed to',
      'Filed to',
      'Source email',
      'Rio notified',
      'Confidence',
    ]) {
      expect(SCAN_LOG_HEADER_ROW).toContain(column)
    }
  })
})
