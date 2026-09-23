// src/lib/customer-mail.test.ts
//
// The customer-email path added after the 2026-09-22 finding that connector
// notes and time entries never email the customer. These tests pin the three
// properties the module claims by construction: it refuses before anything is
// written when it is not set up, it never retries a send, and it reports a 202
// as ACCEPTED rather than delivered.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CUSTOMER_MAIL_SENDER,
  buildCustomerUpdateEmail,
  customerMailReadiness,
  isSendableEmailAddress,
  sendCustomerUpdateEmail,
} from './customer-mail'

const ENV_KEYS = [
  'CONNECTOR_CUSTOMER_EMAIL_ENABLED',
  'CUSTOMER_MAIL_TENANT_ID',
  'CUSTOMER_MAIL_CLIENT_ID',
  'CUSTOMER_MAIL_CLIENT_SECRET',
  'CUSTOMER_MAIL_SENDER',
]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  globalThis.__customerMailGraphToken = undefined
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

function configure() {
  process.env.CONNECTOR_CUSTOMER_EMAIL_ENABLED = 'true'
  process.env.CUSTOMER_MAIL_TENANT_ID = 't'
  process.env.CUSTOMER_MAIL_CLIENT_ID = 'c'
  process.env.CUSTOMER_MAIL_CLIENT_SECRET = 's'
}

const EMAIL = buildCustomerUpdateEmail({
  ticketNumber: 'T20260922.0011',
  ticketTitle: 'Printer offline',
  contactFirstName: 'Pat',
  message: 'Replaced the toner.',
})

describe('customerMailReadiness — refuses before anything is written', () => {
  it('is POLICY_BLOCKED while the kill switch is off, even with credentials set', () => {
    configure()
    delete process.env.CONNECTOR_CUSTOMER_EMAIL_ENABLED
    const r = customerMailReadiness()
    expect(r.ready).toBe(false)
    if (!r.ready) {
      expect(r.failure.reasonCode).toBe('POLICY_BLOCKED')
      expect(r.failure.message).toMatch(/Nothing was written and nothing was sent|nothing was written and nothing was sent/i)
    }
  })

  it.each(['1', 'yes', 'TRUE', ''])('treats %j as off — only the literal "true" enables it', (v) => {
    configure()
    process.env.CONNECTOR_CUSTOMER_EMAIL_ENABLED = v
    expect(customerMailReadiness().ready).toBe(false)
  })

  it('is POLICY_BLOCKED when any credential is missing', () => {
    configure()
    delete process.env.CUSTOMER_MAIL_CLIENT_SECRET
    const r = customerMailReadiness()
    expect(r.ready).toBe(false)
    if (!r.ready) expect(r.failure.reasonCode).toBe('POLICY_BLOCKED')
  })

  it('is ready with the default support sender when fully configured', () => {
    configure()
    expect(customerMailReadiness()).toEqual({ ready: true, sender: DEFAULT_CUSTOMER_MAIL_SENDER })
  })

  it('honours CUSTOMER_MAIL_SENDER', () => {
    configure()
    process.env.CUSTOMER_MAIL_SENDER = 'help@example.com'
    expect(customerMailReadiness()).toEqual({ ready: true, sender: 'help@example.com' })
  })
})

describe('buildCustomerUpdateEmail', () => {
  it('leads the subject with the ticket number and carries the approved text', () => {
    expect(EMAIL.subject).toBe('Ticket T20260922.0011: Printer offline')
    expect(EMAIL.text).toContain('Hi Pat,')
    expect(EMAIL.text).toContain('Replaced the toner.')
    expect(EMAIL.text).toContain('Ticket: T20260922.0011')
  })

  it('escapes HTML in the message so a note cannot inject markup into the email', () => {
    const e = buildCustomerUpdateEmail({
      ticketNumber: 'T1',
      ticketTitle: 'x',
      contactFirstName: null,
      message: '<script>alert(1)</script> & <b>bold</b>',
    })
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('&lt;script&gt;')
    expect(e.html).toContain('&amp;')
    expect(e.text).toContain('Hello,')
  })

  it('keeps paragraphs and line breaks', () => {
    const e = buildCustomerUpdateEmail({ ticketNumber: 'T1', ticketTitle: null, contactFirstName: 'A', message: 'one\ntwo\n\nthree' })
    expect(e.html).toContain('one<br>two')
    expect((e.html.match(/<p style="margin:0 0 14px 0;">/g) ?? []).length).toBe(3) // greeting + 2 paragraphs
    expect(e.subject).toBe('Ticket T1: update')
  })

  it('strips newlines from the ticket title so the subject cannot carry a header break', () => {
    const e = buildCustomerUpdateEmail({ ticketNumber: 'T1', ticketTitle: 'a\r\nBcc: x@y.com', contactFirstName: null, message: 'm' })
    expect(e.subject).not.toMatch(/[\r\n]/)
  })
})

describe('isSendableEmailAddress', () => {
  it.each([
    ['pat@example.com', true],
    ['  pat@example.com  ', true],
    ['', false],
    [null, false],
    ['pat', false],
    ['a@b.com, c@d.com', false],
    ['Pat <pat@example.com>', false],
    ['a@b.com;c@d.com', false],
  ])('%j -> %s', (addr, expected) => {
    expect(isSendableEmailAddress(addr as string | null)).toBe(expected)
  })
})

describe('sendCustomerUpdateEmail', () => {
  function tokenResponse() {
    return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
  }

  it('posts ONE message to the sender\'s sendMail, saved to Sent Items, and reports 202 as ACCEPTED', async () => {
    configure()
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 202 }))

    const r = await sendCustomerUpdateEmail({ to: 'pat@example.com', toName: 'Pat Doe', email: EMAIL })

    expect(r).toMatchObject({ status: 'accepted', httpStatus: 202, sender: DEFAULT_CUSTOMER_MAIL_SENDER, to: 'pat@example.com' })
    const [url, init] = vi.mocked(fetch).mock.calls[1]
    expect(url).toBe(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(DEFAULT_CUSTOMER_MAIL_SENDER)}/sendMail`)
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.saveToSentItems).toBe(true)
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: 'pat@example.com', name: 'Pat Doe' } }])
    expect(body.message.ccRecipients).toBeUndefined()
    expect(body.message.bccRecipients).toBeUndefined()
    expect(body.message.body.contentType).toBe('HTML')
  })

  it('NEVER retries: one failed send is one request, then a throw', async () => {
    configure()
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('{"error":{"code":"ServiceUnavailable"}}', { status: 503 }))

    await expect(sendCustomerUpdateEmail({ to: 'pat@example.com', email: EMAIL })).rejects.toThrow(/\(503\)/)
    const sendCalls = vi.mocked(fetch).mock.calls.filter(([u]) => String(u).includes('/sendMail'))
    expect(sendCalls).toHaveLength(1)
  })

  it('treats a 200 as failure too — only the documented 202 is success', async () => {
    configure()
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await expect(sendCustomerUpdateEmail({ to: 'pat@example.com', email: EMAIL })).rejects.toThrow(/\(200\)/)
  })

  it('names the RBAC scope — never tenant-wide consent — on a 403', async () => {
    configure()
    vi.mocked(fetch)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response('{"error":{"code":"ErrorAccessDenied"}}', { status: 403 }))
    await expect(sendCustomerUpdateEmail({ to: 'pat@example.com', email: EMAIL })).rejects.toThrow(/Test-ServicePrincipalAuthorization.*do NOT fix it with a tenant-wide Entra consent/)
  })
})
