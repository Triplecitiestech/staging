/**
 * Microsoft Graph client for Triple Cities Tech's OWN tenant.
 *
 * Differs from `graph.ts` which is per-customer-tenant. This module uses
 * the Azure AD app registration that TCT owns (the same app used for staff SSO).
 *
 * Credentials come from env vars:
 *   - AZURE_AD_TENANT_ID
 *   - AZURE_AD_CLIENT_ID
 *   - AZURE_AD_CLIENT_SECRET
 *
 * Required Application permissions (Azure AD portal — admin consent):
 *   - User.Read.All                  (look up users by email)
 *   - Group.Read.All                 (resolve HumanResources group members)
 *
 * Plus ONE of the following depending on PTO_CALENDAR_TYPE:
 *
 *   PTO_CALENDAR_TYPE=user (writes to /users/{mailbox}/events):
 *     - Calendars.ReadWrite          — required. Grants tenant-wide write
 *                                       access to user/shared mailbox calendars.
 *     - The PTO_CALENDAR_MAILBOX value MUST be a real M365 user or shared
 *       mailbox; M365 group email addresses do NOT work with /users/.
 *
 *   PTO_CALENDAR_TYPE=group (writes to /groups/{id}/events):
 *     - Group.ReadWrite.All          — required. `Calendars.ReadWrite` is NOT
 *                                       sufficient for /groups/{id}/events; a
 *                                       403 ErrorAccessDenied here means this
 *                                       permission is missing or unconsented.
 *     - PTO_CALENDAR_MAILBOX MUST be the M365 group's email (must be
 *       mail-enabled, not a security-only group).
 *
 * After adding/changing application permissions in the Azure AD portal, a
 * tenant admin MUST click "Grant admin consent for <tenant>" — without that,
 * the permission shows up but Graph still returns 403.
 *
 * Used for:
 *   1. Creating calendar events on the shared PTO calendar
 *   2. Sending calendar invites to employees for approved PTO
 *   3. Resolving HumanResources group members for approver notifications
 */

import { withRetry, withTimeout } from '@/lib/resilience'

// ---------------------------------------------------------------------------
// Env-based token fetch with in-memory cache
// ---------------------------------------------------------------------------

interface TokenEntry {
  accessToken: string
  expiresAt: number
}

// Cache on globalThis so serverless cold starts don't thrash
declare global {
  // eslint-disable-next-line no-var
  var __tctGraphTokenCache: TokenEntry | undefined
}

function getTenantCreds() {
  const tenantId = process.env.AZURE_AD_TENANT_ID
  const clientId = process.env.AZURE_AD_CLIENT_ID
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Missing TCT tenant credentials. Set AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET.'
    )
  }
  return { tenantId, clientId, clientSecret }
}

async function getAccessToken(): Promise<string> {
  const cached = globalThis.__tctGraphTokenCache
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken

  const { tenantId, clientId, clientSecret } = getTenantCreds()
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TCT Graph token fetch failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  globalThis.__tctGraphTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return data.access_token
}

/**
 * Build a hint appended to Graph error messages so the operator knows
 * which Azure AD application permission is likely missing for this path.
 * Only appended for 401/403 — other failures usually mean the resource is
 * wrong, not the permission.
 */
function permissionHintFor(path: string, status: number): string {
  if (status !== 401 && status !== 403) return ''

  // Group calendar event endpoints — needs Group.ReadWrite.All, NOT Calendars.ReadWrite.
  if (/^\/groups\/[^/]+\/events/.test(path)) {
    return (
      '\n\nHint: writing events to an M365 group calendar requires the ' +
      '`Group.ReadWrite.All` Microsoft Graph application permission with ' +
      'admin consent. `Calendars.ReadWrite` does NOT cover `/groups/{id}/events`. ' +
      'Add Group.ReadWrite.All in the Azure AD app registration → API ' +
      'permissions, click "Grant admin consent", then retry the calendar sync. ' +
      'If you cannot add Group.ReadWrite.All, switch the PTO calendar to a ' +
      'shared mailbox: set PTO_CALENDAR_TYPE=user and PTO_CALENDAR_MAILBOX ' +
      'to a real M365 mailbox (Calendars.ReadWrite is enough for that path).'
    )
  }

  // User mailbox calendar event endpoints — needs Calendars.ReadWrite.
  if (/^\/users\/[^/]+\/(calendars\/[^/]+\/)?events/.test(path)) {
    return (
      '\n\nHint: writing events to a user/shared mailbox requires the ' +
      '`Calendars.ReadWrite` Microsoft Graph application permission with ' +
      'admin consent, AND the mailbox must exist as a real M365 user or ' +
      'shared mailbox. If the address is an M365 group email, set ' +
      'PTO_CALENDAR_TYPE=group and grant Group.ReadWrite.All instead.'
    )
  }

  if (path.startsWith('/groups')) {
    return '\n\nHint: reading groups requires the `Group.Read.All` application permission with admin consent.'
  }

  if (path.startsWith('/users')) {
    return '\n\nHint: reading users requires the `User.Read.All` application permission with admin consent.'
  }

  return ''
}

async function graphRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    signal: options?.signal ?? AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TCT Graph ${path} failed (${res.status}): ${text}${permissionHintFor(path, res.status)}`)
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  const text = await res.text()
  if (!text || text.trim().length === 0) return undefined as T
  return JSON.parse(text) as T
}

// ---------------------------------------------------------------------------
// HR group lookup
// ---------------------------------------------------------------------------

export interface HrGroupMember {
  id: string
  displayName: string
  mail: string
}

/**
 * Resolve members of the HumanResources M365 group.
 * Used to determine who should receive PTO approval notifications.
 * Looks up the group by displayName (case-insensitive). Configurable via env.
 */
export async function getHrGroupMembers(): Promise<HrGroupMember[]> {
  const groupName = process.env.PTO_HR_GROUP_NAME || 'HumanResources'
  const groupMail = process.env.PTO_HR_GROUP_MAIL || 'HumanResources@triplecitiestech.com'

  return withRetry(
    async () => {
      // Prefer mail-based lookup (stable). Fall back to displayName.
      let groupId: string | null = null
      try {
        const byMail = await graphRequest<{ value: Array<{ id: string }> }>(
          `/groups?$filter=mail eq '${encodeURIComponent(groupMail)}'&$select=id`
        )
        groupId = byMail.value?.[0]?.id ?? null
      } catch {
        // ignore, fall back
      }

      if (!groupId) {
        const byName = await graphRequest<{ value: Array<{ id: string }> }>(
          `/groups?$filter=displayName eq '${encodeURIComponent(groupName)}'&$select=id`
        )
        groupId = byName.value?.[0]?.id ?? null
      }

      if (!groupId) {
        throw new Error(`HR group not found: tried mail='${groupMail}' and displayName='${groupName}'`)
      }

      const members = await graphRequest<{
        value: Array<{ id: string; displayName?: string; mail?: string; userPrincipalName?: string }>
      }>(`/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`)

      return (members.value ?? [])
        .map((m) => ({
          id: m.id,
          displayName: m.displayName ?? '',
          mail: (m.mail ?? m.userPrincipalName ?? '').toLowerCase(),
        }))
        .filter((m) => !!m.mail)
    },
    { maxRetries: 2, baseDelayMs: 500 }
  )
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

export interface CreateCalendarEventInput {
  /**
   * For type='user' (default): mailbox UPN/email that hosts the calendar.
   * For type='group': M365 group email address.
   */
  calendarOwner: string
  /** 'user' = /users/{owner}/events, 'group' = /groups/{id}/events */
  calendarType?: 'user' | 'group'
  /** Calendar id, or 'calendar' (default) for the primary calendar (user type only) */
  calendarId?: string
  subject: string
  body: string
  /** YYYY-MM-DD */
  startDate: string
  /** YYYY-MM-DD (inclusive) */
  endDate: string
  isAllDay?: boolean
  /** Who should be invited to the event */
  attendees?: Array<{ email: string; name?: string; type?: 'required' | 'optional' }>
  /** If true, categories help filter the PTO calendar */
  categories?: string[]
  /** Timezone for non-all-day events. Default: America/New_York */
  timeZone?: string
}

export interface CalendarEvent {
  id: string
  webLink?: string
  subject: string
}

function dayAfter(dateYmd: string): string {
  // Microsoft Graph all-day events use an exclusive end date.
  // endDate in our system is inclusive, so add 1 day for Graph.
  const [y, m, d] = dateYmd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Create a calendar event on the specified mailbox.
 * Used for PTO approval — event lives on timeoff@triplecitiestech.com.
 */
export async function createCalendarEvent(
  input: CreateCalendarEventInput
): Promise<CalendarEvent> {
  const {
    calendarOwner,
    calendarType = 'user',
    calendarId,
    subject,
    body,
    startDate,
    endDate,
    isAllDay = true,
    attendees = [],
    categories,
    timeZone = 'America/New_York',
  } = input

  const start = isAllDay
    ? { dateTime: `${startDate}T00:00:00`, timeZone }
    : { dateTime: `${startDate}T09:00:00`, timeZone }
  const end = isAllDay
    ? { dateTime: `${dayAfter(endDate)}T00:00:00`, timeZone }
    : { dateTime: `${endDate}T17:00:00`, timeZone }

  const payload: Record<string, unknown> = {
    subject,
    body: { contentType: 'HTML', content: body },
    start,
    end,
    isAllDay,
    showAs: 'oof',
  }
  if (categories && categories.length) payload.categories = categories
  if (attendees.length) {
    payload.attendees = attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name ?? a.email },
      type: a.type ?? 'required',
    }))
  }

  let path: string
  if (calendarType === 'group') {
    // Resolve group by mail → id, then create event on the group calendar
    const byMail = await graphRequest<{ value: Array<{ id: string }> }>(
      `/groups?$filter=mail eq '${encodeURIComponent(calendarOwner)}'&$select=id`
    )
    const groupId = byMail.value?.[0]?.id
    if (!groupId) {
      throw new Error(
        `PTO calendar group '${calendarOwner}' not found. Either create a mailbox with that address or set PTO_CALENDAR_MAILBOX/PTO_CALENDAR_TYPE to a group you actually own.`
      )
    }
    path = `/groups/${groupId}/events`
  } else {
    path = calendarId
      ? `/users/${encodeURIComponent(calendarOwner)}/calendars/${calendarId}/events`
      : `/users/${encodeURIComponent(calendarOwner)}/events`
  }

  return withTimeout(
    () =>
      withRetry(
        () =>
          graphRequest<CalendarEvent>(path, {
            method: 'POST',
            body: JSON.stringify(payload),
          }),
        { maxRetries: 2, baseDelayMs: 500 }
      ),
    30_000,
    `createCalendarEvent(${calendarOwner})`
  )
}

export interface UpdateCalendarEventInput {
  calendarOwner: string
  eventId: string
  subject?: string
  body?: string
  startDate?: string
  endDate?: string
  isAllDay?: boolean
  timeZone?: string
}

export async function updateCalendarEvent(
  input: UpdateCalendarEventInput
): Promise<void> {
  const { calendarOwner, eventId, subject, body, startDate, endDate, isAllDay = true, timeZone = 'America/New_York' } = input

  const payload: Record<string, unknown> = {}
  if (subject) payload.subject = subject
  if (body) payload.body = { contentType: 'HTML', content: body }
  if (startDate) {
    payload.start = isAllDay
      ? { dateTime: `${startDate}T00:00:00`, timeZone }
      : { dateTime: `${startDate}T09:00:00`, timeZone }
  }
  if (endDate) {
    payload.end = isAllDay
      ? { dateTime: `${dayAfter(endDate)}T00:00:00`, timeZone }
      : { dateTime: `${endDate}T17:00:00`, timeZone }
  }
  if (Object.keys(payload).length === 0) return

  await withRetry(
    () =>
      graphRequest<void>(`/users/${encodeURIComponent(calendarOwner)}/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    { maxRetries: 2, baseDelayMs: 500 }
  )
}

export async function deleteCalendarEvent(
  calendarOwner: string,
  eventId: string,
  calendarType: 'user' | 'group' = 'user'
): Promise<void> {
  await withRetry(
    async () => {
      let path: string
      if (calendarType === 'group') {
        const byMail = await graphRequest<{ value: Array<{ id: string }> }>(
          `/groups?$filter=mail eq '${encodeURIComponent(calendarOwner)}'&$select=id`
        )
        const groupId = byMail.value?.[0]?.id
        if (!groupId) return // Group gone? Nothing to delete.
        path = `/groups/${groupId}/events/${eventId}`
      } else {
        path = `/users/${encodeURIComponent(calendarOwner)}/events/${eventId}`
      }
      await graphRequest<void>(path, { method: 'DELETE' })
    },
    { maxRetries: 2, baseDelayMs: 500 }
  )
}

/**
 * Verify TCT Graph credentials work. Returns tenant display name.
 */
export async function verifyTctGraphConnection(): Promise<{ tenantName: string }> {
  const org = await graphRequest<{ value: Array<{ displayName: string }> }>(
    '/organization?$select=displayName'
  )
  return { tenantName: org.value?.[0]?.displayName ?? 'Unknown' }
}
