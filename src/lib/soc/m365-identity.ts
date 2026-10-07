/**
 * SOC — Microsoft Entra (M365) identity correlation.
 *
 * For identity / MFA-change alerts (e.g. "MFA method removed"), the customer's
 * own Microsoft 365 tenant is the AUTHORITATIVE source for what actually
 * happened. This module pulls, scoped strictly to that one tenant via
 * getTenantCredentials(companyId) (so it can never reach another customer):
 *   - directory audit log  → confirms the security-info/MFA change, who did it,
 *                            and whether a method was removed AND re-registered
 *                            in the window (a re-enrollment signature)
 *   - sign-in logs         → device / IP / location / Conditional Access context
 *   - registered auth methods → answers "is the account left weakly protected?"
 *
 * Everything degrades gracefully: a missing tenant connection or un-consented
 * Graph permission becomes a clearly-stated data gap, never a silent "no data".
 *
 * Required Graph Application permissions (consented in the customer's app reg):
 *   - AuditLog.Read.All               (directory audits + sign-in logs)
 *   - UserAuthenticationMethod.Read.All (registered auth methods)
 *   - Directory.Read.All              (user resolution)
 * Sign-in log history additionally requires an Entra ID P1 license on the tenant.
 */

import { getTenantCredentials, getAccessToken, graphRequest, tokenRoles } from '@/lib/graph';
import type { DataSourceStatus, M365IdentityCorrelation, M365AuthMethod, M365AuditEvent, M365ManagedDevice, M365PrivilegeEvent, M365SignIn } from './types';

const WINDOW_MS = 6 * 60 * 60 * 1000; // ±6h, consistent with the rest of SOC enrichment

/** Map a Graph authentication-method @odata.type to a friendly label + whether it's a strong (non-password) factor. */
const METHOD_TYPES: Record<string, { label: string; strong: boolean }> = {
  '#microsoft.graph.microsoftAuthenticatorAuthenticationMethod': { label: 'Microsoft Authenticator', strong: true },
  '#microsoft.graph.fido2AuthenticationMethod': { label: 'FIDO2 security key', strong: true },
  '#microsoft.graph.windowsHelloForBusinessAuthenticationMethod': { label: 'Windows Hello for Business', strong: true },
  '#microsoft.graph.softwareOathAuthenticationMethod': { label: 'Software OATH token', strong: true },
  '#microsoft.graph.temporaryAccessPassAuthenticationMethod': { label: 'Temporary Access Pass', strong: true },
  '#microsoft.graph.phoneAuthenticationMethod': { label: 'Phone (SMS/voice)', strong: true },
  '#microsoft.graph.emailAuthenticationMethod': { label: 'Email (SSPR only)', strong: false },
  '#microsoft.graph.passwordAuthenticationMethod': { label: 'Password', strong: false },
};

/** Audit activities that represent a security-info / MFA / authentication-method change. */
function isAuthMethodActivity(activity: string): boolean {
  const a = activity.toLowerCase();
  return (
    a.includes('security info') ||
    a.includes('authentication method') ||
    a.includes('strong authentication') ||
    a.includes('mfa')
  );
}

interface RawDirectoryAudit {
  activityDisplayName?: string;
  activityDateTime?: string;
  category?: string;
  result?: string;
  initiatedBy?: { user?: { id?: string; userPrincipalName?: string; displayName?: string; ipAddress?: string }; app?: { displayName?: string } };
  targetResources?: Array<{ userPrincipalName?: string; displayName?: string; type?: string; modifiedProperties?: Array<{ displayName?: string; newValue?: string | null }> }>;
}

/**
 * Directory-audit activities that GRANT access — what a "privilege or app
 * grant" alert is about. Matched on Entra's own category first, activity name
 * second; everything else the account did is left out.
 */
/**
 * A user or B2B guest account being created — "Add user" / "Invite external
 * user" in UserManagement. Sharing a OneDrive/SharePoint file with someone
 * outside the company creates exactly this (T20261007.0015: guest
 * a customer guest (#EXT#) added 23 minutes before a Stage 3c alert).
 */
export function isGuestAddActivity(a: { activityDisplayName?: string; category?: string }): boolean {
  return /^(add user|invite external user|add external user|redeem external user invite)$/i.test((a.activityDisplayName ?? '').trim())
}

export function isPrivilegeActivity(a: { activityDisplayName?: string; category?: string }): boolean {
  if (/^(ApplicationManagement|RoleManagement)$/i.test(a.category ?? '')) return true;
  return /consent|app role|role assignment|member to role|service principal|delegated permission|oauth|application|credential|certificate|owner/i.test(a.activityDisplayName ?? '');
}

/** Keep the modified properties that say WHAT was granted; strip Entra's quoting. */
function privilegeDetails(t: NonNullable<RawDirectoryAudit['targetResources']>[number]): string[] {
  const keep = /ConsentAction\.Permissions|ConsentContext\.IsAdminConsent|ConsentContext\.OnBehalfOfAll|Role\.DisplayName|AppRole\.Value|AppRole\.DisplayName|DelegatedPermissionGrant\.Scope|KeyDescription|ServicePrincipalNames|AppAddress/i;
  return (t.modifiedProperties ?? [])
    .filter(m => m.displayName && keep.test(m.displayName) && m.newValue)
    .map(m => `${m.displayName}: ${String(m.newValue).replace(/^"+|"+$/g, '').replace(/\\"/g, '"').replace(/\s+/g, ' ').slice(0, 300)}`);
}

export function toPrivilegeEvent(a: RawDirectoryAudit): M365PrivilegeEvent {
  return {
    kind: isGuestAddActivity(a) ? 'guest_added' : 'grant',
    initiatedBy: a.initiatedBy?.user?.userPrincipalName || a.initiatedBy?.app?.displayName || null,
    time: a.activityDateTime || '',
    activity: a.activityDisplayName || 'unknown activity',
    category: a.category ?? null,
    result: a.result || 'unknown',
    ip: a.initiatedBy?.user?.ipAddress || null,
    targets: (a.targetResources || []).map(t => `${t.type || 'Object'}: ${t.displayName || t.userPrincipalName || '(no name)'}`),
    details: (a.targetResources || []).flatMap(privilegeDetails),
  };
}

interface RawSignIn {
  createdDateTime?: string;
  ipAddress?: string;
  userPrincipalName?: string;
  conditionalAccessStatus?: string;
  status?: { errorCode?: number; failureReason?: string };
  location?: { city?: string; state?: string; countryOrRegion?: string };
  deviceDetail?: { displayName?: string; operatingSystem?: string; browser?: string };
}

interface RawAuthMethod {
  '@odata.type'?: string;
  displayName?: string;
  phoneNumber?: string;
}

/** Is this a "method removed/deleted" audit activity? */
function isRemoval(activity: string): boolean {
  return /delete|deleted|remove|removed|disable/i.test(activity);
}
/** Is this a "method registered/added" audit activity? */
function isRegistration(activity: string): boolean {
  return /register|registered|add|added|enable/i.test(activity);
}

export async function fetchM365Identity(params: {
  companyId: string | null;
  userPrincipalName: string | null;
  /** Entra object id of the account (SaaS Alerts "User Id"), for the initiatedBy filter. */
  userObjectId?: string | null;
  alertTime: string;
}): Promise<{ result: M365IdentityCorrelation | null; status: DataSourceStatus; gap?: string }> {
  const { companyId, userPrincipalName, alertTime } = params;

  if (!companyId) {
    return { result: null, status: { source: 'M365 Tenant', status: 'no_data', detail: 'No company resolved for the ticket.' } };
  }

  const creds = await getTenantCredentials(companyId);
  if (!creds) {
    return {
      result: null,
      status: { source: 'M365 Tenant', status: 'not_configured', detail: "Customer's Microsoft 365 tenant is not connected (no M365 credentials/consent). Connect it under Compliance > Connect Tools." },
      gap: 'M365 tenant not connected — could not confirm the identity change against Entra ID. Connect the tenant and grant AuditLog.Read.All + UserAuthenticationMethod.Read.All.',
    };
  }

  let token: string;
  let roles: string[] | null;
  try {
    token = await getAccessToken(creds.tenantId, creds.clientId, creds.clientSecret);
    roles = tokenRoles(token);
    // A cached token predates any re-consent; if it lacks a role this lookup
    // needs, mint a fresh one before concluding the permission is missing.
    if (roles && SOC_REQUIRED_ROLES.some(r => !roles!.includes(r))) {
      token = await getAccessToken(creds.tenantId, creds.clientId, creds.clientSecret, { fresh: true });
      roles = tokenRoles(token);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      result: null,
      status: { source: 'M365 Tenant', status: 'error', detail: `Could not acquire a Graph token for the tenant: ${detail}` },
      gap: `M365 token acquisition failed — ${detail}`,
    };
  }

  const center = new Date(alertTime).getTime() || Date.now();
  const since = new Date(center - WINDOW_MS).toISOString();
  const until = new Date(center + WINDOW_MS).toISOString();
  const permissionGaps: string[] = [];

  // 1. Directory audit log — the authoritative record of the security-info/MFA change.
  let auditEvents: M365AuditEvent[] = [];
  try {
    const filter = `activityDateTime ge ${since} and activityDateTime le ${until}`;
    const data = await graphRequest<{ value: RawDirectoryAudit[] }>(
      token,
      `/auditLogs/directoryAudits?$filter=${encodeURIComponent(filter)}&$top=100`,
    );
    const upnLower = userPrincipalName?.toLowerCase() || null;
    auditEvents = (data.value || [])
      .filter(a => {
        const activity = a.activityDisplayName || '';
        if (!isAuthMethodActivity(activity)) return false;
        if (!upnLower) return true; // no UPN to scope by — keep all auth-method changes in window
        return (a.targetResources || []).some(t => (t.userPrincipalName || '').toLowerCase() === upnLower);
      })
      .map(a => ({
        activity: a.activityDisplayName || 'unknown activity',
        time: a.activityDateTime || '',
        initiatedBy: a.initiatedBy?.user?.userPrincipalName || a.initiatedBy?.user?.displayName || a.initiatedBy?.app?.displayName || 'unknown',
        result: a.result || 'unknown',
        targetUser: (a.targetResources || []).map(t => t.userPrincipalName).filter(Boolean)[0] || null,
      }));
  } catch (err) {
    recordGraphGap('AuditLog.Read.All (directory audits)', err, permissionGaps, roles, 'AuditLog.Read.All');
  }

  // 1b. What the account ITSELF did that grants access (consents, role
  // assignments, app/service principal changes). The auth-method query above
  // filters on the TARGET user and on MFA activities, so an app consent made
  // BY the user never appeared (T20260930.0005). Filtered server-side on
  // initiatedBy/user/id (documented filter) when the object id is known;
  // otherwise on the initiating UPN in memory.
  let privilegeEvents: M365PrivilegeEvent[] = [];
  if (params.userObjectId || userPrincipalName) {
    try {
      const idFilter = params.userObjectId && /^[0-9a-f-]{36}$/i.test(params.userObjectId)
        ? ` and initiatedBy/user/id eq '${params.userObjectId}'` : '';
      const filter = `activityDateTime ge ${since} and activityDateTime le ${until}${idFilter}`;
      const data = await graphRequest<{ value: RawDirectoryAudit[] }>(
        token,
        `/auditLogs/directoryAudits?$filter=${encodeURIComponent(filter)}&$top=100`,
      );
      const upn = userPrincipalName?.toLowerCase() ?? null;
      privilegeEvents = (data.value || [])
        .filter(a => idFilter || (upn && (a.initiatedBy?.user?.userPrincipalName || '').toLowerCase() === upn))
        .filter(a => isPrivilegeActivity(a) || isGuestAddActivity(a))
        .map(toPrivilegeEvent)
        .sort((x, y) => x.time.localeCompare(y.time));
      // The SaaS Alerts "User Id" is assumed to be the Entra object id; if the
      // id-filtered read finds nothing, re-read the window and match the
      // initiating UPN so a wrong id can never read as "no record".
      if (privilegeEvents.length === 0 && idFilter && upn) {
        const all = await graphRequest<{ value: RawDirectoryAudit[] }>(
          token,
          `/auditLogs/directoryAudits?$filter=${encodeURIComponent(`activityDateTime ge ${since} and activityDateTime le ${until}`)}&$top=500`,
        );
        privilegeEvents = (all.value || [])
          .filter(a => (a.initiatedBy?.user?.userPrincipalName || '').toLowerCase() === upn)
          .filter(a => isPrivilegeActivity(a) || isGuestAddActivity(a))
          .map(toPrivilegeEvent)
          .sort((x, y) => x.time.localeCompare(y.time));
      }
    } catch (err) {
      recordGraphGap('AuditLog.Read.All (privilege / app-grant audit records)', err, permissionGaps, roles, 'AuditLog.Read.All');
    }
  }

  const removeThenReregister =
    auditEvents.some(e => isRemoval(e.activity)) && auditEvents.some(e => isRegistration(e.activity));

  // 2. Sign-in logs for the user in the window (device / IP / Conditional Access). Needs Entra ID P1.
  let signIns: M365SignIn[] = [];
  if (userPrincipalName) {
    try {
      const filter = `createdDateTime ge ${since} and createdDateTime le ${until} and userPrincipalName eq '${userPrincipalName.replace(/'/g, "''")}'`;
      const data = await graphRequest<{ value: RawSignIn[] }>(
        token,
        `/auditLogs/signIns?$filter=${encodeURIComponent(filter)}&$top=50`,
      );
      signIns = (data.value || []).map(s => ({
        time: s.createdDateTime || '',
        ip: s.ipAddress || null,
        location: [s.location?.city, s.location?.state, s.location?.countryOrRegion].filter(Boolean).join(', ') || null,
        device: [s.deviceDetail?.displayName, s.deviceDetail?.operatingSystem, s.deviceDetail?.browser].filter(Boolean).join(' / ') || null,
        deviceName: s.deviceDetail?.displayName || null,
        status: s.status?.errorCode === 0 ? 'success' : `failure${s.status?.failureReason ? `: ${s.status.failureReason}` : ''}`,
        conditionalAccess: s.conditionalAccessStatus || null,
      }));
    } catch (err) {
      recordGraphGap('AuditLog.Read.All / Entra ID P1 (sign-in logs)', err, permissionGaps, roles, 'AuditLog.Read.All');
    }
  }

  // 2b. Intune: devices whose user is this account. The list endpoint's
  // filter support is not documented, so the tenant's devices are read (capped)
  // and matched on userPrincipalName / emailAddress in memory.
  let managedDevices: M365ManagedDevice[] | null = null;
  if (userPrincipalName) {
    try {
      const upn = userPrincipalName.toLowerCase();
      const out: M365ManagedDevice[] = [];
      let path: string | null = '/deviceManagement/managedDevices?$select=deviceName,userPrincipalName,emailAddress,operatingSystem,lastSyncDateTime,complianceState&$top=200';
      for (let page = 0; path && page < 5; page++) {
        const data: { value?: Array<{ deviceName?: string; userPrincipalName?: string; emailAddress?: string; operatingSystem?: string; lastSyncDateTime?: string; complianceState?: string }>; '@odata.nextLink'?: string } =
          await graphRequest(token, path);
        for (const d of data.value || []) {
          if ((d.userPrincipalName || '').toLowerCase() === upn || (d.emailAddress || '').toLowerCase() === upn) {
            out.push({ deviceName: d.deviceName || '(no name)', userPrincipalName: d.userPrincipalName || null, operatingSystem: d.operatingSystem || null, lastSyncDateTime: d.lastSyncDateTime || null, complianceState: d.complianceState || null });
          }
        }
        const next: string | undefined = data['@odata.nextLink'];
        path = next ? next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '') : null;
      }
      managedDevices = out;
    } catch (err) {
      recordGraphGap('DeviceManagementManagedDevices.Read.All (Intune devices)', err, permissionGaps, roles, 'DeviceManagementManagedDevices.Read.All');
    }
  }

  // 3. Current registered authentication methods — answers "is the account left weakly protected?".
  let remainingMethods: M365AuthMethod[] = [];
  if (userPrincipalName) {
    try {
      const data = await graphRequest<{ value: RawAuthMethod[] }>(
        token,
        `/users/${encodeURIComponent(userPrincipalName)}/authentication/methods`,
      );
      remainingMethods = (data.value || []).map(m => {
        const known = m['@odata.type'] ? METHOD_TYPES[m['@odata.type']] : undefined;
        const label = known?.label || (m['@odata.type'] || 'method').replace('#microsoft.graph.', '').replace(/AuthenticationMethod$/, '');
        return { type: label, detail: m.phoneNumber || m.displayName || null };
      });
    } catch (err) {
      recordGraphGap('UserAuthenticationMethod.Read.All (registered methods)', err, permissionGaps, roles, 'UserAuthenticationMethod.Read.All');
    }
  }

  const hasStrongMethodRemaining = remainingMethods.some(m => {
    const entry = Object.values(METHOD_TYPES).find(v => v.label === m.type);
    return entry?.strong === true;
  });

  const result: M365IdentityCorrelation = {
    userPrincipalName,
    auditEvents,
    removeThenReregister,
    signIns,
    remainingMethods,
    hasStrongMethodRemaining,
    permissionGaps,
    privilegeEvents,
    managedDevices,
  };

  // Build the status/gap summary.
  const confirmed = auditEvents.length > 0;
  const pieces: string[] = [];
  if (confirmed) pieces.push(`${auditEvents.length} matching audit event(s)${removeThenReregister ? ' incl. a remove-then-reregister sequence' : ''}`);
  if (privilegeEvents.length > 0) pieces.push(`${privilegeEvents.length} access-granting audit record(s) initiated by the account`);
  if (signIns.length > 0) pieces.push(`${signIns.length} sign-in(s)`);
  if (remainingMethods.length > 0) pieces.push(`${remainingMethods.length} method(s) currently registered`);

  if (pieces.length === 0 && permissionGaps.length > 0) {
    return {
      result,
      status: { source: 'M365 Tenant', status: 'error', detail: `Tenant reachable but Graph permissions/licensing blocked the lookup: ${permissionGaps.join('; ')}.` },
      gap: `M365 tenant connected but the following could not be read: ${permissionGaps.join('; ')}. Each item states why, read from the access token itself; fix that cause, then re-run.`,
    };
  }

  if (pieces.length === 0) {
    return {
      result,
      status: { source: 'M365 Tenant', status: 'no_data', detail: `Tenant reachable but no matching audit events, sign-ins, or methods found in the window for ${userPrincipalName || 'the user'}.` },
      gap: userPrincipalName ? undefined : 'Could not determine the affected user (UPN) from the alert; M365 correlation ran tenant-wide and found nothing specific.',
    };
  }

  return {
    result,
    status: {
      source: 'M365 Tenant',
      status: 'used',
      detail: `Confirmed from ${creds.tenantId ? 'the customer tenant' : 'Entra ID'}: ${pieces.join('; ')}.${permissionGaps.length > 0 ? ` (Partial — ${permissionGaps.join('; ')} unavailable.)` : ''}`,
    },
    gap: permissionGaps.length > 0 ? `M365 partial read — unavailable: ${permissionGaps.join('; ')}.` : undefined,
  };
}

/** Classify a Graph error as a permission/license gap (recorded) vs a generic failure. */
const SOC_REQUIRED_ROLES = ['AuditLog.Read.All', 'UserAuthenticationMethod.Read.All'];

/**
 * Explain WHY a Graph read was refused, from the token itself. "Grant the
 * permission" was printed for every 403, including right after the owner had
 * re-consented (T20260930.0005) — it could not tell a permission the app does
 * not hold from one it holds but Microsoft still refused (e.g. sign-in logs
 * need an Entra ID P1 licence). The token's `roles` claim settles which.
 */
export function recordGraphGap(scope: string, err: unknown, gaps: string[], roles: string[] | null = null, role: string | null = null): void {
  const msg = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 200);
  if (roles && role && !roles.includes(role)) {
    gaps.push(`${scope} — ${role} is NOT in the access token Entra issued for this tenant (token carries: ${roles.length ? roles.join(', ') : 'no application permissions'}). Admin consent only grants what the app registration declares, and a new grant can take a few minutes to appear.`);
  } else if (roles && role) {
    gaps.push(`${scope} — ${role} IS granted, but Microsoft still refused: ${msg}`);
  } else if (/\(403\)|Authorization_RequestDenied|Forbidden|insufficient privileges|tenant.*license|premium/i.test(msg)) {
    gaps.push(`${scope} — refused by Microsoft: ${msg}`);
  } else {
    gaps.push(`${scope} — ${msg.slice(0, 120)}`);
  }
}
