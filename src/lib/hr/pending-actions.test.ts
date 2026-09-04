import { describe, it, expect } from 'vitest'
import {
  classifyRequest,
  buildPendingActionsReport,
  effectiveDateOf,
  subjectOf,
  daysBetween,
  KNOWN_STATUSES,
  type HrRequestRow,
} from './pending-actions'

const TODAY = '2026-09-04'

function row(over: Partial<HrRequestRow> = {}): HrRequestRow {
  return {
    id: 'req-1',
    type: 'onboarding',
    status: 'completed',
    company_slug: 'acme',
    target_upn: 'user@acme.com',
    target_user_id: 'obj-1',
    scheduled_deletion_date: null,
    autotask_ticket_id: 999,
    autotask_ticket_number: 'T20260101.0001',
    submitted_by_email: 'manager@acme.com',
    submitted_by_name: 'A Manager',
    impersonated_by_email: null,
    error_message: null,
    answers: {},
    started_at: '2026-09-01T10:00:00.000Z',
    completed_at: '2026-09-01T10:05:00.000Z',
    created_at: '2026-09-01T09:59:00.000Z',
    updated_at: '2026-09-01T10:05:00.000Z',
    ...over,
  }
}

describe('healthy rows produce no finding', () => {
  it('drops a completed request with no armed deletion', () => {
    expect(classifyRequest(row(), TODAY)).toBeNull()
  })

  it('drops a failed request with no armed deletion', () => {
    expect(classifyRequest(row({ status: 'failed' }), TODAY)).toBeNull()
  })

  it('still counts dropped rows as examined, so "nothing to show" differs from "nothing read"', () => {
    const report = buildPendingActionsReport([row(), row({ id: 'r2', status: 'failed' })], TODAY)
    expect(report.actions).toHaveLength(0)
    expect(report.summary.examined).toBe(2)
  })
})

describe('pending deletion — the irreversible one', () => {
  it('is reported even though the request itself is completed', () => {
    const a = classifyRequest(
      row({ status: 'completed', scheduled_deletion_date: '2026-09-20' }),
      TODAY
    )
    expect(a?.kind).toBe('pending_deletion')
  })

  it('is critical inside 7 days and warning beyond', () => {
    const near = classifyRequest(row({ scheduled_deletion_date: '2026-09-10' }), TODAY)
    const far = classifyRequest(row({ scheduled_deletion_date: '2026-10-30' }), TODAY)
    expect(near?.severity).toBe('critical')
    expect(far?.severity).toBe('warning')
  })

  it('flags a date that has passed without clearing', () => {
    const a = classifyRequest(row({ scheduled_deletion_date: '2026-08-01' }), TODAY)
    expect(a?.severity).toBe('critical')
    expect(a?.finding).toContain('has not cleared')
  })

  it('outranks a wedged status on the same row', () => {
    const a = classifyRequest(
      row({ status: 'running', scheduled_deletion_date: '2026-09-20' }),
      TODAY
    )
    expect(a?.kind).toBe('pending_deletion')
  })

  it('never claims the account cannot be recovered', () => {
    const a = classifyRequest(row({ scheduled_deletion_date: '2026-09-20' }), TODAY)
    const text = `${a?.finding} ${a?.consequence}`.toLowerCase()
    expect(text).not.toContain('cannot be recovered')
    expect(text).not.toContain('no longer be recovered')
  })
})

describe('the wedge — the production outage this was built for', () => {
  it('reports a running request with a start time as wedged', () => {
    const a = classifyRequest(
      row({ status: 'running', completed_at: null, answers: { start_date: '2026-09-30' } }),
      TODAY
    )
    expect(a?.kind).toBe('wedged_running')
    expect(a?.finding).toContain('re-submitting it returns')
  })

  it('is critical once the effective date has passed', () => {
    const a = classifyRequest(
      row({ status: 'running', completed_at: null, answers: { start_date: '2026-08-10' } }),
      TODAY
    )
    expect(a?.severity).toBe('critical')
    expect(a?.daysUntilEffective).toBe(-25)
  })

  it('says the account was created with sign-in blocked when an objectId exists', () => {
    const a = classifyRequest(
      row({
        status: 'running',
        completed_at: null,
        target_user_id: 'obj-9',
        answers: { start_date: '2026-08-10' },
      }),
      TODAY
    )
    expect(a?.consequence).toContain('sign-in BLOCKED')
  })

  it('says no account was created when there is no objectId', () => {
    const a = classifyRequest(
      row({
        status: 'running',
        completed_at: null,
        target_user_id: null,
        answers: { start_date: '2026-08-10' },
      }),
      TODAY
    )
    expect(a?.consequence).toContain('No account was created')
  })

  it('warns about retained access for a wedged offboarding', () => {
    const a = classifyRequest(
      row({
        type: 'offboarding',
        status: 'running',
        completed_at: null,
        answers: { last_day: '2026-09-04', employee_to_offboard: 'leaver@acme.com' },
      }),
      TODAY
    )
    expect(a?.kind).toBe('wedged_running')
    expect(a?.consequence).toContain('still has access')
  })

  it('reproduces the real EcoSpect row', () => {
    // The live row that exposed the outage: future-dated offboarding, status
    // stuck at 'running', no objectId ever resolved.
    const a = classifyRequest(
      row({
        id: '94520e10-916c-422e-a8f7-0324929773b3',
        type: 'offboarding',
        status: 'running',
        company_slug: 'ecospect-287',
        target_upn: 'amckinney@ecospect.com',
        target_user_id: null,
        completed_at: null,
        autotask_ticket_number: 'T20260901.0017',
        created_at: '2026-09-01T16:51:17.661Z',
        started_at: '2026-09-01T16:52:06.087Z',
        answers: { last_day: '2026-09-04', data_handling: 'forward_to_manager' },
      }),
      TODAY
    )
    expect(a?.kind).toBe('wedged_running')
    expect(a?.wasFutureDated).toBe(true)
    expect(a?.effectiveDate).toBe('2026-09-04')
    expect(a?.subject).toBe('amckinney@ecospect.com')
    expect(a?.scheduledDeletionDate).toBeNull()
  })
})

describe('never started', () => {
  it('is critical and names the consequence for an offboarding', () => {
    const a = classifyRequest(
      row({
        type: 'offboarding',
        status: 'pending',
        started_at: null,
        completed_at: null,
        autotask_ticket_id: null,
        answers: { employee_to_offboard: 'ghost@acme.com' },
      }),
      TODAY
    )
    expect(a?.kind).toBe('never_started')
    expect(a?.severity).toBe('critical')
    expect(a?.consequence).toContain('Nothing was revoked')
    expect(a?.autotaskTicketUrl).toBeNull()
  })
})

describe('armed scheduled is healthy, not a defect', () => {
  it('reports info severity and says no action is needed', () => {
    const a = classifyRequest(
      row({ status: 'scheduled', completed_at: null, answers: { start_date: '2026-09-30' } }),
      TODAY
    )
    expect(a?.kind).toBe('armed_scheduled')
    expect(a?.severity).toBe('info')
    expect(a?.consequence).toContain('No action needed')
  })
})

describe('unknown status', () => {
  it('is reported rather than assumed finished', () => {
    const a = classifyRequest(row({ status: 'weird', completed_at: null }), TODAY)
    expect(a?.kind).toBe('unknown_status')
    expect(a?.finding).toContain('weird')
  })

  it('KNOWN_STATUSES matches what the application writes', () => {
    // Kept in sync with the CHECK constraint added in /api/migrations/run.
    expect([...KNOWN_STATUSES].sort()).toEqual(
      ['completed', 'failed', 'pending', 'running', 'scheduled'].sort()
    )
  })
})

describe('ordering puts the most urgent first', () => {
  it('sorts critical before warning before info, then by soonest date', () => {
    const report = buildPendingActionsReport(
      [
        row({ id: 'info', status: 'scheduled', completed_at: null, answers: { start_date: '2026-12-01' } }),
        row({ id: 'far-del', scheduled_deletion_date: '2026-11-01' }),
        row({ id: 'near-del', scheduled_deletion_date: '2026-09-06' }),
        row({ id: 'overdue', status: 'running', completed_at: null, answers: { start_date: '2026-07-01' } }),
      ],
      TODAY
    )
    expect(report.actions[0].severity).toBe('critical')
    expect(report.actions.at(-1)?.requestId).toBe('info')
    // Within the same severity, the sooner date comes first.
    const deletions = report.actions
      .filter((a) => a.kind === 'pending_deletion')
      .map((a) => a.requestId)
    expect(deletions).toEqual(['near-del', 'far-del'])
    expect(report.summary.pendingDeletions).toBe(2)
    expect(report.summary.pendingDeletionsUrgent).toBe(1)
    expect(report.summary.armedScheduled).toBe(1)
  })
})

describe('field helpers', () => {
  it('reads start_date for onboarding and last_day for offboarding', () => {
    expect(effectiveDateOf(row({ answers: { start_date: '2026-09-30' } }))).toBe('2026-09-30')
    expect(
      effectiveDateOf(row({ type: 'offboarding', answers: { last_day: '2026-09-04' } }))
    ).toBe('2026-09-04')
  })

  it('parses answers delivered as a JSON string', () => {
    expect(effectiveDateOf(row({ answers: '{"start_date":"2026-10-01"}' }))).toBe('2026-10-01')
  })

  it('survives unparseable answers without throwing', () => {
    expect(effectiveDateOf(row({ answers: 'not json' }))).toBeNull()
    expect(effectiveDateOf(row({ answers: null }))).toBeNull()
  })

  it('falls back through UPN, form fields, then name', () => {
    expect(subjectOf(row({ target_upn: 'a@b.com' }))).toBe('a@b.com')
    expect(
      subjectOf(row({ target_upn: null, answers: { employee_to_offboard: 'c@d.com' } }))
    ).toBe('c@d.com')
    expect(
      subjectOf(row({ target_upn: null, answers: { first_name: 'Jo', last_name: 'Penny' } }))
    ).toBe('Jo Penny')
    expect(subjectOf(row({ target_upn: null, answers: {} }))).toBeNull()
  })

  it('counts calendar days in both directions', () => {
    expect(daysBetween('2026-09-04', '2026-09-04')).toBe(0)
    expect(daysBetween('2026-09-04', '2026-09-11')).toBe(7)
    expect(daysBetween('2026-09-04', '2026-08-28')).toBe(-7)
    expect(daysBetween('2026-09-04', 'garbage')).toBeNull()
  })
})
