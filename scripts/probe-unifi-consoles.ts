/**
 * UniFi console proxy probe — TCT's firmware remediation list.
 *
 * For every console visible to UBIQUITI_API_KEY (GET /v1/hosts), tries the
 * proxied Network Integration API (GET .../proxy/network/integration/v1/sites)
 * and buckets each console by the typed failure reason:
 *
 *   OK                    — Integration API reachable; site count shown
 *   FIRMWARE_UNSUPPORTED  — Network app below 10.1.84 → UPDATE THIS CONSOLE
 *   CONSOLE_OFFLINE       — unreachable from Site Manager
 *   AUTH_FAILED / RATE_LIMITED / TIMEOUT / OTHER — see message
 *
 * Consoles in the FIRMWARE_UNSUPPORTED and CONSOLE_OFFLINE buckets are the
 * remediation list: none of the unifi_site_* connector tools work against
 * them until they are updated / brought back online.
 *
 * Run (PowerShell):
 *   $env:UBIQUITI_API_KEY = "<key>"; npx tsx scripts/probe-unifi-consoles.ts
 * Optional: -- --out unifi-probe-report.md   writes a Markdown report file.
 */

import { writeFileSync } from 'fs'
import { listUnifiConsoles, listLocalSites, UnifiProxyError, type UnifiConsoleInfo } from '../src/lib/ubiquiti-proxy'

const CONCURRENCY = 8 // ~800ms/proxied call; 85 consoles ≈ 9s at 8-wide

interface ProbeResult {
  console: UnifiConsoleInfo
  bucket: string
  detail: string
  siteCount: number | null
}

async function probeOne(c: UnifiConsoleInfo): Promise<ProbeResult> {
  try {
    const sites = await listLocalSites(c.consoleId)
    return { console: c, bucket: 'OK', detail: `${sites.length} local site(s)`, siteCount: sites.length }
  } catch (err) {
    if (err instanceof UnifiProxyError) {
      return { console: c, bucket: err.code, detail: err.message, siteCount: null }
    }
    return { console: c, bucket: 'OTHER', detail: err instanceof Error ? err.message : String(err), siteCount: null }
  }
}

async function probeAll(consoles: UnifiConsoleInfo[]): Promise<ProbeResult[]> {
  const results: ProbeResult[] = new Array(consoles.length)
  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= consoles.length) return
      results[i] = await probeOne(consoles[i])
      process.stdout.write('.')
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, consoles.length) }, worker))
  process.stdout.write('\n')
  return results
}

function renderMarkdown(results: ProbeResult[]): string {
  const byBucket = new Map<string, ProbeResult[]>()
  for (const r of results) {
    const list = byBucket.get(r.bucket) ?? []
    list.push(r)
    byBucket.set(r.bucket, list)
  }
  const order = ['FIRMWARE_UNSUPPORTED', 'CONSOLE_OFFLINE', 'AUTH_FAILED', 'RATE_LIMITED', 'TIMEOUT', 'OTHER', 'OK']
  const lines: string[] = [
    '# UniFi Console Proxy Probe — firmware remediation list',
    '',
    `Probed ${results.length} consoles via the Cloud Connector Proxy (GET /sites).`,
    `Result: ${(byBucket.get('OK') ?? []).length} reachable, ${results.length - (byBucket.get('OK') ?? []).length} need attention.`,
    '',
  ]
  for (const bucket of order) {
    const list = byBucket.get(bucket)
    if (!list?.length) continue
    lines.push(`## ${bucket} (${list.length})`, '')
    lines.push('| Console | Console ID | Detail |', '|---|---|---|')
    for (const r of list.sort((a, b) => a.console.name.localeCompare(b.console.name))) {
      lines.push(`| ${r.console.name} | \`${r.console.consoleId}\` | ${r.detail.replace(/\|/g, '\\|')} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  if (!process.env.UBIQUITI_API_KEY) {
    console.error('UBIQUITI_API_KEY is not set. PowerShell: $env:UBIQUITI_API_KEY = "<key>"')
    process.exit(1)
  }
  console.log('Listing consoles from Site Manager (/v1/hosts)…')
  const consoles = await listUnifiConsoles()
  console.log(`Probing ${consoles.length} consoles (${CONCURRENCY} at a time)…`)
  const results = await probeAll(consoles)

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.bucket] = (acc[r.bucket] ?? 0) + 1
    return acc
  }, {})
  console.log('\nSummary:', counts)

  const report = renderMarkdown(results)
  const outFlag = process.argv.indexOf('--out')
  if (outFlag !== -1 && process.argv[outFlag + 1]) {
    writeFileSync(process.argv[outFlag + 1], report)
    console.log(`Report written to ${process.argv[outFlag + 1]}`)
  } else {
    console.log('\n' + report)
  }
  // Non-zero exit when remediation is needed, so this can gate a scheduled check.
  const needsWork = results.length - (results.filter((r) => r.bucket === 'OK').length)
  process.exit(needsWork > 0 ? 2 : 0)
}

main().catch((err) => {
  console.error('Probe failed before any per-console results:', err instanceof Error ? err.message : err)
  process.exit(1)
})
