// src/lib/autotask-attachments.test.ts
//
// The rules that run BEFORE any byte reaches Autotask, and the read-back
// comparison that runs after. Everything here is pure; the tool-level
// behaviour (rollback, envelopes, the wire) is in mcp-write-tools.test.ts.

import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_CONTENT_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_PUBLISH,
  attachmentBytesMatch,
  buildAttachmentBody,
  describeAttribution,
  fileExtension,
  normalizeContentType,
  planAttachment,
  verifyAttachmentReadBack,
  type AttachmentPlan,
} from './autotask-attachments'

const TEXT = 'Speaker 1 (00:00): Hello, Triple Cities Tech.\nSpeaker 2 (00:03): Hi, my printer is offline again.\n'

function plan(overrides: Record<string, unknown> = {}): AttachmentPlan {
  const r = planAttachment({ filename: 'call-2026-09-08.txt', contentType: 'text/plain', content: TEXT, ...overrides })
  if (!r.ok) throw new Error(`expected a plan, got ${r.failure.message}`)
  return r.plan
}

function refusal(input: Record<string, unknown>) {
  const r = planAttachment({ filename: 'call.txt', contentType: 'text/plain', content: TEXT, ...input } as never)
  expect(r.ok, 'expected the input to be refused').toBe(false)
  if (r.ok) throw new Error('unreachable')
  return r.failure
}

describe('planAttachment — the transcript case', () => {
  it('encodes UTF-8 text as base64 and defaults to INTERNAL', () => {
    const p = plan()
    expect(p.publish).toBe(ATTACHMENT_PUBLISH.INTERNAL)
    expect(p.customerVisible).toBe(false)
    expect(Buffer.from(p.base64, 'base64').toString('utf8')).toBe(TEXT)
    expect(p.sizeBytes).toBe(Buffer.byteLength(TEXT, 'utf8'))
    expect(p.title).toBe('call-2026-09-08.txt')
  })

  it('opts in to customer visibility ONLY on an explicit true', () => {
    expect(plan({ customerVisible: true }).publish).toBe(ATTACHMENT_PUBLISH.CUSTOMER_VISIBLE)
    expect(plan({ customerVisible: false }).publish).toBe(ATTACHMENT_PUBLISH.INTERNAL)
    expect(plan({ customerVisible: undefined }).publish).toBe(ATTACHMENT_PUBLISH.INTERNAL)
    // A truthy non-boolean is not consent.
    expect(plan({ customerVisible: 'yes' as unknown as boolean }).publish).toBe(ATTACHMENT_PUBLISH.INTERNAL)
  })

  it('strips MIME parameters but records what was passed', () => {
    const p = plan({ contentType: 'text/plain; charset=utf-8' })
    expect(p.contentType).toBe('text/plain')
    expect(p.contentTypeAsPassed).toBe('text/plain; charset=utf-8')
    expect(plan().contentTypeAsPassed).toBeUndefined()
  })

  it('accepts binary via contentBase64 and measures the DECODED size', () => {
    const bytes = Buffer.from('%PDF-1.4 fake', 'latin1')
    const p = plan({ filename: 'form.pdf', contentType: 'application/pdf', content: undefined, contentBase64: bytes.toString('base64') })
    expect(p.sizeBytes).toBe(bytes.length)
    expect(p.base64).toBe(bytes.toString('base64'))
  })
})

describe('planAttachment — refusals happen before any upload and are INVALID_INPUT', () => {
  it('refuses a file over the cap, and names the cap as CHOSEN from the documented range', () => {
    const f = refusal({ content: 'x'.repeat(ATTACHMENT_MAX_BYTES + 1) })
    expect(f.reasonCode).toBe('INVALID_INPUT')
    expect(f.message).toMatch(/6,000,000 bytes/)
    expect(f.remediation).toMatch(/6 to 7 MB/)
    expect(f.details).toMatchObject({ sizeBytes: ATTACHMENT_MAX_BYTES + 1, maxBytes: ATTACHMENT_MAX_BYTES })
    expect(String(f.details?.capBasis)).toMatch(/chosen/i)
  })

  it('accepts a file exactly at the cap', () => {
    expect(plan({ content: 'x'.repeat(ATTACHMENT_MAX_BYTES) }).sizeBytes).toBe(ATTACHMENT_MAX_BYTES)
  })

  it('refuses a content type off the allowlist and lists the allowlist', () => {
    const f = refusal({ filename: 'shot.png', contentType: 'image/png' })
    expect(f.reasonCode).toBe('INVALID_INPUT')
    expect(f.message).toMatch(/image\/png/)
    expect(f.details).toMatchObject({ allowed: Object.keys(ATTACHMENT_CONTENT_TYPES) })
  })

  it('refuses an extension that disagrees with the content type', () => {
    const f = refusal({ filename: 'transcript.exe', contentType: 'text/plain' })
    expect(f.reasonCode).toBe('INVALID_INPUT')
    expect(f.message).toMatch(/\.exe/)
    expect(f.details).toMatchObject({ extension: 'exe', expectedExtensions: ['txt', 'log', 'text'] })
  })

  it('refuses a filename with no extension', () => {
    expect(refusal({ filename: 'transcript' }).message).toMatch(/has no extension/)
  })

  it('refuses a path where a filename was expected', () => {
    expect(refusal({ filename: '../etc/passwd.txt' }).message).toMatch(/bare file name/)
    expect(refusal({ filename: 'C:\\temp\\a.txt' }).message).toMatch(/bare file name/)
  })

  it('refuses both content and contentBase64, and neither', () => {
    expect(refusal({ content: TEXT, contentBase64: 'QQ==' }).message).toMatch(/exactly one/)
    expect(refusal({ content: undefined }).message).toMatch(/Neither content nor contentBase64/)
  })

  it('refuses malformed base64 rather than uploading garbage', () => {
    const f = refusal({ content: undefined, contentBase64: 'not base64!!' })
    expect(f.message).toMatch(/not valid standard base64/)
  })

  it('refuses an empty file', () => {
    expect(refusal({ content: '' }).message).toMatch(/empty/)
  })

  it('refuses names longer than Autotask stores', () => {
    expect(refusal({ filename: `${'a'.repeat(260)}.txt` }).message).toMatch(/at most 255/)
    expect(refusal({ title: 't'.repeat(256) }).message).toMatch(/title is 256 characters/)
  })

  it('every refusal says nothing was uploaded and cites pre-flight validation', () => {
    for (const f of [
      refusal({ content: 'x'.repeat(ATTACHMENT_MAX_BYTES + 1) }),
      refusal({ filename: 'shot.png', contentType: 'image/png' }),
      refusal({ filename: 'transcript' }),
    ]) {
      expect(f.message).toMatch(/Nothing was uploaded/)
      expect(f.evidence).toMatch(/no network call was made/)
    }
  })
})

describe('buildAttachmentBody mirrors the vendor create example', () => {
  it('sends attachmentType FILE_ATTACHMENT, fullPath, title, publish, contentType and base64 data — and no parent id', () => {
    const body = buildAttachmentBody(plan({ title: 'Call transcript' }))
    expect(body).toEqual({
      attachmentType: 'FILE_ATTACHMENT',
      fullPath: 'call-2026-09-08.txt',
      title: 'Call transcript',
      publish: 2,
      contentType: 'text/plain',
      data: Buffer.from(TEXT, 'utf8').toString('base64'),
    })
    expect(Object.keys(body)).not.toContain('ticketID')
    expect(Object.keys(body)).not.toContain('attachDate')
  })

  it('ALWAYS carries publish — the tool never omits it and hopes for a default', () => {
    expect(buildAttachmentBody(plan())).toHaveProperty('publish', 2)
    expect(buildAttachmentBody(plan({ customerVisible: true }))).toHaveProperty('publish', 1)
  })
})

describe('verifyAttachmentReadBack', () => {
  const stored = {
    id: 90, ticketID: 35437, timeEntryID: null, title: 'call-2026-09-08.txt', fullPath: 'call-2026-09-08.txt',
    contentType: 'text/plain', attachmentType: 'FILE_ATTACHMENT', publish: 2,
  }

  it('verifies every hard field on a faithful read-back', () => {
    const v = verifyAttachmentReadBack(plan(), { field: 'ticketID', id: 35437 }, stored)
    expect(v.mismatches).toEqual([])
    expect(v.verifiedFields.sort()).toEqual(['attachmentType', 'fullPath', 'publish', 'ticketID', 'title'])
    expect(v.rollbackWarranted).toBe(false)
    expect(v.contentType).toEqual({ requested: 'text/plain', stored: 'text/plain', matches: true })
  })

  it('a publish that did not stick is a mismatch that WARRANTS ROLLBACK', () => {
    const v = verifyAttachmentReadBack(plan(), { field: 'ticketID', id: 35437 }, { ...stored, publish: 1 })
    expect(v.mismatches).toEqual([{ field: 'publish', requested: 2, actual: 1 }])
    expect(v.rollbackWarranted).toBe(true)
  })

  it('a file on the wrong parent warrants rollback too', () => {
    const v = verifyAttachmentReadBack(plan(), { field: 'timeEntryID', id: 13188 }, { ...stored, timeEntryID: 99 })
    expect(v.mismatches).toEqual([{ field: 'timeEntryID', requested: 13188, actual: 99 }])
    expect(v.rollbackWarranted).toBe(true)
  })

  it('a title or path that did not stick is a mismatch but NOT a rollback', () => {
    const v = verifyAttachmentReadBack(plan({ title: 'Call' }), { field: 'ticketID', id: 35437 }, { ...stored, title: 'Something else' })
    expect(v.mismatches).toEqual([{ field: 'title', requested: 'Call', actual: 'Something else' }])
    expect(v.rollbackWarranted).toBe(false)
  })

  it('a missing field fails closed rather than reading as a match', () => {
    const v = verifyAttachmentReadBack(plan(), { field: 'ticketID', id: 35437 }, { ...stored, publish: undefined })
    expect(v.mismatches).toEqual([{ field: 'publish', requested: 2, actual: null }])
    expect(v.rollbackWarranted).toBe(true)
  })

  it('tolerates line-ending translation and attachmentType case, nothing else', () => {
    const v = verifyAttachmentReadBack(plan({ title: 'a\nb' }), { field: 'ticketID', id: 35437 }, { ...stored, title: 'a\r\nb', attachmentType: 'file_attachment' })
    expect(v.mismatches).toEqual([])
  })

  it('REPORTS a contentType difference instead of failing on it', () => {
    const v = verifyAttachmentReadBack(plan(), { field: 'ticketID', id: 35437 }, { ...stored, contentType: 'text/plain; charset=utf-8' })
    expect(v.mismatches).toEqual([])
    expect(v.contentType.matches).toBe(true) // parameters are normalised away
    const v2 = verifyAttachmentReadBack(plan(), { field: 'ticketID', id: 35437 }, { ...stored, contentType: 'application/octet-stream' })
    expect(v2.mismatches).toEqual([])
    expect(v2.contentType).toEqual({ requested: 'text/plain', stored: 'application/octet-stream', matches: false })
    const v3 = verifyAttachmentReadBack(plan(), { field: 'ticketID', id: 35437 }, { ...stored, contentType: null })
    expect(v3.contentType.matches).toBeNull()
  })
})

describe('attachmentBytesMatch', () => {
  const sent = Buffer.from(TEXT).toString('base64')
  it('compares decoded bytes, so re-wrapped base64 is not a difference', () => {
    expect(attachmentBytesMatch(sent, sent.replace(/(.{20})/g, '$1\r\n'))).toBe(true)
  })
  it('catches a single changed byte', () => {
    const tampered = Buffer.from(TEXT.replace('printer', 'printer!')).toString('base64')
    expect(attachmentBytesMatch(sent, tampered)).toBe(false)
  })
  it('is null — NOT MEASURED — when nothing came back', () => {
    expect(attachmentBytesMatch(sent, null)).toBeNull()
    expect(attachmentBytesMatch(sent, undefined)).toBeNull()
  })
})

describe('describeAttribution', () => {
  it('recognises the signed-in tech in either field, and says which', () => {
    expect(describeAttribution({ attachedByResourceID: 1234, impersonatorCreatorResourceID: null }, 1234)).toMatchObject({ attributedToSignedInTech: true })
    expect(describeAttribution({ attachedByResourceID: 4, impersonatorCreatorResourceID: 1234 }, 1234).basis).toMatch(/impersonatorCreatorResourceID/)
  })
  it('reports API-user attribution plainly instead of asserting the header worked', () => {
    const a = describeAttribution({ attachedByResourceID: 4, impersonatorCreatorResourceID: null }, 1234)
    expect(a.attributedToSignedInTech).toBe(false)
    expect(a.basis).toMatch(/attributed the file to the API user/)
  })
})

describe('small helpers', () => {
  it('normalizeContentType lower-cases and strips parameters', () => {
    expect(normalizeContentType(' Text/Plain; charset=UTF-8 ')).toBe('text/plain')
  })
  it('fileExtension handles dotfiles and trailing dots', () => {
    expect(fileExtension('a.TXT')).toBe('txt')
    expect(fileExtension('.bashrc')).toBe('')
    expect(fileExtension('trailing.')).toBe('')
    expect(fileExtension('noext')).toBe('')
  })
})
