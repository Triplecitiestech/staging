#!/usr/bin/env tsx
// scripts/check-autotask-coverage.ts
//
// CI gate: fail the build if the connector's Autotask surface does not cover
// the generated catalogue.
//
//   npm run check:autotask-coverage
//
// Runs in the quality-gates workflow beside lint, schema-drift, build and unit
// tests. It needs NO credentials — it diffs the committed catalogue snapshot
// against the connector's own claims and exemptions, all of which are in the
// repo. That is deliberate: a gate that only runs where secrets exist is a gate
// that does not run on a pull request.
//
// WITH `--live` AND credentials, it additionally re-reads entityInformation for
// a sample of entities and fails on a snapshot that has drifted from the API,
// which is how a stale catalogue gets caught rather than quietly narrowing what
// the check considers "everything".

import {
  buildCoverageReport,
  formatViolations,
  SURFACE_CLAIMS,
} from '../src/lib/connector/autotask-coverage'
import { CATALOGUE, catalogueEntityNames, permittedOperations } from '../src/lib/connector/autotask-catalogue'
import { TOOL_FACTS } from '../src/lib/connector/capability-registry'

const LIVE = process.argv.includes('--live')

function ageInDays(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : (Date.now() - t) / 86_400_000
}

async function liveSpotCheck(): Promise<string[]> {
  const problems: string[] = []
  const baseUrl = (process.env.AUTOTASK_API_BASE_URL || '').replace(/\/$/, '')
  if (!baseUrl || !process.env.AUTOTASK_API_SECRET) {
    console.log('[coverage] --live requested but no Autotask credentials in the environment; skipping the live spot check.')
    return problems
  }
  const headers = {
    'Content-Type': 'application/json',
    ApiIntegrationCode: process.env.AUTOTASK_API_INTEGRATION_CODE || '',
    UserName: process.env.AUTOTASK_API_USERNAME || '',
    Secret: process.env.AUTOTASK_API_SECRET || '',
  }
  // A sample, not the whole catalogue: the full sweep is what the generator is
  // for, and a CI job should not make 180 vendor calls on every push.
  const sample = catalogueEntityNames()
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, 12)

  for (const entity of sample) {
    try {
      const res = await fetch(`${baseUrl}/v1.0/${entity}/entityInformation`, { headers, signal: AbortSignal.timeout(30_000) })
      if (res.status === 404) {
        problems.push(`${entity}: the catalogue has it, live entityInformation 404s. Regenerate the catalogue.`)
        continue
      }
      if (!res.ok) continue // a transient upstream failure is not a coverage defect
      const body = (await res.json()) as { info?: Record<string, unknown> }
      const info = (body?.info ?? body) as Record<string, unknown>
      const liveOps = (['query', 'create', 'update', 'delete'] as const).filter(
        (op) => info[`can${op[0].toUpperCase()}${op.slice(1)}`] === true,
      )
      const snapOps = permittedOperations(entity)
      const added = liveOps.filter((op) => !snapOps.includes(op))
      if (added.length) {
        problems.push(
          `${entity}: the API now permits ${added.join(', ')} and the catalogue snapshot does not. Regenerate it — an un-regenerated snapshot silently narrows what "everything" means.`,
        )
      }
    } catch {
      // Never fail the gate on an upstream blip. "I could not ask" is not a
      // coverage defect, and treating it as one would make the gate flaky in
      // exactly the way that gets gates disabled.
    }
  }
  return problems
}

async function main(): Promise<void> {
  const registered = Object.keys(TOOL_FACTS)
  const report = buildCoverageReport({ registeredTools: registered })

  console.log(
    `[coverage] catalogue generated ${CATALOGUE.generatedAt} (${Math.round(ageInDays(CATALOGUE.generatedAt))} days ago) — ` +
      `${report.summary.entities} entities, ${report.summary.operationsPermitted} permitted operations, ${report.summary.writableFields} writable fields.`,
  )
  console.log(
    `[coverage] covered: ${report.summary.operationsCovered} operations / ${report.summary.fieldsCovered} fields. ` +
      `Exempted: ${report.summary.operationsExempted} operations / ${report.summary.fieldsExempted} fields.`,
  )

  const problems: string[] = []

  // 1. Claims must name real, registered tools.
  const phantom = SURFACE_CLAIMS.filter((c) => !TOOL_FACTS[c.tool]).map((c) => c.tool)
  if (phantom.length) {
    problems.push(
      `SURFACE_CLAIMS names tools that are not registered: ${phantom.join(', ')}. A claim on a tool nobody registers is a promise, not coverage.`,
    )
  }

  // 2. The catalogue must be a census, not a stub. A check run against an empty
  //    snapshot would pass triumphantly while covering nothing.
  if (report.summary.entities < 100) {
    problems.push(
      `The catalogue holds only ${report.summary.entities} entities. The hand-picked surface this replaces already covered 44, so this is a broken or stale snapshot — run npm run gen:autotask-catalogue.`,
    )
  }

  // 3. The real diff.
  if (report.violations.length) problems.push(formatViolations(report))

  // 4. Staleness is a warning, not a failure: a catalogue cannot regenerate
  //    itself in CI, and failing every build after 90 quiet days would teach
  //    people to delete the gate.
  const age = ageInDays(CATALOGUE.generatedAt)
  if (age > 90) {
    console.warn(
      `[coverage] WARNING: the catalogue snapshot is ${Math.round(age)} days old. Kaseya ships entities between regenerations; run npm run gen:autotask-catalogue against production and commit the result.`,
    )
  }
  if (CATALOGUE.discovery.unchecked.length) {
    console.warn(
      `[coverage] WARNING: ${CATALOGUE.discovery.unchecked.length} candidate(s) were never successfully probed and are NOT recorded as absent: ` +
        CATALOGUE.discovery.unchecked.map((u) => u.entity).join(', '),
    )
  }

  if (LIVE) problems.push(...(await liveSpotCheck()))

  if (problems.length) {
    console.error('\n[coverage] FAILED\n')
    for (const p of problems) console.error(p)
    console.error(
      '\nEvery entity, operation and writable field the Autotask API permits must be exposed by the connector or carry a dated, reasoned exemption in src/lib/connector/autotask-exemptions.ts. "Not needed yet" is not a valid exemption — that is precisely how this surface came to cover 44 of ~180 entities.\n',
    )
    process.exit(1)
  }

  console.log('[coverage] OK — nothing the Autotask API permits is silently missing from the connector.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
