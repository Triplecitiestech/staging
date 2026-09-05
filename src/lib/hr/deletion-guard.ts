/**
 * Pre-execution guard for the scheduled 30-day account deletion.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-03 the nightly cron deleted MLinero@shiptribros.com on a timer
 * armed 30 days earlier. In the intervening month the client had emailed asking
 * for her back, a portal onboarding request had been submitted for the same
 * UPN, and a TCT admin had manually re-enabled the account. At the moment of
 * deletion she was enabled, licensed and in daily use. The job checked none of
 * that — it read one date column and called Graph DELETE /users.
 *
 * The decisive signal in that incident (the manual re-enable) originated
 * OUTSIDE the portal entirely, so no amount of internal supersession logic
 * would have caught it. Only reading the account's live state would have.
 * That makes this module the single highest-value safeguard in the design.
 *
 * THE RULE THAT MUST NEVER BREAK
 *
 * A destructive action proceeds only when EVERY available gate returned an
 * explicit pass. It is never "no gate returned a fail". An unavailable,
 * errored, or unevaluable gate is NOT a pass — it aborts. A deletion that runs
 * because a guard errored is a worse defect than the one this replaces.
 *
 * Owner decision 2026-09-04: client contacts keep the ability to schedule
 * irreversible deletions with no TCT approval step. That makes this guard and
 * the cancellation path the ONLY things standing between a mis-submitted form
 * and a destroyed mailbox. Do not soften either.
 *
 * Pure functions only — no I/O — so the decision is unit-testable without a
 * Graph client or a pg pool.
 */

/** What the caller must read from Graph before a deletion may proceed. */
export interface SubjectLiveState {
  /** The object actually found at the scheduled objectId, or null if absent. */
  found: boolean
  /** Graph `id`. Must still equal the objectId the deletion was armed against. */
  objectId: string | null
  /** Graph `userPrincipalName` as it is NOW. */
  userPrincipalName: string | null
  /** Graph `accountEnabled`. */
  accountEnabled: boolean | null
  /** Count of assigned license SKUs. */
  assignedLicenseCount: number | null
  /** Most recent interactive sign-in, ISO. Needs AuditLog.Read.All. */
  lastSignInDateTime: string | null
  /** Group memberships the subject currently holds. */
  groupCount: number | null
  /**
   * Gates the caller could NOT evaluate, with the reason. A gate listed here
   * is treated as a FAIL, never as a pass.
   */
  unavailable: Array<{ gate: GateName; reason: string }>
}

export type GateName =
  | 'subject_exists'
  | 'identity_matches'
  | 'account_disabled'
  | 'unlicensed'
  | 'no_recent_signin'
  | 'no_group_membership'

export interface GateResult {
  gate: GateName
  /** true = safe to proceed on this axis. false = abort. */
  passed: boolean
  /** Whether the gate could be evaluated at all. */
  evaluated: boolean
  /** Human-readable, used verbatim in the escalation ticket. */
  detail: string
}

export interface DeletionGuardInput {
  /** objectId the deletion was armed against, from hr_requests.target_user_id. */
  scheduledObjectId: string
  /** UPN recorded when the deletion was armed, from hr_requests.target_upn. */
  scheduledUpn: string | null
  /** The date the deletion was scheduled for (YYYY-MM-DD). */
  scheduledDeletionDate: string
  /** When the offboarding ran, ISO — sign-ins after this are contradictions. */
  offboardedAt: string | null
  live: SubjectLiveState
}

export interface DeletionGuardVerdict {
  /** The only value that permits a Graph DELETE. */
  decision: 'proceed' | 'abort'
  gates: GateResult[]
  /** Gates that failed or could not be evaluated. Empty iff decision is proceed. */
  blockingGates: GateResult[]
  /** One-line reason, suitable for a log line. */
  summary: string
  /**
   * True when the account looks REINSTATED rather than merely unverifiable —
   * enabled, licensed, recently used, or re-grouped. Drives a louder escalation
   * and a permanent cancel rather than a retry tomorrow.
   */
  looksReinstated: boolean
}

/**
 * Decide whether a scheduled deletion may execute.
 *
 * Every gate must pass. A gate the caller could not evaluate is reported as
 * `evaluated: false` and counts as blocking.
 */
export function evaluateDeletionGuard(input: DeletionGuardInput): DeletionGuardVerdict {
  const { live, scheduledObjectId, scheduledUpn, offboardedAt } = input
  const gates: GateResult[] = []

  const unavailableFor = (gate: GateName): string | null => {
    const hit = live.unavailable.find((u) => u.gate === gate)
    return hit ? hit.reason : null
  }

  // 1. The subject must still exist. An absent object means someone already
  //    removed it, or the id is wrong — either way, do not issue a DELETE.
  const existsUnavailable = unavailableFor('subject_exists')
  if (existsUnavailable) {
    gates.push({
      gate: 'subject_exists',
      passed: false,
      evaluated: false,
      detail: `Could not confirm the account still exists: ${existsUnavailable}`,
    })
  } else {
    gates.push({
      gate: 'subject_exists',
      passed: live.found,
      evaluated: true,
      detail: live.found
        ? 'Account found at the scheduled object id.'
        : 'No account exists at the scheduled object id — nothing to delete, and the id may now refer to something else.',
    })
  }

  // 2. Identity must still match. A recreated account reuses the UPN with a
  //    DIFFERENT objectId; a rename changes the UPN under the same objectId.
  //    Both mean the thing in front of us is not what was approved for deletion.
  const identityUnavailable = unavailableFor('identity_matches')
  if (identityUnavailable) {
    gates.push({
      gate: 'identity_matches',
      passed: false,
      evaluated: false,
      detail: `Could not confirm identity: ${identityUnavailable}`,
    })
  } else if (!live.found) {
    gates.push({
      gate: 'identity_matches',
      passed: false,
      evaluated: false,
      detail: 'Not evaluated — no account was found.',
    })
  } else {
    const idMatches = live.objectId === scheduledObjectId
    const upnMatches =
      !scheduledUpn ||
      !live.userPrincipalName ||
      live.userPrincipalName.toLowerCase() === scheduledUpn.toLowerCase()
    gates.push({
      gate: 'identity_matches',
      passed: idMatches && upnMatches,
      evaluated: true,
      detail: !idMatches
        ? `Object id has changed: armed against ${scheduledObjectId}, found ${live.objectId ?? 'none'}.`
        : !upnMatches
          ? `UPN has changed: armed against ${scheduledUpn}, account is now ${live.userPrincipalName}.`
          : 'Object id and UPN both match what the deletion was armed against.',
    })
  }

  // 3. The account must still be DISABLED. This alone would have stopped the
  //    2026-09-03 deletion.
  const enabledUnavailable = unavailableFor('account_disabled')
  if (enabledUnavailable || live.accountEnabled === null) {
    gates.push({
      gate: 'account_disabled',
      passed: false,
      evaluated: false,
      detail: `Could not read accountEnabled: ${enabledUnavailable ?? 'field absent from the Graph response'}`,
    })
  } else {
    gates.push({
      gate: 'account_disabled',
      passed: live.accountEnabled === false,
      evaluated: true,
      detail: live.accountEnabled
        ? 'ACCOUNT IS ENABLED. Someone re-enabled it after the offboarding — sign-in works right now.'
        : 'Account is still blocked from sign-in, as the offboarding left it.',
    })
  }

  // 4. The account must still be UNLICENSED. A re-licensed account is one
  //    somebody is paying for.
  const licenseUnavailable = unavailableFor('unlicensed')
  if (licenseUnavailable || live.assignedLicenseCount === null) {
    gates.push({
      gate: 'unlicensed',
      passed: false,
      evaluated: false,
      detail: `Could not read assigned licenses: ${licenseUnavailable ?? 'field absent from the Graph response'}`,
    })
  } else {
    gates.push({
      gate: 'unlicensed',
      passed: live.assignedLicenseCount === 0,
      evaluated: true,
      detail:
        live.assignedLicenseCount > 0
          ? `ACCOUNT HOLDS ${live.assignedLicenseCount} LICENCE(S). Someone re-licensed it after the offboarding.`
          : 'No licences assigned, as the offboarding left it.',
    })
  }

  // 5. No sign-in since the offboarding. Needs AuditLog.Read.All, which the TCT
  //    multi-tenant app requests — but a legacy per-tenant app registration may
  //    not have consented to it, so unavailability here is expected and still
  //    blocks rather than passing.
  const signInUnavailable = unavailableFor('no_recent_signin')
  if (signInUnavailable) {
    gates.push({
      gate: 'no_recent_signin',
      passed: false,
      evaluated: false,
      detail: `Could not read sign-in activity: ${signInUnavailable}`,
    })
  } else if (!live.lastSignInDateTime) {
    gates.push({
      gate: 'no_recent_signin',
      passed: true,
      evaluated: true,
      detail: 'No interactive sign-in on record.',
    })
  } else {
    const signedInAfterOffboard =
      !offboardedAt || Date.parse(live.lastSignInDateTime) > Date.parse(offboardedAt)
    gates.push({
      gate: 'no_recent_signin',
      passed: !signedInAfterOffboard,
      evaluated: true,
      detail: signedInAfterOffboard
        ? `ACCOUNT HAS BEEN USED. Last sign-in ${live.lastSignInDateTime}, after the offboarding${offboardedAt ? ` on ${offboardedAt}` : ''}.`
        : `Last sign-in ${live.lastSignInDateTime}, before the offboarding — consistent with a departed employee.`,
    })
  }

  // 6. Still removed from groups. Weaker than the others (a dynamic group can
  //    re-add on its own), so it is reported but evaluated the same way.
  const groupsUnavailable = unavailableFor('no_group_membership')
  if (groupsUnavailable || live.groupCount === null) {
    gates.push({
      gate: 'no_group_membership',
      passed: false,
      evaluated: false,
      detail: `Could not read group membership: ${groupsUnavailable ?? 'field absent from the Graph response'}`,
    })
  } else {
    gates.push({
      gate: 'no_group_membership',
      passed: live.groupCount === 0,
      evaluated: true,
      detail:
        live.groupCount > 0
          ? `Account is a member of ${live.groupCount} group(s) again. Note a dynamic group can re-add on its own, so this alone is weak evidence.`
          : 'Still removed from all groups, as the offboarding left it.',
    })
  }

  const blockingGates = gates.filter((g) => !g.passed)

  // "Reinstated" means positive evidence the account is back in use, as
  // distinct from "we could not check". The two need different handling: the
  // first is a permanent cancel, the second is worth retrying once the
  // read works.
  const looksReinstated = gates.some(
    (g) =>
      g.evaluated &&
      !g.passed &&
      (g.gate === 'account_disabled' ||
        g.gate === 'unlicensed' ||
        g.gate === 'no_recent_signin' ||
        g.gate === 'no_group_membership' ||
        g.gate === 'identity_matches')
  )

  const decision = blockingGates.length === 0 ? 'proceed' : 'abort'

  return {
    decision,
    gates,
    blockingGates,
    looksReinstated,
    summary:
      decision === 'proceed'
        ? `All ${gates.length} preconditions verified against live Graph — account is absent from use, disabled, unlicensed and ungrouped.`
        : `ABORTED: ${blockingGates.length} of ${gates.length} preconditions did not pass (${blockingGates
            .map((g) => (g.evaluated ? g.gate : `${g.gate}:unreadable`))
            .join(', ')}).`,
  }
}

/**
 * Render the verdict for an Autotask escalation note.
 *
 * Deliberately states what was checked AND what could not be checked — an
 * abort caused by an unreadable field must not look like an abort caused by a
 * reinstated account.
 */
export function describeVerdict(
  verdict: DeletionGuardVerdict,
  subject: string,
  scheduledDate: string
): string {
  const lines: string[] = [
    `The scheduled deletion of ${subject} did NOT run.`,
    '',
    `It was armed for ${scheduledDate}. Immediately before deleting, the platform re-read the account from Microsoft Graph and one or more preconditions no longer held, so the deletion was aborted rather than executed.`,
    '',
    'Preconditions checked:',
  ]
  for (const g of verdict.gates) {
    const mark = g.passed ? '[OK]' : g.evaluated ? '[FAILED]' : '[COULD NOT CHECK]'
    lines.push(`  ${mark} ${g.gate} — ${g.detail}`)
  }
  lines.push('')
  if (verdict.looksReinstated) {
    lines.push(
      'This account appears to have been REINSTATED after the offboarding. The scheduled deletion has been cancelled permanently and will not retry. If the account genuinely should be deleted, submit a new offboarding request.'
    )
  } else {
    lines.push(
      'No evidence was found that the account was reinstated — the deletion was blocked because one or more checks could not be completed. The deletion remains scheduled and will be re-attempted on the next run. If the checks keep failing, resolve the underlying access problem or cancel the deletion.'
    )
  }
  lines.push('')
  lines.push(
    'No data was deleted. This note records a deletion that was prevented, not one that occurred.'
  )
  return lines.join('\n')
}
