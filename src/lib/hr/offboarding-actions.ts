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
   * scheduling) — reported as QUEUED instead of NOT RUN.
   */
  deferred?: boolean
  /** Instruction added to the manual-steps checklist when not automated (or not run) */
  manualInstruction?: string
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

export interface DeriveOffboardingOptions {
  /**
   * True when Exchange Online automation is enabled for this tenant — the
   * shared-mailbox conversion becomes an automated step (key
   * `convert_shared_mailbox`, executed via the Azure Automation runner)
   * instead of a permanent [MANUAL] outcome.
   */
  conversionAutomated?: boolean
  /**
   * True when license removal was intentionally NOT run because the mailbox
   * must still be licensed to convert it to shared (Microsoft requirement).
   * Renders remove_licenses as a [MANUAL] follow-up instead of [NOT RUN].
   */
  licenseRemovalDeferred?: boolean
}

/**
 * Derive the complete set of actions the submitted answers request.
 * `target` is the employee's UPN (or the raw work email before user lookup).
 */
export function deriveRequestedOffboardingActions(
  answers: Record<string, unknown>,
  target: string,
  opts: DeriveOffboardingOptions = {},
): RequestedOffboardingAction[] {
  const a = answers as Record<string, string | undefined>
  const actions: RequestedOffboardingAction[] = []

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

  if (opts.licenseRemovalDeferred) {
    actions.push({
      key: 'remove_licenses',
      label: 'Remove Microsoft 365 licenses (deferred until the mailbox conversion completes)',
      automated: false,
      manualInstruction: `Remove all licenses from ${target} in the Microsoft 365 admin center AFTER the shared-mailbox conversion is confirmed — a mailbox must still be licensed to convert it to shared, so the automation intentionally left the license in place. (Shared mailboxes under 50 GB need no license.)`,
    })
  } else {
    actions.push({ key: 'remove_licenses', label: 'Remove Microsoft 365 licenses', automated: true })
  }

  if (a.data_handling === 'keep_accessible') {
    const recipients = parseSharedMailboxRecipients(answers)
    const label =
      recipients.length > 0
        ? `Convert mailbox to shared + grant access to: ${recipients.join(', ')}`
        : 'Convert mailbox to shared (no access recipients specified on the form)'
    const manualInstruction =
      (recipients.length > 0
        ? `Convert the mailbox for ${target} to a SHARED mailbox (Microsoft 365 admin center -> Active users -> ${target} -> Mail -> Convert to shared mailbox), then grant Read and manage + Send as access to: ${recipients.join(', ')} (Exchange admin center -> Recipients -> Mailboxes -> mailbox delegation).`
        : `Convert the mailbox for ${target} to a SHARED mailbox (Microsoft 365 admin center -> Active users -> ${target} -> Mail -> Convert to shared mailbox). The form did not specify who should receive access — confirm with the requester before granting delegation.`) +
      ' The mailbox must still be licensed to convert (if it was already unlicensed, temporarily re-assign a license, convert, then remove it). Remove the license once conversion is confirmed.'
    actions.push({
      key: 'convert_shared_mailbox',
      label,
      automated: opts.conversionAutomated === true,
      manualInstruction,
    })
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

  return actions
}

/**
 * Reconcile requested actions against the executed/failed step keys.
 * Every requested action produces exactly one status line; automated actions
 * that neither completed nor failed are flagged NOT RUN and force a manual
 * step, so a skipped action can never disappear from the record again.
 */
export function reconcileOffboardingActions(
  requested: RequestedOffboardingAction[],
  stepsCompleted: string[],
  failedSteps: string[],
  /** Automated actions dispatched to an external runner, still awaiting confirmation */
  pendingKeys: string[] = [],
): OffboardingReconciliation {
  const statusLines: string[] = []
  const manualInstructions: string[] = []
  const unaccountedKeys: string[] = []

  for (const action of requested) {
    if (stepsCompleted.includes(action.key)) {
      statusLines.push(`[DONE] ${action.label}`)
    } else if (failedSteps.includes(action.key)) {
      statusLines.push(`[FAILED] ${action.label} — automated attempt failed; manual remediation listed under NEXT STEPS`)
    } else if (pendingKeys.includes(action.key)) {
      statusLines.push(`[QUEUED] ${action.label} — dispatched to the Exchange automation; a confirmation note will follow`)
    } else if (action.deferred) {
      statusLines.push(`[QUEUED] ${action.label} — a confirmation note will be added when scheduled`)
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
