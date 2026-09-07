// Pins the two properties that make this diagnostic worth trusting:
// it is gated, and it compares the REAL surface against what a real client
// receives. If these drift, the diagnostic starts answering a different
// question while looking like it answers this one.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

const SECRET = 'diagnostics-route-test-secret'
let saved: string | undefined

beforeAll(() => {
  saved = process.env.MIGRATION_SECRET
  process.env.MIGRATION_SECRET = SECRET
})
afterAll(() => {
  if (saved === undefined) delete process.env.MIGRATION_SECRET
  else process.env.MIGRATION_SECRET = saved
})

const url = 'http://localhost/api/connector/diagnostics/tools'

describe('connector tool diagnostics route', () => {
  it('refuses without the secret', async () => {
    expect((await GET(new NextRequest(url))).status).toBe(401)
  })

  it('refuses a wrong secret', async () => {
    const req = new NextRequest(url, { headers: { authorization: 'Bearer nope' } })
    expect((await GET(req)).status).toBe(401)
  })

  it('reports the whole surface, and the two sides agree', async () => {
    const req = new NextRequest(url, { headers: { authorization: `Bearer ${SECRET}` } })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    // The connector's real size — not a hand-maintained number: if this moves,
    // a tool was added or lost and the count should move with it.
    expect(body.summary.registered).toBeGreaterThan(150)
    expect(body.summary.emittedToClient).toBe(body.summary.registered)
    expect(body.summary.registeredButNotEmitted).toBe(0)
    expect(body.summary.emittedButNotRegistered).toBe(0)
    expect(body.mismatches).toEqual([])
  })

  it('shows every scan tool registered AND emitted, with its parameters intact', async () => {
    const req = new NextRequest(url, { headers: { authorization: `Bearer ${SECRET}` } })
    const body = await (await GET(req)).json()
    const scan = (body.tools as Array<Record<string, unknown>>).filter((t) =>
      String(t.name).startsWith('scan_')
    )

    expect(scan.map((t) => t.name).sort()).toEqual([
      'scan_file_attachment',
      'scan_list_attachments',
      'scan_log_append',
      'scan_log_columns',
      'scan_probe_render',
      'scan_render_attachment',
    ])
    for (const t of scan) {
      expect(t.emitted, `${t.name} must be emitted`).toBe(true)
      expect(t.recordedParamCount, `${t.name} param count`).toBe(t.emittedPropertyCount)
      expect(t.recordedDescriptionLength, `${t.name} description`).toBeGreaterThan(0)
    }
    // The tool the whole pipeline is gated on, pinned by its real shape.
    const probe = scan.find((t) => t.name === 'scan_probe_render')!
    expect(probe.recordedParamCount).toBe(0)
    expect(probe.emittedHasSchemaKey).toBe(true)
    const render = scan.find((t) => t.name === 'scan_render_attachment')!
    expect(render.recordedParamCount).toBe(5)
  })
})
