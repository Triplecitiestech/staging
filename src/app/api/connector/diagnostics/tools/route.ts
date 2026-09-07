// src/app/api/connector/diagnostics/tools/route.ts
//
// READ-ONLY diagnostic: what does THIS running instance actually register, and
// what does it actually emit on tools/list?
//
// WHY IT EXISTS. On 2026-09-08 the connector reported 185 registered tools while
// the client advertised 179, with the six scan_* tools missing — and
// tct_connector_capabilities reported those six with EMPTY parameter lists while
// hr_* returned full ones. Every server-side layer reproduced clean:
//
//   - the recording proxy and the SDK registry agreed exactly (155 = 155)
//   - the SDK's own tools/list carried all six with valid schemas
//   - mcp-handler does no tools/list filtering
//   - the PRODUCTION BUNDLE, driven at runtime out of .next, recorded full
//     parameter lists (scan_render_attachment: 5), identical to source
//
// So local and production disagreed on the same commit with no local mechanism
// to explain it, and the next honest step was to stop hypothesising and measure
// the running instance. That is all this route does.
//
// It registers the REAL surface via registerAllConnectorTools — the same
// function the live mounts use, not a second copy of the tool list. A
// diagnostic with its own registration list would be measuring itself.
//
// It writes nothing, calls no vendor API, and touches no kill switch. Tool
// HANDLERS are never invoked: registration and serialisation are the only
// things exercised.

import { NextRequest, NextResponse } from 'next/server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { checkSecretAuth } from '@/lib/api-auth'
import { registerAllConnectorTools, type ConnectorMcpServer } from '@/lib/connector/build-mcp-handler'
import { buildCapabilityReport } from '@/lib/connector/capability-registry'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface ToolDiagnostic {
  name: string
  /** From the recording proxy — what tct_connector_capabilities reports from. */
  recordedParamCount: number
  recordedDescriptionLength: number
  /** Present in the tools/list a real MCP client receives from this instance. */
  emitted: boolean
  /** Property count on the emitted JSON Schema. */
  emittedPropertyCount: number | null
  /**
   * Whether the emitted schema carries a `$schema` key. Not cosmetic: a tool
   * registered WITHOUT an inputSchema emits `{type,properties}` with no
   * `$schema`, while `inputSchema: {}` emits one WITH it. If anything
   * downstream validates tool schemas strictly, that is the difference it
   * would see — so it is reported rather than left to be guessed at.
   */
  emittedHasSchemaKey: boolean | null
  /** Set only when the two sides disagree, so a clean run reads clean. */
  mismatch?: string
}

export async function GET(request: NextRequest) {
  const unauthorized = checkSecretAuth(request)
  if (unauthorized) return unauthorized

  try {
    const mcp = new McpServer({ name: 'tct-connector-diagnostics', version: '1.0.0' })
    const { recorded } = registerAllConnectorTools(mcp as unknown as ConnectorMcpServer)

    // Drive a REAL client over an in-memory transport rather than reading the
    // SDK's internals. What comes back is what a connected client receives,
    // which is the whole question — an internal registry read would answer a
    // different one and look like the same answer.
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'tct-diagnostics', version: '1.0.0' })
    await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])

    const emittedTools: Array<{ name: string; inputSchema?: unknown }> = []
    let cursor: string | undefined
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined)
      emittedTools.push(...page.tools)
      cursor = page.nextCursor
    } while (cursor)

    await client.close().catch(() => {})
    await mcp.close().catch(() => {})

    const emittedByName = new Map(emittedTools.map((t) => [t.name, t]))
    const recordedNames = new Set(recorded.map((t) => t.name))

    const tools: ToolDiagnostic[] = recorded.map((t) => {
      const e = emittedByName.get(t.name)
      const schema = e?.inputSchema as Record<string, unknown> | undefined
      const props = schema && typeof schema === 'object' ? (schema.properties as Record<string, unknown> | undefined) : undefined
      const row: ToolDiagnostic = {
        name: t.name,
        recordedParamCount: t.params.length,
        recordedDescriptionLength: t.description.length,
        emitted: Boolean(e),
        emittedPropertyCount: props && typeof props === 'object' ? Object.keys(props).length : e ? 0 : null,
        emittedHasSchemaKey: e ? Object.prototype.hasOwnProperty.call(schema ?? {}, '$schema') : null,
      }
      if (!row.emitted) {
        row.mismatch = 'Registered on this instance but ABSENT from the tools/list a connected client receives.'
      } else if (row.recordedParamCount !== row.emittedPropertyCount) {
        row.mismatch = `Recorded ${row.recordedParamCount} parameters but emitted ${row.emittedPropertyCount} schema properties.`
      } else if (row.recordedDescriptionLength === 0) {
        row.mismatch = 'Recorded with an EMPTY description — the recording proxy threw for this tool and fell back.'
      }
      return row
    })

    const emittedNotRecorded = emittedTools.map((t) => t.name).filter((n) => !recordedNames.has(n))
    const mismatches = tools.filter((t) => t.mismatch)

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      build: buildCapabilityReport([], { includeParams: false }).build,
      note:
        'Measured on THIS instance, now. registerAllConnectorTools is the same function the live connector ' +
        'mounts use, so this is the production surface and not a second copy of the tool list. No tool ' +
        'handler was invoked; nothing was written.',
      summary: {
        registered: recorded.length,
        emittedToClient: emittedTools.length,
        registeredButNotEmitted: tools.filter((t) => !t.emitted).length,
        emittedButNotRegistered: emittedNotRecorded.length,
        mismatches: mismatches.length,
      },
      howToRead:
        'If registered === emittedToClient here but the Claude client advertises fewer, the drop is DOWNSTREAM ' +
        'of this server and no server-side change will fix it. If registeredButNotEmitted is non-zero, the ' +
        'server is the cause and the affected tools are named below.',
      mismatches,
      emittedButNotRegistered: emittedNotRecorded,
      tools,
    })
  } catch (e) {
    // A diagnostic that fails silently is worse than none. Report the failure
    // as a failure, with its message, and never as an empty tool list.
    return NextResponse.json(
      {
        error: 'Connector tool diagnostics failed to run.',
        detail: e instanceof Error ? e.message : String(e),
        note: 'This is a failure of the diagnostic itself. Do NOT read it as "the connector has no tools".',
      },
      { status: 500 }
    )
  }
}
