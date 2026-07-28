// scripts/verify-failure-envelopes.ts
//
// Prints the ACTUAL failure envelope for each of the owner's acceptance cases,
// plus a drift report, using the real entityInformation captured from the live
// TCT instance (src/lib/connector/__fixtures__/autotask-entity-information.ts).
//
// Why a script and not just the test suite: the tests assert, this SHOWS. The
// brief asks for the envelopes to be pasted, and reading them end to end is how
// you notice a message that is technically correct but useless to a human.
//
// Run:  npx tsx scripts/verify-failure-envelopes.ts

import {
  ClassifiedConnectorError,
  connectorFailure,
  classifyThrown,
  type ConnectorFailure,
} from '../src/lib/connector/failure-envelope'
import {
  __setCapabilityFetcher,
  capabilityCacheStats,
  checkField,
  clearCapabilityCache,
  getEntityCapabilitySnapshot,
} from '../src/lib/connector/autotask-capability'
import {
  classifyRejectedFields,
  classifyUnsupportedOperation,
  stagedWriteDriftedFailure,
  stagedWriteNotApprovedFailure,
} from '../src/lib/connector/autotask-write-validation'
import { CONFIG_WRITE_AREAS, FieldsNotAllowlistedError, validateStagedChange } from '../src/lib/connector/staged-writes-core'
import { buildAutotaskDriftReport, checkAutotaskCapability } from '../src/lib/connector/autotask-drift'
import { fixtureFetcher } from '../src/lib/connector/__fixtures__/autotask-entity-information'

const APPROVAL_URL = 'https://www.triplecitiestech.com/admin/connector/staged-writes'

async function envelopeFrom(fn: () => Promise<unknown>): Promise<ConnectorFailure> {
  try {
    await fn()
  } catch (e) {
    if (e instanceof ClassifiedConnectorError) return connectorFailure(e.failure)
    return classifyThrown(e, { surface: 'autotask' })
  }
  throw new Error('expected a failure, got success')
}

function show(caseName: string, expected: string, envelope: ConnectorFailure): void {
  const verdict = envelope.reasonCode === expected ? 'PASS' : `MISMATCH (expected ${expected})`
  console.log(`\n${'━'.repeat(78)}\nCASE: ${caseName}\nEXPECTED: ${expected}   →   GOT: ${envelope.reasonCode}   [${verdict}]\n${'━'.repeat(78)}`)
  console.log(JSON.stringify({ failure: envelope }, null, 2))
}

async function main(): Promise<void> {
  clearCapabilityCache()
  __setCapabilityFetcher(fixtureFetcher)

  // 1. Delete a Service
  show(
    'Delete a Service',
    'UPSTREAM_UNSUPPORTED',
    await envelopeFrom(() => classifyUnsupportedOperation('service', 'Services', 'delete', CONFIG_WRITE_AREAS.service.operations)),
  )

  // 2. Delete a ServiceBundle, before approval
  show(
    'Delete a ServiceBundle (staged, awaiting approval)',
    'POLICY_BLOCKED',
    connectorFailure(
      stagedWriteNotApprovedFailure({ id: 'sw_bundle_delete', status: 'pending_approval', targetLabel: 'Service bundle: Watchtower (id 12)', approvalUrl: APPROVAL_URL }),
    ),
  )

  // 3. Create a Service — now implemented, so this is a pre-flight check, not a failure.
  const createCheck = await checkAutotaskCapability({ entity: 'Services', operation: 'create' })
  console.log(`\n${'━'.repeat(78)}\nCASE: Create a Service (pre-flight)\nEXPECTED: implemented after the companion task   →   GOT verdict ${createCheck.verdict}\n${'━'.repeat(78)}`)
  console.log(JSON.stringify(createCheck, null, 2))

  // 4. Update Services.markupRate
  let rejected: unknown
  try {
    validateStagedChange({ area: 'service', operation: 'update', entityId: 7, changes: { markupRate: 25 } })
  } catch (e) {
    rejected = e
  }
  show(
    'Update Services.markupRate',
    'INVALID_INPUT',
    await envelopeFrom(() => classifyRejectedFields(rejected as FieldsNotAllowlistedError)),
  )

  // 5. Write a notification template
  show('Write a notification template', 'UPSTREAM_UNSUPPORTED', await envelopeFrom(() => getEntityCapabilitySnapshot('NotificationTemplates')))

  // 6. Write a workflow rule / Event
  show('Write a workflow rule / Event', 'UPSTREAM_UNSUPPORTED', await envelopeFrom(() => getEntityCapabilitySnapshot('WorkflowRules')))

  // 7. Write a BillingCode
  const bc = await checkAutotaskCapability({ entity: 'BillingCodes', operation: 'update' })
  console.log(`\n${'━'.repeat(78)}\nCASE: Write a BillingCode (pre-flight)\nEXPECTED: UPSTREAM_UNSUPPORTED   →   GOT ${bc.verdict} / reasonCodeIfAttempted ${bc.reasonCodeIfAttempted}\n${'━'.repeat(78)}`)
  console.log(JSON.stringify(bc, null, 2))

  // 8. Execute an unapproved staged write
  show(
    'Execute an unapproved staged write',
    'POLICY_BLOCKED',
    connectorFailure(stagedWriteNotApprovedFailure({ id: 'sw_unapproved', status: 'pending_approval', approvalUrl: APPROVAL_URL })),
  )

  // 9. Execute a staged write whose record drifted
  show(
    'Execute a staged write whose record changed since staging',
    'PRECONDITION_FAILED',
    connectorFailure(stagedWriteDriftedFailure({ id: 'sw_drift', targetLabel: 'Service: Server Monitoring (id 7)', driftedFields: ['unitPrice', 'unitCost'], verb: 'written' })),
  )

  // 10. Rate limited
  show(
    'Any call while rate-limited',
    'TRANSIENT',
    classifyThrown(new Error('Autotask API query Services failed (429): Rate limit exceeded for this integration code'), { surface: 'autotask' }),
  )

  // ── Cache behaviour ──────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(78)}\nCACHE BEHAVIOUR\n${'═'.repeat(78)}`)
  clearCapabilityCache()
  let calls = 0
  __setCapabilityFetcher((e) => { calls++; return fixtureFetcher(e) })
  const cold = await getEntityCapabilitySnapshot('Services')
  const warm = await getEntityCapabilitySnapshot('Services')
  console.log(`cold lookup  → cache=${cold.cache}  (live fetches so far: ${calls})`)
  console.log(`warm lookup  → cache=${warm.cache}  (live fetches so far: ${calls})`)

  // Age the cache, then break the fetcher: a stale entry must still answer.
  const g = globalThis as unknown as { __atCapabilityCache?: Map<string, { expiresAt: number }> }
  for (const entry of g.__atCapabilityCache?.values() ?? []) entry.expiresAt = 0
  __setCapabilityFetcher(() => Promise.reject(new Error('ETIMEDOUT connecting to webservices.autotask.net')))
  const stale = await getEntityCapabilitySnapshot('Services')
  console.log(`stale + lookup fails → cache=${stale.cache}`)
  console.log(`  staleWarning: ${stale.staleWarning}`)

  // Cold cache + failed lookup MUST be TRANSIENT, never UPSTREAM_UNSUPPORTED.
  clearCapabilityCache()
  const coldFail = await envelopeFrom(() => getEntityCapabilitySnapshot('Services'))
  console.log(`cold cache + lookup fails → reasonCode=${coldFail.reasonCode}  (must be TRANSIENT)`)
  console.log(JSON.stringify({ failure: coldFail }, null, 2))

  // ── markupRate field verdict, verbatim ───────────────────────────────────
  __setCapabilityFetcher(fixtureFetcher)
  clearCapabilityCache()
  console.log(`\n${'═'.repeat(78)}\nFIELD VERDICTS (live metadata)\n${'═'.repeat(78)}`)
  for (const [entity, field] of [['Services', 'markupRate'], ['Services', 'periodType'], ['ServiceBundles', 'unitCost']] as const) {
    console.log(`\n--- ${entity}.${field} ---`)
    console.log(JSON.stringify(await checkField(entity, field), null, 2))
  }

  // ── Drift report ─────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(78)}\nDRIFT REPORT (entities with real captured live metadata)\n${'═'.repeat(78)}`)
  const report = await buildAutotaskDriftReport({
    entities: ['Services', 'ServiceBundles', 'ServiceBundleServices', 'BillingCodes'],
  })
  console.log(JSON.stringify(report, null, 2))
  console.log(`\ncapability cache after the sweep: ${JSON.stringify(capabilityCacheStats(), null, 2)}`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('verification script failed:', e)
    process.exit(1)
  },
)
