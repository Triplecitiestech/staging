// src/lib/mcp-kaseya-quote-manager-tools.test.ts
//
// Turns docs/vendor-api/kaseya-quote-manager/COVERAGE.md from a promise into a
// test. The coverage contract says every one of the 39 spec operations must be
// reachable and no row may be silently dropped; these assertions read the
// CAPTURED SPEC and hold the tool table to it, so a vendor change or a hand-edit
// that loses coverage fails the build rather than going unnoticed.
//
// The other half is the read-only guarantee. That is asserted structurally —
// the client is driven with a stubbed fetch and any non-GET fails the test —
// rather than by reading the source and trusting it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KQM_RESOURCES, KQM_TOOL_NAMES, registerKaseyaQuoteManagerTools } from './mcp-kaseya-quote-manager-tools'
import { KaseyaQuoteManagerClient, MAX_PAGE_SIZE, __resetKqmClient } from './kaseya-quote-manager'
import { TOOL_FACTS, vendorOf } from './connector/capability-registry'

const SPEC_PATH = join(process.cwd(), 'docs/vendor-api/kaseya-quote-manager/openapi.json')

interface SpecOp {
  path: string
  params: string[]
}

function loadSpec() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as {
    paths: Record<string, Record<string, { parameters?: Array<{ name: string; in: string }> }>>
    components: { securitySchemes: Record<string, { type: string; name: string; in: string }> }
  }
  const gets: SpecOp[] = []
  const nonGets: string[] = []
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (method.toLowerCase() !== 'get') {
        nonGets.push(`${method.toUpperCase()} ${path}`)
        continue
      }
      gets.push({ path, params: (op.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name) })
    }
  }
  return { spec, gets, nonGets }
}

type ToolHandler = (args?: Record<string, unknown>) => Promise<unknown>

/** Collect the tools a registration pass produces, with their input schemas. */
function collectTools() {
  const tools = new Map<string, { description: string; inputSchema: Record<string, unknown>; handler: ToolHandler }>()
  const server = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(name: string, config: any, handler: ToolHandler) {
      tools.set(name, { description: config.description, inputSchema: config.inputSchema ?? {}, handler })
    },
  }
  registerKaseyaQuoteManagerTools(server)
  return tools
}

describe('Kaseya Quote Manager coverage contract', () => {
  it('the captured spec still contains zero write operations', () => {
    // The read-only claim in every tool description rests on this. If Kaseya ever
    // ships a POST, this fails and the claim must be re-examined before the spec
    // is re-captured.
    const { nonGets } = loadSpec()
    expect(nonGets, `spec now contains write operations: ${nonGets.join(', ')}`).toEqual([])
  })

  it('every spec GET operation is reachable through a registered tool', () => {
    const { gets } = loadSpec()
    const tools = collectTools()

    for (const op of gets) {
      const isById = op.path.endsWith('{id}')
      const base = op.path.replace('/v1/', '').split('/')[0]
      const resource = KQM_RESOURCES.find((r) => r.path === `/${base}`)
      expect(resource, `no resource in KQM_RESOURCES covers spec path ${op.path}`).toBeDefined()
      expect(tools.has(resource!.tool), `${resource!.tool} not registered`).toBe(true)

      if (isById) {
        // Reachable via the `id` parameter on the resource's tool.
        expect(resource!.hasGetById, `${op.path} exists in the spec but ${resource!.tool} has hasGetById false`).toBe(true)
        expect(Object.keys(tools.get(resource!.tool)!.inputSchema)).toContain('id')
      }
    }
    // 39 operations reachable through 20 tools.
    expect(gets).toHaveLength(39)
    expect(KQM_RESOURCES).toHaveLength(20)
  })

  it('a resource the spec gives no get-by-id does not advertise one', () => {
    // productimage is the single such resource. Advertising `id` for it would
    // produce a 404 the caller could not distinguish from a missing record.
    const { gets } = loadSpec()
    const byIdBases = new Set(
      gets.filter((o) => o.path.endsWith('{id}')).map((o) => o.path.replace('/v1/', '').split('/')[0]),
    )
    for (const r of KQM_RESOURCES) {
      const base = r.path.replace('/', '')
      expect(r.hasGetById, `${r.tool} hasGetById must match the spec for /${base}`).toBe(byIdBases.has(base))
    }
    const noById = KQM_RESOURCES.filter((r) => !r.hasGetById).map((r) => r.tool)
    expect(noById).toEqual(['kqm_product_images'])
    expect(Object.keys(collectTools().get('kqm_product_images')!.inputSchema)).not.toContain('id')
  })

  it('every documented query parameter is exposed, and none are invented', () => {
    const { gets } = loadSpec()
    const tools = collectTools()

    for (const r of KQM_RESOURCES) {
      const listOp = gets.find((o) => o.path === `/v1${r.path}`)
      expect(listOp, `spec has no list operation for ${r.path}`).toBeDefined()

      const exposed = new Set(Object.keys(tools.get(r.tool)!.inputSchema))
      for (const param of listOp!.params) {
        expect(exposed.has(param), `${r.tool} does not expose documented parameter '${param}'`).toBe(true)
      }

      // The inverse: a filter we expose that the spec does not define would be
      // silently ignored by the API, so the caller would believe results were
      // filtered when they were not. `allPages` is ours (a sweep switch), and
      // `id` is a path parameter, so both are excluded from this check.
      const ours = new Set(['allPages', 'id'])
      for (const name of exposed) {
        if (ours.has(name)) continue
        expect(listOp!.params, `${r.tool} exposes '${name}' which the spec does not define for ${r.path}`).toContain(name)
      }
    }
  })

  it('modifiedAfter is exposed only where the API supports it', () => {
    // The API offers it on 15 of 20 resources. Advertising a delta-sync filter
    // the API ignores would return the full set while looking incremental.
    const { gets } = loadSpec()
    const withModified = gets.filter((o) => !o.path.endsWith('{id}') && o.params.includes('modifiedAfter'))
    expect(withModified).toHaveLength(15)

    const tools = collectTools()
    for (const r of KQM_RESOURCES) {
      const supported = withModified.some((o) => o.path === `/v1${r.path}`)
      expect(r.modifiedAfter, `${r.tool}.modifiedAfter must match the spec`).toBe(supported)
      expect(
        Object.keys(tools.get(r.tool)!.inputSchema).includes('modifiedAfter'),
        `${r.tool} schema must expose modifiedAfter only when supported`,
      ).toBe(supported)
    }
  })

  it('the spec declares the API key in a header, which is what the client defaults to', () => {
    // Locks the documented contradiction to the artefact we chose to trust. If a
    // re-captured spec ever says query, this fails and the default is revisited
    // deliberately rather than by drift.
    const { spec } = loadSpec()
    expect(spec.components.securitySchemes.apiKey).toMatchObject({ type: 'apiKey', name: 'apiKey', in: 'header' })
    expect(new KaseyaQuoteManagerClient({ apiKey: 'k' }).currentAuthMode()).toBe('header')
  })

  it('every registered tool has a reviewed TOOL_FACTS entry and a known vendor', () => {
    const tools = collectTools()
    expect([...tools.keys()].sort()).toEqual([...KQM_TOOL_NAMES].sort())
    for (const name of tools.keys()) {
      expect(TOOL_FACTS[name], `${name} has no reviewed TOOL_FACTS entry`).toBeDefined()
      expect(TOOL_FACTS[name].access).toBe('read')
      expect(TOOL_FACTS[name].staged).toBe(false)
      expect(vendorOf(name)).toBe('Kaseya Quote Manager (Datto Commerce)')
    }
  })
})

describe('KaseyaQuoteManagerClient is read-only by construction', () => {
  const calls: Array<{ url: string; method: string | undefined; headers: Record<string, string> }> = []

  beforeEach(() => {
    calls.length = 0
    __resetKqmClient()
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method,
        headers: (init?.headers ?? {}) as Record<string, string>,
      })
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __resetKqmClient()
  })

  it('issues GET and nothing else, with the key in the apiKey header', async () => {
    const client = new KaseyaQuoteManagerClient({ apiKey: 'secret-key', authMode: 'header' })
    await client.get('/quote', { quoteNumber: 'QO1' })

    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
    expect(calls[0].headers.apiKey).toBe('secret-key')
    expect(calls[0].url).toBe('https://api.kaseyaquotemanager.com/v1/quote?quoteNumber=QO1')
    // The key must never leak into the URL in header mode.
    expect(calls[0].url).not.toContain('secret-key')
  })

  it('puts the key in the query string ONLY in query mode', async () => {
    const client = new KaseyaQuoteManagerClient({ apiKey: 'secret-key', authMode: 'query' })
    await client.get('/warehouse')
    expect(calls[0].url).toContain('apiKey=secret-key')
    expect(calls[0].headers.apiKey).toBeUndefined()
  })

  it('never sends the key by both channels at once', async () => {
    // Sending both would make a probe success uninterpretable — the whole point
    // of the probe is to learn WHICH mechanism the API accepts.
    for (const mode of ['header', 'query'] as const) {
      calls.length = 0
      await new KaseyaQuoteManagerClient({ apiKey: 'k', authMode: mode }).get('/warehouse')
      const inHeader = calls[0].headers.apiKey !== undefined
      const inQuery = calls[0].url.includes('apiKey=')
      expect(inHeader && inQuery, `mode ${mode} sent the key twice`).toBe(false)
      expect(inHeader || inQuery, `mode ${mode} sent no key`).toBe(true)
    }
  })

  it('clamps pageSize to the vendor cap instead of gambling on undocumented behaviour', async () => {
    await new KaseyaQuoteManagerClient({ apiKey: 'k' }).get('/quote', { pageSize: 5000 })
    expect(calls[0].url).toContain(`pageSize=${MAX_PAGE_SIZE}`)
    expect(calls[0].url).not.toContain('5000')
  })

  it('sets a timeout on every request so a hung vendor cannot block the function', async () => {
    // Critical gotcha #3: an external fetch without a signal blocks the whole
    // serverless invocation.
    const withSignal: RequestInit[] = []
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      withSignal.push(init ?? {})
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    await new KaseyaQuoteManagerClient({ apiKey: 'k' }).get('/warehouse')
    expect(withSignal[0].signal).toBeInstanceOf(AbortSignal)
  })

  it('refuses a path that is not rooted, so a full URL cannot be smuggled in', async () => {
    const client = new KaseyaQuoteManagerClient({ apiKey: 'k' })
    await expect(client.get('https://evil.example/x')).rejects.toThrow(/must start with/)
    expect(calls).toHaveLength(0)
  })

  it('throws without a key rather than making an unauthenticated call', async () => {
    const client = new KaseyaQuoteManagerClient({ apiKey: '' })
    expect(client.isConfigured()).toBe(false)
    await expect(client.get('/warehouse')).rejects.toThrow(/not configured/)
    expect(calls).toHaveLength(0)
  })
})

describe('probeAuth reports what it observed, without overstating it', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    __resetKqmClient()
  })

  /** Stub the API to accept the key only via the given mechanisms. */
  function stubAccepting(modes: Array<'header' | 'query'>) {
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      const viaHeader = headers.apiKey !== undefined
      const viaQuery = String(url).includes('apiKey=')
      const okHeader = viaHeader && modes.includes('header')
      const okQuery = viaQuery && modes.includes('query')
      if (okHeader || okQuery) {
        return new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    })
    __resetKqmClient()
  }

  it('BOTH accepted: says neither doc is wrong and keeps the header for log-hygiene reasons', async () => {
    // What the live API actually does (probed 2026-07-29). The original logic
    // picked the first success and declared the help page disregardable — a
    // claim the evidence never supported.
    stubAccepting(['header', 'query'])
    const out = await new KaseyaQuoteManagerClient({ apiKey: 'k', authMode: 'header' }).probeAuth()

    expect(out.accepted).toEqual(['header', 'query'])
    expect(out.working).toBe('header')
    expect(out.recommendation).toMatch(/BOTH ways/)
    expect(out.recommendation).toMatch(/neither vendor doc is wrong/)
    // The security reason to prefer the header must be stated, not just "spec says so".
    expect(out.recommendation).toMatch(/access logs|proxy logs/)
    // And it must NOT claim a vendor doc can be ignored.
    expect(out.recommendation).not.toMatch(/can be disregarded/)
  })

  it('both accepted while configured for query: reports the mode actually in use', async () => {
    // `working` must describe what the client will DO, not probe order.
    stubAccepting(['header', 'query'])
    const out = await new KaseyaQuoteManagerClient({ apiKey: 'k', authMode: 'query' }).probeAuth()
    expect(out.working).toBe('query')
    expect(out.accepted).toEqual(['header', 'query'])
  })

  it('only query accepted: says to switch, and flags the URL-leak tradeoff', async () => {
    stubAccepting(['query'])
    const out = await new KaseyaQuoteManagerClient({ apiKey: 'k', authMode: 'header' }).probeAuth()
    expect(out.accepted).toEqual(['query'])
    expect(out.working).toBe('query')
    expect(out.recommendation).toMatch(/KASEYA_QUOTE_MANAGER_AUTH_MODE=query/)
    expect(out.recommendation).toMatch(/leaks into URLs/)
  })

  it('only header accepted: no change needed', async () => {
    stubAccepting(['header'])
    const out = await new KaseyaQuoteManagerClient({ apiKey: 'k', authMode: 'header' }).probeAuth()
    expect(out.accepted).toEqual(['header'])
    expect(out.recommendation).toMatch(/No change needed/)
  })

  it('neither accepted: blames the key, not the mechanism', async () => {
    // The dangerous wrong answer here would be "the mechanism must be wrong",
    // sending someone to flip a setting when the key is the problem.
    stubAccepting([])
    const out = await new KaseyaQuoteManagerClient({ apiKey: 'k', authMode: 'header' }).probeAuth()
    expect(out.accepted).toEqual([])
    expect(out.working).toBeNull()
    expect(out.recommendation).toMatch(/key itself is the most likely cause/)
  })

  it('no key: reports unconfigured without making any call', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (u: string | URL) => {
      calls.push(String(u))
      return new Response('[]', { status: 200 })
    })
    __resetKqmClient()
    const out = await new KaseyaQuoteManagerClient({ apiKey: '' }).probeAuth()
    expect(out.configured).toBe(false)
    expect(out.accepted).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('KaseyaQuoteManagerClient paging', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    __resetKqmClient()
  })

  it('starts at page 1, not page 0', async () => {
    // Datto RMM's 0-indexed paging silently dropped the first page of every
    // sweep for months. This is the regression lock against porting that bug.
    const pages: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL) => {
      pages.push(new URL(String(url)).searchParams.get('page') ?? '')
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    __resetKqmClient()
    await new KaseyaQuoteManagerClient({ apiKey: 'k' }).getAllPages('/quote')
    expect(pages[0]).toBe('1')
  })

  it('stops on a short page and reports truncated=false', async () => {
    let call = 0
    vi.stubGlobal('fetch', async () => {
      call++
      const rows = call === 1 ? Array.from({ length: MAX_PAGE_SIZE }, (_, i) => ({ id: i })) : [{ id: 999 }]
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    __resetKqmClient()
    const result = await new KaseyaQuoteManagerClient({ apiKey: 'k' }).getAllPages('/quote')
    expect(result.pages).toBe(2)
    expect(result.items).toHaveLength(MAX_PAGE_SIZE + 1)
    expect(result.truncated).toBe(false)
  })

  it('flags truncation at the page cap instead of implying completeness', async () => {
    // The API returns no total count, so without this flag a capped sweep is
    // indistinguishable from having fetched everything.
    vi.stubGlobal('fetch', async () => {
      const rows = Array.from({ length: MAX_PAGE_SIZE }, (_, i) => ({ id: i }))
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    __resetKqmClient()
    const result = await new KaseyaQuoteManagerClient({ apiKey: 'k' }).getAllPages('/quote', {}, { maxPages: 3 })
    expect(result.pages).toBe(3)
    expect(result.truncated).toBe(true)
  })

  it('rejects a non-array list response rather than silently returning nothing', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    __resetKqmClient()
    await expect(new KaseyaQuoteManagerClient({ apiKey: 'k' }).getAllPages('/quote')).rejects.toThrow(/expected an array/)
  })
})
