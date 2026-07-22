/**
 * Offboarding requested-action derivation + reconciliation.
 *
 * Why this exists: the offboarding pipeline in /api/hr/process used to build
 * its ticket record from whatever steps happened to run. Anything the form
 * requested that had no automated step (e.g. "convert to shared mailbox") was
 * silently dropped from the PROVISIONING RESULTS — not done, not logged, not
 * flagged (ticket T20260704.0004). These helpers make the record complete by
 * construction: every action the submitted answers request is derived up
 * front, then reconciled against the executed/failed step keys, so each one
 * appears exactly once as DONE / FAILED / MANUAL / QUEUED / NOT RUN.
 *
 * Pure functions only — no I/O — so the contract is unit-testable
 * (offboarding-actions.test.ts) without the route's pg pool.
 *
 * NOTE ON TEXT: output strings end up in Autotask ticket notes/descriptions,
 * which mangle non-Windows-1252 glyphs (✓ → ?, → → ?). Use ASCII markers only.
 */

export interface RequestedOffboardingAction {
  /** Step key — matches the hr_request_steps step_key for automated steps */
  key: string
  /** Human-readable label for the PROVISIONING RESULTS reconciliation */
  label: string
  /** Whether the /api/hr/process pipeline has an automated step for this action */
  automated: boolean
  /**
   * Action runs after the results record is built (e.g. 30-day deletion
   * scheduling, async Exchange Online jobs) — reported as QUEUED instead of
   * NOT RUN, provided the pipeline confirms it actually queued (see the
   * `queuedSteps` parameter of reconcileOffboardingActions).
   */
  deferred?: boolean
  /** Suffix for the [QUEUED] status line explaining what happens next */
  deferredDetail?: string
  /** Instruction added to the manual-steps checklist when not automated (or not run) */
  manualInstruction?: string
}

/**
 * What the pipeline knows about the external Exchange Online runner before
 * deriving actions. When the runner is available, mailbox conversion becomes
 * an automated (async) action; when it is not, the action stays [MANUAL] with
 * the reason appended so the technician knows why the automation didn't run.
 */
export interface OffboardingAutomationContext {
  /** Kill switch on + tenant enabled + platform env configured */
  exchangeAutomationAvailable?: boolean
  /** Why Exchange automation is unavailable (appended to manual instructions) */
  exchangeUnavailableReason?: string
}

export interface OffboardingReconciliation {
  /** One line per requested action: [DONE] / [FAILED] / [MANUAL] / [QUEUED] / [NOT RUN] */
  statusLines: string[]
  /** Manual-step checklist entries for actions the automation does not (or did not) perform */
  manualInstructions: string[]
  /** Keys of automated actions that neither completed nor failed — should be impossible; forces escalation */
  unaccountedKeys: string[]
}

/**
 * Shared-mailbox access recipients across all form-schema generations:
 * current multi_select array `shared_mailbox_access`, a defensive
 * string/comma-list form of the same key, and the legacy single-select
 * `delegate_access_to` / `delegate_access` keys. The pipeline previously
 * required a non-empty array and silently dropped everything else.
 */
export function parseSharedMailboxRecipients(answers: Record<string, unknown>): string[] {
  const recipients: string[] = []
  const push = (value: unknown) => {
    if (typeof value !== 'string') return
    for (const part of value.split(',')) {
      const trimmed = part.trim()
      if (trimmed && !recipients.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
        recipients.push(trimmed)
      }
    }
  }

  const raw = answers.shared_mailbox_access
  if (Array.isArray(raw)) raw.forEach(push)
  else push(raw)

  const a = answers as Record<string, string | undefined>
  push(a.delegate_access_to)
  push(a.delegate_access)

  return recipients
}

function isImmediateTermination(a: Record<string, string | undefined>): boolean {
  return (
    a.urgency_type === 'immediate_termination' ||
    a.account_action === 'immediate_termination' ||
    a.urgency === 'immediate_termination'
  )
}

/** All schema generations' values that mean "delete the account after a 30-day hold" */
export const DELETE_AFTER_HOLD_VALUES = ['delete_after_backup', 'delete_after_30', 'delete_after_30_days']

const WIPE_DEVICE_VALUES = ['wipe_remote', 'remote_wipe', 'wipe']
const RETURN_DEVICE_VALUES = ['return_to_office', 'ship_to_office', 'return']

/**
 * Canonical offboarding step order — the single source of truth for the
 * sequence of offboarding actions. `deriveRequestedOffboardingActions` emits
 * its plan in this order, and the execution pipeline (/api/hr/process) is
 * documented and guarded against violating it.
 *
 * THE RULE THAT MUST NEVER BREAK: `remove_licenses` comes AFTER
 * `convert_shared_mailbox` (and after every other mailbox operation). Microsoft
 * blocks converting a mailbox to shared, and blocks Full Access / Send As
 * grants, once the Microsoft 365 license is removed — the mailbox must still be
 * licensed at the moment it is converted and delegated. Remove the license
 * first and the conversion plus every access grant after it silently fail.
 *
 * Regression history: Dan Brown Construction / Michael Beach (license pulled
 * before the mailbox was converted -> conversion failed), then Tri-Bros
 * Transportation. Do not reorder these two keys. The invariant is enforced by
 * assertLicenseRemovalAfterMailboxConversion() and locked by
 * offboarding-actions.test.ts.
 */
export const OFFBOARDING_STEP_ORDER: readonly string[] = [
  'find_user',
  'revoke_sessions',
  'transfer_onedrive',
  'archive_onedrive',
  'disable_account',
  'remove_groups',
  'convert_shared_mailbox', // mailbox conversion + delegate grants — needs a licensed mailbox
  'setup_forwarding', // also operates on the (still-licensed) mailbox
  'remove_licenses', // MUST come after every mailbox operation above
  'schedule_deletion',
  'wipe_devices',
  'device_return',
]

/**
 * Throw if an ordered step-key sequence would remove the Microsoft 365 license
 * before the shared-mailbox conversion. Pure and cheap: call it on the canonical
 * order, on any derived action plan, and at the offboarding execution site so a
 * future refactor that reorders the steps fails loudly (in tests / at runtime)
 * instead of silently breaking a customer's mailbox conversion.
 *
 * Only fires when BOTH keys are present — non-keep_accessible offboardings that
 * remove the license inline (no conversion) are unaffected.
 */
export function assertLicenseRemovalAfterMailboxConversion(stepKeys: readonly string[]): void {
  const convertIdx = stepKeys.indexOf('convert_shared_mailbox')
  const licenseIdx = stepKeys.indexOf('remove_licenses')
  if (convertIdx !== -1 && licenseIdx !== -1 && licenseIdx < convertIdx) {
    throw new Error(
      'Offboarding step-order violation: remove_licenses is sequenced before ' +
        'convert_shared_mailbox. The mailbox must still be licensed when it is ' +
        'converted to shared and when Full Access / Send As are granted — license ' +
        'removal must come last. See OFFBOARDING_STEP_ORDER in ' +
        'src/lib/hr/offboarding-actions.ts.',
    )
  }
}

/**
 * Stable-sort action-like items into OFFBOARDING_STEP_ORDER. Unknown keys keep
 * their relative insertion position at the end (decorate-sort-undecorate makes
 * the sort stable regardless of the engine's Array.sort guarantees).
 */
function orderByCanonicalStep<T extends { key: string }>(items: T[]): T[] {
  const rank = (key: string): number => {
    const i = OFFBOARDING_STEP_ORDER.indexOf(key)
    return i === -1 ? OFFBOARDING_STEP_ORDER.length : i
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.key) - rank(b.item.key) || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * Derive the complete set of actions the submitted answers request.
 * `target` is the employee's UPN (or the raw work email before user lookup).
 */
export function deriveRequestedOffboardingActions(
  answers: Record<string, unknown>,
  target: string,
  automation: OffboardingAutomationContext = {},
): RequestedOffboardingAction[] {
  const a = answers as Record<string, string | undefined>
  const actions: RequestedOffboardingAction[] = []
  const keepAccessible = a.data_handling === 'keep_accessible'
  const exchangeAvailable = automation.exchangeAutomationAvailable === true

  actions.push({ key: 'find_user', label: `Locate user account (${target})`, automated: true })

  if (isImmediateTermination(a)) {
    actions.push({ key: 'revoke_sessions', label: 'Revoke all active sign-in sessions', automated: true })
  }

  const transferRecipient = a.transfer_files_to || a.transfer_onedrive_to
  if ((a.file_handling === 'transfer_to_user' && a.transfer_files_to) || a.transfer_onedrive_to) {
    actions.push({
      key: 'transfer_onedrive',
      label: `Share OneDrive files with ${transferRecipient}`,
      automated: true,
    })
  }
  if (a.file_handling === 'archive_to_sharepoint' || a.onedrive_archive === 'yes') {
    actions.push({ key: 'archive_onedrive', label: 'Archive OneDrive files to HR SharePoint', automated: true })
  }

  actions.push(
    { key: 'disable_account', label: 'Disable account (block sign-in)', automated: true },
    { key: 'remove_groups', label: 'Remove from all groups and distribution lists', automated: true },
  )

  // License removal: for keep_accessible offboardings the mailbox MUST still
  // be licensed when it is converted to shared (Microsoft requirement), so
  // removal is deferred — to the Exchange callback when the runner is
  // available, to a manual step after conversion when it is not. All other
  // data-handling choices remove licenses inline as before.
  if (!keepAccessible) {
    actions.push({ key: 'remove_licenses', label: 'Remove Microsoft 365 licenses', automated: true })
  } else if (exchangeAvailable) {
    actions.push({
      key: 'remove_licenses',
      label: 'Remove Microsoft 365 licenses (after mailbox conversion is confirmed)',
      automated: true,
      deferred: true,
      deferredDetail: 'runs automatically once the Exchange job confirms the mailbox conversion',
      manualInstruction:
        `Remove all Microsoft 365 licenses from ${target} AFTER the mailbox conversion completes ` +
        `(Microsoft 365 admin center -> Active users -> ${target} -> Licenses and apps). ` +
        'Licenses were intentionally left assigned: the mailbox must be licensed at conversion time.',
    })
  } else {
    actions.push({
      key: 'remove_licenses',
      label: 'Remove Microsoft 365 licenses (after manual mailbox conversion)',
      automated: false,
      manualInstruction:
        `Remove all Microsoft 365 licenses from ${target} AFTER converting the mailbox to shared ` +
        `(Microsoft 365 admin center -> Active users -> ${target} -> Licenses and apps). ` +
        'Licenses were intentionally left assigned: the mailbox must be licensed at conversion time.',
    })
  }

  if (keepAccessible) {
    const recipients = parseSharedMailboxRecipients(answers)
    const label =
      recipients.length > 0
        ? `Convert mailbox to shared + grant access to: ${recipients.join(', ')}`
        : 'Convert mailbox to shared (no access recipients specified on the form)'
    if (exchangeAvailable) {
      actions.push({
        key: 'convert_shared_mailbox',
        label,
        automated: true,
        deferred: true,
        deferredDetail: 'dispatched to the Exchange Online automation; a confirmation note will follow',
        manualInstruction:
          recipients.length > 0
            ? `Convert the mailbox for ${target} to a SHARED mailbox (Microsoft 365 admin center -> Active users -> ${target} -> Mail -> Convert to shared mailbox), then grant Read and manage + Send as access to: ${recipients.join(', ')} (Exchange admin center -> Recipients -> Mailboxes -> mailbox delegation). The license is still assigned — remove it after converting.`
            : `Convert the mailbox for ${target} to a SHARED mailbox (Microsoft 365 admin center -> Active users -> ${target} -> Mail -> Convert to shared mailbox). The form did not specify who should receive access — confirm with the requester before granting delegation. The license is still assigned — remove it after converting.`,
      })
    } else {
      const reason = automation.exchangeUnavailableReason
        ? ` Automated conversion was unavailable: ${automation.exchangeUnavailableReason}.`
        : ''
      actions.push({
        key: 'convert_shared_mailbox',
        label,
        automated: false,
        manualInstruction:
          (recipients.length > 0
            ? `Convert the mailbox for ${target} to a SHARED mailbox (Microsoft 365 admin center -> Active users -> ${target} -> Mail -> Convert to shared mailbox), then grant Read and manage + Send as access to: ${recipients.join(', ')} (Exchange admin center -> Recipients -> Mailboxes -> mailbox delegation).`
            : `Convert the mailbox for ${target} to a SHARED mailbox (Microsoft 365 admin center -> Active users -> ${target} -> Mail -> Convert to shared mailbox). The form did not specify who should receive access — confirm with the requester before granting delegation.`) +
          ' The license is intentionally still assigned (the mailbox must be licensed to convert) — remove it after converting.' +
          reason,
      })
    }
  }

  if (a.data_handling === 'forward_to_manager' || a.data_handling === 'forward_to_specific' || a.forward_email) {
    const forwardTo = a.forward_email_to || a.forward_email
    actions.push({
      key: 'setup_forwarding',
      label: forwardTo
        ? `Set up email forwarding to ${forwardTo}`
        : 'Set up email forwarding (recipient not specified on the form)',
      automated: false,
      manualInstruction: forwardTo
        ? `Set up email forwarding: ${target} -> ${forwardTo} (Exchange admin center -> Recipients -> Mailboxes -> ${target} -> Manage mail flow settings -> Email forwarding). This is not automated.`
        : `Set up email forwarding for ${target} — the form did not specify a recipient; confirm with the requester first.`,
    })
  }

  if (a.data_handling && DELETE_AFTER_HOLD_VALUES.includes(a.data_handling)) {
    actions.push({
      key: 'schedule_deletion',
      label: 'Schedule account deletion after 30-day hold',
      automated: true,
      deferred: true,
    })
  }

  if (a.device_handling && WIPE_DEVICE_VALUES.includes(a.device_handling)) {
    actions.push({
      key: 'wipe_devices',
      label: 'Remote wipe company device(s)',
      automated: false,
      manualInstruction: `Remote wipe the device(s) for ${target} via Intune / Datto RMM as requested on the form. This is not automated.`,
    })
  } else if (a.device_handling && RETURN_DEVICE_VALUES.includes(a.device_handling)) {
    actions.push({
      key: 'device_return',
      label:
        a.device_handling === 'ship_to_office'
          ? 'Company device to be shipped back to the office'
          : 'Company device to be returned to the office',
      automated: false,
      manualInstruction: `Confirm the company device for ${target} has been ${a.device_handling === 'ship_to_office' ? 'shipped back' : 'returned'} before closing this ticket.`,
    })
  }

  // Emit the plan in canonical order so the ticket record reflects the true
  // execution sequence (license removal after the mailbox conversion, never
  // before), and self-check the invariant so this function can never hand a
  // caller a plan that lists license removal ahead of the conversion.
  const ordered = orderByCanonicalStep(actions)
  assertLicenseRemovalAfterMailboxConversion(ordered.map((s) => s.key))
  return ordered
}

/**
 * Reconcile requested actions against the executed/failed step keys.
 * Every requested action produces exactly one status line; automated actions
 * that neither completed nor failed are flagged NOT RUN and force a manual
 * step, so a skipped action can never disappear from the record again.
 *
 * `queuedSteps` (optional): keys of deferred actions the pipeline actually
 * queued (e.g. a dispatched Exchange job). When provided, a deferred action
 * NOT in the list falls through to the NOT RUN handling instead of claiming
 * [QUEUED] — so a failed dispatch can never masquerade as pending work.
 * Omitting the parameter keeps the legacy behavior (deferred == queued).
 */
export function reconcileOffboardingActions(
  requested: RequestedOffboardingAction[],
  stepsCompleted: string[],
  failedSteps: string[],
  queuedSteps?: string[],
): OffboardingReconciliation {
  const statusLines: string[] = []
  const manualInstructions: string[] = []
  const unaccountedKeys: string[] = []

  for (const action of requested) {
    const actuallyQueued = action.deferred && (queuedSteps === undefined || queuedSteps.includes(action.key))
    if (stepsCompleted.includes(action.key)) {
      statusLines.push(`[DONE] ${action.label}`)
    } else if (failedSteps.includes(action.key)) {
      statusLines.push(`[FAILED] ${action.label} — automated attempt failed; manual remediation listed under NEXT STEPS`)
    } else if (actuallyQueued) {
      statusLines.push(`[QUEUED] ${action.label} — ${action.deferredDetail ?? 'a confirmation note will be added when scheduled'}`)
    } else if (!action.automated) {
      statusLines.push(`[MANUAL] ${action.label} — not automated; assigned to TCT staff under NEXT STEPS`)
      if (action.manualInstruction) manualInstructions.push(action.manualInstruction)
    } else {
      statusLines.push(`[NOT RUN] ${action.label} — the automation did not execute this step; complete it manually`)
      unaccountedKeys.push(action.key)
      manualInstructions.push(
        action.manualInstruction ??
          `Manually complete: ${action.label} — the automation skipped this step unexpectedly. Investigate the HR request run before closing.`,
      )
    }
  }

  return { statusLines, manualInstructions, unaccountedKeys }
}
