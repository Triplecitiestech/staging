// src/lib/mcp-hr-tools.test.ts
//
// End-to-end tests for hr_er_log_update, driven through the registered MCP tool
// handler against an in-memory Excel workbook served by a stubbed Graph.
//
// WHY THE STUB APPLIES THE WRITES: the whole promise of this tool is "exactly one
// row, exactly the named cells". A mock that only records PATCHes could not tell
// a correct patch from one that hit the neighbouring row — so the stub keeps a
// real grid, applies every PATCH to it by address, and serves the read-back from
// the mutated grid. Every assertion below is therefore about the workbook's
// resulting STATE, not about the calls that were made.
//
// The row under test is ER-0005, appended 2026-07-31 with "Meeting with Tech" and
// "Linked Document" blank, which is the live case this tool was built for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerHrTools } from './mcp-hr-tools'
import {
  columnLetters,
  parseRangeAddress,
  ER_APPEND_MODE_FLAGS,
  ER_FIELDS,
  ER_IMMUTABLE_COLUMNS,
  ER_UPDATABLE_FIELDS,
} from './hr/employee-relations'

type Handler = (
  args: Record<string, unknown>,
  extra?: unknown
) => Promise<{ content: { text: string }[]; isError?: boolean }>

function harness() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>()
  const server = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(name: string, config: any, handler: Handler) {
      tools.set(name, { config, handler })
    },
  }
  registerHrTools(server)
  return {
    names: [...tools.keys()],
    config: (n: string) => tools.get(n)!.config,
    description: (n: string) => String(tools.get(n)!.config.description),
    schemaKeys: (n: string) =>
      Object.keys((tools.get(n)!.config.inputSchema ?? {}) as Record<string, unknown>),
    async failure(n: string, args: Record<string, unknown> = {}) {
      const res = await tools.get(n)!.handler(args)
      expect(res.isError, `${n} was expected to FAIL but returned success`).toBe(true)
      const text = res.content[0].text
      const start = text.indexOf('{\n  "failure"')
      expect(start, `no failure envelope in: ${text}`).toBeGreaterThan(-1)
      return JSON.parse(text.slice(start)).failure as Record<string, unknown>
    },
    async ok(n: string, args: Record<string, unknown> = {}) {
      const res = await tools.get(n)!.handler(args)
      expect(res.isError, `${n} returned an error: ${res.content[0]?.text}`).toBeFalsy()
      return JSON.parse(res.content[0].text)
    },
  }
}

/** The live 15-column header row, as read from the real workbook 2026-07-30. */
const HEADER = [
  'Entry ID',
  'Date Logged',
  'Date of Incident',
  'Employee',
  'Role / Status',
  'Category',
  'Severity',
  'Summary',
  'Expectation Missed',
  'Reference',
  'Reported By',
  'Action Taken',
  'Linked Document',
  'Follow-Up / Status',
  'Meeting with Tech',
]

function erRow(entryId: string, over: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    'Entry ID': entryId,
    'Date Logged': '2026-07-31',
    'Date of Incident': '2026-07-30',
    Employee: 'Ghenel Bacalla',
    'Role / Status': 'Tier 2 Escalation Tech - Contractor',
    Category: 'Ticket Hygiene',
    Severity: 'Serious',
    Summary: 'Summary text.',
    'Expectation Missed': 'SOP not followed',
    Reference: 'T20260730.0001',
    'Reported By': 'Kurtis Florance',
    'Action Taken': 'Verbal coaching',
    'Linked Document': '',
    'Follow-Up / Status': 'Open',
    'Meeting with Tech': '',
    ...over,
  }
  return HEADER.map((h) => base[h] ?? '')
}

interface StubOptions {
  columns?: string[]
  rows?: string[][]
  sheet?: string
  /** 1-based sheet row of the header row (the table need not start at row 1). */
  headerRow?: number
  /** 0-based sheet column of the table's first column. */
  firstColumn?: number
  /** Fail the read-back grid read, to exercise the unverified path. */
  failReadBack?: boolean
}

interface Stub {
  /** The live grid. Mutated by PATCHes, so assertions read real state. */
  rows: string[][]
  columns: string[]
  /** Every PATCH the tool issued, in order. */
  writes: Array<{ address: string; value: string }>
  /** Requests the stub did not recognise — a silent gap must fail a test. */
  unmatched: string[]
  cell(rowIndex: number, column: string): string
}

const GRAPH = 'https://graph.microsoft.com/v1.0'

function graphStub(options: StubOptions = {}): Stub {
  const columns = options.columns ?? HEADER
  const rows = (options.rows ?? [erRow('ER-0005')]).map((r) => [...r])
  const sheet = options.sheet ?? 'Log'
  const headerRow = options.headerRow ?? 1
  const firstColumn = options.firstColumn ?? 0
  const writes: Array<{ address: string; value: string }> = []
  const unmatched: string[] = []
  let gridReads = 0

  const firstDataRow = headerRow + 1
  const dataBodyAddress = rows.length
    ? `${sheet}!${columnLetters(firstColumn)}${firstDataRow}:` +
      `${columnLetters(firstColumn + columns.length - 1)}${headerRow + rows.length}`
    : null

  /** address → grid coordinates, using the same arithmetic the tool must use. */
  function coords(address: string): { r: number; c: number } | null {
    const parsed = parseRangeAddress(address)
    if (!parsed) return null
    return { r: parsed.startRow - firstDataRow, c: parsed.startColumnIndex - firstColumn }
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(GRAPH, '')
    const method = (init?.method ?? 'GET').toUpperCase()

    // Ordered most-specific first: several of these paths are suffixes of others.
    if (path.includes('/columns?$select=name,index')) {
      gridReads += 1
      if (options.failReadBack && gridReads > 1) return json({ error: { code: 'unavailable' } }, 503)
      return json({ value: columns.map((name, index) => ({ name, index })) })
    }
    if (path.includes('/columns?$select=name')) {
      return json({ value: columns.map((name) => ({ name })) })
    }
    if (path.includes('/dataBodyRange')) {
      if (!dataBodyAddress) return json({ error: { code: 'itemNotFound' } }, 404)
      return json({ address: dataBodyAddress, values: rows.map((r) => [...r]) })
    }
    if (path.includes('/worksheet?$select=name')) return json({ name: sheet })
    if (path.includes('/workbook/tables?$select=id,name')) {
      // Braces-GUID id on purpose: addressing a table by it 404s every call, so a
      // regression that reaches for `id` instead of `name` must break loudly.
      return json({ value: [{ id: '{4C7D4E1B-0000-4E0B-9A1B-000000000001}', name: 'Table1' }] })
    }

    const range = /\/worksheets\/([^/]+)\/range\(address='([^']+)'\)/.exec(path)
    if (range) {
      const address = range[2]
      const at = coords(address)
      if (decodeURIComponent(range[1]) !== sheet) return json({ error: { code: 'itemNotFound' } }, 404)
      if (!at || at.r < 0 || at.r >= rows.length || at.c < 0 || at.c >= columns.length) {
        return json({ error: { code: 'invalidArgument', message: `out of range: ${address}` } }, 400)
      }
      if (method === 'PATCH') {
        const value = String((JSON.parse(String(init?.body)) as { values: unknown[][] }).values[0][0])
        writes.push({ address, value })
        rows[at.r][at.c] = value
        return json({ address })
      }
      return json({ address, values: [[rows[at.r][at.c]]] })
    }

    if (path.includes('?$select=webUrl')) {
      return json({ webUrl: 'https://example.invalid/Employee%20Relations%20Log.xlsx' })
    }
    if (/\/items\/[^/?]+\?\$select=id,name$/.test(path)) {
      return json({ id: 'item-id', name: 'Employee Relations Log.xlsx' })
    }

    unmatched.push(`${method} ${path}`)
    return json({ error: { code: 'stubMiss', message: path } }, 404)
  })

  return {
    rows,
    columns,
    writes,
    unmatched,
    cell: (rowIndex: number, column: string) => rows[rowIndex][columns.indexOf(column)],
  }
}

const ENV = {
  CONNECTOR_HR_WRITES_ENABLED: 'true',
  HR_RECORDS_TENANT_ID: 'tenant',
  HR_RECORDS_CLIENT_ID: 'client',
  HR_RECORDS_CLIENT_SECRET: 'secret-value',
}
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  // Pre-seed the module's token cache so no test depends on the OAuth exchange.
  globalThis.__hrRecordsGraphToken = { accessToken: 'test-token', expiresAt: Date.now() + 3_600_000 }
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  globalThis.__hrRecordsGraphToken = undefined
  vi.unstubAllGlobals()
})

describe('registration', () => {
  it('registers hr_er_log_update alongside the existing HR tools', () => {
    expect(harness().names).toEqual([
      'hr_er_log_append',
      'hr_er_log_update',
      'hr_er_log_columns',
      'hr_file_document',
    ])
  })

  it('says plainly that it patches ONE existing row and never creates one', () => {
    // A downstream Claude that reaches for hr_er_log_append when it means to
    // update would append a duplicate row to someone's disciplinary record, so
    // the distinction has to be in the description, not just in the docs.
    const d = harness().description('hr_er_log_update')
    expect(d).toMatch(/ONE EXISTING row/)
    expect(d).toMatch(/NEVER creates a row/)
    expect(d).toMatch(/NEVER writes Entry ID or Date Logged/)
    expect(d).toMatch(/hr_er_log_append/)
    expect(d).toMatch(/failure/)
  })

  it('rejects an Entry ID or Date Logged write at the SCHEMA level', () => {
    // Not a runtime check a later edit could forget: the schema is EXACTLY the
    // lookup key + the updatable fields + the append flags, so no parameter
    // capable of carrying an Entry ID or Date Logged value exists at all.
    const keys = harness().schemaKeys('hr_er_log_update')
    const expected = [
      'entryId',
      ...ER_UPDATABLE_FIELDS.map((f) => f.input as string),
      ...ER_APPEND_MODE_FLAGS.map((f) => f.flag as string),
    ]
    expect([...keys].sort()).toEqual([...expected].sort())
    // The inputs behind the immutable columns are absent by name.
    for (const spec of ER_FIELDS) {
      if (!ER_IMMUTABLE_COLUMNS.includes(spec.column) || !spec.input) continue
      expect(keys, `${spec.column} must not be settable`).not.toContain(spec.input)
    }
    expect(keys).toContain('entryId') // present only as the lookup key
    expect(keys).not.toContain('dateLogged')
  })

  it('exposes the same patch parameter names as hr_er_log_append', () => {
    const h = harness()
    const appendKeys = h.schemaKeys('hr_er_log_append').filter((k) => k !== 'dateLogged')
    const updateKeys = h.schemaKeys('hr_er_log_update')
    for (const key of appendKeys) expect(updateKeys, `missing ${key}`).toContain(key)
  })
})

describe('hr_er_log_update — successful patches', () => {
  it('patches a single column and leaves every other cell untouched', async () => {
    const stub = graphStub()
    const before = [...stub.rows[0]]

    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      meetingWithTech: 'He confirmed the build finished on 07-30.',
    })

    expect(stub.writes).toEqual([{ address: 'O2', value: 'He confirmed the build finished on 07-30.' }])
    expect(stub.cell(0, 'Meeting with Tech')).toBe('He confirmed the build finished on 07-30.')
    // Every other cell byte-identical.
    stub.columns.forEach((column, i) => {
      if (column === 'Meeting with Tech') return
      expect(stub.rows[0][i], column).toBe(before[i])
    })

    expect(res).toMatchObject({
      entryId: 'ER-0005',
      rowIndex: 0,
      verified: true,
      tableName: 'Table1',
      unchangedRequested: [],
      workbookWebUrl: 'https://example.invalid/Employee%20Relations%20Log.xlsx',
    })
    expect(res.changed).toEqual([
      { column: 'Meeting with Tech', before: '', after: 'He confirmed the build finished on 07-30.' },
    ])
    // The FULL row comes back, keyed by the sheet's own headers.
    expect(Object.keys(res.row)).toEqual(HEADER)
    expect(res.row['Entry ID']).toBe('ER-0005')
    expect(res.row.Summary).toBe('Summary text.')
    expect(res.tableColumns).toEqual(HEADER)
    expect(stub.unmatched).toEqual([])
  })

  it('patches several columns in one call, one cell write each', async () => {
    const stub = graphStub()

    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      meetingWithTech: 'He confirmed it.',
      linkedDocument: 'https://example.invalid/ER-DOC-0003.docx',
      followUpStatus: 'Closed',
    })

    expect(stub.writes).toEqual([
      { address: 'M2', value: 'https://example.invalid/ER-DOC-0003.docx' },
      { address: 'N2', value: 'Closed' },
      { address: 'O2', value: 'He confirmed it.' },
    ])
    expect(res.verified).toBe(true)
    expect(res.changed.map((c: { column: string }) => c.column)).toEqual([
      'Linked Document',
      'Follow-Up / Status',
      'Meeting with Tech',
    ])
    expect(res.changed[1]).toEqual({ column: 'Follow-Up / Status', before: 'Open', after: 'Closed' })
    expect(stub.cell(0, 'Follow-Up / Status')).toBe('Closed')
    expect(stub.unmatched).toEqual([])
  })

  it('matches the Entry ID case-insensitively and with whitespace', async () => {
    const stub = graphStub()
    const res = await harness().ok('hr_er_log_update', {
      entryId: '  er-0005 ',
      followUpStatus: 'Closed',
    })
    expect(res.entryId).toBe('ER-0005')
    expect(stub.cell(0, 'Follow-Up / Status')).toBe('Closed')
  })

  it('patches the right row when there are several, touching no other row', async () => {
    const stub = graphStub({
      rows: [erRow('ER-0003'), erRow('ER-0004'), erRow('ER-0005'), erRow('ER-0006')],
    })
    const others = [0, 1, 3].map((i) => [...stub.rows[i]])

    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Closed',
    })

    expect(res.rowIndex).toBe(2)
    expect(stub.writes).toEqual([{ address: 'N4', value: 'Closed' }])
    expect(stub.cell(2, 'Follow-Up / Status')).toBe('Closed')
    ;[0, 1, 3].forEach((row, n) => expect(stub.rows[row]).toEqual(others[n]))
  })

  it('reports a supplied value that already matched, without writing it', async () => {
    const stub = graphStub()
    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Open',
      severity: 'Critical',
    })
    expect(res.unchangedRequested).toEqual(['Follow-Up / Status'])
    expect(stub.writes).toEqual([{ address: 'G2', value: 'Critical' }])
  })

  it('writes nothing at all when every supplied value already matched', async () => {
    const stub = graphStub()
    const res = await harness().ok('hr_er_log_update', { entryId: 'ER-0005', followUpStatus: 'Open' })
    expect(stub.writes).toEqual([])
    expect(res.changed).toEqual([])
    expect(res.unchangedRequested).toEqual(['Follow-Up / Status'])
    expect(res.warnings.join(' ')).toMatch(/NOT modified/)
  })

  it('sanitizes text and normalizes dates on the way in', async () => {
    const stub = graphStub()
    await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      meetingWithTech: 'He said 😀 it was done',
      dateOfIncident: '2026-07-29',
    })
    expect(stub.cell(0, 'Meeting with Tech')).toBe('He said it was done')
    expect(stub.cell(0, 'Date of Incident')).toBe('2026-07-29')
  })
})

describe('hr_er_log_update — append mode vs replace mode', () => {
  it('REPLACES by default', async () => {
    const stub = graphStub({ rows: [erRow('ER-0005', { 'Meeting with Tech': 'First talk.' })] })
    await harness().ok('hr_er_log_update', { entryId: 'ER-0005', meetingWithTech: 'Second talk.' })
    expect(stub.cell(0, 'Meeting with Tech')).toBe('Second talk.')
  })

  it('APPENDS on a new line when appendToMeetingWithTech is set', async () => {
    const stub = graphStub({ rows: [erRow('ER-0005', { 'Meeting with Tech': 'First talk.' })] })
    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      meetingWithTech: 'Second talk.',
      appendToMeetingWithTech: true,
    })
    expect(stub.cell(0, 'Meeting with Tech')).toBe('First talk.\nSecond talk.')
    expect(res.changed[0].before).toBe('First talk.')
    expect(res.verified).toBe(true)
  })

  it('appends to Summary independently, and replaces other columns in the same call', async () => {
    const stub = graphStub()
    await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      summary: 'Recurred on 08-01.',
      appendToSummary: true,
      severity: 'Critical',
    })
    expect(stub.cell(0, 'Summary')).toBe('Summary text.\nRecurred on 08-01.')
    expect(stub.cell(0, 'Severity')).toBe('Critical')
  })

  it('says so when an append flag is set with no text to append', async () => {
    const stub = graphStub()
    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Closed',
      appendToMeetingWithTech: true,
    })
    expect(res.warnings.join(' ')).toMatch(/appendToMeetingWithTech was set but no Meeting with Tech text/)
    expect(stub.writes).toEqual([{ address: 'N2', value: 'Closed' }])
  })
})

describe('hr_er_log_update — column-order independence', () => {
  it('writes the RIGHT cells when a human reorders the header row', async () => {
    // Positions must come from the live header row on every call. Reordering the
    // sheet must move the write, not corrupt a different column.
    const reordered = [
      'Meeting with Tech',
      'Summary',
      'Entry ID',
      'Follow-Up / Status',
      'Employee',
      'Date Logged',
    ]
    const stub = graphStub({
      columns: reordered,
      rows: [['', 'Summary text.', 'ER-0005', 'Open', 'Ghenel Bacalla', '2026-07-31']],
    })

    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      meetingWithTech: 'He agreed.',
      followUpStatus: 'Closed',
    })

    expect(stub.writes).toEqual([
      { address: 'A2', value: 'He agreed.' },
      { address: 'D2', value: 'Closed' },
    ])
    expect(stub.rows[0]).toEqual([
      'He agreed.',
      'Summary text.',
      'ER-0005',
      'Closed',
      'Ghenel Bacalla',
      '2026-07-31',
    ])
    expect(res.tableColumns).toEqual(reordered)
    expect(res.verified).toBe(true)
  })

  it('addresses cells correctly when the table does not start at A1', async () => {
    const stub = graphStub({ headerRow: 4, firstColumn: 2 })
    await harness().ok('hr_er_log_update', { entryId: 'ER-0005', followUpStatus: 'Closed' })
    // Header on row 4, first column C, so the first data row is 5 and
    // "Follow-Up / Status" (index 13) is column P.
    expect(stub.writes).toEqual([{ address: 'P5', value: 'Closed' }])
    expect(stub.cell(0, 'Follow-Up / Status')).toBe('Closed')
  })

  it('ignores a column a human added that no parameter maps to', async () => {
    const stub = graphStub({
      columns: [...HEADER, 'HR Review Date'],
      rows: [[...erRow('ER-0005'), '2026-08-05']],
    })
    const res = await harness().ok('hr_er_log_update', { entryId: 'ER-0005', followUpStatus: 'Closed' })
    expect(stub.writes).toEqual([{ address: 'N2', value: 'Closed' }])
    expect(stub.cell(0, 'HR Review Date')).toBe('2026-08-05')
    expect(res.row['HR Review Date']).toBe('2026-08-05')
  })
})

describe('hr_er_log_update — refusals', () => {
  it('refuses an unknown Entry ID and lists the ids that exist', async () => {
    const stub = graphStub({ rows: [erRow('ER-0004'), erRow('ER-0005')] })
    const failure = await harness().failure('hr_er_log_update', {
      entryId: 'ER-0099',
      followUpStatus: 'Closed',
    })
    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.fixableBy).toBe('tct_human')
    expect(failure.evidence).toContain('ER-0004')
    expect(failure.evidence).toContain('ER-0005')
    expect(failure.remediation).toContain('hr_er_log_columns')
    expect(failure.message).toMatch(/NEVER creates a row/)
    expect(stub.writes).toEqual([])
  })

  it('refuses a duplicate Entry ID and names BOTH rows rather than guessing', async () => {
    const stub = graphStub({ rows: [erRow('ER-0005'), erRow('ER-0006'), erRow('ER-0005')] })
    const failure = await harness().failure('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Closed',
    })
    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.evidence).toMatch(/0 and 2/)
    expect(failure.evidence).toMatch(/sheet rows 2 and 4/)
    expect((failure.details as { duplicateRows: unknown[] }).duplicateRows).toEqual([
      { rowIndex: 0, sheetRow: 2, entryId: 'ER-0005' },
      { rowIndex: 2, sheetRow: 4, entryId: 'ER-0005' },
    ])
    expect(stub.writes).toEqual([])
  })

  it('refuses an empty patch as INVALID_INPUT, without touching Graph at all', async () => {
    const stub = graphStub()
    const failure = await harness().failure('hr_er_log_update', { entryId: 'ER-0005' })
    expect(failure.reasonCode).toBe('INVALID_INPUT')
    expect(failure.fixableBy).toBe('caller')
    expect(failure.message).toMatch(/at least one/i)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    expect(stub.writes).toEqual([])
  })

  it('treats the append flags alone as an empty patch', async () => {
    const failure = await harness().failure('hr_er_log_update', {
      entryId: 'ER-0005',
      appendToSummary: true,
    })
    expect(failure.reasonCode).toBe('INVALID_INPUT')
  })

  it('refuses a missing entryId', async () => {
    const failure = await harness().failure('hr_er_log_update', { entryId: '  ', severity: 'Low' })
    expect(failure.reasonCode).toBe('INVALID_INPUT')
    expect(failure.message).toMatch(/entryId is required/)
  })

  it('refuses the WHOLE patch when a named column is not in the live header row', async () => {
    // Writing part of what was asked for would leave the row in a state neither
    // the caller nor the sheet describes.
    const columns = HEADER.filter((c) => c !== 'Meeting with Tech')
    const stub = graphStub({ columns, rows: [erRow('ER-0005').slice(0, 14)] })

    const failure = await harness().failure('hr_er_log_update', {
      entryId: 'ER-0005',
      meetingWithTech: 'He agreed.',
      followUpStatus: 'Closed',
    })

    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.message).toContain('Meeting with Tech')
    expect(failure.evidence).toContain('Entry ID | Date Logged')
    expect(failure.remediation).toContain('hr_er_log_columns')
    expect((failure.details as { liveColumns: string[] }).liveColumns).toEqual(columns)
    // Follow-Up / Status was writable, and was still NOT written.
    expect(stub.writes).toEqual([])
    expect(stub.cell(0, 'Follow-Up / Status')).toBe('Open')
  })

  it('refuses when the row moved between the read and the write', async () => {
    const stub = graphStub({ rows: [erRow('ER-0005')] })
    // Simulate a concurrent edit: the Entry ID cell no longer holds our row.
    const original = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(GRAPH, '')
      if ((init?.method ?? 'GET') === 'GET' && path.includes("range(address='A2')")) {
        return new Response(JSON.stringify({ address: 'A2', values: [['ER-0009']] }), { status: 200 })
      }
      return original(input, init)
    })

    const failure = await harness().failure('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Closed',
    })
    expect(failure.reasonCode).toBe('PRECONDITION_FAILED')
    expect(failure.message).toMatch(/row moved/i)
    expect(failure.evidence).toContain('ER-0009')
    expect(stub.writes).toEqual([])
  })

  it('is dormant while the kill switch is off, and writes nothing', async () => {
    process.env.CONNECTOR_HR_WRITES_ENABLED = 'false'
    const stub = graphStub()
    const failure = await harness().failure('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Closed',
    })
    expect(String(failure.message)).toMatch(/CONNECTOR_HR_WRITES_ENABLED/)
    expect(stub.writes).toEqual([])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})

describe('hr_er_log_update — verification is never claimed without proof', () => {
  it('reports verified:false when the read-back cannot be performed', async () => {
    const stub = graphStub({ failReadBack: true })
    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Closed',
    })
    // The write DID happen — the tool must say so, and must not claim it verified.
    expect(stub.cell(0, 'Follow-Up / Status')).toBe('Closed')
    expect(res.verified).toBe(false)
    expect(res.warnings.join(' ')).toMatch(/could not re-read/i)
  })

  it('reports verified:false when a written cell does not hold its new value', async () => {
    const stub = graphStub()
    const original = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(GRAPH, '')
      // Accept the PATCH with a 200 but drop it, the shape of the IT Glue
      // folder-move defect: an accepted write that did not stick is not success.
      if ((init?.method ?? 'GET').toUpperCase() === 'PATCH' && path.includes('range(address=')) {
        return new Response(JSON.stringify({}), { status: 200 })
      }
      return original(input, init)
    })

    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      followUpStatus: 'Closed',
    })
    expect(stub.cell(0, 'Follow-Up / Status')).toBe('Open')
    expect(res.verified).toBe(false)
    expect(res.warnings.join(' ')).toMatch(/Read-back mismatch/)
    // The row reported back is the workbook's REAL state, not what we intended.
    expect(res.row['Follow-Up / Status']).toBe('Open')
  })

  it('accepts a date that Excel stored as a serial in a date-formatted column', async () => {
    const stub = graphStub()
    const original = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(GRAPH, '')
      if ((init?.method ?? 'GET').toUpperCase() === 'PATCH' && path.includes("range(address='C2')")) {
        // Excel coerces the text date to a serial: 2026-07-29 → 46232.
        stub.rows[0][2] = '46232'
        return new Response(JSON.stringify({}), { status: 200 })
      }
      return original(input, init)
    })

    const res = await harness().ok('hr_er_log_update', {
      entryId: 'ER-0005',
      dateOfIncident: '2026-07-29',
    })
    expect(res.verified).toBe(true)
    expect(res.warnings.filter((w: string) => /mismatch/i.test(w))).toEqual([])
  })
})
