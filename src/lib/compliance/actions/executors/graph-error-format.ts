/**
 * Format a Graph API error into a friendly, actionable summary for the
 * preview UI. The default behavior in previewers was to dump
 * `err.message` verbatim — that exposed the entire JSON error body from
 * Graph, including activity ids and proxy URLs, which is unhelpful and
 * looks broken to the operator.
 *
 * For the two errors we hit most often:
 *   403 Forbidden    → "App reg is missing scope X — grant it in M365 admin"
 *   401 Unauthorized → "Token expired or app reg consent lapsed — reconnect M365"
 *
 * For anything else, we keep the original message but strip the JSON
 * body so the operator sees a clean one-line summary instead of a
 * multi-paragraph dump.
 */

const SCOPE_HINTS_BY_PATH: Array<{ pattern: RegExp; scopes: string[] }> = [
  // Compliance + configuration policies live under the same Intune scope.
  { pattern: /\/deviceManagement\/deviceCompliancePolicies/i,  scopes: ['DeviceManagementConfiguration.Read.All'] },
  { pattern: /\/deviceManagement\/deviceConfigurations/i,      scopes: ['DeviceManagementConfiguration.Read.All'] },
  { pattern: /\/deviceManagement\/managedDevices/i,            scopes: ['DeviceManagementManagedDevices.Read.All'] },
  { pattern: /\/identity\/conditionalAccess\/policies/i,       scopes: ['Policy.Read.All'] },
  { pattern: /\/policies\/authenticationMethodsPolicy/i,       scopes: ['Policy.Read.All'] },
  { pattern: /\/directorySettingTemplates/i,                   scopes: ['Directory.Read.All'] },
  { pattern: /\/users/i,                                       scopes: ['User.Read.All'] },
  { pattern: /\/groups/i,                                      scopes: ['Group.Read.All'] },
]

function detectScopeHint(rawMessage: string): string[] {
  for (const { pattern, scopes } of SCOPE_HINTS_BY_PATH) {
    if (pattern.test(rawMessage)) return scopes
  }
  return []
}

/**
 * Convert a Graph error string into a one-line operator-facing message.
 * Returns null when the error doesn't look like a Graph error — caller
 * should fall back to its own formatting in that case.
 */
export function formatGraphPreviewError(err: unknown, operation: string): string {
  const raw = err instanceof Error ? err.message : String(err)

  // graphRequest throws `Graph API <path> failed (<status>): <body>` —
  // pull out the status so we can branch by HTTP code.
  const statusMatch = raw.match(/failed \((\d{3})\)/)
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0

  if (status === 403) {
    const scopes = detectScopeHint(raw)
    if (scopes.length > 0) {
      return (
        `Could not ${operation} — the customer's M365 app registration is missing the ` +
        `${scopes.join(' / ')} permission. Grant it in the Microsoft 365 admin center ` +
        `under Enterprise Applications → TCT Customer Portal → Permissions, then ask ` +
        `a Global Admin to re-consent on behalf of the organization.`
      )
    }
    return (
      `Could not ${operation} — Microsoft Graph returned 403 Forbidden. The customer's ` +
      `app registration is missing a required permission. Check the consented scopes in ` +
      `the Microsoft 365 admin center.`
    )
  }

  if (status === 401) {
    return (
      `Could not ${operation} — Microsoft Graph returned 401 Unauthorized. The customer's ` +
      `M365 connection may have expired or the admin-consent grant has been revoked. ` +
      `Reconnect M365 from step 3.`
    )
  }

  if (status === 429) {
    return `Could not ${operation} — Microsoft Graph is throttling requests (429). Retry in a few minutes.`
  }

  if (status === 404) {
    return `Could not ${operation} — Microsoft Graph returned 404. The endpoint or resource isn't available on this tenant.`
  }

  // Anything else: keep the first line of the raw message so the
  // operator gets a hint about what failed, but drop the JSON body so
  // we don't paste a 3 KB blob into the preview card.
  const firstLine = raw.split(/[\n{]/)[0].trim()
  return `Could not ${operation}: ${firstLine || 'unknown error'}.`
}
