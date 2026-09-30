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
  /** Events tied to THIS incident (by incident id, or same device within ±1h). */
  rawEvents: unknown[];
  /**
   * Account events that are NOT tied to this incident (other devices, other
   * times). Kept apart on purpose: on Wilmar T20260927.0006 the account-wide
   * /events fallback pulled WIL0178 / MOBILE077 / WIL0225 detections from a
   * different day into "this incident", and the analysis called that lateral
   * movement. They are environment context, never this incident's detail.
   */
  otherEvents: unknown[];
  /** The id on the incident record the API returned — must equal incidentId. */
  incidentRecordId: string | null;
}

interface RawIncidentEnvelope {
  data?: unknown[];
  total?: number;
  page?: number;
  pageSize?: number;
}

const DETECTION_FIELD_ALIASES: Record<keyof DetectionFields, string[]> = {
  actionTaken: ['actionTaken', 'action', 'remediationAction', 'responseAction', 'detectionAction'],
  eventTime: ['eventTime', 'event_time', 'eventTimestamp', 'detectionTime', 'timestamp', 'time', 'occurredAt'],
  path: ['path', 'filePath', 'imagePath', 'processPath', 'targetPath'],
  process: ['process', 'processName', 'image', 'imageName', 'fileName'],
  targetCommandLine: ['targetCommandLine', 'commandLine', 'processCommandLine', 'cmdLine', 'targetCmdLine', 'target_commandline'],
  parentCommandLine: ['parentCommandLine', 'parentCmdLine', 'parentProcessCommandLine', 'parent_commandline'],
  userContext: ['userContext', 'user', 'userName', 'username', 'account', 'accountName', 'subjectUserName', 'user_name'],
  hash: ['hash', 'sha256', 'sha1', 'md5', 'fileHash', 'sha256Hash', 'computedHash', 'computed_hash'],
  threatName: ['threatName', 'threat_name', 'threat', 'malwareName', 'detectionName', 'ruleName', 'signatureName'],
  threatType: ['threatType', 'threat_type', 'category', 'threatCategory', 'detectionType', 'malwareType'],
  severity: ['severity', 'priority', 'riskLevel', 'level'],
  device: ['device', 'deviceName', 'hostname', 'host', 'computerName', 'machineName', 'endpoint'],
  organization: ['organization', 'organizationName', 'customer', 'customerName', 'accountName'],
  detectionMessage: ['detectionMessage', 'message', 'detection', 'summary', 'eventSummary', 'description'],
};

export type DetectionFields = {
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

  /**
   * EXACT id match only. This used to fall back to "the only row returned",
   * so an API that ignored the id filter handed back some other incident and
   * the assessment reported the wrong incident number (13135961 vs 13135962).
   */
  private matchById(list: unknown[], incidentId: string): unknown | undefined {
    return list.find(it => it && typeof it === 'object' && String((it as Record<string, unknown>).id ?? '') === String(incidentId));
  }

  /** Fetch a single incident by its RocketCyber incident ID (tries several strategies). */
  async getIncident(incidentId: string, accountId?: string | null): Promise<unknown | null> {
    // 1. Filter by id (+ accountId if known).
    try {
      const data = await this.request<unknown>('/incidents', { id: incidentId, accountId: accountId || undefined });
      const found = this.matchById(this.unwrap(data), incidentId);
      if (found) return found;
    } catch { /* try next */ }

    // 2. Path-style lookup — still required to carry the requested id.
    try {
      const single = await this.request<unknown>(`/incidents/${encodeURIComponent(incidentId)}`);
      const found = this.matchById(this.unwrap(single), incidentId);
      if (found) return found;
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
    const otherEvents: unknown[] = [];
    const needsEvents = !fields.process || !fields.path || !fields.hash;
    if (needsEvents && resolvedAccountId) {
      const incidentMs = toMillis(inc.eventTime ?? inc.event_time ?? inc.createdAt ?? inc.created_at);
      const since = incidentMs ? new Date(incidentMs - 60 * 60 * 1000).toISOString() : undefined;
      const until = incidentMs ? new Date(incidentMs + 60 * 60 * 1000).toISOString() : undefined;
      const appId = asString(inc.appId ?? inc.app_id ?? inc.applicationId) || undefined;
      const dates = since || until ? JSON.stringify([since || '', until || '']) : undefined;

      // The IOC detail (path/process/hash) lives on the EVENT, not the incident.
      // The account-wide /events endpoint returns MANY detections (this device
      // had msiexec, Dell, AND the Datto one), so we must pick the event that
      // belongs to THIS incident — the one closest in time to it.
      const attempts: Array<() => Promise<unknown>> = [
        () => this.request<unknown>(`/incidents/${encodeURIComponent(incidentId)}/events`),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, incidentId, appId, dates }),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, appId, dates }),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, appId }),
        () => this.request<unknown>('/events', { accountId: resolvedAccountId, dates }),
      ];
      let candidates: unknown[] = [];
      for (const attempt of attempts) {
        try {
          const evs = this.unwrap(await attempt());
          if (evs.length > 0) { candidates = evs; break; }
        } catch {
          // Try the next shape.
        }
      }
      // Only events that BELONG to this incident are its detail: tagged with
      // its id, or on its device within ±1h. Everything else the account-wide
      // endpoints returned is kept apart as otherEvents.
      const incidentDevice = normDevice(fields.device);
      const { mine, others } = partitionIncidentEvents(candidates, incidentId, incidentDevice, incidentMs);
      rawEvents.push(...mine);
      otherEvents.push(...others);

      // Select the single event that belongs to this incident (deterministic).
      const best = selectClosestEvent(mine, incidentMs);
      if (best) fields = mergeFields(fields, extractDetectionFields(best));
    }

    // event_time often comes back as a unix timestamp — normalize to ISO.
    if (fields.eventTime && /^\d{9,13}$/.test(fields.eventTime)) {
      const ms = toMillis(fields.eventTime);
      if (ms) fields.eventTime = new Date(ms).toISOString();
    }

    // The Defender message blob carries User / Target & Parent Commandline that
    // aren't exposed as structured fields — parse them out when missing.
    if (fields.detectionMessage) {
      const m = fields.detectionMessage;
      const grab = (re: RegExp) => { const x = m.match(re); return x && x[1].trim() ? x[1].trim() : null; };
      fields.userContext = fields.userContext || grab(/\bUser:\s*([^\r\n]+)/i);
      fields.targetCommandLine = fields.targetCommandLine || grab(/Target Commandline:\s*([^\r\n]+)/i);
      fields.parentCommandLine = fields.parentCommandLine || grab(/Parent Commandline:\s*([^\r\n]+)/i);
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
      otherEvents,
      incidentRecordId: asString(inc.id),
    };
  }
}

// ── Field extraction helpers ──

/** Parse a time value (ISO string, unix seconds, or unix millis) to epoch ms. */
function toMillis(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^\d{9,13}$/.test(t)) {
      const n = parseInt(t, 10);
      return n > 1e12 ? n : n * 1000;
    }
    const parsed = Date.parse(t);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Get an event's timestamp in epoch ms (handles JSON:API `attributes` nesting). */
export function getEventMillis(ev: unknown): number | null {
  if (!ev || typeof ev !== 'object') return null;
  const o = ev as Record<string, unknown>;
  const attrs = (o.attributes && typeof o.attributes === 'object' ? o.attributes : {}) as Record<string, unknown>;
  return toMillis(
    o.event_time ?? o.eventTime ?? o.timestamp ?? o.created_at ?? o.createdAt ??
    attrs.event_time ?? attrs.eventTime ?? attrs.timestamp,
  );
}

/**
 * Pick the event that belongs to this incident from a list of account-wide
 * events: the one whose timestamp is closest to the incident's. Without a
 * reference time we only return a single unambiguous event.
 */
function selectClosestEvent(events: unknown[], incidentMs: number | null): unknown | null {
  if (events.length === 0) return null;
  if (events.length === 1) return events[0];
  if (incidentMs === null) return null;
  let best: unknown = null;
  let bestDelta = Infinity;
  let bestId = '';
  for (const ev of events) {
    const ms = getEventMillis(ev);
    if (ms === null) continue;
    const delta = Math.abs(ms - incidentMs);
    const id = eventId(ev) ?? '';
    // Equal distance → lowest id, so the same inputs always pick the same event.
    if (delta < bestDelta || (delta === bestDelta && id < bestId)) { bestDelta = delta; best = ev; bestId = id; }
  }
  return best;
}

/** An event's own id (handles JSON:API nesting). */
export function eventId(ev: unknown): string | null {
  if (!ev || typeof ev !== 'object') return null;
  const o = ev as Record<string, unknown>;
  const attrs = (o.attributes && typeof o.attributes === 'object' ? o.attributes : {}) as Record<string, unknown>;
  return asString(o.id ?? o.eventId ?? o.event_id ?? attrs.id ?? attrs.eventId);
}

/** The incident id an event says it belongs to, if it says. */
function eventIncidentId(ev: unknown): string | null {
  if (!ev || typeof ev !== 'object') return null;
  const o = ev as Record<string, unknown>;
  const attrs = (o.attributes && typeof o.attributes === 'object' ? o.attributes : {}) as Record<string, unknown>;
  return asString(o.incidentId ?? o.incident_id ?? attrs.incidentId ?? attrs.incident_id);
}

function normDevice(d: string | null | undefined): string | null {
  if (!d) return null;
  const first = d.split('|')[0].trim().split('.')[0].trim().toLowerCase();
  return first || null;
}

/** Split account events into those belonging to this incident and the rest. */
export function partitionIncidentEvents(
  events: unknown[],
  incidentId: string,
  incidentDevice: string | null,
  incidentMs: number | null,
): { mine: unknown[]; others: unknown[] } {
  const mine: unknown[] = [];
  const others: unknown[] = [];
  for (const ev of events) {
    const tagged = eventIncidentId(ev);
    if (tagged) {
      (tagged === String(incidentId) ? mine : others).push(ev);
      continue;
    }
    const dev = normDevice(extractDetectionFields(ev).device);
    const ms = getEventMillis(ev);
    const near = incidentMs !== null && ms !== null && Math.abs(ms - incidentMs) <= 60 * 60 * 1000;
    (incidentDevice && dev === incidentDevice && near ? mine : others).push(ev);
  }
  return { mine, others };
}

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
export function extractDetectionFields(obj: unknown): DetectionFields {
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
