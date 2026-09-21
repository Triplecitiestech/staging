#!/usr/bin/env tsx
// scripts/generate-autotask-catalogue.ts
//
// Generate src/data/autotask-catalogue.generated.json — the census of every
// Autotask REST entity this zone's credential can see, with each entity's
// permitted operations and full field metadata.
//
// Run it from a machine that has the Autotask credentials:
//   npm run gen:autotask-catalogue
//
// WHY A GENERATOR AND NOT A CONSTANT: the Autotask surface of this connector
// was built by hand, one entity at a time, each one added after a missing
// capability blocked live work. A hand-maintained list can only ever contain
// what somebody already needed. This walks the whole API instead, and the
// coverage check (src/lib/connector/autotask-coverage.ts) fails the build on
// anything it finds that the connector does not expose.
//
// DISCOVERY IS LAYERED, AND EVERY LAYER IS REPORTED
// ------------------------------------------------
// Candidate entity names come from, in order of preference:
//
//   1. the zone's own Swagger/OpenAPI document, if it serves one;
//   2. a committed candidate list captured from Kaseya's published REST
//      entity index (docs/vendor-api/autotask/entity-candidates.json);
//   3. whatever the previous snapshot already knew.
//
// Whichever answers, the run then takes the TRANSITIVE CLOSURE over
// `referenceEntityType`: every reference field on every entity names another
// entity, so an entity nobody listed is still discovered the moment anything
// points at it. That is what stops the candidate list from being a boundary —
// it is a seed, and the closure runs to a fixpoint.
//
// Every candidate is then PROBED LIVE against entityInformation. A 404 means
// no REST surface on this instance and is recorded in `notRestEntities`. Any
// other failure is recorded in `unchecked` and is NEVER read as absence — "I
// could not ask" is not evidence of "it is not there", which is the rule the
// whole capability layer is built on.

import { promises as fs } from 'fs'
import path from 'path'

const OUT = path.join(process.cwd(), 'src/data/autotask-catalogue.generated.json')
const CANDIDATES = path.join(process.cwd(), 'docs/vendor-api/autotask/entity-candidates.json')

interface FieldMeta {
  name: string
  dataType?: string
  isRequired: boolean
  isReadOnly: boolean
  isQueryable?: boolean
  isPickList?: boolean
  isReference?: boolean
  referenceEntityType?: string | null
}

interface EntityEntry {
  name: string
  capabilities: Record<string, boolean | null>
  fields: FieldMeta[]
}

const baseUrl = (process.env.AUTOTASK_API_BASE_URL || '').replace(/\/$/, '')
const headers = {
  'Content-Type': 'application/json',
  ApiIntegrationCode: process.env.AUTOTASK_API_INTEGRATION_CODE || '',
  UserName: process.env.AUTOTASK_API_USERNAME || '',
  Secret: process.env.AUTOTASK_API_SECRET || '',
}

function requireCredentials(): void {
  const missing = ['AUTOTASK_API_BASE_URL', 'AUTOTASK_API_INTEGRATION_CODE', 'AUTOTASK_API_USERNAME', 'AUTOTASK_API_SECRET'].filter(
    (k) => !process.env[k],
  )
  if (missing.length) {
    console.error(
      `Missing Autotask credentials: ${missing.join(', ')}.\n` +
        'This generator reads live metadata; it cannot and must not fabricate a catalogue. ' +
        'Run it with the production Autotask environment loaded (vercel env pull).',
    )
    process.exit(1)
  }
}

async function getJson<T>(url: string, timeoutMs = 30_000): Promise<{ ok: boolean; status: number; body: T | null; text: string }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
  const text = await res.text()
  let body: T | null = null
  try {
    body = JSON.parse(text) as T
  } catch {
    body = null
  }
  return { ok: res.ok, status: res.status, body, text: text.slice(0, 400) }
}

// ---------------------------------------------------------------------------
// Candidate sources
// ---------------------------------------------------------------------------

/** Entity names from the zone's Swagger document, if it publishes one. */
async function fromSwagger(): Promise<{ names: string[]; outcome: string }> {
  const urls = [`${baseUrl}/v1.0/swagger.json`, `${baseUrl}/swagger/docs/v1`, `${baseUrl}/swagger/v1/swagger.json`]
  for (const url of urls) {
    try {
      const res = await getJson<{ paths?: Record<string, unknown> }>(url, 45_000)
      if (!res.ok || !res.body?.paths) continue
      const names = new Set<string>()
      for (const p of Object.keys(res.body.paths)) {
        // /V1.0/Tickets/query → Tickets ; /V1.0/Tickets/{parentId}/Notes → both
        for (const seg of p.split('/')) {
          if (/^[A-Za-z]{3,}$/.test(seg) && !/^(v1|V1|query|entityInformation|count)$/.test(seg)) names.add(seg)
        }
      }
      return { names: [...names], outcome: `${url} → ${names.size} candidate names` }
    } catch (e) {
      // Try the next URL; the outcome of the whole source is reported below.
      void e
    }
  }
  return { names: [], outcome: `no swagger document served (tried ${urls.length} paths)` }
}

/** Entity names captured from Kaseya's published REST entity index. */
async function fromVendorDocList(): Promise<{ names: string[]; outcome: string }> {
  try {
    const raw = JSON.parse(await fs.readFile(CANDIDATES, 'utf8')) as { entities?: string[]; source?: string }
    const names = (raw.entities ?? []).filter((n) => /^[A-Za-z][A-Za-z0-9]*$/.test(n))
    return { names, outcome: `${path.relative(process.cwd(), CANDIDATES)} → ${names.length} candidate names (${raw.source ?? 'no source recorded'})` }
  } catch (e) {
    return { names: [], outcome: `not readable: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Entity names the previous snapshot already established. */
async function fromPreviousSnapshot(): Promise<{ names: string[]; outcome: string }> {
  try {
    const raw = JSON.parse(await fs.readFile(OUT, 'utf8')) as { entities?: Array<{ name: string }> }
    const names = (raw.entities ?? []).map((e) => e.name)
    return { names, outcome: `previous snapshot → ${names.length} known entities` }
  } catch {
    return { names: [], outcome: 'no previous snapshot' }
  }
}

// ---------------------------------------------------------------------------
// Live probe
// ---------------------------------------------------------------------------

type ProbeResult =
  | { kind: 'entity'; entry: EntityEntry }
  | { kind: 'not-found' }
  | { kind: 'unchecked'; error: string }

async function probe(entity: string): Promise<ProbeResult> {
  try {
    const [info, fields] = await Promise.all([
      getJson<{ info?: Record<string, unknown> }>(`${baseUrl}/v1.0/${entity}/entityInformation`),
      getJson<{ fields?: Array<Record<string, unknown>> }>(`${baseUrl}/v1.0/${entity}/entityInformation/fields`),
    ])
    if (info.status === 404) return { kind: 'not-found' }
    if (!info.ok) return { kind: 'unchecked', error: `entityInformation ${info.status}: ${info.text}` }

    const raw = (info.body?.info ?? info.body ?? {}) as Record<string, unknown>
    const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v == null ? null : Boolean(v))
    return {
      kind: 'entity',
      entry: {
        name: typeof raw.name === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(raw.name) ? (raw.name as string) : entity,
        capabilities: {
          canQuery: asBool(raw.canQuery),
          canCreate: asBool(raw.canCreate),
          canUpdate: asBool(raw.canUpdate),
          canDelete: asBool(raw.canDelete),
          hasUserDefinedFields: asBool(raw.hasUserDefinedFields),
        },
        fields: (fields.body?.fields ?? []).map((f) => ({
          name: String(f.name),
          dataType: f.dataType == null ? undefined : String(f.dataType),
          isRequired: f.isRequired === true,
          isReadOnly: f.isReadOnly === true,
          isQueryable: f.isQueryable !== false,
          isPickList: f.isPickList === true,
          isReference: f.isReference === true,
          referenceEntityType: (f.referenceEntityType as string) || null,
        })),
      },
    }
  } catch (e) {
    return { kind: 'unchecked', error: e instanceof Error ? e.message : String(e) }
  }
}

/** Run n probes at a time — Autotask allows three concurrent threads per credential. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  requireCredentials()

  const attempted: Array<{ source: string; outcome: string; count?: number }> = []
  const swagger = await fromSwagger()
  attempted.push({ source: 'swagger', outcome: swagger.outcome, count: swagger.names.length })
  const docs = await fromVendorDocList()
  attempted.push({ source: 'vendor-doc-list', outcome: docs.outcome, count: docs.names.length })
  const previous = await fromPreviousSnapshot()
  attempted.push({ source: 'previous-snapshot', outcome: previous.outcome, count: previous.names.length })

  const source: 'swagger' | 'vendor-doc-list' | 'previous-snapshot' | 'reference-closure' = swagger.names.length
    ? 'swagger'
    : docs.names.length
      ? 'vendor-doc-list'
      : previous.names.length
        ? 'previous-snapshot'
        : 'reference-closure'

  // Union every source: a name any of them knows is worth one probe, and an
  // entity the vendor docs list but swagger omits is exactly the gap this is
  // meant to find.
  const queue = Array.from(new Set([...swagger.names, ...docs.names, ...previous.names]))
  if (!queue.length) {
    console.error('No candidate entity names from any source, so there is nothing to probe. Refusing to write an empty catalogue.')
    process.exit(1)
  }

  const found = new Map<string, EntityEntry>()
  const notFound = new Set<string>()
  const unchecked: Array<{ entity: string; error: string }> = []
  const seen = new Set<string>()

  let wave = queue
  let round = 0
  while (wave.length && round < 12) {
    round += 1
    const todo = wave.filter((n) => {
      const k = n.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (!todo.length) break
    console.log(`[catalogue] round ${round}: probing ${todo.length} candidate(s)…`)
    const results = await mapLimit(todo, 3, probe)

    for (let i = 0; i < todo.length; i += 1) {
      const name = todo[i]
      const r = results[i]
      if (r.kind === 'entity') found.set(r.entry.name.toLowerCase(), r.entry)
      else if (r.kind === 'not-found') notFound.add(name)
      else unchecked.push({ entity: name, error: r.error })
    }

    // Reference closure: every reference field names another entity. This is
    // what makes the candidate list a seed rather than a boundary.
    const next = new Set<string>()
    for (const entry of found.values()) {
      for (const f of entry.fields) {
        const singular = f.referenceEntityType
        if (!singular || !/^[A-Za-z][A-Za-z0-9]*$/.test(singular)) continue
        for (const plural of [`${singular}s`, singular, `${singular}es`, singular.replace(/y$/, 'ies')]) {
          if (!seen.has(plural.toLowerCase())) next.add(plural)
        }
      }
    }
    wave = [...next]
  }

  const entities = [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
  const catalogue = {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/generate-autotask-catalogue.ts',
    zone: (() => {
      try {
        return new URL(baseUrl).host
      } catch {
        return null
      }
    })(),
    discovery: {
      source,
      attempted,
      notRestEntities: [...notFound].sort(),
      unchecked: unchecked.sort((a, b) => a.entity.localeCompare(b.entity)),
    },
    entities,
  }

  await fs.mkdir(path.dirname(OUT), { recursive: true })
  await fs.writeFile(OUT, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8')

  console.log(
    `[catalogue] ${entities.length} entities, ${notFound.size} candidates with no REST surface, ` +
      `${unchecked.length} unchecked (NOT the same as absent). Written to ${path.relative(process.cwd(), OUT)}.`,
  )
  if (unchecked.length) {
    console.warn('[catalogue] unchecked candidates — re-run before trusting coverage:')
    for (const u of unchecked) console.warn(`  ${u.entity}: ${u.error}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
