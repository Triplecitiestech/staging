// src/lib/connector/autotask-drift.test.ts
//
// Guards the DIRECT_WRITE_TOOLS map against the failure it was added to fix.
//
// `implemented` in autotask_capability_check used to be derived from the
// staged-write areas alone. That was right while every Autotask write went
// through the approval gate, and became wrong the moment the project/task/CRM
// tools shipped as direct writes: the layer answered "the connector does not
// expose it yet — report it to Kurtis as a build task" for Tasks.update, a tool
// that was live and working.
//
// A capability layer that tells you to BUILD something that already exists is
// the mirror image of one that tells you the vendor CAN'T — both send the owner
// to the wrong person with confidence. So the map is data, and these tests are
// what stop it drifting: a tool name that no longer exists, or a direct write
// tool missing from the map, fails here rather than in a chat months later.

import { describe, expect, it } from 'vitest'
import { DIRECT_WRITE_TOOLS, directToolsFor } from './autotask-drift'
import { TOOL_FACTS } from './capability-registry'

const mapped = Object.values(DIRECT_WRITE_TOOLS).flatMap((ops) => Object.values(ops).flat())

describe('DIRECT_WRITE_TOOLS', () => {
  it('names only tools that are actually classified in TOOL_FACTS', () => {
    // TOOL_FACTS completeness is itself asserted against the live registry in
    // capability-registry.test.ts, so this transitively pins the map to real
    // registered tools without importing the whole module graph.
    const unknown = mapped.filter((name) => !TOOL_FACTS[name])
    expect(
      unknown,
      `These tool names appear in DIRECT_WRITE_TOOLS but are not registered anywhere. autotask_capability_check would tell a caller to use a tool that does not exist: ${unknown.join(', ')}`,
    ).toEqual([])
  })

  it('never names a READ tool as a write implementation', () => {
    const reads = mapped.filter((name) => TOOL_FACTS[name]?.access !== 'write')
    expect(
      reads,
      `DIRECT_WRITE_TOOLS claims these implement a write operation, but TOOL_FACTS classifies them as reads: ${reads.join(', ')}`,
    ).toEqual([])
  })

  it('never lists a tool that requires staged approval as a DIRECT write', () => {
    // The whole point of the flag is that a direct tool bypasses the gate. A
    // staged tool in here would make capability_check report requiresStaged-
    // Approval false for an operation the gate really does cover.
    const staged = mapped.filter((name) => TOOL_FACTS[name]?.staged === true)
    expect(staged, `These are staged-approval tools and must not be listed as direct writes: ${staged.join(', ')}`).toEqual([])
  })

  it('accounts for every Autotask write tool in the registry', () => {
    // The direction that actually rots: a new direct write tool ships and
    // nobody adds it here, so capability_check keeps calling its operation an
    // unbuilt gap. Tools that are genuinely not entity-operation writes are
    // listed explicitly rather than pattern-matched away.
    const NOT_ENTITY_OPERATIONS = new Set([
      // staged-write machinery, not an entity write of its own
      'autotask_stage_config_write',
      'autotask_execute_staged_write',
      'autotask_cancel_staged_write',
    ])
    const missing = Object.entries(TOOL_FACTS)
      .filter(([name, f]) => f.access === 'write' && !f.staged && name.startsWith('autotask_') && !NOT_ENTITY_OPERATIONS.has(name))
      .map(([name]) => name)
      .filter((name) => !mapped.includes(name))
    expect(
      missing,
      `These direct Autotask write tools are absent from DIRECT_WRITE_TOOLS, so autotask_capability_check will report their entity operation as an unbuilt gap and send someone to rebuild them: ${missing.join(', ')}`,
    ).toEqual([])
  })
})

describe('directToolsFor', () => {
  it('resolves the tool that made the stale BLOCKED claim wrong', () => {
    expect(directToolsFor('Tasks', 'update')).toEqual(['autotask_update_task'])
  })

  it('is case-insensitive on the entity name, as Autotask is', () => {
    expect(directToolsFor('tasks', 'create')).toEqual(['autotask_create_task'])
  })

  it('returns nothing for query — reads are resolved separately', () => {
    expect(directToolsFor('Tasks', 'query')).toEqual([])
  })

  it('returns nothing for an operation no direct tool implements', () => {
    // Tasks.canDelete is false upstream and no tool offers it; the verdict for
    // this must come from the API metadata, not from this map.
    expect(directToolsFor('Tasks', 'delete')).toEqual([])
    expect(directToolsFor('NotAnEntity', 'update')).toEqual([])
  })
})
