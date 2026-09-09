// src/lib/ringcentral.test.ts
//
// Locks the two rules that carry real consequence in this module:
//
//  1. TRANSCRIPT COVERAGE. RingCentral stops transcribing the moment a call
//     becomes a three-way conference and returns the partial transcript with no
//     indication it is partial. On 2026-09-09 that truncated a call which began
//     at 10:41 AM ET at 10:46 AM, losing the whole vendor conversation that
//     held the outcome. The case below replays exactly those timings.
//     `coverageComplete` must never come back `true` for that call, and must
//     never come back `true` when it could not be measured.
//
//  2. DATE BOUNDARIES. Three different date formats were tried against the
//     labs server and all three failed. "2026-09-09" means that whole day in
//     Eastern Time, and the ET offset is resolved for the actual date rather
//     than hardcoded, so it holds in both EDT and EST.

import { describe, expect, it } from 'vitest'
import {
  assessCoverage,
  easternOffsetHours,
  normaliseCall,
  parseInsights,
  recordingIdOf,
  toIsoBoundary,
  type TranscriptSegment,
} from './ringcentral'

const seg = (startOffsetSeconds: number, endOffsetSeconds: number, text = 'hello', speaker = 'Speaker 1'): TranscriptSegment => ({
  speaker,
  text,
  startOffsetSeconds,
  endOffsetSeconds,
})

describe('assessCoverage — the three-way truncation guard', () => {
  it('reports coverageComplete false for the real 2026-09-09 truncation', () => {
    // Call started 10:41 AM ET and ran 20 minutes; the transcript stopped at
    // 10:46, i.e. 300 seconds in of a 1200-second call.
    const callStartUtc = '2026-09-09T14:41:00.000Z' // 10:41 EDT
    const verdict = assessCoverage([seg(0, 120), seg(120, 300)], 1200, callStartUtc)

    expect(verdict.coverageComplete).toBe(false)
    expect(verdict.coverageEndOffsetSeconds).toBe(300)
    // Ends around 10:46 AM ET — the exact symptom the user saw.
    expect(verdict.coverageEndsAt).toContain('10:46')
    expect(verdict.coverageFraction).toBeCloseTo(0.25, 5)
    expect(verdict.likelyCause).toMatch(/three-way conference/i)
    expect(verdict.coverageReason).toMatch(/DO NOT PRESENT THIS AS THE WHOLE CONVERSATION/)
  })

  it('accepts a transcript that reaches the end within the trailing-silence tolerance', () => {
    // 596s of a 600s call — 4s of goodbye is not a truncation.
    const verdict = assessCoverage([seg(0, 596)], 600, '2026-09-09T14:41:00.000Z')
    expect(verdict.coverageComplete).toBe(true)
    expect(verdict.likelyCause).toBeNull()
  })

  it('uses the LARGER of 15s and 5% of the call as the tolerance', () => {
    // Short call: 5% of 60s is 3s, so the floor of 15s applies and 50s of a
    // 60s call passes.
    expect(assessCoverage([seg(0, 50)], 60, null).coverageComplete).toBe(true)
    // Long call: 5% of 3600s is 180s, well above the 15s floor, so 3500s passes
    // while 3000s does not.
    expect(assessCoverage([seg(0, 3500)], 3600, null).coverageComplete).toBe(true)
    expect(assessCoverage([seg(0, 3000)], 3600, null).coverageComplete).toBe(false)
  })

  // The three not-measured cases. Each must be null, and null must never read
  // as a pass — that is the whole point of the field being tri-state.
  it('returns null, not true, when there are no segments', () => {
    const v = assessCoverage([], 600, '2026-09-09T14:41:00.000Z')
    expect(v.coverageComplete).toBeNull()
    expect(v.coverageReason).toMatch(/NOT MEASURED/)
    expect(v.coverageReason).not.toMatch(/covers the call/)
  })

  it('returns null when segments carry no usable timestamps', () => {
    const v = assessCoverage(
      [{ speaker: 'A', text: 'something was said', startOffsetSeconds: null, endOffsetSeconds: null }],
      600,
      '2026-09-09T14:41:00.000Z',
    )
    expect(v.coverageComplete).toBeNull()
    expect(v.coverageReason).toMatch(/NOT MEASURED/)
  })

  it('returns null when the call duration is unknown', () => {
    for (const duration of [null, 0]) {
      const v = assessCoverage([seg(0, 300)], duration, '2026-09-09T14:41:00.000Z')
      expect(v.coverageComplete).toBeNull()
      expect(v.coverageReason).toMatch(/NOT MEASURED/)
    }
  })

  it('never returns true for any input that lacks both segments and a duration', () => {
    // A sweep, because "defaults to true" is the failure mode being excluded
    // and a single case cannot exclude it.
    const durations: Array<number | null> = [null, 0, -1]
    for (const d of durations) {
      expect(assessCoverage([], d, null).coverageComplete).not.toBe(true)
    }
  })

  it('falls back to startOffset when a segment has no end offset', () => {
    const v = assessCoverage([{ speaker: 'A', text: 'x', startOffsetSeconds: 300, endOffsetSeconds: null }], 1200, null)
    expect(v.coverageEndOffsetSeconds).toBe(300)
    expect(v.coverageComplete).toBe(false)
  })
})

describe('toIsoBoundary / easternOffsetHours', () => {
  it('reads a bare date as the whole day in Eastern, not UTC midnight', () => {
    const start = toIsoBoundary('2026-09-09', 'start')
    const end = toIsoBoundary('2026-09-09', 'end')
    // September is EDT (UTC-4).
    expect(start).toBe('2026-09-09T00:00:00.000-04:00')
    expect(end).toBe('2026-09-09T23:59:59.999-04:00')
    // A 10:41 ET call must fall inside the window.
    expect(new Date('2026-09-09T14:41:00Z').getTime()).toBeGreaterThan(new Date(start).getTime())
    expect(new Date('2026-09-09T14:41:00Z').getTime()).toBeLessThan(new Date(end).getTime())
  })

  it('resolves the offset for the actual date rather than hardcoding it', () => {
    expect(easternOffsetHours('2026-09-09T12:00:00Z')).toBe(-4) // EDT
    expect(easternOffsetHours('2026-01-15T12:00:00Z')).toBe(-5) // EST
    // The winter date must therefore produce -05:00, which a hardcoded -4 could not.
    expect(toIsoBoundary('2026-01-15', 'start')).toBe('2026-01-15T00:00:00.000-05:00')
  })

  it('passes a full ISO instant straight through', () => {
    expect(toIsoBoundary('2026-09-09T14:41:00Z', 'start')).toBe('2026-09-09T14:41:00.000Z')
  })
})

describe('normaliseCall', () => {
  it('picks the counterparty from the correct side per direction', () => {
    const outbound = normaliseCall({
      id: '1',
      direction: 'Outbound',
      startTime: '2026-09-09T14:41:00.000Z',
      duration: 1200,
      from: { phoneNumber: '+16073417500', extensionNumber: '101' },
      to: { phoneNumber: '+16072221339', name: 'Vendor Support' },
    })
    expect(outbound.counterpartyNumber).toBe('+16072221339')
    expect(outbound.counterpartyName).toBe('Vendor Support')
    expect(outbound.tctExtension).toBe('101')

    const inbound = normaliseCall({
      id: '2',
      direction: 'Inbound',
      from: { phoneNumber: '+16072221339', name: 'Vendor Support' },
      to: { phoneNumber: '+16073417500', extensionNumber: '101' },
    })
    expect(inbound.counterpartyNumber).toBe('+16072221339')
    expect(inbound.tctExtension).toBe('101')
  })

  it('renders the start time in Eastern as well as UTC', () => {
    const c = normaliseCall({ id: '1', startTime: '2026-09-09T14:41:00.000Z', duration: 60 })
    expect(c.startTimeUtc).toBe('2026-09-09T14:41:00.000Z')
    expect(c.startTimeEastern).toContain('10:41')
  })

  it('derives duration from durationMs when duration is absent', () => {
    expect(normaliseCall({ id: '1', durationMs: 194060 }).durationSeconds).toBe(194)
  })

  it('finds a recording id on a leg when the record itself carries none', () => {
    const rec = { id: '1', legs: [{ legType: 'Accept' }, { recording: { id: '1662272004' } }] }
    expect(recordingIdOf(rec)).toBe('1662272004')
    expect(normaliseCall(rec).transcriptAvailable).toBe(true)
  })

  it('reports no transcript available when there is no recording anywhere', () => {
    const c = normaliseCall({ id: '1', legs: [{ legType: 'Accept' }] })
    expect(c.recordingId).toBeNull()
    expect(c.hasRecording).toBe(false)
    expect(c.transcriptAvailable).toBe(false)
  })
})

describe('parseInsights', () => {
  it('reads segments across the plausible field spellings', () => {
    const a = parseInsights({ transcript: { segments: [{ speaker: 'S1', text: 'hi', start: 0, end: 5 }] } })
    expect(a.segments).toEqual([{ speaker: 'S1', text: 'hi', startOffsetSeconds: 0, endOffsetSeconds: 5 }])

    const b = parseInsights({ transcription: { utterances: [{ speakerName: 'Kurtis', content: 'ok', startMs: 1000, endMs: 4500 }] } })
    expect(b.segments[0]).toEqual({ speaker: 'Kurtis', text: 'ok', startOffsetSeconds: 1, endOffsetSeconds: 4.5 })
  })

  it('reports parsed:false with the payload keys when nothing matched', () => {
    const r = parseInsights({ somethingEntirelyNew: { rows: [] }, meta: 1 })
    expect(r.parsed).toBe(false)
    expect(r.segments).toEqual([])
    expect(r.payloadKeys).toEqual(['somethingEntirelyNew', 'meta'])
  })

  it('an unreadable payload must not be indistinguishable from a silent call', () => {
    // Both produce zero segments, so `parsed` is the ONLY thing that separates
    // "we could not read it" from "nothing was said". Coverage must be null in
    // both cases, never true.
    const unreadable = parseInsights({ mystery: true })
    expect(unreadable.parsed).toBe(false)
    expect(assessCoverage(unreadable.segments, 600, null).coverageComplete).toBeNull()
  })

  it('reads summary paragraphs from string, array and object shapes', () => {
    expect(parseInsights({ summary: 'one paragraph' }).summaryParagraphs).toEqual(['one paragraph'])
    expect(parseInsights({ summary: [{ text: 'a' }, { text: 'b' }] }).summaryParagraphs).toEqual(['a', 'b'])
    expect(parseInsights({ summary: { paragraphs: ['x'] } }).summaryParagraphs).toEqual(['x'])
  })

  it('drops empty-text segments rather than counting them as speech', () => {
    const r = parseInsights({ transcript: { segments: [{ text: '   ', start: 0 }, { text: 'real', start: 1, end: 2 }] } })
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].text).toBe('real')
  })
})
