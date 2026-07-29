// src/lib/kaseya-quote-manager.ts
//
// The ONE Kaseya Quote Manager (Datto Commerce) API client. Read-only.
//
// READ-ONLY BY CONSTRUCTION: this module exposes no way to issue anything but a
// GET. There is no method parameter and no body parameter anywhere in its public
// surface — `get()` is the only network path and it hardcodes the verb. That is
// not merely a policy choice: the captured OpenAPI spec
// (docs/vendor-api/kaseya-quote-manager/openapi.json, sha256 in COVERAGE.md)
// contains 39 operations and ALL 39 are GET, so the vendor API has no write
// surface to expose. Verified from the spec itself rather than taken on trust
// from Kaseya's "read-only" statement.
//
// AUTH — the spec and the help page CONTRADICT each other, and this is not
// settled. `components.securitySchemes.apiKey` declares `{type: apiKey, name:
// "apiKey", in: "header"}` — a HEADER. Kaseya's help page
// (help.quotemanager.kaseya.com/.../api.htm) describes a QUERY PARAMETER, and is
// itself inconsistent on casing (`apikey` vs `apiKey`). Those disagree on the
// mechanism, not the spelling.
//
// The machine-readable spec wins as the default, because it is the artefact the
// vendor generates from their implementation. But because it is genuinely
// unresolved, the mechanism is overridable at runtime via
// KASEYA_QUOTE_MANAGER_AUTH_MODE ('header' | 'query') so the empirical answer can
// be applied without a code change, and `probeAuth()` below settles it against
// the live API. Do NOT quietly "fix" this by sending both — sending a key by two
// channels at once means a success tells you nothing about which one worked.
//
// RATE LIMITS are NOT in the spec. 60 requests/minute, 20,000/24h and HTTP 429
// come from the help page only. The limiter below is per-lambda-instance, so
// across concurrent Vercel instances it is a floor rather than a guarantee — 429s
// are therefore ALSO handled reactively via withRetry, which classifies them as
// transient and backs off. Both layers are deliberate; neither is sufficient.
//
// PAGING: `page` is 1-INDEXED (spec default 1). This is the opposite of Datto
// RMM, whose 0-indexed paging silently skipped the first page of every sweep for
// months (docs/gotchas.md → Datto RMM). Do not copy a page-0 loop into here.
//
// NO TOTAL COUNT: list responses are bare JSON arrays — there is no envelope and
// no totalCount field. A sweep therefore cannot report "X of Y" and must never
// invent one; termination is "a short page means the end".

import { withRetry, classifyError, structuredLog } from '@/lib/resilience'

const BASE_URL = 'https://api.kaseyaquotemanager.com'
/** Paths in the spec already carry /v1, so the effective base is BASE_URL + path. */
const API_PREFIX = '/v1'

/** Help page's stated hard cap. Not in the spec — confirmed by probeAuth(). */
export const MAX_PAGE_SIZE = 100
/** Help page's stated limits. Not in the spec. */
const RATE_PER_MINUTE = 60
const RATE_PER_DAY = 20_000

const DATA_TIMEOUT_MS = 30_000

export type AuthMode = 'header' | 'query'

export class KaseyaQuoteManagerNotConfiguredError extends Error {
  constructor() {
    super('Kaseya Quote Manager is not configured: set KASEYA_QUOTE_MANAGER_API_KEY in the environment.')
    this.name = 'KaseyaQuoteManagerNotConfiguredError'
  }
}

/**
 * Sliding-window limiter, module-level so it survives across tool calls in a
 * warm lambda. Timestamps only — no request data is retained.
 */
const callTimes: number[] = []

function pruneCallTimes(now: number): void {
  const dayAgo = now - 86_400_000
  while (callTimes.length && callTimes[0] < dayAgo) callTimes.shift()
}

function millisUntilSlot(now: number): number {
  pruneCallTimes(now)
  if (callTimes.length >= RATE_PER_DAY) {
    // A 24h budget breach is not something to sleep through inside a request.
    throw new Error(
      `Kaseya Quote Manager daily rate limit reached (${RATE_PER_DAY} requests/24h per the vendor help page). Try again later.`,
    )
  }
  const minuteAgo = now - 60_000
  const inLastMinute = callTimes.filter((t) => t >= minuteAgo)
  if (inLastMinute.length < RATE_PER_MINUTE) return 0
  // Wait just past the oldest call in the window falling out of it.
  return Math.max(0, inLastMinute[0] + 60_000 - now) + 25
}

async function awaitRateSlot(): Promise<void> {
  for (;;) {
    const wait = millisUntilSlot(Date.now())
    if (wait === 0) break
    if (wait > DATA_TIMEOUT_MS) {
      throw new Error(
        `Kaseya Quote Manager rate limit would require waiting ${Math.round(wait / 1000)}s (${RATE_PER_MINUTE}/min per the vendor help page). Aborting rather than holding the request open.`,
      )
    }
    await new Promise((r) => setTimeout(r, wait))
  }
  callTimes.push(Date.now())
}

export interface KqmQuery {
  [key: string]: string | number | undefined
}

export class KaseyaQuoteManagerClient {
  private readonly apiKey: string | undefined
  private readonly authMode: AuthMode

  constructor(opts: { apiKey?: string; authMode?: AuthMode } = {}) {
    this.apiKey = opts.apiKey ?? process.env.KASEYA_QUOTE_MANAGER_API_KEY
    const envMode = process.env.KASEYA_QUOTE_MANAGER_AUTH_MODE
    this.authMode = opts.authMode ?? (envMode === 'query' ? 'query' : 'header')
  }

  isConfigured(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0
  }

  /** Which auth mechanism this client is using, for reporting to the caller. */
  currentAuthMode(): AuthMode {
    return this.authMode
  }

  private requireKey(): string {
    if (!this.isConfigured()) throw new KaseyaQuoteManagerNotConfiguredError()
    return this.apiKey as string
  }

  /**
   * Build the request URL, dropping undefined params and clamping pageSize.
   *
   * pageSize is clamped rather than passed through: the help page states a hard
   * cap of 100 and the spec does not state one at all, so an un-clamped 5000
   * would be a silent gamble on undocumented behaviour.
   */
  private buildUrl(path: string, query: KqmQuery, key: string): string {
    const url = new URL(`${BASE_URL}${API_PREFIX}${path}`)
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === '') continue
      const value = k === 'pageSize' ? Math.min(Number(v) || MAX_PAGE_SIZE, MAX_PAGE_SIZE) : v
      url.searchParams.set(k, String(value))
    }
    if (this.authMode === 'query') url.searchParams.set('apiKey', key)
    return url.toString()
  }

  /**
   * The ONLY network path in this module. GET by construction — no method or
   * body parameter exists to override.
   */
  async get<T = unknown>(path: string, query: KqmQuery = {}): Promise<T> {
    if (!path.startsWith('/')) throw new Error(`Kaseya Quote Manager path must start with '/': got "${path}"`)
    const key = this.requireKey()

    return withRetry(
      async () => {
        await awaitRateSlot()
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (this.authMode === 'header') headers.apiKey = key

        const res = await fetch(this.buildUrl(path, query, key), {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
        })

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          // Truncated: a vendor HTML error page would otherwise flood the log
          // and the failure envelope.
          throw new Error(
            `Kaseya Quote Manager GET ${API_PREFIX}${path} failed (${res.status} ${res.statusText})${body ? `: ${body.slice(0, 300)}` : ''}`,
          )
        }
        return (await res.json()) as T
      },
      { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 15_000 },
    )
  }

  /**
   * Page through a list endpoint until a short page arrives.
   *
   * Returns `truncated: true` when maxPages was hit, because the API gives no
   * total count — without an explicit flag a capped sweep is indistinguishable
   * from a complete one, which is how "we have all the data" bugs happen.
   */
  async getAllPages<T = unknown>(
    path: string,
    query: KqmQuery = {},
    opts: { pageSize?: number; maxPages?: number } = {},
  ): Promise<{ items: T[]; pages: number; truncated: boolean; pageSize: number }> {
    const pageSize = Math.min(opts.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
    const maxPages = opts.maxPages ?? 50
    const items: T[] = []
    let page = 1 // 1-INDEXED per the spec. Never change this to 0.
    let pages = 0

    for (; pages < maxPages; ) {
      const batch = await this.get<T[]>(path, { ...query, page, pageSize })
      pages++
      if (!Array.isArray(batch)) {
        throw new Error(
          `Kaseya Quote Manager GET ${API_PREFIX}${path} returned ${typeof batch}, expected an array (the spec declares every list response as a bare array).`,
        )
      }
      items.push(...batch)
      if (batch.length < pageSize) return { items, pages, truncated: false, pageSize }
      page++
    }
    return { items, pages, truncated: true, pageSize }
  }

  /**
   * Settle the documented auth contradiction against the LIVE API, and confirm
   * the undocumented pageSize cap, without ever returning the key.
   *
   * Tries each mechanism in isolation — never both at once, which would make a
   * success uninterpretable. Uses /v1/warehouse: it takes no required parameter
   * and is the cheapest list in the spec.
   */
  async probeAuth(): Promise<{
    configured: boolean
    working: AuthMode | null
    results: Array<{ mode: AuthMode; ok: boolean; status: number | null; detail: string }>
    defaultMode: AuthMode
    pageSizeCapHonoured: boolean | null
    recommendation: string
  }> {
    if (!this.isConfigured()) {
      return {
        configured: false,
        working: null,
        results: [],
        defaultMode: this.authMode,
        pageSizeCapHonoured: null,
        recommendation:
          'Set KASEYA_QUOTE_MANAGER_API_KEY in Vercel and redeploy (a variable added after a deployment is not visible to it), then run this again.',
      }
    }
    const key = this.requireKey()
    const results: Array<{ mode: AuthMode; ok: boolean; status: number | null; detail: string }> = []

    for (const mode of ['header', 'query'] as AuthMode[]) {
      const probe = new KaseyaQuoteManagerClient({ apiKey: key, authMode: mode })
      try {
        const rows = await probe.get<unknown[]>('/warehouse', { page: 1, pageSize: 1 })
        results.push({
          mode,
          ok: true,
          status: 200,
          detail: `Authenticated. Returned ${Array.isArray(rows) ? rows.length : 0} row(s).`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const status = /\((\d{3})\s/.exec(message)?.[1]
        results.push({
          mode,
          ok: false,
          status: status ? Number(status) : null,
          detail: classifyError(err).category === 'rate_limit' ? 'Rate limited — inconclusive, retry.' : message.slice(0, 200),
        })
      }
    }

    const working = results.find((r) => r.ok)?.mode ?? null

    // Only worth asking once we know how to authenticate at all.
    let pageSizeCapHonoured: boolean | null = null
    if (working) {
      try {
        const probe = new KaseyaQuoteManagerClient({ apiKey: key, authMode: working })
        const rows = await probe.get<unknown[]>('/warehouse', { page: 1, pageSize: MAX_PAGE_SIZE })
        pageSizeCapHonoured = Array.isArray(rows) && rows.length <= MAX_PAGE_SIZE
      } catch {
        pageSizeCapHonoured = null
      }
    }

    structuredLog.info(
      { correlationId: `kqm-probe-${Date.now()}`, operation: 'kqm.probe_auth' },
      `Kaseya Quote Manager auth probe: working=${working ?? 'none'} default=${this.authMode}`,
    )

    return {
      configured: true,
      working,
      results,
      defaultMode: this.authMode,
      pageSizeCapHonoured,
      recommendation:
        working === null
          ? 'NEITHER mechanism authenticated. The key itself is the most likely cause (wrong value, not yet active, or the deployment predates the variable being added). Do not assume the mechanism is wrong until a key known to be good has been tried.'
          : working === this.authMode
            ? `The spec-declared mechanism (${working}) is correct and is already the default. No change needed — the help page's contradictory description can be disregarded.`
            : `The help page is right and the spec is wrong: ${working} works, the default is ${this.authMode}. Set KASEYA_QUOTE_MANAGER_AUTH_MODE=${working} in Vercel to switch without a code change, and tell Claude Code to make it the default.`,
    }
  }
}

/** Module-level singleton so the rate-limit window is shared in a warm lambda. */
let _client: KaseyaQuoteManagerClient | null = null

export function kqmClient(): KaseyaQuoteManagerClient {
  if (!_client) _client = new KaseyaQuoteManagerClient()
  return _client
}

/** Test seam: reset the singleton and the rate-limit window. */
export function __resetKqmClient(): void {
  _client = null
  callTimes.length = 0
}
