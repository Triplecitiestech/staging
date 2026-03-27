import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db-pool'
import { Resend } from 'resend'
import { AutotaskClient } from '@/lib/autotask'
import {
  createGraphClient,
  getTenantCredentialsBySlug,
  type GraphGroup,
} from '@/lib/graph'
import { pax8, type Pax8Subscription, type Pax8Company, SKU_TO_PAX8_PRODUCT } from '@/lib/pax8'
import type { GraphLicenseSku } from '@/lib/graph'

// Pax8 license procurement can poll for up to 5 minutes
export const maxDuration = 300

// ---------------------------------------------------------------------------
// Raw pg pool — bypasses Prisma entirely so schema mismatches can't cause 500s
// ---------------------------------------------------------------------------

const pool = getPool()

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.EMAIL_FROM || 'Triple Cities Tech <noreply@triplecitiestech.com>'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessRequestBody {
  requestId: string
  executeScheduled?: boolean  // Set by cron to force-execute a scheduled request
}

interface AutotaskTicketPayload {
  CompanyID: number
  Title: string
  Description: string
  Status: number
  Priority: number
  QueueID?: number
  IssueType?: number
  SubIssueType?: number
  ContactID?: number
}

interface AutotaskTicketResponse {
  itemId?: number
  item?: {
    id: number
    ticketNumber: string
  }
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAutotaskHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    UserName: process.env.AUTOTASK_API_USERNAME ?? '',
    Secret: process.env.AUTOTASK_API_SECRET ?? '',
    ApiIntegrationCode: process.env.AUTOTASK_API_INTEGRATION_CODE ?? '',
  }
}

function getAutotaskBaseUrl(): string {
  return (process.env.AUTOTASK_API_BASE_URL ?? '').replace(/\/$/, '')
}

/** Map raw option values to human-readable labels */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  work_location_detail: {
    office: 'Office',
    home: 'Home (Remote)',
    hybrid: 'Hybrid (Office + Home)',
    field: 'Field / On-site at client locations',
  },
  credential_delivery: {
    submitter: "Send to me (I'll share with the employee)",
    personal_email: "Send directly to the employee's personal email",
  },
  computer_situation: {
    existing_company: 'Use an existing company computer',
    new_computer: 'New computer required',
    personal_byod: 'BYOD / personal computer (work from home)',
    dont_know: "I don't know",
    none: 'No computer needed',
  },
  urgency_type: {
    immediate_termination: 'Immediate Termination — revoke access now',
    end_of_day: 'End of Business Day',
    scheduled: 'Scheduled Date (see Last Day field)',
    already_gone: 'Employee Has Already Left',
  },
  data_handling: {
    keep_accessible: 'Convert to Shared Mailbox — Keep Accessible',
    forward_to_manager: 'Forward Email to Manager',
    forward_to_specific: 'Forward Email to Specific Person',
    delete_after_backup: 'Delete After Backup',
    no_action: 'No Action Needed',
  },
  device_handling: {
    return_to_office: 'Return Device to Office',
    ship_to_office: 'Ship Device to Office',
    wipe_remote: 'Remote Wipe',
    keep_device: 'Employee Keeps Device (BYOD)',
    no_device: 'No Company Device',
  },
  file_handling: {
    transfer_to_user: 'Transfer Files to Another User',
    archive_to_sharepoint: 'Archive to SharePoint',
    delete_files: 'Delete All Files',
    no_action: 'No Action Needed',
  },
}

/** Country code to full name */
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', AU: 'Australia',
  DE: 'Germany', FR: 'France', JP: 'Japan', IN: 'India', BR: 'Brazil',
  MX: 'Mexico', NZ: 'New Zealand', IE: 'Ireland', NL: 'Netherlands',
  SG: 'Singapore', ZA: 'South Africa', SE: 'Sweden', NO: 'Norway',
  DK: 'Denmark', FI: 'Finland', CH: 'Switzerland', AT: 'Austria',
  BE: 'Belgium', ES: 'Spain', IT: 'Italy', PT: 'Portugal', PL: 'Poland',
}

/** Resolve a raw value to its display label */
function resolveLabel(field: string, raw: string): string {
  return VALUE_LABELS[field]?.[raw] ?? raw
}

/** Resolve country codes to names */
function resolveCountries(val: unknown): string {
  if (Array.isArray(val)) return val.map(c => COUNTRY_NAMES[c as string] ?? c).join(', ')
  if (typeof val === 'string') return COUNTRY_NAMES[val] ?? val
  return ''
}

// ---------------------------------------------------------------------------
// Pax8 auto-procurement helper
// ---------------------------------------------------------------------------

interface Pax8AutoProcureResult {
  success: boolean
  pax8CompanyId?: string
  subscriptionId?: string
  previousQuantity?: number
  newQuantity?: number
  error?: string
}

/**
 * Poll Microsoft Graph to confirm that a license SKU has available seats.
 * Uses exponential backoff: 15s, 30s, 45s, 60s, 60s, 60s... up to maxWaitMs.
 * Returns true if seats become available within the timeout.
 */
async function pollForLicenseAvailability(
  checkAvailability: () => Promise<{ available: number } | null>,
  maxWaitMs: number = 300_000, // 5 minutes
): Promise<boolean> {
  const startTime = Date.now()
  const intervals = [15_000, 30_000, 45_000, 60_000] // escalating intervals, then 60s repeating
  let attempt = 0

  while (Date.now() - startTime < maxWaitMs) {
    const waitMs = intervals[Math.min(attempt, intervals.length - 1)]
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    attempt++

    try {
      const result = await checkAvailability()
      if (result && result.available > 0) {
        console.log(`[hr/process] License available after ${attempt} poll(s) (${Math.round((Date.now() - startTime) / 1000)}s)`)
        return true
      }
    } catch (err) {
      console.warn(`[hr/process] License poll attempt ${attempt} failed:`, err)
    }
  }

  console.warn(`[hr/process] License availability polling timed out after ${Math.round(maxWaitMs / 1000)}s (${attempt} attempts)`)
  return false
}

/**
 * Attempt to auto-procure a license seat via Pax8 when no seats are available.
 * Finds the Pax8 company by name match, looks up the matching subscription for
 * the M365 SKU, and increments it by 1 seat.
 *
 * After Pax8 confirms the seat increase, polls Microsoft Graph for up to 5 minutes
 * to confirm the license is actually available before returning success.
 *
 * @param checkLicenseAvailability - callback that checks Graph API for available seats
 */
async function tryPax8AutoProcure(
  companyName: string,
  skuPartNumber: string,
  checkLicenseAvailability?: () => Promise<{ available: number } | null>,
): Promise<Pax8AutoProcureResult> {
  // Check if Pax8 is configured
  if (!process.env.PAX8_CLIENT_ID || !process.env.PAX8_CLIENT_SECRET) {
    return { success: false, error: 'Pax8 credentials not configured' }
  }

  // Check if this SKU has a known Pax8 product mapping
  if (!SKU_TO_PAX8_PRODUCT[skuPartNumber.toUpperCase()]) {
    return { success: false, error: `No Pax8 product mapping for SKU "${skuPartNumber}"` }
  }

  try {
    // Find the Pax8 company by name match
    const pax8Companies = await pax8.getCompanies()
    const normalizedName = companyName.toLowerCase().trim()
    const pax8Company = pax8Companies.find(
      (c: Pax8Company) => c.name.toLowerCase().trim() === normalizedName
    ) ?? pax8Companies.find(
      (c: Pax8Company) => normalizedName.includes(c.name.toLowerCase().trim())
        || c.name.toLowerCase().trim().includes(normalizedName)
    )

    if (!pax8Company) {
      return { success: false, error: `No matching Pax8 company found for "${companyName}"` }
    }

    // Find the matching subscription for this SKU
    const subscription: Pax8Subscription | null = await pax8.findSubscriptionForSku(
      pax8Company.id,
      skuPartNumber
    )

    if (!subscription) {
      return {
        success: false,
        pax8CompanyId: pax8Company.id,
        error: `No active Pax8 subscription found matching SKU "${skuPartNumber}" for company "${pax8Company.name}"`,
      }
    }

    // Add 1 seat via Pax8
    const previousQuantity = subscription.quantity
    const newQuantity = await pax8.addSeats(
      subscription.id,
      previousQuantity,
      1,
    )

    // Poll Microsoft Graph to confirm the license is actually available
    // Pax8 → Microsoft provisioning can take several minutes
    if (checkLicenseAvailability) {
      console.log(`[hr/process] Pax8 seat added for ${skuPartNumber}. Polling Graph API for license availability...`)
      const licenseReady = await pollForLicenseAvailability(checkLicenseAvailability)

      if (!licenseReady) {
        return {
          success: false,
          pax8CompanyId: pax8Company.id,
          subscriptionId: subscription.id,
          previousQuantity,
          newQuantity,
          error: `Pax8 seat added (${previousQuantity} → ${newQuantity}) but Microsoft license not available after 5 min polling. License assignment may still succeed if retried later.`,
        }
      }
    } else {
      // No Graph client available — fall back to a 30s static wait
      await new Promise((resolve) => setTimeout(resolve, 30_000))
    }

    return {
      success: true,
      pax8CompanyId: pax8Company.id,
      subscriptionId: subscription.id,
      previousQuantity,
      newQuantity,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Pax8 auto-procure failed: ${msg}` }
  }
}

/** Metadata for a custom question — loaded from DB to render in ticket description */
interface CustomQuestionMeta {
  label: string
  sectionTitle: string
  type: string
  staticOptions?: Array<{ value: string; label: string }>
}

/** Lookup table: group/list/site ID → display name. Populated before description is built. */
type DisplayNameMap = Record<string, string>

function formatAnswersAsDescription(
  type: string,
  answers: Record<string, unknown>,
  submitterName?: string | null,
  submitterEmail?: string | null,
  displayNames?: DisplayNameMap,
  customQuestionsMeta?: Record<string, CustomQuestionMeta>,
): string {
  const lines: string[] = []
  const a = answers as Record<string, string>

  // Helper to display array or string values, resolving IDs to display names
  const dn = displayNames ?? {}
  const fmtArray = (val: unknown): string => {
    if (Array.isArray(val)) return val.map(v => dn[v as string] ?? v).join(', ')
    if (typeof val === 'string') return dn[val] ?? val
    return ''
  }

  if (type === 'onboarding') {
    lines.push('=== EMPLOYEE ONBOARDING REQUEST ===', '')
    if (submitterName) lines.push(`Requested by: ${submitterName}`)
    if (submitterEmail) lines.push(`Requester email: ${submitterEmail}`)
    lines.push('')
    lines.push('EMPLOYEE DETAILS')
    lines.push(`  Name:           ${a.first_name ?? ''} ${a.last_name ?? ''}`.trimEnd())
    if (a.start_date)      lines.push(`  Start Date:     ${a.start_date}`)
    if (a.job_title)       lines.push(`  Job Title:      ${a.job_title}`)
    if (a.department)      lines.push(`  Department:     ${a.department}`)
    const countries = resolveCountries(answers.work_country)
    if (countries)         lines.push(`  Work Countries: ${countries}`)
    if (a.work_location_detail || a.work_location) {
      const locLabel = resolveLabel('work_location_detail', a.work_location_detail || a.work_location)
      lines.push(`  Work Location:  ${locLabel}`)
    }
    if (a.desired_username) lines.push(`  Desired User:   ${a.desired_username}`)
    if (a.personal_email)  lines.push(`  Personal Email: ${a.personal_email}`)
    if (a.phone)           lines.push(`  Phone:          ${a.phone}`)

    lines.push('', 'MICROSOFT 365 SETUP')
    if (a.access_profile)  lines.push(`  Access Profile: ${a.access_profile}`)
    if (a.license_type) {
      const licLabel = dn[a.license_type] ?? a.license_type
      lines.push(`  License Type:   ${licLabel}`)
    }
    // New schema uses separate multi_select fields for groups
    const secGroups = fmtArray(answers.security_groups)
    const distLists = fmtArray(answers.distribution_lists)
    const teams = fmtArray(answers.teams_groups)
    const spSites = fmtArray(answers.sharepoint_sites)
    if (secGroups)   lines.push(`  Security Groups:  ${secGroups}`)
    if (distLists)   lines.push(`  Distro Lists:     ${distLists}`)
    if (teams)       lines.push(`  Teams:            ${teams}`)
    if (spSites)     lines.push(`  SharePoint Sites: ${spSites}`)
    // Legacy combined field
    if (a.groups_to_add)   lines.push(`  Groups/Teams:   ${a.groups_to_add}`)
    if (a.clone_permissions === 'yes') {
      lines.push(`  Clone From:     ${a.clone_from_user ?? 'Not specified'}`)
    }
    if (a.credential_delivery) {
      const cdLabel = resolveLabel('credential_delivery', a.credential_delivery)
      lines.push(`  Credential Delivery: ${cdLabel}`)
    }

    // Computer & device setup
    if (a.computer_situation) {
      lines.push('', 'COMPUTER & DEVICE SETUP')
      if (a.computer_situation === 'existing_company') {
        lines.push(`  Setup Type:     Existing company computer`)
        if (a.existing_device) lines.push(`  Device:         ${a.existing_device}`)
      } else if (a.computer_situation === 'new_computer') {
        lines.push(`  Setup Type:     *** NEW COMPUTER REQUIRED ***`)
        lines.push(`  Action:         Sales quote needed — routed to Sales queue`)
        // Legacy fields (may still be present from older submissions)
        if (a.new_computer_type === 'custom_quote') {
          lines.push(`  Quote Type:     Custom — sales team to create quote`)
        } else if (a.new_computer_type === 'standard') {
          const specs = fmtArray(answers.computer_spec)
          if (specs) lines.push(`  Equipment:      ${specs}`)
        }
      } else if (a.computer_situation === 'personal_byod') {
        lines.push(`  Setup Type:     BYOD / personal computer (work from home)`)
      } else if (a.computer_situation === 'dont_know') {
        lines.push(`  Setup Type:     Unknown — manager needs to confirm computer situation`)
      } else if (a.computer_situation === 'none') {
        lines.push(`  Setup Type:     No computer needed`)
      }
    }

    if (a.additional_notes) lines.push('', `NOTES\n  ${a.additional_notes}`)
  } else {
    lines.push('=== EMPLOYEE OFFBOARDING REQUEST ===', '')
    if (submitterName) lines.push(`Requested by: ${submitterName}`)
    if (submitterEmail) lines.push(`Requester email: ${submitterEmail}`)
    lines.push('')
    lines.push('EMPLOYEE DETAILS')
    lines.push(`  Name:           ${a.first_name ?? ''} ${a.last_name ?? ''}`.trimEnd())
    if (a.work_email || a.employee_to_offboard) lines.push(`  Work Email:     ${a.work_email ?? a.employee_to_offboard}`)
    if (a.last_day)        lines.push(`  Last Day:       ${a.last_day}`)

    lines.push('', 'URGENCY & TIMELINE')
    if (a.urgency_type)    lines.push(`  Urgency:        ${resolveLabel('urgency_type', a.urgency_type)}`)

    lines.push('', 'DATA & EMAIL HANDLING')
    if (a.data_handling)      lines.push(`  Data Handling:  ${resolveLabel('data_handling', a.data_handling)}`)
    if (a.forward_email_to)   lines.push(`  Forward To:     ${a.forward_email_to}`)
    const sharedAccess = fmtArray(answers.shared_mailbox_access)
    if (sharedAccess)         lines.push(`  Shared Mailbox Access: ${sharedAccess}`)
    if (a.delegate_access_to) lines.push(`  Delegate To:    ${a.delegate_access_to}`)
    // Legacy fields
    if (a.account_action)  lines.push(`  Action:         ${a.account_action}`)
    if (a.forward_email)   lines.push(`  Forward To:     ${a.forward_email}`)
    if (a.delegate_access) lines.push(`  Delegate To:    ${a.delegate_access}`)

    lines.push('', 'FILE HANDLING')
    if (a.file_handling)      lines.push(`  File Action:    ${resolveLabel('file_handling', a.file_handling)}`)
    if (a.transfer_files_to)  lines.push(`  Transfer To:    ${a.transfer_files_to}`)
    // Legacy fields
    if (a.transfer_onedrive_to) lines.push(`  Transfer OneDrive To: ${a.transfer_onedrive_to}`)
    if (a.onedrive_archive)   lines.push(`  OneDrive Archive: ${a.onedrive_archive}`)

    lines.push('', 'ACCESS & GROUPS')
    lines.push('  Remove from all groups/distro lists: Yes (automatic)')

    lines.push('', 'DEVICE HANDLING')
    if (a.device_handling) lines.push(`  Device:         ${resolveLabel('device_handling', a.device_handling)}`)

    if (a.additional_notes) lines.push('', `ADDITIONAL NOTES & OTHER SYSTEMS\n  ${a.additional_notes}`)
  }

  // Render custom question answers that weren't handled by the hardcoded sections above
  const knownKeys = new Set([
    // Onboarding
    'first_name', 'last_name', 'start_date', 'job_title', 'department',
    'work_country', 'work_location', 'work_location_detail', 'desired_username',
    'personal_email', 'phone', 'access_profile', 'license_type',
    'security_groups', 'distribution_lists', 'teams_groups', 'sharepoint_sites',
    'groups_to_add', 'clone_permissions', 'clone_from_user', 'credential_delivery',
    'computer_situation', 'existing_device', 'new_computer_type', 'computer_spec',
    'additional_notes', 'billing_acknowledgment',
    // Offboarding
    'work_email', 'employee_to_offboard', 'last_day', 'urgency_type',
    'data_handling', 'forward_email_to', 'shared_mailbox_access', 'delegate_access_to',
    'account_action', 'forward_email', 'delegate_access',
    'file_handling', 'transfer_files_to', 'transfer_onedrive_to', 'onedrive_archive',
    'device_handling',
    // Internal / meta
    'submitted_by_email', 'submitted_by_name',
  ])

  const customAnswers = Object.entries(answers).filter(
    ([key, val]) => !knownKeys.has(key) && val !== undefined && val !== null && val !== ''
  )

  if (customAnswers.length > 0 && customQuestionsMeta) {
    // Group by section title
    const sectionGroups: Record<string, Array<{ key: string; label: string; value: unknown }>> = {}
    const ungrouped: Array<{ key: string; label: string; value: unknown }> = []

    for (const [key, value] of customAnswers) {
      const meta = customQuestionsMeta[key]
      if (meta) {
        const section = meta.sectionTitle || 'Other'
        if (!sectionGroups[section]) sectionGroups[section] = []
        sectionGroups[section].push({ key, label: meta.label, value })
      } else {
        // Unknown custom key — still include with humanized label
        const label = key.replace(/^custom_q_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        ungrouped.push({ key, label, value })
      }
    }

    const formatValue = (meta: CustomQuestionMeta | undefined, val: unknown): string => {
      // Resolve static option values to labels
      if (meta?.staticOptions && typeof val === 'string') {
        const opt = meta.staticOptions.find(o => o.value === val)
        if (opt) return opt.label
      }
      if (meta?.staticOptions && Array.isArray(val)) {
        return (val as string[]).map(v => {
          const opt = meta.staticOptions!.find(o => o.value === v)
          return opt ? opt.label : v
        }).join(', ')
      }
      if (Array.isArray(val)) return val.map(v => dn[v as string] ?? v).join(', ')
      if (typeof val === 'boolean') return val ? 'Yes' : 'No'
      if (typeof val === 'string') return dn[val] ?? val
      return String(val)
    }

    for (const [sectionTitle, items] of Object.entries(sectionGroups)) {
      lines.push('', sectionTitle.toUpperCase())
      for (const item of items) {
        const displayVal = formatValue(customQuestionsMeta[item.key], item.value)
        lines.push(`  ${item.label}: ${displayVal}`)
      }
    }

    if (ungrouped.length > 0) {
      lines.push('', 'ADDITIONAL INFORMATION')
      for (const item of ungrouped) {
        const displayVal = formatValue(undefined, item.value)
        lines.push(`  ${item.label}: ${displayVal}`)
      }
    }
  } else if (customAnswers.length > 0) {
    // No metadata available — still render custom answers with humanized keys
    lines.push('', 'ADDITIONAL INFORMATION')
    for (const [key, value] of customAnswers) {
      const label = key.replace(/^custom_q_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const displayVal = Array.isArray(value)
        ? (value as string[]).map(v => dn[v as string] ?? v).join(', ')
        : typeof value === 'boolean' ? (value ? 'Yes' : 'No')
        : String(value)
      lines.push(`  ${label}: ${displayVal}`)
    }
  }

  return lines.join('\n')
}

function buildTicketTitle(type: string, answers: Record<string, unknown>): string {
  const a = answers as Record<string, string>
  const firstName = (a.first_name ?? '').trim()
  const lastName = (a.last_name ?? '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (type === 'onboarding') {
    return `[ONBOARDING] New Employee: ${fullName}`
  }
  // Offboarding: use fullName if available, fall back to work email / UPN
  const displayName = fullName || a.work_email || a.employee_to_offboard || 'Unknown'
  return `[OFFBOARDING] Employee Termination: ${displayName}`
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Check if a date string (YYYY-MM-DD) is in the future relative to today in EST */
function isDateInFuture(dateStr: string): boolean {
  if (!dateStr) return false
  // Get today's date in EST/EDT
  const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const todayEst = estNow.toISOString().slice(0, 10)
  return dateStr > todayEst
}

/** Format a date for display: "Wednesday, March 25, 2026" */
function formatDateDisplay(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })
  } catch {
    return dateStr
  }
}

/** Generate a 16-character temporary password: mixed case + digits + specials */
function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%&*'
  const all = upper + lower + digits + special

  // Ensure at least one from each class
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
  const required = [pick(upper), pick(lower), pick(digits), pick(special)]

  const remaining = Array.from({ length: 12 }, () => pick(all))
  const combined = [...required, ...remaining]

  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[combined[i], combined[j]] = [combined[j], combined[i]]
  }
  return combined.join('')
}

/** Derive the primary email domain from existing tenant users (skip .onmicrosoft.com) */
function deriveDomainFromUsers(upns: string[]): string | null {
  for (const upn of upns) {
    const domain = upn.split('@')[1]
    if (domain && !domain.endsWith('.onmicrosoft.com')) {
      return domain
    }
  }
  return null
}

/** Describe a group for display purposes */
function describeGroup(g: GraphGroup): string {
  if (g.groupTypes?.includes('Unified')) return `${g.displayName} (Microsoft 365 group)`
  if (g.mailEnabled && !g.securityEnabled) return `${g.displayName} (distribution list)`
  if (g.securityEnabled) return `${g.displayName} (security group)`
  return g.displayName
}

// ---------------------------------------------------------------------------
// Step logger helper
// ---------------------------------------------------------------------------

async function logStep(
  pgClient: import('pg').PoolClient,
  requestId: string,
  stepKey: string,
  stepName: string,
  status: 'completed' | 'failed',
  startedAt: Date,
  input?: unknown,
  output?: unknown,
  error?: string,
) {
  await pgClient.query(
    `INSERT INTO hr_request_steps
       (request_id, step_key, step_name, status, attempt, input, output, error, started_at, completed_at, created_at)
     VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, NOW())`,
    [
      requestId,
      stepKey,
      stepName,
      status,
      input ? JSON.stringify(input) : null,
      output ? JSON.stringify(output) : null,
      error ? JSON.stringify({ message: error }) : null,
      startedAt,
      new Date(),
    ]
  )
}

// ---------------------------------------------------------------------------
// POST /api/hr/process
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Validate internal secret — optional if env var not set
  const expectedSecret = process.env.INTERNAL_SECRET ?? ''
  if (expectedSecret) {
    const providedSecret = request.headers.get('x-internal-secret') ?? ''
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    console.warn('[hr/process] INTERNAL_SECRET not set — skipping auth check')
  }

  // 2. Parse body
  let body: ProcessRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // 3. Load the HR request with company join
    const reqResult = await client.query(
      `SELECT
         r.id, r.company_id, r.company_slug, r.type, r.status,
         r.submitted_by_email, r.submitted_by_name, r.answers,
         r.autotask_ticket_id, r.autotask_ticket_number,
         r.target_upn, r.target_user_id, r.idempotency_key,
         r.error_message, r.retry_count,
         r.started_at, r.completed_at, r.created_at, r.updated_at,
         r.resolved_action_plan,
         c."autotaskCompanyId", c."displayName"
       FROM hr_requests r
       JOIN companies c ON c.id = r.company_id
       WHERE r.id = $1`,
      [body.requestId]
    )

    if (reqResult.rows.length === 0) {
      return NextResponse.json({ error: 'HR request not found' }, { status: 404 })
    }

    const hrRequest = reqResult.rows[0]

    // 4. Guard against re-processing
    if (hrRequest.status === 'completed' || hrRequest.status === 'running') {
      return NextResponse.json(
        { message: `Request already in state: ${hrRequest.status}` },
        { status: 200 }
      )
    }
    // Allow scheduled requests to be re-processed only when cron triggers them
    if (hrRequest.status === 'scheduled' && !body.executeScheduled) {
      return NextResponse.json(
        { message: 'Request is scheduled — will be processed on the last working day' },
        { status: 200 }
      )
    }

    // 5. Update status to running
    await client.query(
      `UPDATE hr_requests SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [hrRequest.id]
    )

    const answers = (typeof hrRequest.answers === 'string' ? JSON.parse(hrRequest.answers) : hrRequest.answers) as Record<string, unknown>
    const a = answers as Record<string, string>
    const baseUrl = getAutotaskBaseUrl()
    const autotaskHeaders = getAutotaskHeaders()
    const firstName = (a.first_name ?? '').trim()
    const lastName = (a.last_name ?? '').trim()
    let fullName = [firstName, lastName].filter(Boolean).join(' ')

    // autotaskCompanyId is stored as String? — Autotask REST expects an integer
    const rawCompanyId = hrRequest.autotaskCompanyId
    const autotaskCompanyId: number = rawCompanyId ? parseInt(rawCompanyId, 10) : 0

    if (!rawCompanyId || isNaN(autotaskCompanyId)) {
      await client.query(
        `UPDATE hr_requests
         SET status = 'failed',
             error_message = $2,
             retry_count = COALESCE(retry_count, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [hrRequest.id, `Company "${hrRequest.displayName}" has no Autotask Company ID configured`]
      )
      return NextResponse.json(
        { error: 'Company has no Autotask Company ID configured' },
        { status: 422 }
      )
    }

    // Instantiate AutotaskClient for notes
    let autotask: AutotaskClient | null = null
    try {
      autotask = new AutotaskClient()
    } catch (err) {
      console.warn('[hr/process] AutotaskClient init failed (notes will be skipped):', err instanceof Error ? err.message : err)
    }

    // -----------------------------------------------------------------
    // Look up requester's Autotask contact ID (best-effort)
    // -----------------------------------------------------------------
    let requesterContactId: number | undefined
    if (autotask && hrRequest.submitted_by_email) {
      try {
        const contacts = await autotask.getContactsByCompany(autotaskCompanyId)
        const match = contacts.find(
          (c) => c.emailAddress?.toLowerCase() === hrRequest.submitted_by_email.toLowerCase()
        )
        if (match) requesterContactId = match.id
      } catch (err) {
        console.warn('[hr/process] Could not look up requester contact:', err instanceof Error ? err.message : err)
      }
    }

    // -----------------------------------------------------------------
    // PRE-STEP: Resolve display names for group IDs and license SKUs
    // -----------------------------------------------------------------
    const displayNames: DisplayNameMap = {}
    try {
      const creds = hrRequest.company_slug
        ? await getTenantCredentialsBySlug(hrRequest.company_slug)
        : null
      if (creds) {
        const graph = createGraphClient(creds)

        // Resolve license SKU display name
        if (a.license_type) {
          try {
            const sku = await graph.getLicenseSkuByPartNumber(a.license_type)
            if (sku?.displayName) displayNames[a.license_type] = sku.displayName
          } catch { /* use raw name */ }
        }

        // Resolve group/list/team/site IDs to display names
        const allIds: string[] = []
        for (const field of ['security_groups', 'distribution_lists', 'teams_groups', 'sharepoint_sites']) {
          const val = answers[field]
          if (Array.isArray(val)) allIds.push(...(val as string[]))
        }
        if (allIds.length > 0) {
          // Fetch all groups to build an ID→name map
          try {
            const [securityGroups, distLists, m365Groups, spSites] = await Promise.allSettled([
              graph.getSecurityGroups(),
              graph.getDistributionLists(),
              graph.getM365Groups(),
              graph.getSharePointSites(),
            ])
            const allItems: Array<{ id?: string; displayName?: string }> = []
            if (securityGroups.status === 'fulfilled') allItems.push(...(securityGroups.value as Array<{ id?: string; displayName?: string }>))
            if (distLists.status === 'fulfilled') allItems.push(...(distLists.value as Array<{ id?: string; displayName?: string }>))
            if (m365Groups.status === 'fulfilled') allItems.push(...(m365Groups.value as Array<{ id?: string; displayName?: string }>))
            if (spSites.status === 'fulfilled') {
              for (const site of spSites.value as Array<{ id?: string; displayName?: string }>) {
                if (site.id && site.displayName) allItems.push(site)
              }
            }
            for (const item of allItems) {
              if (item.id && item.displayName) {
                displayNames[item.id] = item.displayName
              }
            }
          } catch (err) {
            console.warn('[hr/process] Could not resolve group display names:', err instanceof Error ? err.message : err)
          }
        }
      }
    } catch (err) {
      console.warn('[hr/process] Display name resolution failed (non-fatal):', err instanceof Error ? err.message : err)
    }

    // -----------------------------------------------------------------
    // PRE-STEP: Load custom question metadata for ticket description
    // -----------------------------------------------------------------
    const customQuestionsMeta: Record<string, CustomQuestionMeta> = {}
    try {
      const configResult = await client.query(
        `SELECT id FROM customer_form_configs WHERE company_id = $1 AND type = $2 LIMIT 1`,
        [hrRequest.company_id, hrRequest.type]
      )
      if (configResult.rows.length > 0) {
        const configId = configResult.rows[0].id
        // Load custom sections for title lookup
        const sectionsResult = await client.query(
          `SELECT key, title FROM customer_custom_sections WHERE config_id = $1 AND is_enabled = true`,
          [configId]
        )
        const sectionTitles: Record<string, string> = {}
        for (const row of sectionsResult.rows) {
          sectionTitles[row.key] = row.title
        }
        // Load custom questions with their labels and section assignments
        const questionsResult = await client.query(
          `SELECT key, label, type, section_key, static_options FROM customer_custom_questions WHERE config_id = $1 AND is_enabled = true`,
          [configId]
        )
        for (const row of questionsResult.rows) {
          const sectionTitle = sectionTitles[row.section_key] ?? row.section_key
          const staticOpts = row.static_options
            ? (typeof row.static_options === 'string' ? JSON.parse(row.static_options) : row.static_options)
            : undefined
          customQuestionsMeta[row.key] = {
            label: row.label,
            sectionTitle,
            type: row.type,
            staticOptions: staticOpts,
          }
        }
      }
    } catch (err) {
      console.warn('[hr/process] Failed to load custom question metadata (non-fatal):', err instanceof Error ? err.message : err)
    }

    // -----------------------------------------------------------------
    // STEP 1: Create Autotask Ticket
    // -----------------------------------------------------------------

    const ticketStepStart = new Date()
    const originalDescription = formatAnswersAsDescription(
      hrRequest.type, answers, hrRequest.submitted_by_name, hrRequest.submitted_by_email, displayNames, customQuestionsMeta
    )

    // Determine if ticket needs Sales queue (new computer required)
    const needsNewComputer = hrRequest.type === 'onboarding' && a.computer_situation === 'new_computer'
    const salesQueueId = process.env.AUTOTASK_SALES_QUEUE_ID
      ? parseInt(process.env.AUTOTASK_SALES_QUEUE_ID, 10)
      : undefined

    const ticketPayload: AutotaskTicketPayload = {
      CompanyID: autotaskCompanyId,
      Title: buildTicketTitle(hrRequest.type, answers),
      Description: originalDescription,
      Status: 1,   // New
      Priority: 2, // Medium
      ...(requesterContactId ? { ContactID: requesterContactId } : {}),
      ...(needsNewComputer && salesQueueId ? { QueueID: salesQueueId } : {}),
    }

    let ticketId: number | null = null
    let ticketNumber: string | null = null
    let ticketStepError: string | null = null

    try {
      const ticketRes = await fetch(`${baseUrl}/V1.0/Tickets`, {
        method: 'POST',
        headers: autotaskHeaders,
        body: JSON.stringify(ticketPayload),
      })

      if (!ticketRes.ok) {
        const errText = await ticketRes.text()
        throw new Error(`Autotask ticket creation failed (${ticketRes.status}): ${errText}`)
      }

      const ticketData = (await ticketRes.json()) as AutotaskTicketResponse

      if (ticketData?.itemId) {
        ticketId = ticketData.itemId
        ticketNumber = null
      } else if (ticketData?.item?.id) {
        ticketId = ticketData.item.id
        ticketNumber = ticketData.item.ticketNumber ?? null
      } else {
        throw new Error(`Unexpected Autotask response shape: ${JSON.stringify(ticketData)}`)
      }

      // Fetch the ticket to get the ticketNumber if we don't have it
      if (ticketId && !ticketNumber) {
        try {
          const getRes = await fetch(`${baseUrl}/V1.0/Tickets/${ticketId}`, {
            method: 'GET',
            headers: autotaskHeaders,
          })
          if (getRes.ok) {
            const getData = await getRes.json()
            ticketNumber = getData?.item?.ticketNumber ?? `T${ticketId}`
          }
        } catch {
          ticketNumber = `T${ticketId}`
        }
      }
    } catch (err) {
      ticketStepError = err instanceof Error ? err.message : String(err)
    }

    await logStep(client, hrRequest.id, 'create_ticket', 'Create Autotask Ticket',
      ticketStepError ? 'failed' : 'completed', ticketStepStart,
      { payload: ticketPayload },
      ticketId ? { ticketId, ticketNumber } : undefined,
      ticketStepError ?? undefined)

    if (ticketStepError || ticketId === null) {
      await client.query(
        `UPDATE hr_requests
         SET status = 'failed',
             error_message = $2,
             retry_count = COALESCE(retry_count, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [hrRequest.id, ticketStepError ?? 'Ticket creation returned no ID']
      )

      await client.query(
        `INSERT INTO hr_audit_logs
           (company_id, request_id, actor, action, resource, details, severity, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
        [
          hrRequest.company_id,
          hrRequest.id,
          'system',
          'request_failed',
          `hr_request:${hrRequest.id}`,
          JSON.stringify({ step: 'create_ticket', error: ticketStepError ?? undefined }),
          'error',
        ]
      )

      return NextResponse.json(
        { error: 'Failed to create Autotask ticket', details: ticketStepError },
        { status: 500 }
      )
    }

    // Persist ticketId and ticketNumber
    await client.query(
      `UPDATE hr_requests
       SET autotask_ticket_id = $2,
           autotask_ticket_number = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [hrRequest.id, ticketId, ticketNumber]
    )

    // Add internal note if ticket was routed to Sales queue
    if (needsNewComputer) {
      const queueNote = salesQueueId
        ? 'This ticket has been routed to the Sales queue because a new computer is required. Please create a quote and coordinate hardware procurement.'
        : 'NOTE: New computer required but AUTOTASK_SALES_QUEUE_ID is not configured — ticket was created in the default queue. Please move to the Sales queue manually.'
      if (autotask && ticketId) {
        try {
          await autotask.createTicketNote(ticketId, {
            title: 'New Computer Required — Sales Queue',
            description: queueNote,
            noteType: 1,
            publish: 2, // internal only
          })
        } catch (err) {
          console.warn('[hr/process] Failed to add sales queue note:', err instanceof Error ? err.message : err)
        }
      }
    }

    // -----------------------------------------------------------------
    // STEP 2: Add 30-minute time entry to the ticket
    // -----------------------------------------------------------------

    const timeStepStart = new Date()
    const resourceId = parseInt(process.env.AUTOTASK_DEFAULT_RESOURCE_ID ?? '0', 10)
    let timeStepError: string | null = null

    const isOffboarding = hrRequest.type === 'offboarding'
    const hoursWorked = isOffboarding ? 1.0 : 0.5

    const timeEntryPayload = {
      ticketID: ticketId,
      resourceID: resourceId,
      dateWorked: todayIsoDate(),
      hoursWorked,
      summaryNotes: `HR ${hrRequest.type} for ${fullName || 'employee'} - setup and documentation`,
    }

    try {
      const timeRes = await fetch(`${baseUrl}/V1.0/TimeEntries`, {
        method: 'POST',
        headers: autotaskHeaders,
        body: JSON.stringify(timeEntryPayload),
      })

      if (!timeRes.ok) {
        const errText = await timeRes.text()
        throw new Error(`Autotask time entry failed (${timeRes.status}): ${errText}`)
      }
    } catch (err) {
      timeStepError = err instanceof Error ? err.message : String(err)
      console.error('[hr/process] Time entry failed (non-fatal):', timeStepError)
    }

    await logStep(client, hrRequest.id, 'add_time_entry', `Add Time Entry (${isOffboarding ? '1 hr' : '30 min'})`,
      timeStepError ? 'failed' : 'completed', timeStepStart,
      { payload: timeEntryPayload },
      timeStepError ? undefined : { hoursWorked },
      timeStepError ?? undefined)

    // -----------------------------------------------------------------
    // STEP 3: M365 Provisioning Pipeline
    // -----------------------------------------------------------------

    const stepsCompleted: string[] = ['create_ticket']
    if (!timeStepError) stepsCompleted.push('add_time_entry')

    // Track overall provisioning outcome
    let primaryActionSucceeded = false
    const provisioningResults: string[] = []
    const failedSteps: string[] = []
    const manualSteps: string[] = []

    // Convenience to add an Autotask note (non-fatal if it fails)
    const addTicketNote = async (title: string, description: string, publish: 1 | 2 = 2) => {
      if (!autotask || !ticketId) return
      try {
        await autotask.createTicketNote(ticketId, {
          title,
          description,
          noteType: 1,
          publish,
        })
      } catch (err) {
        console.warn(`[hr/process] Failed to add ticket note "${title}":`, err instanceof Error ? err.message : err)
      }
    }

    if (hrRequest.type === 'onboarding') {
      // =============================================================
      // ONBOARDING PIPELINE
      // =============================================================

      // Check if this is a future-dated onboarding
      const startDate = a.start_date
      const isFutureStart = startDate ? isDateInFuture(startDate) : false
      const isScheduledOnboardingRun = body.executeScheduled === true

      // Load M365 credentials
      const creds = hrRequest.company_slug
        ? await getTenantCredentialsBySlug(hrRequest.company_slug)
        : null

      if (!creds) {
        const msg = `No M365 credentials configured for company slug "${hrRequest.company_slug}"`
        console.error('[hr/process]', msg)
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'failed', new Date(), undefined, undefined, msg)
        failedSteps.push('load_m365_creds')
      } else {
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'completed', new Date(), undefined, { tenantId: creds.tenantId })
        stepsCompleted.push('load_m365_creds')

        const graph = createGraphClient(creds)

        // --- Generate UPN ---
        const firstName = (a.first_name ?? '').toLowerCase().replace(/[^a-z]/g, '')
        const lastName = (a.last_name ?? '').toLowerCase().replace(/[^a-z]/g, '')
        // Use desired_username if provided, otherwise fallback to firstname.lastname
        let mailNickname: string
        if (a.desired_username && a.desired_username.trim()) {
          // Strip domain if user typed full email
          mailNickname = a.desired_username.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9.]/g, '')
        } else {
          mailNickname = `${firstName}.${lastName}`
        }

        // Derive domain from existing users
        let domain: string | null = null
        try {
          const existingUsers = await graph.getUsers()
          domain = deriveDomainFromUsers(existingUsers.map((u) => u.userPrincipalName))
        } catch {
          console.warn('[hr/process] Could not list users to derive domain')
        }

        if (!domain) {
          const msg = 'Could not determine email domain from tenant users'
          await logStep(client, hrRequest.id, 'create_user', 'Create M365 User', 'failed', new Date(), undefined, undefined, msg)
          failedSteps.push('create_user')
          await addTicketNote('M365 User Creation Failed', msg)
        } else {
          const upn = `${mailNickname}@${domain}`
          const tempPassword = generateTempPassword()

          // Future-dated onboardings: create account locked (accountEnabled=false)
          // Account will be unlocked by cron on the start date
          const accountLocked = isFutureStart && !isScheduledOnboardingRun

          // --- Create M365 User ---
          const createStart = new Date()
          let newUserId: string | null = null
          try {
            // Resolve usageLocation: first element of multi_select work_country array, or string fallback
            const workCountry = answers.work_country
            let usageLocation = 'US'
            if (Array.isArray(workCountry) && workCountry.length > 0) {
              usageLocation = workCountry[0] as string
            } else if (typeof workCountry === 'string' && workCountry) {
              usageLocation = workCountry
            }

            const newUser = await graph.createUser({
              displayName: fullName,
              userPrincipalName: upn,
              mailNickname,
              password: tempPassword,
              jobTitle: a.job_title ?? undefined,
              department: a.department ?? undefined,
              usageLocation,
              accountEnabled: !accountLocked,
            })
            newUserId = newUser.id
            primaryActionSucceeded = true
            provisioningResults.push(`Work Email: ${upn}`)
            if (accountLocked) {
              provisioningResults.push(`Account Status: LOCKED — will be unlocked on ${formatDateDisplay(startDate)}`)
            }

            await logStep(client, hrRequest.id, 'create_user', 'Create M365 User', 'completed', createStart,
              { upn, displayName: fullName, accountLocked }, { userId: newUserId, upn, accountLocked })
            stepsCompleted.push('create_user')

            // Persist the UPN
            await client.query(
              `UPDATE hr_requests SET target_upn = $2, target_user_id = $3, updated_at = NOW() WHERE id = $1`,
              [hrRequest.id, upn, newUserId]
            )

            await addTicketNote('M365 Account Created', `UPN: ${upn}\nDisplay Name: ${fullName}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'create_user', 'Create M365 User', 'failed', createStart, { upn }, undefined, msg)
            failedSteps.push('create_user')
            await addTicketNote('M365 User Creation Failed', `UPN: ${upn}\nError: ${msg}`)
          }

          // --- Assign License (only if user was created) ---
          if (newUserId && a.license_type) {
            const licStart = new Date()
            try {
              const sku: GraphLicenseSku | null = await graph.getLicenseSkuByPartNumber(a.license_type)
              if (!sku) {
                throw new Error(`License SKU not found: ${a.license_type}`)
              }

              // Check license seat availability before assigning
              const availableSeats = sku.prepaidUnits.enabled - sku.consumedUnits
              let pax8Procured = false

              if (availableSeats <= 0) {
                // No seats available — try Pax8 auto-procurement
                const companyName = hrRequest.displayName || ''
                // Pass a Graph API callback so Pax8 procurement polls until the license is confirmed available
                const checkAvailability = async () => {
                  const freshSku = await graph.getLicenseSkuByPartNumber(sku.skuPartNumber)
                  if (!freshSku) return null
                  return { available: freshSku.prepaidUnits.enabled - freshSku.consumedUnits }
                }
                const procureResult = await tryPax8AutoProcure(companyName, sku.skuPartNumber, checkAvailability)

                if (procureResult.success) {
                  pax8Procured = true
                  await logStep(client, hrRequest.id, 'pax8_auto_procure', 'Pax8 Auto-Procure License', 'completed', new Date(),
                    { skuPartNumber: sku.skuPartNumber, company: companyName },
                    { subscriptionId: procureResult.subscriptionId, previousQuantity: procureResult.previousQuantity, newQuantity: procureResult.newQuantity })
                  await addTicketNote('License Auto-Procured via Pax8',
                    `No available seats for ${sku.displayName ?? sku.skuPartNumber}.\n` +
                    `Pax8 subscription ${procureResult.subscriptionId} increased from ${procureResult.previousQuantity} to ${procureResult.newQuantity} seat(s).\n` +
                    `License confirmed available via Microsoft Graph. Proceeding with assignment.`)
                } else {
                  // Pax8 procurement failed — log but still attempt assignment (it may fail)
                  console.warn(`[hr/process] Pax8 auto-procure failed for ${sku.skuPartNumber}: ${procureResult.error}`)
                  await logStep(client, hrRequest.id, 'pax8_auto_procure', 'Pax8 Auto-Procure License', 'failed', new Date(),
                    { skuPartNumber: sku.skuPartNumber, company: companyName }, undefined, procureResult.error)
                }
              }

              await graph.assignLicense(newUserId, sku.skuId)
              const licName = sku.displayName ?? sku.skuPartNumber
              const licNote = pax8Procured
                ? `License: ${licName} (auto-procured via Pax8)`
                : `License: ${licName}`
              provisioningResults.push(licNote)

              await logStep(client, hrRequest.id, 'assign_license', 'Assign License', 'completed', licStart,
                { skuPartNumber: a.license_type, pax8Procured }, { skuId: sku.skuId, displayName: licName })
              stepsCompleted.push('assign_license')
              await addTicketNote('License Assigned', `License: ${licName}\nSKU: ${sku.skuPartNumber}${pax8Procured ? '\n(Seat auto-procured via Pax8)' : ''}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'assign_license', 'Assign License', 'failed', licStart, { skuPartNumber: a.license_type }, undefined, msg)
              failedSteps.push('assign_license')
              await addTicketNote('License Assignment Failed', `SKU: ${a.license_type}\nError: ${msg}`)
            }
          }

          // --- Add to groups (from schema multi_select fields OR legacy groups_to_add) ---
          const groupsAdded: string[] = []

          // Collect group IDs (not SharePoint sites — those need different handling)
          const allGroupIds: string[] = []
          const sharePointSiteIds: string[] = []

          // New schema: separate multi_select fields
          for (const field of ['security_groups', 'distribution_lists', 'teams_groups']) {
            const fieldVal = answers[field]
            if (Array.isArray(fieldVal)) {
              allGroupIds.push(...(fieldVal as string[]))
            }
          }
          // SharePoint sites are NOT groups — can't be added via /groups/{id}/members
          const spVal = answers.sharepoint_sites
          if (Array.isArray(spVal)) {
            sharePointSiteIds.push(...(spVal as string[]))
          }

          // Legacy: groups_to_add (JSON array or comma-separated)
          if (allGroupIds.length === 0 && !sharePointSiteIds.length && a.groups_to_add) {
            try {
              const parsed = JSON.parse(a.groups_to_add) as string[]
              allGroupIds.push(...parsed)
            } catch {
              allGroupIds.push(...a.groups_to_add.split(',').map((s) => s.trim()).filter(Boolean))
            }
          }

          if (newUserId && allGroupIds.length > 0) {
            for (const groupId of allGroupIds) {
              const groupName = displayNames[groupId] ?? groupId
              const gStart = new Date()
              try {
                await graph.addUserToGroup(groupId, newUserId)
                groupsAdded.push(groupId)
                await logStep(client, hrRequest.id, `add_to_group_${groupId}`, `Add to Group: ${groupName}`, 'completed', gStart,
                  { groupId, groupName, userId: newUserId }, { added: true })
                stepsCompleted.push(`add_to_group_${groupId}`)
                await addTicketNote('Added to Group', `Group: ${groupName}`)
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                // "already exist" means user is already a member — treat as success
                if (msg.includes('already exist')) {
                  groupsAdded.push(groupId)
                  await logStep(client, hrRequest.id, `add_to_group_${groupId}`, `Add to Group: ${groupName}`, 'completed', gStart,
                    { groupId, groupName, userId: newUserId }, { added: true, alreadyMember: true })
                  stepsCompleted.push(`add_to_group_${groupId}`)
                  await addTicketNote('Added to Group', `Group: ${groupName} (already a member)`)
                } else {
                  await logStep(client, hrRequest.id, `add_to_group_${groupId}`, `Add to Group: ${groupName}`, 'failed', gStart,
                    { groupId, groupName, userId: newUserId }, undefined, msg)
                  failedSteps.push(`add_to_group_${groupId}`)
                  await addTicketNote('Group Add Failed', `Group: ${groupName}\nError: ${msg}`)
                }
              }
            }
          }

          // Handle SharePoint sites — use site permissions API (not group membership)
          if (newUserId && sharePointSiteIds.length > 0) {
            for (const siteId of sharePointSiteIds) {
              const siteName = displayNames[siteId] ?? siteId
              const gStart = new Date()
              try {
                await graph.addUserToSharePointSite(siteId, newUserId, 'write')
                groupsAdded.push(siteId)
                await logStep(client, hrRequest.id, `add_to_site_${siteId}`, `Add to SharePoint: ${siteName}`, 'completed', gStart,
                  { siteId, siteName, userId: newUserId }, { added: true })
                stepsCompleted.push(`add_to_site_${siteId}`)
                await addTicketNote('Added to SharePoint Site', `Site: ${siteName}`)
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                // "already exist" = already has access
                if (msg.includes('already exist') || msg.includes('Permission already exists')) {
                  groupsAdded.push(siteId)
                  await logStep(client, hrRequest.id, `add_to_site_${siteId}`, `Add to SharePoint: ${siteName}`, 'completed', gStart,
                    { siteId, siteName, userId: newUserId }, { added: true, alreadyMember: true })
                  stepsCompleted.push(`add_to_site_${siteId}`)
                  await addTicketNote('Added to SharePoint Site', `Site: ${siteName} (already has access)`)
                } else {
                  await logStep(client, hrRequest.id, `add_to_site_${siteId}`, `Add to SharePoint: ${siteName}`, 'failed', gStart,
                    { siteId, siteName, userId: newUserId }, undefined, msg)
                  failedSteps.push(`add_to_site_${siteId}`)
                  await addTicketNote('SharePoint Site Access Failed', `Site: ${siteName}\nError: ${msg}`)
                }
              }
            }
          }

          if (groupsAdded.length > 0) {
            const groupNameList = groupsAdded.map(id => displayNames[id] ?? id)
            provisioningResults.push(`Groups Added:\n${groupNameList.map(n => `  - ${n}`).join('\n')}`)
          }

          // --- Clone permissions + licenses from another user ---
          const clonedGroups: GraphGroup[] = []
          const clonedLicenseNames: string[] = []
          if (newUserId && a.clone_permissions === 'yes' && a.clone_from_user) {
            const cloneStart = new Date()
            try {
              const sourceUser = await graph.getUserByEmail(a.clone_from_user)
              if (!sourceUser) {
                throw new Error(`Source user not found: ${a.clone_from_user}`)
              }

              // Clone licenses from source user (with Pax8 auto-procurement)
              try {
                const sourceLicenses = await graph.getUserAssignedLicenses(sourceUser.id)
                const allSkus = await graph.getLicenseSkus()
                for (const srcLic of sourceLicenses) {
                  try {
                    // Check if this SKU has available seats
                    const skuInfo = allSkus.find(s => s.skuId === srcLic.skuId)
                    if (skuInfo) {
                      const availSeats = skuInfo.prepaidUnits.enabled - skuInfo.consumedUnits
                      if (availSeats <= 0) {
                        // Try Pax8 auto-procurement for this cloned license
                        const companyName = hrRequest.displayName || ''
                        const checkAvail = async () => {
                          const freshSku = await graph.getLicenseSkuByPartNumber(skuInfo.skuPartNumber)
                          if (!freshSku) return null
                          return { available: freshSku.prepaidUnits.enabled - freshSku.consumedUnits }
                        }
                        const procResult = await tryPax8AutoProcure(companyName, skuInfo.skuPartNumber, checkAvail)
                        if (procResult.success) {
                          await addTicketNote('License Auto-Procured via Pax8 (Clone)',
                            `No seats for ${skuInfo.displayName ?? skuInfo.skuPartNumber}. ` +
                            `Pax8 subscription increased from ${procResult.previousQuantity} to ${procResult.newQuantity} seat(s). License confirmed available.`)
                        }
                        // If Pax8 fails, still try assignment — it will fail and be caught below
                      }
                    }
                    await graph.assignLicense(newUserId, srcLic.skuId)
                    const licName = skuInfo?.displayName ?? skuInfo?.skuPartNumber ?? srcLic.skuId
                    clonedLicenseNames.push(licName)
                    provisioningResults.push(`License (cloned): ${licName}`)
                  } catch {
                    // License may not have available units — non-fatal
                  }
                }
                if (clonedLicenseNames.length > 0) {
                  await addTicketNote('Licenses Cloned', `Cloned ${clonedLicenseNames.length} license(s) from ${a.clone_from_user}:\n${clonedLicenseNames.map(n => `  - ${n}`).join('\n')}`)
                  stepsCompleted.push('clone_licenses')
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                console.warn('[hr/process] License clone failed (non-fatal):', msg)
                await addTicketNote('License Clone Failed', `Source: ${a.clone_from_user}\nError: ${msg}`)
              }

              // Clone groups from source user
              const sourceGroups = await graph.getUserGroups(sourceUser.id)
              const addableGroups = sourceGroups.filter(
                (g) => g.displayName && (g.securityEnabled || g.mailEnabled || (g.groupTypes && g.groupTypes.length > 0))
              )

              let cloneSuccessCount = 0
              for (const sg of addableGroups) {
                try {
                  await graph.addUserToGroup(sg.id, newUserId)
                  cloneSuccessCount++
                  clonedGroups.push(sg)
                } catch {
                  // Non-fatal per group — may already be a member
                }
              }

              provisioningResults.push(`Clone Source: ${a.clone_from_user} (${cloneSuccessCount} groups cloned)`)
              await logStep(client, hrRequest.id, 'clone_permissions', 'Clone User Permissions', 'completed', cloneStart,
                { sourceUser: a.clone_from_user }, { groupsCloned: cloneSuccessCount, total: addableGroups.length, licensesCloned: clonedLicenseNames.length })
              stepsCompleted.push('clone_permissions')
              await addTicketNote('Permissions Cloned', `Source: ${a.clone_from_user}\nGroups cloned: ${cloneSuccessCount}/${addableGroups.length}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'clone_permissions', 'Clone User Permissions', 'failed', cloneStart,
                { sourceUser: a.clone_from_user }, undefined, msg)
              failedSteps.push('clone_permissions')
              await addTicketNote('Permission Clone Failed', `Source: ${a.clone_from_user}\nError: ${msg}`)
            }
          }

          // --- Build provisioning results text for ticket ---
          if (primaryActionSucceeded) {
            const resultLines: string[] = [
              '',
              '=== PROVISIONING RESULTS ===',
              `Work Email: ${upn}`,
            ]

            // License info
            if (a.license_type && !failedSteps.includes('assign_license')) {
              // Get friendly name
              let licDisplayName: string = a.license_type
              try {
                const sku = await graph.getLicenseSkuByPartNumber(a.license_type)
                if (sku?.displayName) licDisplayName = sku.displayName
              } catch { /* use raw part number */ }
              resultLines.push(`License: ${licDisplayName}`)
            }

            // Groups added — use display names
            const allGroupDescriptions: string[] = []
            if (groupsAdded.length > 0) {
              for (const gId of groupsAdded) {
                const gName = displayNames[gId] ?? gId
                allGroupDescriptions.push(`  - ${gName}`)
              }
            }
            // Cloned groups
            for (const cg of clonedGroups) {
              allGroupDescriptions.push(`  - ${describeGroup(cg)}`)
            }
            // SharePoint sites (already included in groupsAdded if successful)
            if (allGroupDescriptions.length > 0) {
              resultLines.push('Groups Added:')
              resultLines.push(...allGroupDescriptions)
            }

            if (a.clone_from_user && !failedSteps.includes('clone_permissions')) {
              resultLines.push(`Clone Source: ${a.clone_from_user} (${clonedGroups.length} groups cloned)`)
            }

            // Build manual steps for TCT staff
            if (needsNewComputer) {
              manualSteps.push('New computer required — create sales quote and coordinate hardware procurement')
            }
            if (a.additional_notes && a.additional_notes.trim()) {
              manualSteps.push(`Review additional notes/software requirements — see "NOTES" section above`)
            }
            if (failedSteps.length > 0) {
              // Map failed step keys to clear manual action descriptions
              const onboardFailedDescriptions: Record<string, string> = {
                load_m365_creds: 'Configure M365 credentials for this company in the admin portal',
                create_user: `Manually create M365 user account for ${fullName} in Azure AD`,
                assign_license: `Manually assign license "${displayNames[a.license_type] ?? a.license_type}" to ${upn} in Microsoft 365 Admin Center`,
                clone_permissions: `Manually clone permissions from ${a.clone_from_user} to ${upn}`,
              }
              for (const step of failedSteps) {
                let desc: string
                if (step.startsWith('add_to_group_')) {
                  const gId = step.replace('add_to_group_', '')
                  desc = `Manually add ${upn} to group: ${displayNames[gId] ?? gId}`
                } else if (step.startsWith('add_to_site_')) {
                  const sId = step.replace('add_to_site_', '')
                  desc = `Manually grant ${upn} access to SharePoint site: ${displayNames[sId] ?? sId}`
                } else {
                  desc = onboardFailedDescriptions[step] ?? `Retry failed step: ${step}`
                }
                manualSteps.push(desc)
              }
              const humanFailedSteps = failedSteps.map(s => {
                if (s.startsWith('add_to_group_')) return `Add to ${displayNames[s.replace('add_to_group_', '')] ?? s.replace('add_to_group_', '')}`
                if (s.startsWith('add_to_site_')) return `Add to SharePoint: ${displayNames[s.replace('add_to_site_', '')] ?? s.replace('add_to_site_', '')}`
                return s
              })
              resultLines.push(`\nFailed Steps: ${humanFailedSteps.join(', ')}`)
              resultLines.push('Status: Completed with errors — manual steps required')
            } else if (manualSteps.length > 0) {
              resultLines.push('Status: Automated steps complete — manual steps required')
            } else {
              resultLines.push('Status: All actions completed successfully')
            }

            // Add "Next Steps for TCT Staff" section
            resultLines.push('')
            resultLines.push('=== NEXT STEPS FOR TCT STAFF ===')
            if (manualSteps.length > 0) {
              for (const step of manualSteps) {
                resultLines.push(`  [ ] ${step}`)
              }
            } else {
              resultLines.push('  None — all steps completed automatically.')
            }

            const provisioningResultsText = resultLines.join('\n')

            // PATCH ticket description
            try {
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: autotaskHeaders,
                body: JSON.stringify({
                  id: ticketId,
                  description: originalDescription + '\n\n' + provisioningResultsText,
                }),
              })
            } catch (err) {
              console.warn('[hr/process] Failed to update ticket description:', err instanceof Error ? err.message : err)
            }

            // Internal note for manual steps
            if (manualSteps.length > 0) {
              await addTicketNote('Manual Steps Required',
                'The following actions require manual intervention by TCT staff:\n\n' +
                manualSteps.map(s => `• ${s}`).join('\n'), 2)
            }

            // Final customer-visible note (publish=1)
            const licDisplayForNote = a.license_type ? (displayNames[a.license_type] ?? a.license_type) : null
            const startDateDisplay = startDate ? formatDateDisplay(startDate) : null
            const completionNote = [
              accountLocked
                ? `Employee ${fullName} has been provisioned (account locked until ${startDateDisplay}):`
                : `Employee ${fullName} has been fully provisioned:`,
              '',
              `New Email: ${upn}`,
              licDisplayForNote ? `License: ${licDisplayForNote}` : null,
              allGroupDescriptions.length > 0 ? `Groups/Lists/Sites: ${allGroupDescriptions.length} added` : null,
              '',
              accountLocked
                ? `The account is currently LOCKED and will be automatically unlocked on ${startDateDisplay} at 12:01 AM EST.\nLogin credentials will be shared closer to the start date.`
                : 'Temporary password will be shared securely by your TCT technician.',
            ].filter(Boolean).join('\n')

            await addTicketNote(
              accountLocked ? 'Onboarding Provisioned — Account Locked' : 'Onboarding Complete',
              completionNote, 1)

            // Internal-only note with temp password (publish=2)
            await addTicketNote('Temporary Password (INTERNAL)', `UPN: ${upn}\nTemporary Password: ${tempPassword}`, 2)

            // Send email notification
            if (resend) {
              const submitterEmail = hrRequest.submitted_by_email || a.submitted_by_email
              const credentialDelivery = a.credential_delivery || 'submitter'
              const recipientEmail = credentialDelivery === 'personal_email' && a.personal_email
                ? a.personal_email
                : submitterEmail

              if (recipientEmail) {
                const isPersonalEmail = credentialDelivery === 'personal_email' && a.personal_email
                try {
                  const companyName = hrRequest.displayName || 'your organization'

                  const isCompanyComputer = a.computer_situation === 'existing_company' || a.computer_situation === 'new_computer'

                  // Build login instructions based on whether this goes to the new hire or the submitter
                  const loginInstructions = isPersonalEmail ? [
                    '',
                    '═══════════════════════════════════',
                    'HOW TO GET STARTED',
                    '═══════════════════════════════════',
                    '',
                    // Order sign-in instructions by scenario:
                    // Company computer first if applicable, then browser access
                    ...(isCompanyComputer ? [
                      '1. SIGN IN ON YOUR COMPANY COMPUTER',
                      '   From the Windows sign-in screen:',
                      '     a. Click "Other user" (or "Switch user" if someone is already signed in)',
                      `     b. Enter your email: ${upn}`,
                      `     c. Enter your temporary password: ${tempPassword}`,
                      '     d. You will be prompted to create a new password — choose something secure',
                      '     e. Follow the prompts to set up Multi-Factor Authentication (MFA)',
                      '',
                      '2. SET UP MULTI-FACTOR AUTHENTICATION (MFA)',
                      '   During sign-in, you will be prompted to set up MFA.',
                      '   We recommend using the Microsoft Authenticator app:',
                      '     a. Download "Microsoft Authenticator" from the App Store or Google Play',
                      '     b. When prompted, choose "Add work or school account"',
                      '     c. Scan the QR code shown on screen',
                      '     d. You can also choose to receive a text or phone call instead',
                      '',
                      '3. ACCESS MICROSOFT 365 FROM A BROWSER',
                      '   You can also access your apps from any web browser:',
                      '     a. Go to https://portal.office.com',
                      `     b. Sign in with: ${upn}`,
                      '     c. Access Outlook, Teams, OneDrive, and all Microsoft 365 apps',
                    ] : [
                      '1. SIGN IN TO MICROSOFT 365',
                      '   Go to https://portal.office.com',
                      `   Email: ${upn}`,
                      `   Password: ${tempPassword}`,
                      '   You will be asked to change your password on first sign-in.',
                      '',
                      '2. SET UP MULTI-FACTOR AUTHENTICATION (MFA)',
                      '   After changing your password, you will be prompted to set up MFA.',
                      '   We recommend using the Microsoft Authenticator app:',
                      '     a. Download "Microsoft Authenticator" from the App Store or Google Play',
                      '     b. When prompted, choose "Add work or school account"',
                      '     c. Scan the QR code shown on screen',
                      '     d. You can also choose to receive a text or phone call instead',
                      '',
                    ]),
                    '',
                    '3. ACCESS YOUR APPS',
                    '   • Outlook (email): https://outlook.office.com',
                    '   • Microsoft Teams: https://teams.microsoft.com',
                    '   • OneDrive (files): https://onedrive.live.com',
                    '   • All apps: https://portal.office.com',
                    '',
                    'If you have any trouble signing in, contact your IT administrator.',
                  ] : [
                    '',
                    'Please share these credentials securely with the new employee.',
                    isCompanyComputer
                      ? 'They can sign in on their company computer from the Windows sign-in screen by clicking "Other user", or at https://portal.office.com'
                      : 'They can sign in at https://portal.office.com',
                    'They will be prompted to change their password and set up MFA on first sign-in.',
                  ]

                  const emailSubject = accountLocked
                    ? (isPersonalEmail
                      ? `Welcome to ${companyName} — Your Account Will Be Ready on ${startDateDisplay}`
                      : `Employee Onboarding Scheduled — ${fullName} (starts ${startDateDisplay})`)
                    : (isPersonalEmail
                      ? `Welcome to ${companyName} — Your Microsoft 365 Account`
                      : `Employee Onboarding Complete — ${fullName}`)

                  const emailIntro = accountLocked
                    ? (isPersonalEmail
                      ? [`Welcome to ${companyName}!`, '', `Your Microsoft 365 account has been created but is currently locked until your start date (${startDateDisplay}).`, `Your account will be automatically unlocked on ${startDateDisplay} and you will be able to sign in at that time.`]
                      : ['Hello,', '', `A Microsoft 365 account has been created for ${fullName} for use with ${companyName}.`, '', `⏳ SCHEDULED START: The account is currently LOCKED and will be automatically unlocked on ${startDateDisplay} at 12:01 AM EST.`, 'Credentials are included below — please share them with the employee closer to their start date.'])
                    : (isPersonalEmail
                      ? [`Welcome to ${companyName}!`, '', `Your Microsoft 365 account has been created and is ready to use.`]
                      : ['Hello,', '', `A Microsoft 365 account has been created for ${fullName} for use with ${companyName}.`])

                  await resend.emails.send({
                    from: FROM_EMAIL,
                    to: [recipientEmail],
                    subject: emailSubject,
                    text: [
                      ...emailIntro,
                      '',
                      `Email Address: ${upn}`,
                      `Temporary Password: ${tempPassword}`,
                      ...(accountLocked ? [
                        '',
                        `⚠️ Do NOT attempt to sign in before ${startDateDisplay} — the account will be locked.`,
                      ] : loginInstructions),
                      '',
                      `Triple Cities Tech | Support Ticket: ${ticketNumber}`,
                    ].filter((l) => l !== null).join('\n'),
                  })
                } catch (err) {
                  console.warn('[hr/process] Email notification failed (non-fatal):', err instanceof Error ? err.message : err)
                }
              }
            } else if (!resend) {
              console.warn('[hr/process] RESEND_API_KEY not set — skipping email notification')
            }

            // Future-dated onboarding: set request status to 'scheduled' so cron will unlock on start date
            if (accountLocked && primaryActionSucceeded) {
              await client.query(
                `UPDATE hr_requests
                 SET status = 'scheduled',
                     updated_at = NOW()
                 WHERE id = $1`,
                [hrRequest.id]
              )

              // Add internal note about scheduled unlock
              await addTicketNote('Onboarding Scheduled',
                `Account for ${fullName} (${upn}) is provisioned but LOCKED.\n\n` +
                `The account will be automatically unlocked on ${startDateDisplay} at 12:01 AM EST.\n` +
                `All groups, licenses, and SharePoint access have been configured.\n\n` +
                `Status: Scheduled — awaiting start date`, 2)
            } else {
              // Close ticket only if no manual steps remain (status=5)
              if (manualSteps.length === 0) {
                try {
                  await fetch(`${baseUrl}/V1.0/Tickets`, {
                    method: 'PATCH',
                    headers: autotaskHeaders,
                    body: JSON.stringify({ id: ticketId, status: 5 }),
                  })
                } catch (err) {
                  console.warn('[hr/process] Failed to close ticket:', err instanceof Error ? err.message : err)
                }
              }
            }
          }
        }
      }
    } else {
      // =============================================================
      // OFFBOARDING PIPELINE
      // =============================================================

      // Check if this offboarding should be scheduled for a future date
      const lastDay = a.last_day
      const isScheduledRun = body.executeScheduled === true
      const isImmediateTermination = a.urgency_type === 'immediate_termination' || a.account_action === 'immediate_termination'
      const shouldSchedule = lastDay && isDateInFuture(lastDay) && !isScheduledRun && !isImmediateTermination

      if (shouldSchedule) {
        // Future-dated offboarding: create ticket with "Scheduled" note, skip M365 actions
        const scheduledDateDisplay = formatDateDisplay(lastDay)

        // Add scheduled note to the ticket
        await addTicketNote('Offboarding Scheduled',
          `This offboarding is scheduled to execute automatically on ${scheduledDateDisplay} at 12:01 AM EST.\n\n` +
          `Employee: ${fullName || a.work_email || a.employee_to_offboard || 'Unknown'}\n` +
          `Last Working Day: ${scheduledDateDisplay}\n\n` +
          'All automated actions (disable account, remove groups, remove licenses, OneDrive handling) ' +
          'will be executed at the scheduled time. The ticket will be updated with results.', 2)

        // Also add a customer-visible note
        await addTicketNote('Offboarding Scheduled',
          `The offboarding for ${fullName || a.work_email || a.employee_to_offboard || 'the employee'} ` +
          `is scheduled to take effect on ${scheduledDateDisplay}.\n\n` +
          'You will receive an email confirmation once all actions have been completed.', 1)

        // Set request status to scheduled
        await client.query(
          `UPDATE hr_requests
           SET status = 'scheduled',
               updated_at = NOW()
           WHERE id = $1`,
          [hrRequest.id]
        )

        await client.query(
          `INSERT INTO hr_audit_logs
             (company_id, request_id, actor, action, resource, details, severity, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
          [
            hrRequest.company_id,
            hrRequest.id,
            'system',
            'request_scheduled',
            `hr_request:${hrRequest.id}`,
            JSON.stringify({ scheduledDate: lastDay, ticketId, ticketNumber }),
            'info',
          ]
        )

        return NextResponse.json({
          message: `Offboarding scheduled for ${lastDay} at 12:01 AM EST`,
          requestId: hrRequest.id,
          ticketId,
          ticketNumber,
          scheduledDate: lastDay,
          status: 'scheduled',
        })
      }

      const creds = hrRequest.company_slug
        ? await getTenantCredentialsBySlug(hrRequest.company_slug)
        : null

      if (!creds) {
        const msg = `No M365 credentials configured for company slug "${hrRequest.company_slug}"`
        console.error('[hr/process]', msg)
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'failed', new Date(), undefined, undefined, msg)
        failedSteps.push('load_m365_creds')
      } else {
        await logStep(client, hrRequest.id, 'load_m365_creds', 'Load M365 Credentials', 'completed', new Date(), undefined, { tenantId: creds.tenantId })
        stepsCompleted.push('load_m365_creds')

        const graph = createGraphClient(creds)
        const workEmail = a.work_email ?? a.employee_to_offboard ?? ''

        // Find user
        const findStart = new Date()
        let targetUserId: string | null = null
        let targetUpn: string | null = null
        try {
          const user = await graph.getUserByEmail(workEmail)
          if (!user) throw new Error(`User not found: ${workEmail}`)
          targetUserId = user.id
          targetUpn = user.userPrincipalName
          // Fill in fullName from Graph displayName if form answers didn't have first/last name
          if (!fullName && user.displayName) fullName = user.displayName.trim()
          await logStep(client, hrRequest.id, 'find_user', 'Find User', 'completed', findStart,
            { email: workEmail }, { userId: targetUserId, upn: targetUpn })
          stepsCompleted.push('find_user')

          // Update ticket title now that we have the real name
          if (fullName && ticketId) {
            try {
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: autotaskHeaders,
                body: JSON.stringify({
                  id: ticketId,
                  Title: `[OFFBOARDING] Employee Termination: ${fullName}`,
                }),
              })
            } catch {
              // Non-fatal — title was already set with UPN fallback
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await logStep(client, hrRequest.id, 'find_user', 'Find User', 'failed', findStart,
            { email: workEmail }, undefined, msg)
          failedSteps.push('find_user')
          await addTicketNote('User Lookup Failed', `Email: ${workEmail}\nError: ${msg}`)
        }

        if (targetUserId) {
          // Persist target
          await client.query(
            `UPDATE hr_requests SET target_upn = $2, target_user_id = $3, updated_at = NOW() WHERE id = $1`,
            [hrRequest.id, targetUpn, targetUserId]
          )

          // Revoke sessions if immediate termination (new schema: urgency_type, legacy: account_action/urgency)
          if (a.urgency_type === 'immediate_termination' || a.account_action === 'immediate_termination' || a.urgency === 'immediate_termination') {
            const revokeStart = new Date()
            try {
              await graph.revokeSignInSessions(targetUserId)
              await logStep(client, hrRequest.id, 'revoke_sessions', 'Revoke All Sessions', 'completed', revokeStart,
                { userId: targetUserId }, { revoked: true })
              stepsCompleted.push('revoke_sessions')
              await addTicketNote('Sessions Revoked', `All active sessions revoked for ${targetUpn}`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'revoke_sessions', 'Revoke All Sessions', 'failed', revokeStart,
                { userId: targetUserId }, undefined, msg)
              failedSteps.push('revoke_sessions')
              await addTicketNote('Session Revocation Failed', `Error: ${msg}`)
            }
          }

          // OneDrive transfer — MUST happen before account is disabled
          // Supports both new (file_handling + transfer_files_to) and legacy (transfer_onedrive_to) answer keys
          let oneDriveTransferredTo: string | null = null
          let oneDriveWebUrl: string | null = null
          const transferRecipient = a.transfer_files_to || a.transfer_onedrive_to
          const shouldTransferFiles = (a.file_handling === 'transfer_to_user' && a.transfer_files_to) || a.transfer_onedrive_to
          if (shouldTransferFiles && transferRecipient && targetUserId) {
            const odStart = new Date()
            try {
              const result = await graph.grantOneDriveAccess(targetUserId, transferRecipient)
              oneDriveTransferredTo = transferRecipient
              oneDriveWebUrl = result.webUrl
              provisioningResults.push(`OneDrive Transferred To: ${oneDriveTransferredTo}`)
              await logStep(client, hrRequest.id, 'transfer_onedrive', 'Transfer OneDrive Access', 'completed', odStart,
                { targetUserId, recipientEmail: oneDriveTransferredTo }, { webUrl: oneDriveWebUrl })
              stepsCompleted.push('transfer_onedrive')
              await addTicketNote('OneDrive Access Granted', `Shared with: ${oneDriveTransferredTo}\nOneDrive URL: ${oneDriveWebUrl}`)

              // Notify the recipient about their new OneDrive access
              if (resend) {
                try {
                  await resend.emails.send({
                    from: FROM_EMAIL,
                    to: [oneDriveTransferredTo],
                    subject: `OneDrive files shared with you — ${fullName || targetUpn || 'Employee'}`,
                    text: [
                      'Hello,',
                      '',
                      `As part of the offboarding process for ${fullName || targetUpn || 'the employee'}, their OneDrive files have been shared with you.`,
                      '',
                      `You can access the files here:`,
                      oneDriveWebUrl,
                      '',
                      'If you have any questions about these files, please contact your IT administrator.',
                      '',
                      'Triple Cities Tech',
                    ].join('\n'),
                  })
                } catch (err) {
                  console.warn('[hr/process] OneDrive notification email failed (non-fatal):', err instanceof Error ? err.message : err)
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'transfer_onedrive', 'Transfer OneDrive Access', 'failed', odStart,
                { targetUserId, recipientEmail: transferRecipient }, undefined, msg)
              failedSteps.push('transfer_onedrive')
              await addTicketNote('OneDrive Transfer Failed', `Recipient: ${transferRecipient}\nError: ${msg}`)
            }
          }

          // OneDrive archive — MUST happen before account is disabled
          let archiveFolderUrl: string | null = null
          let archivedFileCount = 0
          const shouldArchive = a.file_handling === 'archive_to_sharepoint' || a.onedrive_archive === 'yes'
          if (shouldArchive && targetUserId) {
            const archiveStart = new Date()
            try {
              const hrSite = await graph.getOrCreateHRSharePointSite()
              const folderName = `${fullName} — Offboarding ${new Date().toISOString().slice(0, 10)}`.trim()
              const archiveResult = await graph.archiveOneDriveToSharePoint(
                targetUserId,
                hrSite.driveId,
                folderName
              )
              archiveFolderUrl = archiveResult.folderWebUrl
              archivedFileCount = archiveResult.fileCount
              provisioningResults.push(`OneDrive Archived: ${archivedFileCount} items to HR SharePoint`)
              await logStep(client, hrRequest.id, 'archive_onedrive', 'Archive OneDrive to SharePoint', 'completed', archiveStart,
                { targetUserId, driveId: hrSite.driveId },
                { folderUrl: archiveFolderUrl, fileCount: archivedFileCount, siteUrl: hrSite.webUrl })
              stepsCompleted.push('archive_onedrive')
              await addTicketNote('OneDrive Files Archived — Awaiting Review',
                `${archivedFileCount} items copied to HR SharePoint\nFolder: ${archiveFolderUrl}\nSite: ${hrSite.webUrl}\n\n` +
                'ACTION REQUIRED: Please review the archived files to confirm everything transferred correctly, then close this ticket.')
              // Always require human review after archive
              manualSteps.push(`Review SharePoint archive for ${fullName} (${archivedFileCount} items) and confirm completeness — then close this ticket`)
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              await logStep(client, hrRequest.id, 'archive_onedrive', 'Archive OneDrive to SharePoint', 'failed', archiveStart,
                { targetUserId }, undefined, msg)
              failedSteps.push('archive_onedrive')
              await addTicketNote('OneDrive Archive Failed', `Error: ${msg}`)
            }
          }

          // Disable account — after OneDrive operations since Graph can't access a disabled user's drive
          const disableStart = new Date()
          try {
            await graph.disableAccount(targetUserId)
            primaryActionSucceeded = true
            provisioningResults.push(`Account Disabled: ${targetUpn}`)
            await logStep(client, hrRequest.id, 'disable_account', 'Disable Account', 'completed', disableStart,
              { userId: targetUserId }, { disabled: true })
            stepsCompleted.push('disable_account')
            await addTicketNote('Account Disabled', `Account disabled: ${targetUpn}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'disable_account', 'Disable Account', 'failed', disableStart,
              { userId: targetUserId }, undefined, msg)
            failedSteps.push('disable_account')
            await addTicketNote('Account Disable Failed', `Error: ${msg}`)
          }

          // Remove from all groups
          const removeGrpStart = new Date()
          let removedGroupCount = 0
          const removedGroupNames: string[] = []
          const skippedGroupNames: string[] = []
          try {
            const userGroups = await graph.getUserGroups(targetUserId)
            const removableGroups = userGroups.filter(
              (g) => g.displayName && (g.securityEnabled || g.mailEnabled || (g.groupTypes && g.groupTypes.length > 0))
            )

            for (const grp of removableGroups) {
              try {
                await graph.removeUserFromGroup(grp.id, targetUserId)
                removedGroupCount++
                removedGroupNames.push(describeGroup(grp))
              } catch {
                skippedGroupNames.push(`${grp.displayName} (dynamic/protected)`)
              }
            }

            provisioningResults.push(`Groups Removed: ${removedGroupCount}/${removableGroups.length}`)
            await logStep(client, hrRequest.id, 'remove_groups', 'Remove from All Groups', 'completed', removeGrpStart,
              { userId: targetUserId }, { removed: removedGroupCount, total: removableGroups.length, names: removedGroupNames })
            stepsCompleted.push('remove_groups')

            const groupNoteLines = [
              `Removed from ${removedGroupCount}/${removableGroups.length} groups:`,
              ...removedGroupNames.map(n => `  ✓ ${n}`),
              ...(skippedGroupNames.length > 0 ? ['Skipped (dynamic/protected):', ...skippedGroupNames.map(n => `  ⊘ ${n}`)] : []),
            ]
            await addTicketNote('Removed from Groups', groupNoteLines.join('\n'))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'remove_groups', 'Remove from All Groups', 'failed', removeGrpStart,
              { userId: targetUserId }, undefined, msg)
            failedSteps.push('remove_groups')
            await addTicketNote('Group Removal Failed', `Error: ${msg}`)
          }

          // Remove licenses
          const removeLicStart = new Date()
          let removedLicenseCount = 0
          const removedLicenseNames: string[] = []
          try {
            const skus = await graph.getLicenseSkus()
            for (const sku of skus) {
              try {
                await graph.removeLicense(targetUserId, sku.skuId)
                removedLicenseCount++
                removedLicenseNames.push(sku.displayName ?? sku.skuPartNumber)
              } catch {
                // License wasn't assigned to this user — ignore
              }
            }

            provisioningResults.push(`Licenses Removed: ${removedLicenseCount}`)
            await logStep(client, hrRequest.id, 'remove_licenses', 'Remove Licenses', 'completed', removeLicStart,
              { userId: targetUserId }, { removed: removedLicenseCount, names: removedLicenseNames })
            stepsCompleted.push('remove_licenses')

            const licNoteLines = removedLicenseCount > 0
              ? [`Removed ${removedLicenseCount} license(s):`, ...removedLicenseNames.map(n => `  ✓ ${n}`)]
              : ['No licenses were assigned to this user.']
            await addTicketNote('Licenses Removed', licNoteLines.join('\n'))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await logStep(client, hrRequest.id, 'remove_licenses', 'Remove Licenses', 'failed', removeLicStart,
              { userId: targetUserId }, undefined, msg)
            failedSteps.push('remove_licenses')
            await addTicketNote('License Removal Failed', `Error: ${msg}`)
          }

          // Build provisioning results for ticket
          if (primaryActionSucceeded) {
            // Determine manual steps for TCT staff
            // Shared mailbox access requires manual configuration via Exchange Admin
            const sharedMailboxUsers = Array.isArray(answers.shared_mailbox_access)
              ? (answers.shared_mailbox_access as string[])
              : []
            if (a.data_handling === 'keep_accessible' && sharedMailboxUsers.length > 0) {
              manualSteps.push(
                `Grant shared mailbox access for ${targetUpn} to: ${sharedMailboxUsers.join(', ')} (Exchange Admin Center → Shared Mailboxes)`
              )
            }
            if (a.data_handling === 'forward_to_manager' || a.data_handling === 'forward_to_specific') {
              if (a.forward_email_to) {
                manualSteps.push(`Verify email forwarding is active: ${targetUpn} → ${a.forward_email_to}`)
              }
            }
            if (a.additional_notes && a.additional_notes.trim()) {
              manualSteps.push(`Review additional notes/other systems access — see "ADDITIONAL NOTES" section above`)
            }
            // Map failed step keys to clear manual action descriptions
            const failedStepDescriptions: Record<string, string> = {
              find_user: `Manually locate user account for ${workEmail} in Azure AD`,
              revoke_sessions: `Manually revoke active sessions for ${targetUpn || workEmail} via Azure AD → Users → Revoke Sessions`,
              disable_account: `Manually disable account ${targetUpn || workEmail} in Azure AD → Users → Block Sign-in`,
              remove_groups: `Manually remove ${targetUpn || workEmail} from all groups/distribution lists in Azure AD`,
              remove_licenses: `Manually remove all licenses from ${targetUpn || workEmail} in Microsoft 365 Admin Center → Licenses`,
              transfer_onedrive: `Manually share OneDrive files from ${targetUpn || workEmail} to ${a.transfer_files_to || a.transfer_onedrive_to || 'designated recipient'} via OneDrive Admin`,
              archive_onedrive: `Manually archive OneDrive files from ${targetUpn || workEmail} to HR SharePoint site`,
              load_m365_creds: 'Configure M365 credentials for this company in the admin portal before retrying',
            }
            for (const step of failedSteps) {
              const desc = failedStepDescriptions[step] ?? `Retry failed step: ${step}`
              manualSteps.push(desc)
            }

            const resultLines = [
              '',
              '=== PROVISIONING RESULTS ===',
              `Account: ${targetUpn}`,
              'Action: Account disabled',
              '',
              `Groups Removed (${removedGroupCount}):`,
              ...(removedGroupNames.length > 0 ? removedGroupNames.map(n => `  - ${n}`) : ['  (none)']),
              ...(skippedGroupNames.length > 0 ? [`Skipped Groups: ${skippedGroupNames.join(', ')}`] : []),
              '',
              `Licenses Removed (${removedLicenseCount}):`,
              ...(removedLicenseNames.length > 0 ? removedLicenseNames.map(n => `  - ${n}`) : ['  (none)']),
              '',
              oneDriveTransferredTo ? `OneDrive Shared With: ${oneDriveTransferredTo}` : null,
              archiveFolderUrl ? `OneDrive Archived: ${archivedFileCount} items copied to HR SharePoint` : null,
              archiveFolderUrl ? `Archive Folder: ${archiveFolderUrl}` : null,
              failedSteps.length > 0 ? `\nFailed Steps:\n${failedSteps.map(s => {
                const humanNames: Record<string, string> = {
                  find_user: 'Find User',
                  revoke_sessions: 'Revoke Sessions',
                  disable_account: 'Disable Account',
                  remove_groups: 'Remove from Groups',
                  remove_licenses: 'Remove Licenses',
                  transfer_onedrive: 'Transfer OneDrive Files',
                  archive_onedrive: 'Archive OneDrive to SharePoint',
                  load_m365_creds: 'Load M365 Credentials',
                }
                return `  - ${humanNames[s] ?? s}`
              }).join('\n')}` : null,
              failedSteps.length > 0
                ? 'Status: Completed with errors — manual steps required'
                : manualSteps.length > 0
                  ? 'Status: Automated steps complete — manual steps required'
                  : 'Status: All actions completed successfully',
              '',
              '=== NEXT STEPS FOR TCT STAFF ===',
              ...(manualSteps.length > 0
                ? manualSteps.map(s => `  [ ] ${s}`)
                : ['  None — all steps completed automatically.']),
            ].filter(Boolean).join('\n')

            // PATCH ticket description
            try {
              await fetch(`${baseUrl}/V1.0/Tickets`, {
                method: 'PATCH',
                headers: autotaskHeaders,
                body: JSON.stringify({
                  id: ticketId,
                  description: originalDescription + '\n\n' + resultLines,
                }),
              })
            } catch (err) {
              console.warn('[hr/process] Failed to update ticket description:', err instanceof Error ? err.message : err)
            }

            // Internal note for manual steps
            if (manualSteps.length > 0) {
              await addTicketNote('Manual Steps Required',
                'The following actions require manual intervention by TCT staff:\n\n' +
                manualSteps.map(s => `• ${s}`).join('\n'), 2)
            }

            // Final customer-visible note — list specifics
            const noteLines: (string | null)[] = [
              `Employee ${fullName} has been offboarded:`,
              '',
              `Account ${targetUpn} has been disabled.`,
            ]
            // List removed groups by name
            if (removedGroupNames.length > 0) {
              noteLines.push('', `Removed from ${removedGroupCount} group(s):`)
              for (const gn of removedGroupNames) {
                noteLines.push(`  - ${gn}`)
              }
              if (skippedGroupNames.length > 0) {
                noteLines.push(`  (${skippedGroupNames.length} dynamic/protected group(s) could not be removed automatically)`)
              }
            } else {
              noteLines.push(`No removable group memberships found.`)
            }
            // List removed licenses by name
            if (removedLicenseNames.length > 0) {
              noteLines.push('', `${removedLicenseCount} license(s) removed:`)
              for (const ln of removedLicenseNames) {
                noteLines.push(`  - ${ln}`)
              }
            } else {
              noteLines.push(`No licenses were assigned.`)
            }
            noteLines.push(
              oneDriveTransferredTo ? `\nOneDrive files shared with ${oneDriveTransferredTo}.` : null,
              archiveFolderUrl ? `OneDrive files copied to HR SharePoint (${archivedFileCount} items).` : null,
              '',
              manualSteps.length > 0
                ? 'Some steps require manual action by our team. We will follow up shortly.'
                : 'All access has been revoked.',
            )
            const completionNote = noteLines.filter(Boolean).join('\n')

            await addTicketNote(
              manualSteps.length > 0 ? 'Offboarding In Progress' : 'Offboarding Complete',
              completionNote, 1)

            // Email notification to submitter
            if (resend) {
              const recipientEmail = hrRequest.submitted_by_email || a.submitted_by_email
              if (recipientEmail) {
                try {
                  const companyName = hrRequest.displayName || 'your organization'
                  // Final fallback: use targetUpn (email) if fullName is still empty
                  const employeeName = fullName || targetUpn || 'the employee'
                  // Build detailed email body
                  const emailLines: (string | null)[] = [
                    'Hello,',
                    '',
                    `The offboarding for ${employeeName} at ${companyName} has been ${manualSteps.length > 0 ? 'partially completed' : 'completed'}.`,
                    '',
                    `Account ${targetUpn} has been disabled.`,
                  ]
                  // List removed groups by name
                  if (removedGroupNames.length > 0) {
                    emailLines.push('', `Removed from ${removedGroupCount} group(s):`)
                    for (const gn of removedGroupNames) emailLines.push(`  - ${gn}`)
                    if (skippedGroupNames.length > 0) {
                      emailLines.push(`  (${skippedGroupNames.length} dynamic/protected group(s) skipped)`)
                    }
                  }
                  // List removed licenses by name
                  if (removedLicenseNames.length > 0) {
                    emailLines.push('', `${removedLicenseCount} license(s) removed:`)
                    for (const ln of removedLicenseNames) emailLines.push(`  - ${ln}`)
                  }
                  emailLines.push(
                    oneDriveTransferredTo ? `\nOneDrive files shared with ${oneDriveTransferredTo}.` : null,
                    archiveFolderUrl ? `OneDrive files copied to HR SharePoint (${archivedFileCount} items).` : null,
                    archiveFolderUrl ? `Archive location: ${archiveFolderUrl}` : null,
                  )
                  // List manual steps that are still pending
                  if (manualSteps.length > 0) {
                    emailLines.push('', 'The following steps still require action by our team:')
                    for (const ms of manualSteps) emailLines.push(`  - ${ms}`)
                    emailLines.push('', 'We will follow up when everything is complete.')
                  }
                  emailLines.push(
                    '',
                    `Triple Cities Tech | Support Ticket: ${ticketNumber}`,
                  )

                  await resend.emails.send({
                    from: FROM_EMAIL,
                    to: [recipientEmail],
                    subject: manualSteps.length > 0
                      ? `Employee Offboarding In Progress — ${employeeName}`
                      : `Employee Offboarding Complete — ${employeeName}`,
                    text: emailLines.filter((l) => l !== null).join('\n'),
                  })
                } catch (err) {
                  console.warn('[hr/process] Email notification failed (non-fatal):', err instanceof Error ? err.message : err)
                }
              }
            } else {
              console.warn('[hr/process] RESEND_API_KEY not set — skipping email notification')
            }

            // Close ticket if all automated, escalate if manual steps remain
            if (manualSteps.length === 0) {
              try {
                await fetch(`${baseUrl}/V1.0/Tickets`, {
                  method: 'PATCH',
                  headers: autotaskHeaders,
                  body: JSON.stringify({ id: ticketId, status: 5 }),
                })
              } catch (err) {
                console.warn('[hr/process] Failed to close ticket:', err instanceof Error ? err.message : err)
              }
            } else {
              // Escalate ticket so a human reviews the manual steps
              try {
                await fetch(`${baseUrl}/V1.0/Tickets`, {
                  method: 'PATCH',
                  headers: autotaskHeaders,
                  body: JSON.stringify({ id: ticketId, priority: 3 }), // High priority
                })
              } catch (err) {
                console.warn('[hr/process] Failed to escalate ticket:', err instanceof Error ? err.message : err)
              }
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------
    // Finalise the request
    // -----------------------------------------------------------------

    const finalStatus = failedSteps.length > 0 && !primaryActionSucceeded ? 'failed' : 'completed'
    const errorMsg = failedSteps.length > 0
      ? `Steps failed: ${failedSteps.join(', ')}`
      : null

    await client.query(
      `UPDATE hr_requests
       SET status = $2,
           completed_at = NOW(),
           error_message = $3,
           resolved_action_plan = $4::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        hrRequest.id,
        finalStatus,
        errorMsg,
        stepsCompleted.length > 0 ? JSON.stringify({ completedActions: stepsCompleted, failedActions: failedSteps }) : null,
      ]
    )

    await client.query(
      `INSERT INTO hr_audit_logs
         (company_id, request_id, actor, action, resource, details, severity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
      [
        hrRequest.company_id,
        hrRequest.id,
        'system',
        finalStatus === 'completed' ? 'request_completed' : 'request_failed',
        `hr_request:${hrRequest.id}`,
        JSON.stringify({
          ticketId,
          ticketNumber,
          stepsCompleted,
          failedSteps,
          primaryActionSucceeded,
        }),
        finalStatus === 'completed' ? 'info' : 'error',
      ]
    )

    return NextResponse.json(
      {
        message: `HR request processed — ${finalStatus}`,
        requestId: hrRequest.id,
        ticketId,
        ticketNumber,
        stepsCompleted,
        failedSteps,
        primaryActionSucceeded,
      },
      { status: 200 }
    )
  } finally {
    client.release()
  }
}
