/**
 * Microsoft Graph API Client — Per-Tenant
 *
 * Each TCT customer has their own Azure AD app registration.
 * Credentials (tenantId, clientId, clientSecret) are stored
 * per-company in the database. This module:
 *
 *   1. Fetches credentials for a given companyId
 *   2. Obtains a client-credentials OAuth2 token (cached in-memory per tenant)
 *   3. Exposes typed helpers for every Graph call the HR system needs
 *
 * REQUIRED Azure AD app permissions (Application, not Delegated):
 *   - User.ReadWrite.All
 *   - Group.ReadWrite.All
 *   - GroupMember.ReadWrite.All
 *   - Directory.ReadWrite.All
 *   - Sites.ReadWrite.All        (SharePoint)
 *   - Organization.Read.All      (license SKUs)
 *   - Mail.ReadWrite              (distribution lists via Exchange)
 */

import { Pool } from 'pg'

// ---------------------------------------------------------------------------
// Pool (shared with other raw-pg routes)
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

// ---------------------------------------------------------------------------
// Token cache — keyed by tenantId, expires 5 min before actual expiry
// ---------------------------------------------------------------------------

interface TokenEntry {
  accessToken: string
  expiresAt: number // ms epoch
}

const tokenCache = new Map<string, TokenEntry>()

async function getAccessToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const cached = tokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph token fetch failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  const expiresAt = Date.now() + (data.expires_in - 300) * 1000 // 5-min buffer

  tokenCache.set(tenantId, { accessToken: data.access_token, expiresAt })
  return data.access_token
}

// ---------------------------------------------------------------------------
// Company credentials lookup
// ---------------------------------------------------------------------------

export interface TenantCredentials {
  tenantId: string
  clientId: string
  clientSecret: string
}

export async function getTenantCredentials(companyId: string): Promise<TenantCredentials | null> {
  const client = await pool.connect()
  try {
    const res = await client.query<{
      m365_tenant_id: string | null
      m365_client_id: string | null
      m365_client_secret: string | null
    }>(
      `SELECT m365_tenant_id, m365_client_id, m365_client_secret
       FROM companies WHERE id = $1 LIMIT 1`,
      [companyId]
    )

    if (res.rows.length === 0) return null
    const row = res.rows[0]

    if (!row.m365_tenant_id || !row.m365_client_id || !row.m365_client_secret) {
      return null
    }

    return {
      tenantId:     row.m365_tenant_id,
      clientId:     row.m365_client_id,
      clientSecret: row.m365_client_secret,
    }
  } finally {
    client.release()
  }
}

export async function getTenantCredentialsBySlug(companySlug: string): Promise<(TenantCredentials & { companyId: string }) | null> {
  const client = await pool.connect()
  try {
    const res = await client.query<{
      id: string
      m365_tenant_id: string | null
      m365_client_id: string | null
      m365_client_secret: string | null
    }>(
      `SELECT id, m365_tenant_id, m365_client_id, m365_client_secret
       FROM companies WHERE slug = $1 LIMIT 1`,
      [companySlug]
    )

    if (res.rows.length === 0) return null
    const row = res.rows[0]

    if (!row.m365_tenant_id || !row.m365_client_id || !row.m365_client_secret) {
      return null
    }

    return {
      companyId:    row.id,
      tenantId:     row.m365_tenant_id,
      clientId:     row.m365_client_id,
      clientSecret: row.m365_client_secret,
    }
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------------
// Typed Graph response shapes
// ---------------------------------------------------------------------------

export interface GraphUser {
  id: string
  displayName: string
  userPrincipalName: string
  mail: string | null
  jobTitle: string | null
  department: string | null
  accountEnabled: boolean
  givenName: string | null
  surname: string | null
}

export interface GraphGroup {
  id: string
  displayName: string
  description: string | null
  mail: string | null
  groupTypes: string[]
  mailEnabled: boolean
  securityEnabled: boolean
}

export interface GraphSite {
  id: string
  displayName: string
  webUrl: string
  name: string
}

export interface GraphLicenseSku {
  skuId: string
  skuPartNumber: string
  displayName: string | null  // friendly name from lookup table
  consumedUnits: number
  prepaidUnits: { enabled: number; suspended: number; warning: number }
}

// Friendly name map for common M365 SKU part numbers
const SKU_FRIENDLY_NAMES: Record<string, string> = {
  'O365_BUSINESS_ESSENTIALS':      'Microsoft 365 Business Basic',
  'SMB_BUSINESS':                  'Microsoft 365 Apps for Business',
  'O365_BUSINESS_PREMIUM':         'Microsoft 365 Business Standard',
  'SPB':                           'Microsoft 365 Business Premium',
  'ENTERPRISEPACK':                'Office 365 E3',
  'ENTERPRISEPREMIUM':             'Office 365 E5',
  'SPE_E3':                        'Microsoft 365 E3',
  'SPE_E5':                        'Microsoft 365 E5',
  'EXCHANGESTANDARD':              'Exchange Online (Plan 1)',
  'EXCHANGEENTERPRISE':            'Exchange Online (Plan 2)',
  'TEAMS_ESSENTIALS':              'Microsoft Teams Essentials',
  'O365_BUSINESS':                 'Microsoft 365 Apps for Business',
  'MCOSTANDARD':                   'Skype for Business Online (Plan 2)',
}

// ---------------------------------------------------------------------------
// Core Graph request helper
// ---------------------------------------------------------------------------

async function graphRequest<T>(
  token: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph API ${path} failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<T>
}

// Paginate through @odata.nextLink automatically
async function graphGetAll<T>(token: string, path: string): Promise<T[]> {
  const results: T[] = []
  let url: string | null = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`

  while (url) {
    const page: { value: T[]; '@odata.nextLink'?: string } =
      await graphRequest<{ value: T[]; '@odata.nextLink'?: string }>(token, url)
    results.push(...(page.value ?? []))
    url = page['@odata.nextLink'] ?? null
  }

  return results
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a Graph client bound to a specific tenant's credentials */
export function createGraphClient(creds: TenantCredentials) {
  let cachedToken: string | null = null

  async function token(): Promise<string> {
    if (!cachedToken) {
      cachedToken = await getAccessToken(creds.tenantId, creds.clientId, creds.clientSecret)
    }
    return cachedToken
  }

  return {
    /** Verify credentials work — returns tenant display name */
    async verifyConnection(): Promise<{ tenantName: string; tenantId: string }> {
      const t = await token()
      const org = await graphRequest<{ value: Array<{ displayName: string; id: string }> }>(
        t, '/organization?$select=displayName,id'
      )
      return {
        tenantName: org.value[0]?.displayName ?? 'Unknown',
        tenantId: org.value[0]?.id ?? creds.tenantId,
      }
    },

    /** All licensed users (enabled accounts only, max 999) */
    async getUsers(): Promise<GraphUser[]> {
      const t = await token()
      return graphGetAll<GraphUser>(
        t,
        '/users?$select=id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled,givenName,surname' +
        '&$filter=accountEnabled eq true&$top=999'
      )
    },

    /** Security groups (non-mail-enabled) */
    async getSecurityGroups(): Promise<GraphGroup[]> {
      const t = await token()
      const all = await graphGetAll<GraphGroup>(
        t,
        '/groups?$select=id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled' +
        '&$filter=securityEnabled eq true and mailEnabled eq false&$top=999'
      )
      return all.sort((a, b) => a.displayName.localeCompare(b.displayName))
    },

    /** Distribution lists (mail-enabled, security-disabled) */
    async getDistributionLists(): Promise<GraphGroup[]> {
      const t = await token()
      const all = await graphGetAll<GraphGroup>(
        t,
        '/groups?$select=id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled' +
        "&$filter=mailEnabled eq true and securityEnabled eq false&$top=999"
      )
      return all.sort((a, b) => a.displayName.localeCompare(b.displayName))
    },

    /** Microsoft 365 Groups (Teams + SharePoint group-connected) */
    async getM365Groups(): Promise<GraphGroup[]> {
      const t = await token()
      const all = await graphGetAll<GraphGroup>(
        t,
        "/groups?$select=id,displayName,description,mail,groupTypes,mailEnabled,securityEnabled" +
        "&$filter=groupTypes/any(c:c eq 'Unified')&$top=999"
      )
      return all.sort((a, b) => a.displayName.localeCompare(b.displayName))
    },

    /** SharePoint sites (top 100 by name) */
    async getSharePointSites(): Promise<GraphSite[]> {
      const t = await token()
      try {
        const res = await graphRequest<{ value: GraphSite[] }>(
          t,
          '/sites?search=*&$select=id,displayName,webUrl,name&$top=100'
        )
        return (res.value ?? []).sort((a, b) => a.displayName.localeCompare(b.displayName))
      } catch {
        // Sites.ReadWrite.All not consented — return empty rather than crashing
        return []
      }
    },

    /** Subscribed license SKUs with friendly names */
    async getLicenseSkus(): Promise<GraphLicenseSku[]> {
      const t = await token()
      const res = await graphRequest<{
        value: Array<{
          skuId: string
          skuPartNumber: string
          consumedUnits: number
          prepaidUnits: { enabled: number; suspended: number; warning: number }
        }>
      }>(t, '/subscribedSkus?$select=skuId,skuPartNumber,consumedUnits,prepaidUnits')

      return (res.value ?? []).map((sku) => ({
        skuId: sku.skuId,
        skuPartNumber: sku.skuPartNumber,
        displayName: SKU_FRIENDLY_NAMES[sku.skuPartNumber] ?? sku.skuPartNumber,
        consumedUnits: sku.consumedUnits,
        prepaidUnits: sku.prepaidUnits,
      })).sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''))
    },

    // -----------------------------------------------------------------
    // Write methods — provisioning pipeline
    // -----------------------------------------------------------------

    /** Create a new M365 user with a temporary password */
    async createUser(userData: {
      displayName: string
      userPrincipalName: string
      mailNickname: string
      password: string
      jobTitle?: string
      department?: string
      usageLocation?: string
      accountEnabled?: boolean
    }): Promise<GraphUser> {
      const t = await token()
      return graphRequest<GraphUser>(t, '/users', {
        method: 'POST',
        body: JSON.stringify({
          displayName: userData.displayName,
          userPrincipalName: userData.userPrincipalName,
          mailNickname: userData.mailNickname,
          passwordProfile: {
            password: userData.password,
            forceChangePasswordNextSignIn: true,
          },
          jobTitle: userData.jobTitle ?? null,
          department: userData.department ?? null,
          usageLocation: userData.usageLocation ?? null,
          accountEnabled: userData.accountEnabled ?? true,
        }),
      })
    },

    /** Assign a license to a user by SKU ID */
    async assignLicense(userId: string, skuId: string): Promise<void> {
      const t = await token()
      await graphRequest(t, `/users/${userId}/assignLicense`, {
        method: 'POST',
        body: JSON.stringify({
          addLicenses: [{ skuId, disabledPlans: [] }],
          removeLicenses: [],
        }),
      })
    },

    /** Add a user to a group */
    async addUserToGroup(groupId: string, userId: string): Promise<void> {
      const t = await token()
      await graphRequest(t, `/groups/${groupId}/members/$ref`, {
        method: 'POST',
        body: JSON.stringify({
          '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
        }),
      })
    },

    /** Revoke all sign-in sessions for a user */
    async revokeSignInSessions(userId: string): Promise<void> {
      const t = await token()
      await graphRequest(t, `/users/${userId}/revokeSignInSessions`, {
        method: 'POST',
      })
    },

    /** Disable a user account */
    async disableAccount(userId: string): Promise<void> {
      const t = await token()
      await graphRequest(t, `/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ accountEnabled: false }),
      })
    },

    /** Remove a license from a user */
    async removeLicense(userId: string, skuId: string): Promise<void> {
      const t = await token()
      await graphRequest(t, `/users/${userId}/assignLicense`, {
        method: 'POST',
        body: JSON.stringify({
          addLicenses: [],
          removeLicenses: [skuId],
        }),
      })
    },

    /** Remove a user from a group */
    async removeUserFromGroup(groupId: string, userId: string): Promise<void> {
      const t = await token()
      await graphRequest(t, `/groups/${groupId}/members/${userId}/$ref`, {
        method: 'DELETE',
      })
    },

    /** Get all groups a user is a member of */
    async getUserGroups(userId: string): Promise<GraphGroup[]> {
      const t = await token()
      return graphGetAll<GraphGroup>(t, `/users/${userId}/memberOf`)
    },

    /** Look up a user by email/UPN */
    async getUserByEmail(email: string): Promise<GraphUser | null> {
      const t = await token()
      try {
        return await graphRequest<GraphUser>(
          t,
          `/users/${encodeURIComponent(email)}?$select=id,displayName,userPrincipalName,mail,jobTitle,department,accountEnabled`
        )
      } catch {
        return null
      }
    },

    // -----------------------------------------------------------------
    // OneDrive & SharePoint — offboarding file handling
    // -----------------------------------------------------------------

    /** Grant a user read access to another user's OneDrive via sharing link */
    async grantOneDriveAccess(
      ownerUserId: string,
      recipientEmail: string
    ): Promise<{ webUrl: string }> {
      const t = await token()
      // Get the OneDrive root
      const drive = await graphRequest<{ id: string; webUrl: string }>(
        t,
        `/users/${ownerUserId}/drive/root`
      )
      // Create a sharing invitation for the recipient
      await graphRequest(t, `/users/${ownerUserId}/drive/root/invite`, {
        method: 'POST',
        body: JSON.stringify({
          requireSignIn: true,
          sendInvitation: false, // We send our own email
          roles: ['read'],
          recipients: [{ email: recipientEmail }],
          message: 'OneDrive files shared as part of employee offboarding',
        }),
      })
      return { webUrl: drive.webUrl }
    },

    /** Find or create an HR SharePoint site for archiving offboarded employee files */
    async getOrCreateHRSharePointSite(): Promise<{ siteId: string; webUrl: string; driveId: string }> {
      const t = await token()

      // Search for an existing HR site
      try {
        const search = await graphRequest<{ value: Array<{ id: string; webUrl: string; displayName: string }> }>(
          t,
          "/sites?search=Human Resources&$select=id,webUrl,displayName&$top=10"
        )
        const hrSite = search.value?.find(
          (s) => /^(hr|human\s*resources)$/i.test(s.displayName)
        )
        if (hrSite) {
          // Get the default drive
          const drive = await graphRequest<{ id: string }>(t, `/sites/${hrSite.id}/drive`)
          return { siteId: hrSite.id, webUrl: hrSite.webUrl, driveId: drive.id }
        }
      } catch {
        // Search failed — proceed to create
      }

      // Create a new team site (group-connected) for HR
      const group = await graphRequest<{ id: string }>(t, '/groups', {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Human Resources',
          description: 'HR document archive for offboarded employee files',
          groupTypes: ['Unified'],
          mailEnabled: true,
          mailNickname: 'humanresources',
          securityEnabled: false,
          visibility: 'Private',
        }),
      })

      // Wait briefly for SharePoint site provisioning
      await new Promise((r) => setTimeout(r, 5000))

      // Get the group's SharePoint site
      const site = await graphRequest<{ id: string; webUrl: string }>(
        t,
        `/groups/${group.id}/sites/root`
      )
      const drive = await graphRequest<{ id: string }>(t, `/sites/${site.id}/drive`)

      return { siteId: site.id, webUrl: site.webUrl, driveId: drive.id }
    },

    /** Copy a user's OneDrive files to a folder on a SharePoint site */
    async archiveOneDriveToSharePoint(
      ownerUserId: string,
      targetDriveId: string,
      folderName: string
    ): Promise<{ folderWebUrl: string; fileCount: number }> {
      const t = await token()

      // Create the archive folder on the target drive
      const folder = await graphRequest<{ id: string; webUrl: string }>(
        t,
        `/drives/${targetDriveId}/root/children`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'rename',
          }),
        }
      )

      // List top-level items in the user's OneDrive
      const items = await graphGetAll<{
        id: string
        name: string
        size: number
        folder?: Record<string, unknown>
      }>(t, `/users/${ownerUserId}/drive/root/children?$select=id,name,size,folder`)

      let fileCount = 0
      for (const item of items) {
        try {
          // Copy each item to the archive folder
          await graphRequest(t, `/users/${ownerUserId}/drive/items/${item.id}/copy`, {
            method: 'POST',
            body: JSON.stringify({
              parentReference: {
                driveId: targetDriveId,
                id: folder.id,
              },
              name: item.name,
            }),
          })
          fileCount++
        } catch {
          // Non-fatal per item — some may be too large or locked
        }
      }

      return { folderWebUrl: folder.webUrl, fileCount }
    },

    /** Find a license SKU by its part number (e.g. EXCHANGESTANDARD) */
    async getLicenseSkuByPartNumber(partNumber: string): Promise<GraphLicenseSku | null> {
      const t = await token()
      const res = await graphRequest<{
        value: Array<{
          skuId: string
          skuPartNumber: string
          consumedUnits: number
          prepaidUnits: { enabled: number; suspended: number; warning: number }
        }>
      }>(t, '/subscribedSkus?$select=skuId,skuPartNumber,consumedUnits,prepaidUnits')

      const match = (res.value ?? []).find(
        (s) => s.skuPartNumber.toLowerCase() === partNumber.toLowerCase()
      )
      if (!match) return null
      return {
        skuId: match.skuId,
        skuPartNumber: match.skuPartNumber,
        displayName: SKU_FRIENDLY_NAMES[match.skuPartNumber] ?? match.skuPartNumber,
        consumedUnits: match.consumedUnits,
        prepaidUnits: match.prepaidUnits,
      }
    },
  }
}
