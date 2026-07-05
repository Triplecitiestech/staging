// src/lib/mcp-config-write-tools.ts
//
// GATED Autotask CONFIG writes for the MCP connector. The gate is structural
// (see src/lib/connector/staged-writes.ts): staging never writes, execution
// only works on a row a human approved on /admin/connector/staged-writes
// behind staff auth the MCP token cannot reach, with drift detection and a
// permanent audit trail. Ticket-scoped writes (notes, time entries, status)
// live in mcp-write-tools.ts and are unchanged.

import { z } from 'zod'
import {
  cancelStagedWrite,
  executeStagedWrite,
  listStagedWrites,
  stageConfigWrite,
} from '@/lib/connector/staged-writes'
import { CONFIG_WRITE_AREAS } from '@/lib/connector/staged-writes-core'

function ok(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] } }
function fail(err: unknown) { const m = err instanceof Error ? err.message : String(err); return { content: [{ type: 'text' as const, text: `Error: ${m}` }], isError: true } }

const AREA_KEYS = Object.keys(CONFIG_WRITE_AREAS) as [string, ...string[]]
const AREA_SUMMARY = Object.values(CONFIG_WRITE_AREAS)
  .map((s) => `${s.area} (${s.operations.join('/')}: ${s.allowedFields.join(', ')})`)
  .join('; ')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerConfigWriteTools(server: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email

  server.registerTool(
    'autotask_stage_config_write',
    {
      title: 'Autotask: stage a config change (writes NOTHING)',
      description: `STAGE a configuration change for human approval — this tool NEVER writes to Autotask. It snapshots the current values, computes a field-by-field before→after diff, stores the pending change, and returns the diff plus an approval URL. A staff member must approve it on /admin/connector/staged-writes (staff login; the connector token cannot approve), then autotask_execute_staged_write applies it. Staged changes expire unexecuted. Writable areas (verified against the Autotask REST API — notification templates, workflow rules, and status/SLA admin config have NO API write surface and are deliberately absent): ${AREA_SUMMARY}. The status_sla_overlay area writes the owner-maintained mapping in OUR database (mappings: [{statusId, slaEvent}]), never to Autotask.`,
      inputSchema: {
        area: z.enum(AREA_KEYS).describe('Config area to change'),
        operation: z.enum(['create', 'update', 'delete']).describe('What to do'),
        entityId: z.number().int().optional().describe('Target record id (required for update/delete)'),
        parentId: z.number().int().optional().describe('Parent id for child records (e.g. holidaySetID for a new holiday; derived automatically on update/delete)'),
        changes: z.record(z.string(), z.unknown()).optional().describe('Field→new-value map (allowlisted fields only; omit for delete)'),
        reason: z.string().optional().describe('Why this change is being made (stored in the audit trail)'),
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ area, operation, entityId, parentId, changes, reason }: any, extra: any) => {
      try {
        const stagedBy = emailOf(extra)
        if (!stagedBy) throw new Error('Cannot stage: no signed-in user email on the connector session.')
        return ok(await stageConfigWrite({ area, operation, entityId, parentId, changes: changes ?? {}, reason, stagedBy }))
      } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_list_staged_writes',
    {
      title: 'Autotask: list staged config writes',
      description: 'List staged config changes and their audit state (pending_approval / approved / rejected / executed / failed / drifted / cancelled / expired), newest first, with diffs. Use after the user says they approved, to check whether a staged write is now executable. Read-only.',
      inputSchema: { status: z.string().optional().describe('Filter by status, e.g. pending_approval or approved') },
    },
    async ({ status }: { status?: string }) => {
      // Scoped to Autotask+overlay rows — UniFi rows have their own tools.
      try { return ok(await listStagedWrites(status, ['autotask', 'overlay'])) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_execute_staged_write',
    {
      title: 'Autotask: execute an APPROVED staged write',
      description: 'Execute ONE staged config change that a human already APPROVED on /admin/connector/staged-writes. Refuses anything not in approved state (calling it early returns the approval URL — that is expected, not an error to work around). Single-use. Re-reads the live record first and ABORTS as \'drifted\' if it changed since staging. On success returns the API result plus a fresh read-back of the record so the outcome is verifiable.',
      inputSchema: { stagedWriteId: z.string().describe('Id returned by autotask_stage_config_write') },
    },
    async ({ stagedWriteId }: { stagedWriteId: string }) => {
      try { return ok(await executeStagedWrite(stagedWriteId)) } catch (e) { return fail(e) }
    }
  )

  server.registerTool(
    'autotask_cancel_staged_write',
    {
      title: 'Autotask: cancel a staged write',
      description: 'Cancel a pending or approved staged config change before execution. The row stays in the audit trail as cancelled. Nothing is written to Autotask.',
      inputSchema: { stagedWriteId: z.string().describe('Id returned by autotask_stage_config_write') },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ stagedWriteId }: any, extra: any) => {
      try { return ok(await cancelStagedWrite(stagedWriteId, emailOf(extra) ?? 'unknown', ['autotask', 'overlay'])) } catch (e) { return fail(e) }
    }
  )
}
