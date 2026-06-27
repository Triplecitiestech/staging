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

import { getTenantCredentials, getAccessToken, graphRequest } from '@/lib/graph';
import type { DataSourceStatus, M365IdentityCorrelation, M365AuthMethod, M365AuditEvent, M365SignIn } from './types';

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
  result?: string;
  initiatedBy?: { user?: { userPrincipalName?: string; displayName?: string }; app?: { displayName?: string } };
  targetResources?: Array<{ userPrincipalName?: string; displayName?: string; type?: string }>;
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
  try {
    token = await getAccessToken(creds.tenantId, creds.clientId, creds.clientSecret);
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
    recordGraphGap('AuditLog.Read.All (directory audits)', err, permissionGaps);
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
        status: s.status?.errorCode === 0 ? 'success' : `failure${s.status?.failureReason ? `: ${s.status.failureReason}` : ''}`,
        conditionalAccess: s.conditionalAccessStatus || null,
      }));
    } catch (err) {
      recordGraphGap('AuditLog.Read.All / Entra ID P1 (sign-in logs)', err, permissionGaps);
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
      recordGraphGap('UserAuthenticationMethod.Read.All (registered methods)', err, permissionGaps);
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
  };

  // Build the status/gap summary.
  const confirmed = auditEvents.length > 0;
  const pieces: string[] = [];
  if (confirmed) pieces.push(`${auditEvents.length} matching audit event(s)${removeThenReregister ? ' incl. a remove-then-reregister sequence' : ''}`);
  if (signIns.length > 0) pieces.push(`${signIns.length} sign-in(s)`);
  if (remainingMethods.length > 0) pieces.push(`${remainingMethods.length} method(s) currently registered`);

  if (pieces.length === 0 && permissionGaps.length > 0) {
    return {
      result,
      status: { source: 'M365 Tenant', status: 'error', detail: `Tenant reachable but Graph permissions/licensing blocked the lookup: ${permissionGaps.join('; ')}.` },
      gap: `M365 tenant connected but the following could not be read: ${permissionGaps.join('; ')}. Grant the listed permissions (and ensure Entra ID P1 for sign-in logs) in the customer's app registration, then re-run.`,
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
function recordGraphGap(scope: string, err: unknown, gaps: string[]): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\(403\)|Authorization_RequestDenied|Forbidden|insufficient privileges|tenant.*license|premium/i.test(msg)) {
    gaps.push(scope);
  } else {
    gaps.push(`${scope} — ${msg.slice(0, 120)}`);
  }
}
