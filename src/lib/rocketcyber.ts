/**
 * RocketCyber Customer API Client
 *
 * RocketCyber (Kaseya) Managed SOC. The Customer API is read-only (GET only).
 *
 * Base URL (US region): https://api-us.rocketcyber.com/v3
 * Docs:                  https://api-doc.rocketcyber.com/
 * Token location:        RocketCyber portal > Provider Settings > RocketCyber API
 *
 * Auth: Bearer token in the Authorization header.
 *
 * Endpoints used here:
 *   GET /incidents   — list/filter incidents (id, accountId, status, page, pageSize)
 *   GET /events      — detection-level events (accountId, appId, verdict, dates)
 *
 * WHY THIS EXISTS: RocketCyber emails an Autotask ticket built from a
 * notification template that frequently leaves the interesting fields
 * (process, path, command line, hash) as "UNDEFINED". The real detection
 * detail — what you see behind the "Details" button in the RocketCyber
 * portal — lives in the incident/event payload returned by this API. The SOC
 * Analyst pulls that payload so it correlates on real data, not the gutted
 * ticket body.
 *
 * Field names on RocketCyber events are app-specific and largely undocumented,
 * so detection-field extraction walks the raw JSON looking for the first key
 * that matches a set of known aliases. The raw payload is always preserved so
 * the AI sees everything.
 */

export interface RocketCyberDetail {
  incidentId: string;
  accountId: string | null;
  title: string | null;
  status: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  description: string | null;
  remediation: string | null;
  eventCount: number;

  // Detection fields (best-effort extraction from incident + events)
  actionTaken: string | null;
  eventTime: string | null;
  path: string | null;
  process: string | null;
  targetCommandLine: string | null;
  parentCommandLine: string | null;
  userContext: string | null;
  hash: string | null;
  threatName: string | null;
  threatType: string | null;
  severity: string | null;
  device: string | null;
  organization: string | null;
  detectionMessage: string | null;

  // Raw passthrough — given to the AI verbatim so nothing is lost
  rawIncident: unknown;
  rawEvents: unknown[];
}

interface RawIncidentEnvelope {
  data?: unknown[];
  total?: number;
  page?: number;
  pageSize?: number;
}

const DETECTION_FIELD_ALIASES: Record<keyof DetectionFields, string[]> = {
  actionTaken: ['actionTaken', 'action', 'remediationAction', 'responseAction', 'detectionAction'],
  eventTime: ['eventTime', 'eventTimestamp', 'detectionTime', 'timestamp', 'time', 'occurredAt'],
  path: ['path', 'filePath', 'imagePath', 'processPath', 'targetPath'],
  process: ['process', 'processName', 'image', 'imageName', 'fileName'],
  targetCommandLine: ['targetCommandLine', 'commandLine', 'processCommandLine', 'cmdLine', 'targetCmdLine'],
  parentCommandLine: ['parentCommandLine', 'parentCmdLine', 'parentProcessCommandLine'],
  userContext: ['userContext', 'user', 'userName', 'username', 'account', 'accountName', 'subjectUserName'],
  hash: ['hash', 'sha256', 'sha1', 'md5', 'fileHash', 'sha256Hash', 'computedHash', 'computed_hash'],
  threatName: ['threatName', 'threat', 'malwareName', 'detectionName', 'ruleName', 'signatureName'],
  threatType: ['threatType', 'category', 'threatCategory', 'detectionType', 'malwareType'],
  severity: ['severity', 'priority', 'riskLevel', 'level'],
  device: ['device', 'deviceName', 'hostname', 'host', 'computerName', 'machineName', 'endpoint'],
  organization: ['organization', 'organizationName', 'customer', 'customerName', 'accountName'],
  detectionMessage: ['detectionMessage', 'message', 'detection', 'summary', 'eventSummary', 'description'],
};

type DetectionFields = {
  actionTaken: string | null;
  eventTime: string | null;
  path: string | null;
  process: string | null;
  targetCommandLine: string | null;
  parentCommandLine: string | null;
  userContext: string | null;
  hash: string | null;
  threatName: string | null;
  threatType: string | null;
  severity: string | null;
  device: string | null;
  organization: string | null;
  detectionMessage: string | null;
};

export class RocketCyberClient {
  private apiToken: string;
  private baseUrl: string;
  // RocketCyber's documented header is Bearer, but some tenants accept a raw
  // token. We try Bearer first and fall back to raw on a 401/403.
  private authStyle: 'bearer' | 'raw' = 'bearer';

  constructor() {
    this.apiToken = process.env.ROCKETCYBER_API_TOKEN || '';
    this.baseUrl = (process.env.ROCKETCYBER_API_URL || 'https://api-us.rocketcyber.com/v3').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return !!this.apiToken;
  }

  private authHeader(): string {
    return this.authStyle === 'bearer' ? `Bearer ${this.apiToken}` : this.apiToken;
  }

  private async request<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const qs = new URLSearchParams();
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      }
    }
    const url = `${this.baseUrl}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;

    const doFetch = () => fetch(url, {
      headers: { Authorization: this.authHeader(), Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });

    let res = await doFetch();
    // Auth fallback: flip Bearer <-> raw once and retry.
    if ((res.status === 401 || res.status === 403) && this.authStyle === 'bearer') {
      this.authStyle = 'raw';
      res = await doFetch();
    }

    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `RocketCyber auth rejected (${res.status}) on ${path}. ` +
        `Verify ROCKETCYBER_API_TOKEN (Provider Settings > RocketCyber API) and that it has Customer API access. Body: ${text.slice(0, 200)}`
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RocketCyber API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const text = await res.text();
    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
  }

  /** Normalize the various envelope shapes the API may return into a flat array. */
  private unwrap(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const env = data as RawIncidentEnvelope & Record<string, unknown>;
      if (Array.isArray(env.data)) return env.data;
      // Single-object response
      if ('id' in env) return [env];
    }
    return [];
  }

  private matchById(list: unknown[], incidentId: string): unknown | undefined {
    const byId = list.find(it => it && typeof it === 'object' && String((it as Record<string, unknown>).id ?? '') === String(incidentId));
    if (byId) return byId;
    return list.length === 1 ? list[0] : undefined;
  }

  /** Fetch a single incident by its RocketCyber incident ID (tries several strategies). */
  async getIncident(incidentId: string, accountId?: string | null): Promise<unknown | null> {
    // 1. Filter by id (+ accountId if known).
    try {
      const data = await this.request<unknown>('/incidents', { id: incidentId, accountId: accountId || undefined });
      const found = this.matchById(this.unwrap(data), incidentId);
      if (found) return found;
    } catch { /* try next */ }

    // 2. Path-style lookup.
    try {
      const single = await this.request<unknown>(`/incidents/${encodeURIComponent(incidentId)}`);
      const unwrapped = this.unwrap(single);
      if (unwrapped.length) return unwrapped[0];
      if (single && typeof single === 'object' && 'id' in single) return single;
    } catch { /* try next */ }

    // 3. List the account's incidents and find by id.
    if (accountId) {
      try {
        const data = await this.request<unknown>('/incidents', { accountId, pageSize: 1000 });
        const found = this.matchById(this.unwrap(data), incidentId);
        if (found) return found;
      } catch { /* give up */ }
    }
    return null;
  }

  /** Fetch detection-level events for an account, optionally narrowed by a date window. */
  async getEvents(params: {
    accountId: string;
    appId?: string | number;
    verdict?: 'informational' | 'suspicious' | 'malicious';
    since?: string;
    until?: string;
    pageSize?: number;
  }): Promise<unknown[]> {
    const dates =
      params.since || params.until
        ? JSON.stringify([params.since || '', params.until || ''])
        : undefined;
    const data = await this.request<unknown>('/events', {
      accountId: params.accountId,
      appId: params.appId,
      verdict: params.verdict,
      dates,
      pageSize: params.pageSize ?? 100,
    });
    return this.unwrap(data);
  }

  /**
   * Fetch an incident and assemble a normalized detail object with the
   * detection fields the SOC analyst needs. Best-effort: any missing field
   * stays null, and the raw payloads are always included.
   */
  async getIncidentDetail(incidentId: string, accountId?: string | null): Promise<RocketCyberDetail | null> {
    const incident = await this.getIncident(incidentId, accountId);
    if (!incident || typeof incident !== 'object') return null;

    const inc = incident as Record<string, unknown>;
    const resolvedAccountId =
      accountId ||
      asString(inc.accountId ?? inc.account_id ?? inc.customerId ?? inc.customer_id) ||
      null;

    // Extract detection fields from the incident object itself first.
    let fields = extractDetectionFields(incident);

    // If the high-value fields are still missing, pull events around the
    // incident time and merge the best match.
    const rawEvents: unknown[] = [];
    const needsEvents = !fields.process || !fields.path || !fields.hash;
    if (needsEvents && resolvedAccountId) {
      const createdAt = asString(inc.createdAt ?? inc.created_at);
      const since = createdAt ? new Date(new Date(createdAt).getTime() - 60 * 60 * 1000).toISOString() : undefined;
      const until = createdAt ? new Date(new Date(createdAt).getTime() + 60 * 60 * 1000).toISOString() : undefined;
      const appId = asString(inc.appId ?? inc.app_id ?? inc.applicationId) || undefined;
      const dates = since || until ? JSON.stringify([since || '', until || '']) : undefined;

      // The IOC detail (path/process/hash) lives on the EVENT, not the incident.
      // RocketCyber's event linkage isn't consistently documented, so try the
      // likely shapes and use whatever returns events. Each is best-effort.
      const attempts: Array<() => Promise<unknown>> = [
        () => this.request<unknown>(`/incidents/${encodeURIComponent(incidentId)}/events`),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, incidentId, appId, dates }),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, appId, dates }),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, appId }),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, dates }),
      ];
      for (const attempt of attempts) {
        try {
          const events = this.unwrap(await attempt());
          if (events.length > 0) {
            rawEvents.push(...events);
            for (const ev of events) fields = mergeFields(fields, extractDetectionFields(ev));
            if (fields.process || fields.path || fields.hash) break;
          }
        } catch {
          // Try the next shape.
        }
      }
    }

    return {
      incidentId,
      accountId: resolvedAccountId,
      title: asString(inc.title ?? inc.name),
      status: asString(inc.status),
      createdAt: asString(inc.createdAt ?? inc.created_at),
      resolvedAt: asString(inc.resolvedAt ?? inc.resolved_at),
      description: asString(inc.description),
      remediation: asString(inc.remediation),
      eventCount: typeof inc.eventCount === 'number' ? inc.eventCount : rawEvents.length,
      ...fields,
      rawIncident: incident,
      rawEvents,
    };
  }
}

// ── Field extraction helpers ──

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t || t.toUpperCase() === 'UNDEFINED' || t.toUpperCase() === 'NULL') return null;
    return t;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

/** Recursively collect the first non-empty value for each alias key. */
function extractDetectionFields(obj: unknown): DetectionFields {
  const found: Partial<Record<keyof DetectionFields, string>> = {};
  const aliasLookup = new Map<string, keyof DetectionFields>();
  for (const [field, aliases] of Object.entries(DETECTION_FIELD_ALIASES) as [keyof DetectionFields, string[]][]) {
    for (const a of aliases) aliasLookup.set(a.toLowerCase(), field);
  }

  const visit = (node: unknown, depth: number) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const field = aliasLookup.get(key.toLowerCase());
      if (field && found[field] === undefined) {
        const str = asString(value);
        if (str) found[field] = str;
      }
      if (value && typeof value === 'object') visit(value, depth + 1);
    }
  };
  visit(obj, 0);

  return {
    actionTaken: found.actionTaken ?? null,
    eventTime: found.eventTime ?? null,
    path: found.path ?? null,
    process: found.process ?? null,
    targetCommandLine: found.targetCommandLine ?? null,
    parentCommandLine: found.parentCommandLine ?? null,
    userContext: found.userContext ?? null,
    hash: found.hash ?? null,
    threatName: found.threatName ?? null,
    threatType: found.threatType ?? null,
    severity: found.severity ?? null,
    device: found.device ?? null,
    organization: found.organization ?? null,
    detectionMessage: found.detectionMessage ?? null,
  };
}

function mergeFields(base: DetectionFields, extra: DetectionFields): DetectionFields {
  const out = { ...base };
  for (const key of Object.keys(out) as (keyof DetectionFields)[]) {
    if (!out[key] && extra[key]) out[key] = extra[key];
  }
  return out;
}
