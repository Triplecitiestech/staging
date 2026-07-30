// src/lib/autotask-activity.test.ts
//
// Locks the ticket-34648 defect (2026-07-30): a technician's completed 2.67-hour
// build existed only as time entry 13188, autotask_ticket_notes structurally
// could not see it, and the assistant told the owner there was no update showing
// the work finished. The ticket already carried the contradiction
// (lastActivityDate 14:48:47 vs newest returned note 12:08:22).
//
// The scenario is reproduced from the REAL values read off ticket 34648, as
// fixed data rather than a live call — live state moves on, and a regression
// test that depends on today's ticket state stops testing the defect tomorrow.

import { describe, it, expect } from 'vitest'
import {
  activityGapWarning,
  classifyPublishVisibility,
  computeActivityGap,
  decideNotificationVerdict,
  newestTimestamp,
  sortActivity,
  timeEntryVisibility,
  TICKET_NOTES_EXCLUSIONS,
  type ActivityItem,
} from './autotask-activity'

// ── The real ticket-34648 state at the moment of the defect ─────────────────
// Newest TicketNote returned by autotask_ticket_notes: id 29888071, 12:08:22.
// Ghenel Bacalla's time entry 13188: worked 12:05–14:45, record saved 14:48:47,
// which is also what the ticket reported as lastActivityDate.
const T34648_LAST_ACTIVITY = '2026-07-29T14:48:47.000Z'
const T34648_NEWEST_NOTE_AT = '2026-07-29T12:08:22.030Z'
const T34648_TIME_ENTRY_AT = '2026-07-29T14:48:47.000Z'

function note(id: number, at: string, publish: number): ActivityItem {
  return {
    source: 'ticket_note', sourceEntity: 'TicketNotes', id, at, atField: 'createDateTime',
    title: null, author: { type: 'resource', resourceId: 29682885, name: 'Kurtis Florance', email: 'kurtis@triplecitiestech.com', contactId: null, impersonatorResourceId: null },
    visibility: classifyPublishVisibility(publish, publish === 1 ? 'All Autotask Users' : 'Internal Project Team'),
    body: null, internalBody: null, work: null, parent: null, file: null, noteType: null,
  }
}

function ghenelTimeEntry(): ActivityItem {
  return {
    source: 'time_entry', sourceEntity: 'TimeEntries', id: 13188, at: T34648_TIME_ENTRY_AT, atField: 'createDateTime',
    title: null,
    author: { type: 'resource', resourceId: 29682935, name: 'Ghenel Bacalla', email: 'Ghenel@triplecitiestech.com', contactId: null, impersonatorResourceId: null },
    visibility: timeEntryVisibility(),
    body: 'Completed the provisioning of their replacement devices...', internalBody: 'saved PIN in ITGlue',
    work: { dateWorked: '2026-07-29T00:00:00.000Z', startDateTime: '2026-07-29T12:05:00.000Z', endDateTime: '2026-07-29T14:45:00.000Z', hoursWorked: 2.6667, hoursToBill: 2, billable: true },
    parent: null, file: null, noteType: null,
  }
}

describe('ticket 34648 replay — the false-absence defect', () => {
  it('autotask_ticket_notes-style read (notes only) reports activityGap true', () => {
    // What the notes read could see: notes up to 12:08:22, no time entries.
    const notesOnly = [note(29888069, '2026-07-29T11:58:00.593Z', 2), note(29888071, T34648_NEWEST_NOTE_AT, 2)]
    const gap = computeActivityGap({
      lastActivityDate: T34648_LAST_ACTIVITY,
      newestRetrievedActivityAt: newestTimestamp(notesOnly),
    })

    expect(gap.activityGap).toBe(true)
    expect(gap.reason).toBe('activity_newer_than_read')
    expect(gap.newestRetrievedActivityAt).toBe(T34648_NEWEST_NOTE_AT)
    // 12:08:22 -> 14:48:47 is 2h 40m 25s of unaccounted activity.
    expect(gap.gapSeconds).toBe(9625)
  })

  it('emits a warning that names autotask_ticket_activity as the tool to call', () => {
    const gap = computeActivityGap({ lastActivityDate: T34648_LAST_ACTIVITY, newestRetrievedActivityAt: T34648_NEWEST_NOTE_AT })
    const warning = activityGapWarning(34648, gap, { retrieved: 'ticket note' })

    expect(warning).toBeTruthy()
    expect(warning).toContain('UNRETRIEVED ACTIVITY')
    expect(warning).toContain('autotask_ticket_activity({ ticketId: 34648 })')
    expect(warning).toContain('2h 40m')
    // The warning must forbid the specific false claim that was made.
    expect(warning).toMatch(/before stating that work was not done/)
  })

  it('autotask_ticket_activity-style read surfaces Ghenel time entry 13188', () => {
    const timeline = sortActivity([
      note(29888069, '2026-07-29T11:58:00.593Z', 2),
      note(29888071, T34648_NEWEST_NOTE_AT, 2),
      ghenelTimeEntry(),
    ])

    const entry = timeline.find((i) => i.sourceEntity === 'TimeEntries' && i.id === 13188)
    expect(entry, 'time entry 13188 must appear in the merged timeline').toBeDefined()
    expect(entry!.author.name).toBe('Ghenel Bacalla')
    expect(entry!.author.email).toBe('Ghenel@triplecitiestech.com')
    expect(entry!.work?.hoursWorked).toBeCloseTo(2.6667, 4)

    // It is the NEWEST item, which is exactly why the notes-only read was stale.
    expect(timeline[timeline.length - 1].id).toBe(13188)

    // And the merged read now accounts for the ticket's last activity.
    const gap = computeActivityGap({ lastActivityDate: T34648_LAST_ACTIVITY, newestRetrievedActivityAt: newestTimestamp(timeline) })
    expect(gap.activityGap).toBe(false)
    expect(activityGapWarning(34648, gap, { retrieved: 'note, time entry or attachment', isActivityTool: true })).toBeNull()
  })

  it('the structural exclusion warning fires regardless of timestamps', () => {
    // The trap a pure timestamp check misses: on 34648 TODAY the newest note is
    // NEWER than both time entries, so the gap check alone says "no gap" while
    // the completed work is still invisible to a notes read. The unconditional
    // exclusion notice is the second signal that covers this.
    const gap = computeActivityGap({
      lastActivityDate: '2026-07-30T13:00:03.613Z',
      newestRetrievedActivityAt: '2026-07-30T13:00:03.613Z',
    })
    expect(gap.activityGap).toBe(false)
    expect(activityGapWarning(34648, gap, { retrieved: 'ticket note' })).toBeNull()

    expect(TICKET_NOTES_EXCLUSIONS.excludes.join(' ')).toContain('TimeEntries')
    expect(TICKET_NOTES_EXCLUSIONS.doNotUseFor).toMatch(/not be used|Do NOT use/i)
    expect(TICKET_NOTES_EXCLUSIONS.doNotUseFor).toContain('autotask_ticket_activity')
  })
})

describe('computeActivityGap', () => {
  it('is null — not false — when lastActivityDate is absent', () => {
    // An unmeasured check must never read as a clean bill of health.
    const gap = computeActivityGap({ lastActivityDate: null, newestRetrievedActivityAt: '2026-07-29T12:00:00Z' })
    expect(gap.activityGap).toBeNull()
    expect(gap.reason).toBe('no_last_activity_date')
    expect(activityGapWarning(1, gap, { retrieved: 'ticket note' })).toBeNull()
  })

  it('is true when the read returned nothing at all', () => {
    const gap = computeActivityGap({ lastActivityDate: '2026-07-29T12:00:00Z', newestRetrievedActivityAt: null })
    expect(gap.activityGap).toBe(true)
    expect(gap.reason).toBe('no_items_retrieved')
    expect(activityGapWarning(34648, gap, { retrieved: 'ticket note' })).toContain('returned no ticket note')
  })

  it('is false when the newest retrieved item matches or postdates lastActivityDate', () => {
    expect(computeActivityGap({ lastActivityDate: '2026-07-29T12:00:00Z', newestRetrievedActivityAt: '2026-07-29T12:00:00Z' }).activityGap).toBe(false)
    expect(computeActivityGap({ lastActivityDate: '2026-07-29T12:00:00Z', newestRetrievedActivityAt: '2026-07-29T12:05:00Z' }).activityGap).toBe(false)
  })

  it('applies NO tolerance window, so small real gaps still warn', () => {
    // Deliberate: a spurious "go check the timeline" costs one tool call; a
    // missed gap costs an employee a false accusation. gapSeconds is published
    // so a reader can tell 3s of workflow skew from unretrieved work.
    const gap = computeActivityGap({ lastActivityDate: '2026-07-30T13:00:03.613Z', newestRetrievedActivityAt: '2026-07-30T13:00:00.387Z' })
    expect(gap.activityGap).toBe(true)
    expect(gap.gapSeconds).toBe(3)
  })
})

describe('publish visibility', () => {
  it('reads "All Autotask Users" as CUSTOMER-VISIBLE', () => {
    // The counter-intuitive one: the label reads MSP-internal but per Kaseya's
    // note-form docs it is the Internal-cleared state, viewable by Client
    // Portal customers. Getting this backwards would mislabel every customer
    // note as internal.
    const v = classifyPublishVisibility(1, 'All Autotask Users')
    expect(v.scope).toBe('customer_visible')
    expect(v.basis).toContain('All Autotask Users')
  })

  it('reads any Internal* label as internal', () => {
    expect(classifyPublishVisibility(2, 'Internal Project Team').scope).toBe('internal')
    expect(classifyPublishVisibility(4, 'Internal & Co-Managed').scope).toBe('internal')
    expect(classifyPublishVisibility(2, 'Internal Users Only').scope).toBe('internal')
  })

  it('falls back to system ids when the live label is unavailable', () => {
    expect(classifyPublishVisibility(1, null).scope).toBe('customer_visible')
    expect(classifyPublishVisibility(2, null).scope).toBe('internal')
    expect(classifyPublishVisibility(4, null).scope).toBe('internal')
  })

  it('returns unknown — never a guess — for an unrecognised value', () => {
    const v = classifyPublishVisibility(99, 'Something New')
    expect(v.scope).toBe('unknown')
    expect(v.basis).toMatch(/not a publish value this connector can classify/)
    expect(classifyPublishVisibility(null, null).scope).toBe('unknown')
  })

  it('reports time-entry visibility as unknown because the API has no such field', () => {
    const v = timeEntryVisibility()
    expect(v.scope).toBe('unknown')
    expect(v.basis).toContain('NO publish/visibility field')
    // Must not claim a vendor capability that does not exist.
    expect(v.scope).not.toBe('internal')
    expect(v.scope).not.toBe('customer_visible')
  })
})

describe('decideNotificationVerdict — the customer-note claim', () => {
  it('is true only when the stamp actually advanced', () => {
    const v = decideNotificationVerdict({ baselineEstablished: true, before: '2026-07-28T20:43:00Z', after: '2026-07-30T13:00:04Z' })
    expect(v).toEqual({ customerNotified: true, reason: 'advanced' })
  })

  it('is true on a first-ever notification (baseline read OK, value genuinely null)', () => {
    expect(decideNotificationVerdict({ baselineEstablished: true, before: null, after: '2026-07-30T13:00:04Z' }))
      .toEqual({ customerNotified: true, reason: 'advanced' })
  })

  it('NEVER claims a notification when the baseline read failed', () => {
    // The trap: a ticket notified last week + a failed pre-write read would look
    // freshly notified, reporting a customer as contacted when nothing was sent.
    const v = decideNotificationVerdict({ baselineEstablished: false, before: null, after: '2026-07-23T11:17:03Z' })
    expect(v).toEqual({ customerNotified: false, reason: 'no_baseline' })
  })

  it('is false when the stamp did not move — the ticket-34648 case', () => {
    // Both API-posted customer notes left this stamp untouched.
    const v = decideNotificationVerdict({ baselineEstablished: true, before: '2026-07-20T10:00:00Z', after: '2026-07-20T10:00:00Z' })
    expect(v).toEqual({ customerNotified: false, reason: 'unchanged' })
  })

  it('is false when the ticket has never had a customer notification', () => {
    expect(decideNotificationVerdict({ baselineEstablished: true, before: null, after: null }))
      .toEqual({ customerNotified: false, reason: 'never_notified' })
  })

  it('never returns true on an unparseable after-value', () => {
    expect(decideNotificationVerdict({ baselineEstablished: true, before: null, after: 'not-a-date' }).customerNotified).toBe(false)
  })
})

describe('sortActivity', () => {
  it('orders ascending and puts unparseable timestamps last', () => {
    const items = [
      note(3, '2026-07-29T14:00:00Z', 1),
      note(1, '2026-07-29T10:00:00Z', 1),
      note(9, '', 1),
      note(2, '2026-07-29T12:00:00Z', 1),
    ]
    expect(sortActivity(items).map((i) => i.id)).toEqual([1, 2, 3, 9])
  })

  it('returns null from newestTimestamp when nothing is parseable', () => {
    expect(newestTimestamp([{ at: '' }, { at: 'nonsense' }])).toBeNull()
    expect(newestTimestamp([])).toBeNull()
  })
})
