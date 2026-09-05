import { describe, it, expect } from 'vitest'
import {
  evaluateDeletionGuard,
  describeVerdict,
  type SubjectLiveState,
  type DeletionGuardInput,
} from './deletion-guard'

const OBJECT_ID = '83dd8806-cd40-42af-b1a6-07ab9fc38bd5'
const UPN = 'MLinero@shiptribros.com'

/** A subject in the state a genuine offboarding leaves behind. */
function cleanlyOffboarded(over: Partial<SubjectLiveState> = {}): SubjectLiveState {
  return {
    found: true,
    objectId: OBJECT_ID,
    userPrincipalName: UPN,
    accountEnabled: false,
    assignedLicenseCount: 0,
    lastSignInDateTime: '2026-08-04T18:00:00.000Z',
    groupCount: 0,
    unavailable: [],
    ...over,
  }
}

function input(live: SubjectLiveState, over: Partial<DeletionGuardInput> = {}): DeletionGuardInput {
  return {
    scheduledObjectId: OBJECT_ID,
    scheduledUpn: UPN,
    scheduledDeletionDate: '2026-09-03',
    offboardedAt: '2026-08-04T19:30:00.000Z',
    live,
    ...over,
  }
}

describe('the happy path is the only path that deletes', () => {
  it('proceeds when every gate passes', () => {
    const v = evaluateDeletionGuard(input(cleanlyOffboarded()))
    expect(v.decision).toBe('proceed')
    expect(v.blockingGates).toHaveLength(0)
    expect(v.looksReinstated).toBe(false)
  })

  it('requires every gate to have been EVALUATED, not merely not-failed', () => {
    const v = evaluateDeletionGuard(input(cleanlyOffboarded()))
    expect(v.gates.every((g) => g.evaluated)).toBe(true)
  })
})

describe('the 2026-09-03 Tri-Bros incident — replayed', () => {
  // The actual state of MLinero@shiptribros.com at 05:01:21 on 2026-09-03:
  // re-enabled by a TCT admin on 08-10, re-licensed, and in daily use
  // (SaaS Alerts fired on a mailbox rule on 08-14).
  const asItActuallyWas = cleanlyOffboarded({
    accountEnabled: true,
    assignedLicenseCount: 1,
    lastSignInDateTime: '2026-09-02T14:12:00.000Z',
    groupCount: 3,
  })

  it('ABORTS — this is the deletion that must never have happened', () => {
    const v = evaluateDeletionGuard(input(asItActuallyWas))
    expect(v.decision).toBe('abort')
  })

  it('recognises it as a reinstatement, so the deletion is cancelled not retried', () => {
    const v = evaluateDeletionGuard(input(asItActuallyWas))
    expect(v.looksReinstated).toBe(true)
  })

  it('names every contradicting signal', () => {
    const v = evaluateDeletionGuard(input(asItActuallyWas))
    const blocked = v.blockingGates.map((g) => g.gate)
    expect(blocked).toContain('account_disabled')
    expect(blocked).toContain('unlicensed')
    expect(blocked).toContain('no_recent_signin')
    expect(blocked).toContain('no_group_membership')
  })

  it('each of the three main gates would have stopped it ALONE', () => {
    for (const solo of [
      { accountEnabled: true },
      { assignedLicenseCount: 2 },
      { lastSignInDateTime: '2026-09-02T14:12:00.000Z' },
    ]) {
      const v = evaluateDeletionGuard(input(cleanlyOffboarded(solo)))
      expect(v.decision).toBe('abort')
    }
  })
})

describe('fail safe — an unreadable gate is never a pass', () => {
  it('aborts when accountEnabled cannot be read', () => {
    const v = evaluateDeletionGuard(
      input(
        cleanlyOffboarded({
          accountEnabled: null,
          unavailable: [{ gate: 'account_disabled', reason: 'Graph 503' }],
        })
      )
    )
    expect(v.decision).toBe('abort')
    expect(v.blockingGates.some((g) => g.gate === 'account_disabled' && !g.evaluated)).toBe(true)
  })

  it('aborts when sign-in activity is unavailable (legacy app reg without AuditLog.Read.All)', () => {
    const v = evaluateDeletionGuard(
      input(
        cleanlyOffboarded({
          unavailable: [{ gate: 'no_recent_signin', reason: 'Graph 403 Authorization_RequestDenied' }],
        })
      )
    )
    expect(v.decision).toBe('abort')
  })

  it('an unreadable gate is NOT treated as a reinstatement — it retries, not cancels', () => {
    const v = evaluateDeletionGuard(
      input(
        cleanlyOffboarded({
          accountEnabled: null,
          unavailable: [{ gate: 'account_disabled', reason: 'Graph 503' }],
        })
      )
    )
    expect(v.decision).toBe('abort')
    expect(v.looksReinstated).toBe(false)
  })

  it('aborts when the whole subject read failed', () => {
    const v = evaluateDeletionGuard(
      input(
        cleanlyOffboarded({
          found: false,
          unavailable: [
            { gate: 'subject_exists', reason: 'network timeout' },
            { gate: 'identity_matches', reason: 'network timeout' },
            { gate: 'account_disabled', reason: 'network timeout' },
            { gate: 'unlicensed', reason: 'network timeout' },
          ],
        })
      )
    )
    expect(v.decision).toBe('abort')
  })
})

describe('identity must still match', () => {
  it('aborts when the object id has changed — a recreated account reuses the UPN', () => {
    const v = evaluateDeletionGuard(
      input(cleanlyOffboarded({ objectId: 'a-completely-different-guid' }))
    )
    expect(v.decision).toBe('abort')
    expect(v.looksReinstated).toBe(true)
    expect(v.blockingGates.some((g) => g.gate === 'identity_matches')).toBe(true)
  })

  it('aborts when the UPN has changed under the same object id', () => {
    const v = evaluateDeletionGuard(
      input(cleanlyOffboarded({ userPrincipalName: 'someone.else@shiptribros.com' }))
    )
    expect(v.decision).toBe('abort')
  })

  it('aborts when the account no longer exists', () => {
    const v = evaluateDeletionGuard(input(cleanlyOffboarded({ found: false })))
    expect(v.decision).toBe('abort')
    expect(v.blockingGates.some((g) => g.gate === 'subject_exists')).toBe(true)
  })
})

describe('sign-in comparison is relative to the offboarding, not to now', () => {
  it('passes when the last sign-in predates the offboarding', () => {
    const v = evaluateDeletionGuard(
      input(cleanlyOffboarded({ lastSignInDateTime: '2026-08-01T09:00:00.000Z' }))
    )
    expect(v.decision).toBe('proceed')
  })

  it('aborts when the last sign-in postdates it', () => {
    const v = evaluateDeletionGuard(
      input(cleanlyOffboarded({ lastSignInDateTime: '2026-08-20T09:00:00.000Z' }))
    )
    expect(v.decision).toBe('abort')
  })

  it('treats any sign-in as blocking when the offboarding time is unknown', () => {
    const v = evaluateDeletionGuard(
      input(cleanlyOffboarded({ lastSignInDateTime: '2026-08-01T09:00:00.000Z' }), {
        offboardedAt: null,
      })
    )
    expect(v.decision).toBe('abort')
  })

  it('passes when there is no sign-in on record at all', () => {
    const v = evaluateDeletionGuard(input(cleanlyOffboarded({ lastSignInDateTime: null })))
    expect(v.decision).toBe('proceed')
  })
})

describe('the escalation note tells the truth', () => {
  it('never claims data was deleted', () => {
    const v = evaluateDeletionGuard(input(cleanlyOffboarded({ accountEnabled: true })))
    const text = describeVerdict(v, 'Maryilith Linero (MLinero@shiptribros.com)', '2026-09-03')
    expect(text).toContain('did NOT run')
    expect(text).toContain('No data was deleted')
  })

  it('distinguishes a reinstated account from an unreadable check', () => {
    const reinstated = describeVerdict(
      evaluateDeletionGuard(input(cleanlyOffboarded({ accountEnabled: true }))),
      'x',
      '2026-09-03'
    )
    expect(reinstated).toContain('cancelled permanently')

    const unreadable = describeVerdict(
      evaluateDeletionGuard(
        input(
          cleanlyOffboarded({
            accountEnabled: null,
            unavailable: [{ gate: 'account_disabled', reason: 'Graph 503' }],
          })
        )
      ),
      'x',
      '2026-09-03'
    )
    expect(unreadable).toContain('remains scheduled')
    expect(unreadable).not.toContain('cancelled permanently')
  })

  it('marks unevaluated gates distinctly from failed ones', () => {
    const text = describeVerdict(
      evaluateDeletionGuard(
        input(
          cleanlyOffboarded({
            accountEnabled: null,
            unavailable: [{ gate: 'account_disabled', reason: 'Graph 503' }],
          })
        )
      ),
      'x',
      '2026-09-03'
    )
    expect(text).toContain('[COULD NOT CHECK]')
  })

  it('never repeats the false recoverability claim', () => {
    const text = describeVerdict(
      evaluateDeletionGuard(input(cleanlyOffboarded({ accountEnabled: true }))),
      'x',
      '2026-09-03'
    ).toLowerCase()
    expect(text).not.toContain('cannot be recovered')
    expect(text).not.toContain('no longer be recovered')
  })
})
