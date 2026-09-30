// src/lib/mcp-soc-tools.ts
//
// SOC analyzer surface on the MCP connector. ONE tool, and it is read-only by
// construction: soc_triage_dry_run runs the real analyzer against an existing
// ticket with a recording writer (every Autotask write and the customer email
// are captured, not made), a read-only assessment store, no persistence, and
// both LLM calls off. It exists so the analyzer's outcome on a live ticket can
// be checked without touching the ticket or the customer — the smoke test for
// the 2026-09-28 SOC changes, and a preview for technicians.

import { z } from 'zod'
import { toolFailure } from '@/lib/connector/failure-envelope'
import { runSocDryRunForTicket } from '@/lib/soc/engine'

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSocTools(server: any) {
  server.registerTool(
    'soc_triage_dry_run',
    {
      title: 'SOC: dry-run the analyzer on a ticket (writes nothing)',
      description:
        'READ-ONLY. Runs the SOC analyzer on one existing security ticket exactly as a live run would and returns what it WOULD do — classification and confidence (computed in code from the evidence), the per-client visibility map (which sources are connected, unverified or not connected), TCT-initiated change windows, IP classification, which sources corroborate versus are context, the co-managed status and recipient, the exact customer message, and the list of Autotask writes / emails a live run would make. NOTHING is written: no ticket note, no contact change, no email, no database row. Both AI calls are off (the outcome does not depend on them). Also reports what a live automatic trigger would do with this ticket right now (assess, or skip because it is already assessed / a twin).',
      inputSchema: {
        ticketId: z.number().int().describe('Autotask ticket id (numeric, not the T-number)'),
      },
    },
    async ({ ticketId }: { ticketId: number }) => {
      try {
        return ok(await runSocDryRunForTicket(ticketId))
      } catch (e) {
        return toolFailure(e, { surface: 'connector' })
      }
    },
  )
}
