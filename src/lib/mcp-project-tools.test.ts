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
import { datesMatch, valueMatches, verifyWrittenFields, definedFields, splitByQueryability } from '@/lib/mcp-project-tools'
import { __setCapabilityFetcher, clearCapabilityCache } from '@/lib/connector/autotask-capability'

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

  it('treats an empty string as the same clear request — Autotask stores null', () => {
    // Blanking a description sends '' and Autotask stores null. That is a
    // successful clear; failing it would report a dropped write that landed.
    expect(valueMatches('', null)).toBe(true)
    expect(valueMatches('', '')).toBe(true)
    expect(valueMatches('', 'still here')).toBe(false)
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

describe('splitByQueryability — a writable field a read can never see', () => {
  // Tasks.remainingHours is isRequired false, isReadOnly FALSE (so it is
  // writable) and isQueryable FALSE. A fail-closed verifier that did not know
  // this would return PRECONDITION_FAILED on a write that landed perfectly —
  // and a verification flag that cries wolf is worse than none, because the
  // reader learns to ignore it.
  const snapshot = {
    entity: 'Tasks',
    capabilities: { canQuery: true, canCreate: true, canUpdate: true, canDelete: false },
    fields: [
      { name: 'title', isRequired: true, isReadOnly: false, isQueryable: true },
      { name: 'status', isRequired: true, isReadOnly: false, isQueryable: true },
      { name: 'remainingHours', isRequired: false, isReadOnly: false, isQueryable: false },
    ],
    fetchedAt: '2026-08-25T00:00:00.000Z',
  }

  beforeEach(() => clearCapabilityCache())
  afterEach(() => {
    __setCapabilityFetcher(null)
    clearCapabilityCache()
  })

  it('separates the field no read can return, and says why', async () => {
    __setCapabilityFetcher(async () => snapshot)
    const res = await splitByQueryability('Tasks', ['title', 'status', 'remainingHours'])

    expect(res.verifiable).toEqual(['title', 'status'])
    expect(res.unverifiable).toEqual(['remainingHours'])
    expect(res.reason).toMatch(/isQueryable false/)
    // It must never imply the write failed — it was accepted, just unprovable.
    expect(res.reason).toMatch(/accepted/)
  })

  it('reports nothing when every field is queryable', async () => {
    __setCapabilityFetcher(async () => snapshot)
    const res = await splitByQueryability('Tasks', ['title', 'status'])
    expect(res.unverifiable).toEqual([])
    expect(res.reason).toBeNull()
  })

  it('falls back to the STRICT path when the metadata lookup fails', async () => {
    // A failed lookup must never silently widen what goes unverified.
    __setCapabilityFetcher(async () => { throw new Error('entityInformation unreachable') })
    const res = await splitByQueryability('Tasks', ['title', 'remainingHours'])
    expect(res.verifiable).toEqual(['title', 'remainingHours'])
    expect(res.unverifiable).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Defects found building Wilmar project 55 (2026-08-25)
// ---------------------------------------------------------------------------
//
// 134 tasks through the connector surfaced three defects that cost failed
// writes. These lock the fixes to the VERBATIM vendor payloads observed, so a
// future refactor that reintroduces any of them fails here.

import { planTaskAssignment } from '@/lib/mcp-project-tools'
import { classifyError } from '@/lib/resilience'
import { classifyThrown } from '@/lib/connector/failure-envelope'
import { resolvePicklistId, __setPicklistFetcher, clearPicklistCache } from '@/lib/connector/autotask-picklists'

describe('classifyError — a 500 carrying a structured errors[] body is a REQUEST problem', () => {
  // Autotask answers request-shape rejections with HTTP 500. The bare '500'
  // status test classified these as server_error → TRANSIENT → "wait briefly
  // and retry", advice that can never succeed because the request is wrong.
  const taskAssignment500 =
    'Autotask POST Projects/55/Tasks failed (500): {"errors":[' +
    '"The Task \\"Kickoff\\" has an invalid Resource and Role combination.",' +
    '"billingCodeID is a required field when a Resource (primary/secondary) is assigned to a Task",' +
    '"departmentID is a required field when a Resource (primary/secondary) is assigned to a Task"]}'

  const picklist500 =
    'Autotask POST Projects/55/Notes failed (500): {"errors":["Picklist value [3] does not exist for noteType. ; on record number [1]."]}'

  it('classifies the verbatim task-assignment 500 as validation, not transient', () => {
    const c = classifyError(new Error(taskAssignment500))
    expect(c.category).toBe('validation')
    expect(c.isTransient).toBe(false)
  })

  it('classifies the verbatim picklist 500 as validation, not transient', () => {
    const c = classifyError(new Error(picklist500))
    expect(c.category).toBe('validation')
    expect(c.isTransient).toBe(false)
  })

  it('the envelope never tells the caller to retry either of them', () => {
    for (const raw of [taskAssignment500, picklist500]) {
      const env = classifyThrown(new Error(raw), { surface: 'autotask' })
      expect(env.reasonCode).toBe('INVALID_INPUT')
      expect(env.fixableBy).not.toBe('retry')
      expect(env.remediation.toLowerCase()).not.toContain('wait briefly')
      expect(env.remediation.toLowerCase()).not.toContain('report it as an outage')
    }
  })

  it('quotes the vendor\'s own sentence back, because it names the field', () => {
    const env = classifyThrown(new Error(taskAssignment500), { surface: 'autotask' })
    expect(env.remediation).toContain('billingCodeID')
  })

  it('a 500 with NO structured body is still TRANSIENT', () => {
    // A real outage must keep retrying. This is the half that would break if
    // the fix were "treat every Autotask 500 as invalid input".
    const c = classifyError(new Error('Autotask POST Tickets failed (500): <html>Server Error</html>'))
    expect(c.category).toBe('server_error')
    expect(c.isTransient).toBe(true)
  })

  it('a 500 whose errors[] is a GENERIC fault is still TRANSIENT', () => {
    // The first version of this fix reclassified any errors[] array and broke
    // two real retry tests using exactly this body. Recognition is an
    // allowlist, so an unrecognised body keeps retrying: a needless retry
    // costs a second, a suppressed one costs an outage recovery.
    for (const body of [
      'failed (500): {"errors":["internal error"]}',
      'failed (500): {"errors":["Internal server error, please try again"]}',
      'failed (500): {"errors":["Something went wrong"]}',
    ]) {
      expect(classifyError(new Error(body)).isTransient).toBe(true)
    }
  })

  it('a state-dependent structured rejection is PRECONDITION_FAILED, not INVALID_INPUT', () => {
    // Different fix, different owner: the caller cannot correct an argument
    // to make an already-closed record accept a write.
    const env = classifyThrown(
      new Error('failed (500): {"errors":["The ticket has been closed and can no longer be edited."]}'),
      { surface: 'autotask' },
    )
    expect(env.reasonCode).toBe('PRECONDITION_FAILED')
  })

  it('the original "Data violation" pairing error is unchanged', () => {
    // The 2026-07-29 behaviour must survive this change.
    const c = classifyError(new Error('failed (500): {"errors":["Data violation: When assigning a Resource, you must assign both a assignedResourceID and assignedResourceRoleID."]}'))
    expect(c.category).toBe('data_violation')
    expect(c.isTransient).toBe(false)
  })
})

describe('planTaskAssignment — the four-field group and the pairing Autotask enforces', () => {
  // Live ResourceRoleDepartments, 2026-08-25. Ghenel holds Engineer; Kurtis
  // does not — which is why defaulting everyone to Engineer failed.
  const ghenel = [
    { resourceID: 29682935, roleID: 29682834, departmentID: 2, isDefault: false },
    { resourceID: 29682935, roleID: 29683355, departmentID: 29683478, isDefault: false },
    { resourceID: 29682935, roleID: 29683460, departmentID: 29683478, isDefault: true },
  ]
  const kurtis = [{ resourceID: 29682885, roleID: 29682834, departmentID: 2, isDefault: true }]

  it('defaults to the RESOURCE\'S OWN role, not a global Engineer', () => {
    const plan = planTaskAssignment({ assignedResourceID: 29682935, billingCodeID: 7, rows: ghenel })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.assignedResourceRoleID).toBe(29683460) // their isDefault row
    expect(plan.departmentID).toBe(29683478) // department comes from the same row
  })

  it('refuses a role the resource does not hold, naming the ones they do', () => {
    // The exact Wilmar failure: Engineer defaulted onto someone without it.
    const plan = planTaskAssignment({ assignedResourceID: 29682885, assignedResourceRoleID: 29683355, billingCodeID: 7, rows: kurtis })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.invalidPairing?.heldRoleIDs).toEqual([29682834])
    expect(plan.message).toContain('29682834')
  })

  it('refuses when billingCodeID is missing — Autotask requires it and it cannot be guessed', () => {
    const plan = planTaskAssignment({ assignedResourceID: 29682935, rows: ghenel })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.missing).toContain('billingCodeID')
  })

  it('accepts an explicitly supplied role the resource DOES hold', () => {
    const plan = planTaskAssignment({ assignedResourceID: 29682935, assignedResourceRoleID: 29683355, billingCodeID: 7, rows: ghenel })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.departmentID).toBe(29683478)
  })

  it('refuses a resource with no active role rather than inventing one', () => {
    const plan = planTaskAssignment({ assignedResourceID: 999, billingCodeID: 7, rows: [] })
    expect(plan.ok).toBe(false)
    if (plan.ok) return
    expect(plan.message).toContain('holds no active role')
  })

  it('an explicit departmentID overrides the pairing default', () => {
    const plan = planTaskAssignment({ assignedResourceID: 29682935, departmentID: 2, billingCodeID: 7, rows: ghenel })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.departmentID).toBe(2)
  })
})

describe('resolvePicklistId — the durable fix for five wrong hardcoded ids', () => {
  const projectNoteTypes = [
    { id: 8, label: 'Email' },
    { id: 5, label: 'Project Notes' },
    { id: 12, label: 'Project Status' },
  ]

  beforeEach(() => clearPicklistCache())
  afterEach(() => {
    __setPicklistFetcher(null)
    clearPicklistCache()
  })

  it('resolves the live id by label, ignoring the fallback', () => {
    __setPicklistFetcher(async () => projectNoteTypes)
    return resolvePicklistId('ProjectNotes', 'noteType', 'Project Notes', 3).then((r) => {
      expect(r.id).toBe(5)
      expect(r.resolvedFrom).toBe('live')
      expect(r.warning).toBeUndefined()
    })
  })

  it('uses the fallback AND says so when the lookup fails', () => {
    // Silently falling back is how a wrong id becomes invisible again.
    __setPicklistFetcher(async () => { throw new Error('entityInformation unreachable') })
    return resolvePicklistId('ProjectNotes', 'noteType', 'Project Notes', 5).then((r) => {
      expect(r.id).toBe(5)
      expect(r.resolvedFrom).toBe('fallback')
      expect(r.warning).toMatch(/unverified/)
    })
  })

  it('a successful lookup that lacks the label is a WARNING, not a silent fallback', () => {
    __setPicklistFetcher(async () => projectNoteTypes)
    return resolvePicklistId('ProjectNotes', 'noteType', 'Task Notes', 3).then((r) => {
      expect(r.resolvedFrom).toBe('fallback')
      expect(r.warning).toContain('5 Project Notes')
    })
  })

  it('does not fuzzy-match a near-miss label', () => {
    // "Project Notes" resolving to "Project Status" would write the wrong value.
    __setPicklistFetcher(async () => projectNoteTypes)
    return resolvePicklistId('ProjectNotes', 'noteType', 'Project Note', 99).then((r) => {
      expect(r.resolvedFrom).toBe('fallback')
      expect(r.id).toBe(99)
    })
  })
})
