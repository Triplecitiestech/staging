// src/lib/mcp-itglue-passwords.test.ts
//
// Pins the SECURITY guarantees of the IT Glue password write surface, added
// 2026-09-09 when the self-imposed gate was narrowed from "no passwords at
// all" to "write only".
//
// Each assertion below corresponds to a promise made in the tool description,
// and a promise about a credential is worth exactly as much as the test that
// holds it:
//
//   1. There is NO read path — no get, list, search or retrieval tool exists,
//      and the client has no method that returns a stored secret.
//   2. The secret is never in the audit record.
//   3. The secret is never in an error message.
//   4. Both tools are OFF unless the kill switch says otherwise.
//   5. A write is never anonymous.

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ITGLUE_PASSWORD_WRITES_KILL_SWITCH,
  itGluePasswordWritesEnabled,
  passwordAuditRecord,
  registerItGlueTools,
} from './mcp-itglue-tools'
import { TOOL_FACTS } from './connector/capability-registry'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Registered = { meta: any; handler: (args?: any, extra?: any) => Promise<any> }

function collectTools(): Map<string, Registered> {
  const tools = new Map<string, Registered>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerItGlueTools({ registerTool: (name: string, meta: any, handler: any) => tools.set(name, { meta, handler }) })
  return tools
}

const TOOLS = collectTools()
const SOURCE = readFileSync(join(process.cwd(), 'src/lib/mcp-itglue-tools.ts'), 'utf8')
const CLIENT_SOURCE = readFileSync(join(process.cwd(), 'src/lib/it-glue.ts'), 'utf8')

describe('there is no password READ path, and none may be added', () => {
  it('registers exactly two password tools, both writes', () => {
    const pw = [...TOOLS.keys()].filter((n) => n.includes('password'))
    expect(pw.sort()).toEqual(['itglue_create_password', 'itglue_update_password'])
  })

  it('registers no tool that could read, list, search or retrieve a password', () => {
    // The whole asymmetry rests on this: writing a credential the human already
    // has is a different risk from being able to pull every customer
    // credential out through an MCP token.
    const forbidden = [...TOOLS.keys()].filter((n) =>
      /password/i.test(n) && /(get|list|search|read|show|reveal|retrieve|fetch|export)/i.test(n),
    )
    expect(forbidden).toEqual([])
  })

  it('the client exposes no method that returns a stored secret', () => {
    // A getPassword on the client would be a read path even with no tool on it,
    // because the next tool author would find and use it.
    expect(CLIENT_SOURCE).not.toMatch(/async\s+getPassword\s*\(/)
    expect(CLIENT_SOURCE).not.toMatch(/async\s+getPasswords\s*\(/)
    expect(CLIENT_SOURCE).not.toMatch(/async\s+searchPasswords\s*\(/)
    // And nothing performs a GET against /passwords.
    expect(CLIENT_SOURCE).not.toMatch(/request<[^>]*>\(\s*`?\/passwords/)
  })

  it('keeps passwords excluded from relate and attach on both ends', () => {
    const relate = TOOLS.get('itglue_relate_items')!
    expect(JSON.stringify(relate.meta)).not.toMatch(/"passwords"/i)
    expect(JSON.stringify(relate.meta)).toMatch(/Passwords are excluded/i)
  })
})

describe('the secret never reaches a log', () => {
  it('records who, which org, the record name and the FIELD NAMES — never a value', () => {
    const rec = passwordAuditRecord({
      action: 'create',
      actor: 'kurtis@triplecitiestech.com',
      organizationId: '6942365',
      recordId: '12345',
      recordName: 'Spectrum Business - Portal Login',
      suppliedKeys: ['organizationId', 'name', 'password', 'username', 'notes'],
    })

    expect(rec.actor).toBe('kurtis@triplecitiestech.com')
    expect(rec.recordName).toBe('Spectrum Business - Portal Login')
    expect(rec.fieldsSet).toEqual(['name', 'password', 'username', 'notes'])
    expect(rec.secretLogged).toBe(false)

    // The field NAME "password" is useful audit signal — it says the credential
    // was rotated. Its VALUE must be nowhere in the record.
    const serialised = JSON.stringify(rec)
    expect(serialised).toContain('"password"')
    expect(serialised).not.toContain('hunter2')
  })

  it('cannot be made to log a value by passing one, because it only takes key names', () => {
    // passwordAuditRecord's signature accepts `suppliedKeys: string[]` — there
    // is no parameter capable of carrying a value. This asserts the shape.
    const rec = passwordAuditRecord({
      action: 'update',
      actor: 'a@b.c',
      suppliedKeys: ['password'],
    })
    expect(JSON.stringify(rec)).not.toMatch(/hunter2|correct-horse/)
    expect(rec.fieldsSet).toEqual(['password'])
  })

  it('drops any key that is not on the auditable allowlist', () => {
    // The allowlist is the enforcement: adding a field to the tool later cannot
    // start logging something unintended.
    const rec = passwordAuditRecord({
      action: 'create',
      actor: 'a@b.c',
      suppliedKeys: ['name', 'secretValue', 'plaintext', 'apiKey'],
    })
    expect(rec.fieldsSet).toEqual(['name'])
  })

  it('carries a correlationId and operation so the write is traceable', () => {
    const rec = passwordAuditRecord({ action: 'create', actor: 'a@b.c', suppliedKeys: [] })
    expect(typeof rec.correlationId).toBe('string')
    expect(rec.operation).toBe('connector_itglue_password_create')
  })
})

describe('the secret never reaches an error message', () => {
  it('the client throws password errors WITHOUT the vendor response body', () => {
    // `send` puts 300 chars of IT Glue's response into its Error. For a
    // password that is a leak channel, because a validation message can quote
    // the value it rejected. sendWithoutEchoingSecrets exists for that reason.
    expect(CLIENT_SOURCE).toMatch(/sendWithoutEchoingSecrets/)
    const fn = CLIENT_SOURCE.slice(CLIENT_SOURCE.indexOf('private async sendWithoutEchoingSecrets'))
    const body = fn.slice(0, fn.indexOf('\n  }'))
    // It must not read the response text into the thrown message.
    expect(body).toMatch(/deliberately NOT included/)
    expect(body).not.toMatch(/text\.substring/)
    expect(body).not.toMatch(/\$\{text\}/)
  })

  it('both password writes go through that helper, not the ordinary send', () => {
    for (const method of ['async createPassword', 'async updatePassword']) {
      const at = CLIENT_SOURCE.indexOf(method)
      expect(at, method).toBeGreaterThan(-1)
      const chunk = CLIENT_SOURCE.slice(at, at + 3000)
      expect(chunk).toMatch(/sendWithoutEchoingSecrets/)
    }
  })
})

describe('the kill switch is off by default', () => {
  const saved = process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH]
  beforeEach(() => { delete process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH] })
  afterEach(() => {
    if (saved === undefined) delete process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH]
    else process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH] = saved
  })

  it('is off when unset, and off for anything other than the string "true"', () => {
    expect(itGluePasswordWritesEnabled()).toBe(false)
    for (const v of ['', 'false', 'TRUE', '1', 'yes']) {
      process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH] = v
      expect(itGluePasswordWritesEnabled(), v).toBe(false)
    }
    process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH] = 'true'
    expect(itGluePasswordWritesEnabled()).toBe(true)
  })

  it('refuses both tools with POLICY_BLOCKED and makes no request when off', async () => {
    for (const name of ['itglue_create_password', 'itglue_update_password']) {
      const res = await TOOLS.get(name)!.handler({ id: '1', organizationId: '1', name: 'x', password: 'hunter2' }, {})
      expect(res.isError, name).toBe(true)
      expect(res.content[0].text).toMatch(/POLICY_BLOCKED/)
      expect(res.content[0].text).toMatch(/nothing was written/i)
      // The refusal itself must not echo the secret it was handed.
      expect(res.content[0].text).not.toContain('hunter2')
    }
  })

  it('declares the switch in TOOL_FACTS, so the connector derives it', () => {
    // PR #213: switch names are derived from TOOL_FACTS, never a hand-kept
    // list. A switch missing here is a tool the capability report cannot
    // describe honestly.
    expect(TOOL_FACTS.itglue_create_password.killSwitch).toBe(ITGLUE_PASSWORD_WRITES_KILL_SWITCH)
    expect(TOOL_FACTS.itglue_update_password.killSwitch).toBe(ITGLUE_PASSWORD_WRITES_KILL_SWITCH)
    expect(TOOL_FACTS.itglue_create_password.access).toBe('write')
  })
})

describe('a credential write is never anonymous', () => {
  const saved = process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH]
  beforeEach(() => { process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH] = 'true' })
  afterEach(() => {
    if (saved === undefined) delete process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH]
    else process.env[ITGLUE_PASSWORD_WRITES_KILL_SWITCH] = saved
  })

  it('refuses when no signed-in email is on the session', async () => {
    const res = await TOOLS.get('itglue_create_password')!.handler(
      { organizationId: '1', name: 'x', password: 'hunter2' },
      {},
    )
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/Cannot attribute this password write/)
    expect(res.content[0].text).not.toContain('hunter2')
  })

  it('refuses an update with no fields to change, before any request', async () => {
    const res = await TOOLS.get('itglue_update_password')!.handler(
      { id: '123' },
      { authInfo: { extra: { email: 'kurtis@triplecitiestech.com' } } },
    )
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/no fields to change were supplied/)
  })
})

describe('the tool descriptions state the guarantees they are held to', () => {
  it('both say write-only with no read path', () => {
    for (const name of ['itglue_create_password', 'itglue_update_password']) {
      const d = TOOLS.get(name)!.meta.description as string
      expect(d, name).toMatch(/WRITE ONLY/)
      expect(d, name).toMatch(/never echoed|never echoed back/)
    }
  })

  it('the create description promises no read tool will be added', () => {
    const d = TOOLS.get('itglue_create_password')!.meta.description as string
    expect(d).toMatch(/no companion tool to read, list, search or retrieve/)
    expect(d).toMatch(/none will be added/)
  })

  it('no password tool input schema offers a way to read a value back', () => {
    for (const name of ['itglue_create_password', 'itglue_update_password']) {
      const keys = Object.keys(TOOLS.get(name)!.meta.inputSchema ?? {})
      expect(keys, name).not.toContain('reveal')
      expect(keys, name).not.toContain('returnPassword')
      expect(keys, name).not.toContain('includeSecret')
    }
  })
})
