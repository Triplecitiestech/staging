// src/lib/mcp-project-tools.test.ts
//
// Locks the two things this surface got wrong before it existed.
//
// 1. THE PATH RESOLVER. AutotaskClient.updateTaskStatus tried three URLs, threw
//    away every error, and rethrew only the LAST one. A 500 "Data violation"
//    from the CORRECT parent-scoped URL was discarded, and the 404 from a later
//    candidate — ProjectTasks, an entity that does not exist on this instance —
//    became the recorded symptom. That is how "task PATCH returns 404 on all 3
//    entity paths" was written into CLAUDE.md as a vendor limitation while
//    entityInformation reported Tasks.canUpdate true.
//
//    So the rule under test is: a 404 moves to the next candidate, ANY OTHER
//    failure stops immediately and surfaces itself. Read the assertions as the
//    definition of that rule, not as coverage of it.
//
// 2. FIELD VERIFICATION. An accepted write is not a done write. The comparison
//    has to tolerate the transport differences Autotask really introduces
//    (line endings, datetime formatting, int-vs-bool flags) without tolerating
//    a value that did not land — a verifier that cries wolf on every date write
//    teaches the reader to ignore it, which is worse than no verifier at all.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.AUTOTASK_API_BASE_URL = 'https://webservices15.autotask.net/atservicesrest'
  process.env.AUTOTASK_WRITE_USERNAME = 'test-user'
  process.env.AUTOTASK_WRITE_SECRET = 'test-secret'
  process.env.AUTOTASK_WRITE_INTEGRATION_CODE = 'test-code'
})

import { writeAtFirstWorkingPath, createTask, updateTask } from '@/lib/autotask-write'
import { datesMatch, valueMatches, verifyWrittenFields, definedFields } from '@/lib/mcp-project-tools'

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }) as unknown as Response

const textResponse = (status: number, body: string) =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body }) as unknown as Response

describe('writeAtFirstWorkingPath — path resolution', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('uses the first candidate when it succeeds, and never calls the second', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { itemId: 41 }))

    const res = await writeAtFirstWorkingPath<{ itemId: number }>('POST', [
      { path: 'Projects/7/Tasks', body: { title: 'a' } },
      { path: 'Tasks', body: { title: 'a', projectID: 7 } },
    ])

    expect(res.result.itemId).toBe(41)
    expect(res.pathUsed).toBe('Projects/7/Tasks')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.attempts).toEqual([{ path: 'Projects/7/Tasks', method: 'POST', status: 200, outcome: 'ok' }])
  })

  it('falls through a 404 to the next candidate and reports both attempts', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(404, '404 - File or directory not found.'))
      .mockResolvedValueOnce(jsonResponse(200, { itemId: 99 }))

    const res = await writeAtFirstWorkingPath<{ itemId: number }>('PATCH', [
      { path: 'ProjectTasks', body: { id: 99 } },
      { path: 'Tasks', body: { id: 99 } },
    ])

    expect(res.pathUsed).toBe('Tasks')
    expect(res.attempts.map((a) => a.outcome)).toEqual(['path-not-found', 'ok'])
  })

  it('THE REGRESSION: a non-404 rejection stops the chain and is the error thrown', async () => {
    // The exact shape of the original defect. The parent-scoped URL is correct
    // and Autotask refuses the PAYLOAD with a 500 data violation. The old chain
    // swallowed this and went on to report a later path's 404.
    const dataViolation = '{"errors":["Data violation: status 4 is not a valid value."]}'
    fetchMock.mockResolvedValueOnce(textResponse(500, dataViolation))

    await expect(
      writeAtFirstWorkingPath('PATCH', [
        { path: 'Projects/7/Tasks', body: { id: 99, status: 4 } },
        { path: 'Tasks', body: { id: 99, status: 4 } },
      ]),
    ).rejects.toThrow(/Data violation/)

    // The second candidate must NEVER be tried: the path was right.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never reports a 404 verdict without naming every URL it tried', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(404, 'nope'))
      .mockResolvedValueOnce(textResponse(404, 'nope'))

    await expect(
      writeAtFirstWorkingPath('POST', [{ path: 'A', body: {} }, { path: 'B', body: {} }]),
    ).rejects.toThrow(/A → 404.*B → 404/)
  })

  it('sends the parent-scoped body and the root body separately', async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse(404, 'nope'))
      .mockResolvedValueOnce(jsonResponse(200, { itemId: 5 }))

    await writeAtFirstWorkingPath('POST', [
      { path: 'Companies/12/Projects', body: { projectName: 'x' } },
      { path: 'Projects', body: { projectName: 'x', companyID: 12 } },
    ])

    // The root fallback must carry companyID; the parent-scoped one must not,
    // because Projects.companyID is read-only in the body.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ projectName: 'x' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ projectName: 'x', companyID: 12 })
  })

  it('carries a timeout signal on every write', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))
    await writeAtFirstWorkingPath('POST', [{ path: 'Tasks', body: {} }])
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('task writes — the assignment pair Autotask requires', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(jsonResponse(200, { itemId: 1 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('createTask defaults the role when a resource is supplied without one', async () => {
    await createTask(7, { title: 't', status: 1, taskType: 1, assignedResourceID: 29683333 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    // Engineer — never Low/High Voltage Technician 29683465.
    expect(body.assignedResourceRoleID).toBe(29683355)
  })

  it('updateTask defaults the role too — the writer, not the tool, enforces it', async () => {
    await updateTask(99, 7, { assignedResourceID: 29683333 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.assignedResourceRoleID).toBe(29683355)
  })

  it('clearing an assignment does NOT acquire a role', async () => {
    await updateTask(99, 7, { assignedResourceID: null })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.assignedResourceID).toBeNull()
    expect(body).not.toHaveProperty('assignedResourceRoleID')
  })

  it('a write that touches neither field stays untouched', async () => {
    await updateTask(99, 7, { status: 8 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ id: 99, status: 8 })
  })
})

describe('datesMatch', () => {
  it('treats a Z-suffixed request and a zoneless Autotask response as equal', () => {
    expect(datesMatch('2026-09-01T14:30:00Z', '2026-09-01T14:30:00')).toBe(true)
  })

  it('accepts a date-only request against a stamped datetime on the same day', () => {
    expect(datesMatch('2026-09-01', '2026-09-01T00:00:00')).toBe(true)
  })

  it('still fails a genuinely different date', () => {
    expect(datesMatch('2026-09-01T14:30:00Z', '2026-09-02T14:30:00')).toBe(false)
  })

  it('returns null for non-dates so the caller falls back to a string compare', () => {
    expect(datesMatch('In Progress', 'In Progress')).toBeNull()
  })
})

describe('valueMatches', () => {
  it('tolerates line-ending differences in text', () => {
    expect(valueMatches('one\ntwo', 'one\r\ntwo')).toBe(true)
  })

  it('does NOT tolerate truncated text', () => {
    expect(valueMatches('the full note', 'the full')).toBe(false)
  })

  it('accepts an integer flag for a boolean field (Contacts.isActive is an int)', () => {
    expect(valueMatches(true, 1)).toBe(true)
    expect(valueMatches(false, 0)).toBe(true)
    expect(valueMatches(true, 0)).toBe(false)
  })

  it('compares decimals within Autotask precision but not loosely', () => {
    expect(valueMatches(2.67, 2.67)).toBe(true)
    expect(valueMatches(2.67, 2.7)).toBe(false)
  })

  it('treats null as a request to clear, satisfied by null or empty', () => {
    expect(valueMatches(null, null)).toBe(true)
    expect(valueMatches(null, '')).toBe(true)
    expect(valueMatches(null, 5)).toBe(false)
  })
})

describe('verifyWrittenFields', () => {
  it('reports a field that did not stick as a mismatch — fail closed', () => {
    const res = verifyWrittenFields({ status: 8 }, { status: 1 }, { status: 1 })
    expect(res.mismatches).toEqual([{ field: 'status', requested: 8, actual: 1 }])
  })

  it('counts a field absent from the read-back as NOT landed, never as fine', () => {
    const res = verifyWrittenFields({ title: 'new' }, {}, {})
    expect(res.mismatches).toEqual([{ field: 'title', requested: 'new', actual: null }])
  })

  it('separates a real change from a no-op re-send', () => {
    const res = verifyWrittenFields(
      { status: 8, title: 'same' },
      { status: 1, title: 'same' },
      { status: 8, title: 'same' },
    )
    expect(res.mismatches).toEqual([])
    expect(res.changedFields).toEqual(['status'])
    expect(res.unchangedFields).toEqual(['title'])
  })

  it('does not fail a date write purely on formatting', () => {
    const res = verifyWrittenFields(
      { endDateTime: '2026-09-01T17:00:00Z' },
      { endDateTime: null },
      { endDateTime: '2026-09-01T17:00:00' },
    )
    expect(res.mismatches).toEqual([])
    expect(res.changedFields).toEqual(['endDateTime'])
  })
})

describe('definedFields', () => {
  it('drops undefined so a PATCH carries only what was supplied', () => {
    expect(definedFields({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null })
  })
})
