// src/lib/mcp-scan-tools.test.ts
//
// The two properties that matter most about this surface, pinned:
//
//   1. The destination guardrail runs BEFORE anything is fetched or written.
//      A check that happens after the upload is not a guardrail.
//   2. The probe needs no credentials, because it exists to answer whether
//      image content blocks work at all — a question that has to be answerable
//      before the pipeline is configured.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'

const graphMock = vi.hoisted(() => ({
  assertScanReady: vi.fn(),
  auditScanWrite: vi.fn(),
  fetchScanAttachment: vi.fn(),
  getDrive: vi.fn(),
  getDriveItem: vi.fn(),
  listScanAttachments: vi.fn(),
  getScanMessage: vi.fn(),
  uploadScanFile: vi.fn(),
  RAVEN_SENDER: 'raw39v@import.raven.com',
  SCAN_MAILBOX: 'kurtis@triplecitiestech.com',
}))

vi.mock('@/lib/scan-filing/graph', () => graphMock)

import { registerScanTools } from './mcp-scan-tools'

type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<{
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  isError?: boolean
}>

function registerAll() {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>()
  registerScanTools({
    registerTool(name: string, config: Record<string, unknown>, handler: Handler) {
      tools.set(name, { config, handler })
    },
  })
  return tools
}

/**
 * Parse the JSON a tool returns. A failure result prefixes the JSON with an
 * `Error: <message>` line for byte-compatibility with the pre-envelope format,
 * so parse from the first brace rather than the first character.
 */
function payload(res: Awaited<ReturnType<Handler>>): Record<string, unknown> {
  const text = res.content.find((c) => c.type === 'text')?.text ?? '{}'
  return JSON.parse(text.slice(text.indexOf('{')))
}

const SP = 'https://triplecitiestechcom.sharepoint.com'

const FILE_ARGS = {
  messageId: 'msg-1',
  attachmentId: 'att-1',
  driveId: 'drive-1',
  parentItemId: 'folder-1',
  filename: 'Form 1099-NEC 2025 Wells Family.pdf',
}

beforeEach(() => {
  vi.clearAllMocks()
  graphMock.getDriveItem.mockResolvedValue({
    id: 'folder-1',
    name: '2025',
    webUrl: `${SP}/sites/accounting/Shared Documents/2025`,
    size: null,
    isFolder: true,
    parentPath: null,
  })
  graphMock.fetchScanAttachment.mockResolvedValue({
    meta: { id: 'att-1', name: '20260907_090410_Raven_Scan.pdf', contentType: 'application/pdf', size: 4, isInline: false },
    message: {
      id: 'msg-1',
      subject: 'Document From Kurtis Florance',
      receivedDateTime: '2026-09-07T13:04:10Z',
      webLink: 'https://outlook.office.com/x',
      fromAddress: 'raw39v@import.raven.com',
      hasAttachments: true,
      fromRavenScanner: true,
    },
    bytes: new Uint8Array([1, 2, 3, 4]),
  })
  graphMock.uploadScanFile.mockResolvedValue({
    itemId: 'item-9',
    name: FILE_ARGS.filename,
    webUrl: `${SP}/sites/accounting/Shared Documents/2025/x.pdf`,
    size: 4,
    renamed: false,
    verified: true,
    uploadPath: 'simple',
  })
})

describe('the registered surface', () => {
  it('registers exactly the scan tools, all under the scan_ prefix', () => {
    const names = [...registerAll().keys()].sort()
    expect(names).toEqual([
      'scan_file_attachment',
      'scan_list_attachments',
      'scan_log_append',
      'scan_log_columns',
      'scan_probe_render',
      'scan_render_attachment',
    ])
    expect(names.every((n) => n.startsWith('scan_'))).toBe(true)
  })

  it('exposes NO tool that could return a raw attachment', () => {
    // The whole architecture rests on bytes never crossing the conversation.
    const configs = [...registerAll().values()].map((t) => JSON.stringify(t.config).toLowerCase())
    expect(configs.some((c) => c.includes('base64content') || c.includes('contentbytes'))).toBe(false)
  })

  it('offers no way to express "replace" when filing', () => {
    const schema = registerAll().get('scan_file_attachment')!.config.inputSchema as Record<
      string,
      z.ZodTypeAny
    >
    // Read the enum's own accepted values, not its prose: the description
    // mentions "replace" precisely to say it does not exist.
    const options = (schema.conflictBehavior.unwrap() as z.ZodEnum<[string, ...string[]]>).options
    expect(options).toEqual(['rename', 'fail'])
  })
})

describe('scan_probe_render', () => {
  it('returns an image content block alongside its report', async () => {
    const res = await registerAll().get('scan_probe_render')!.handler({})
    const image = res.content.find((c) => c.type === 'image')
    expect(image).toBeDefined()
    expect(image!.mimeType).toBe('image/png')
    expect((image!.data ?? '').length).toBeGreaterThan(100)
  })

  it('needs no credential — assertScanReady is deliberately not called', async () => {
    await registerAll().get('scan_probe_render')!.handler({})
    expect(graphMock.assertScanReady).not.toHaveBeenCalled()
  })

  it('reports the image block and the render engine as SEPARATE observations', async () => {
    const res = await registerAll().get('scan_probe_render')!.handler({})
    const body = payload(res) as { imageBlock: unknown; renderEngine: { available: boolean } }
    expect(body.imageBlock).toBeDefined()
    expect(body.renderEngine).toBeDefined()
    // mupdf really loads in this environment; that is a separate fact from
    // whether the image block reaches the model.
    expect(body.renderEngine.available).toBe(true)
  })

  it('asks the caller to read the digits back rather than trusting the block was built', async () => {
    const res = await registerAll().get('scan_probe_render')!.handler({})
    expect(JSON.stringify(payload(res))).toContain('Report the 4-digit number')
  })
})

describe('scan_file_attachment guardrails', () => {
  it('refuses an excluded site and fetches NOTHING', async () => {
    graphMock.getDrive.mockResolvedValue({
      id: 'drive-1',
      name: 'Documents',
      webUrl: `${SP}/sites/inky-journaling/Shared Documents`,
      driveType: 'documentLibrary',
    })

    const res = await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)
    const body = payload(res) as { failure: { reasonCode: string; evidence: string } }

    expect(res.isError).toBe(true)
    expect(body.failure.reasonCode).toBe('POLICY_BLOCKED')
    expect(body.failure.evidence).toContain('/sites/inky-journaling')
    expect(graphMock.fetchScanAttachment).not.toHaveBeenCalled()
    expect(graphMock.uploadScanFile).not.toHaveBeenCalled()
  })

  it("refuses another employee's OneDrive", async () => {
    graphMock.getDrive.mockResolvedValue({
      id: 'drive-1',
      name: 'OneDrive',
      webUrl: 'https://triplecitiestechcom-my.sharepoint.com/personal/alex_triplecitiestech_com/Documents',
      driveType: 'business',
    })
    const res = await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)
    expect((payload(res) as { failure: { reasonCode: string } }).failure.reasonCode).toBe('POLICY_BLOCKED')
    expect(graphMock.uploadScanFile).not.toHaveBeenCalled()
  })

  it('refuses the scanner\'s generic filename before it even looks up the drive', async () => {
    const res = await registerAll()
      .get('scan_file_attachment')!
      .handler({ ...FILE_ARGS, filename: '20260907_090410_Raven_Scan.pdf' })
    const body = payload(res) as { failure: { reasonCode: string; evidence: string } }

    expect(body.failure.reasonCode).toBe('INVALID_INPUT')
    expect(body.failure.evidence).toContain('Raven_Scan')
    expect(graphMock.getDrive).not.toHaveBeenCalled()
  })

  it('refuses to write into something that is not a folder', async () => {
    graphMock.getDrive.mockResolvedValue({
      id: 'drive-1',
      name: 'Documents',
      webUrl: `${SP}/sites/accounting/Shared Documents`,
      driveType: 'documentLibrary',
    })
    graphMock.getDriveItem.mockResolvedValue({
      id: 'folder-1',
      name: 'Existing Invoice.pdf',
      webUrl: `${SP}/sites/accounting/Shared Documents/Existing Invoice.pdf`,
      size: 100,
      isFolder: false,
      parentPath: null,
    })

    const res = await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)
    expect((payload(res) as { failure: { reasonCode: string } }).failure.reasonCode).toBe('INVALID_INPUT')
    expect(graphMock.uploadScanFile).not.toHaveBeenCalled()
  })
})

describe('scan_file_attachment on the happy path', () => {
  beforeEach(() => {
    graphMock.getDrive.mockResolvedValue({
      id: 'drive-1',
      name: 'Documents',
      webUrl: `${SP}/sites/accounting/Shared Documents`,
      driveType: 'documentLibrary',
    })
  })

  it('files it, and reports the destination it proved rather than the one it was told', async () => {
    const res = await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)
    const body = payload(res) as {
      filed: boolean
      verified: boolean
      destination: { siteKey: string; kind: string; label: string }
      source: { originalFilename: string }
    }

    expect(body.filed).toBe(true)
    expect(body.verified).toBe(true)
    expect(body.destination.siteKey).toBe('/sites/accounting')
    expect(body.destination.kind).toBe('filing-site')
    expect(body.destination.label).toBe('Accounting')
    expect(body.source.originalFilename).toBe('20260907_090410_Raven_Scan.pdf')
    expect(graphMock.uploadScanFile).toHaveBeenCalledTimes(1)
  })

  it('defaults conflictBehavior to rename, never replace', async () => {
    await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)
    expect(graphMock.uploadScanFile).toHaveBeenCalledWith(
      expect.objectContaining({ conflictBehavior: 'rename' })
    )
  })

  it('reports filed:false and warns when the read-back did not confirm the size', async () => {
    graphMock.uploadScanFile.mockResolvedValue({
      itemId: 'item-9',
      name: FILE_ARGS.filename,
      webUrl: `${SP}/x.pdf`,
      size: 1,
      renamed: false,
      verified: false,
      uploadPath: 'simple',
    })
    const body = payload(await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)) as {
      filed: boolean
      warnings: string[]
    }
    expect(body.filed).toBe(false)
    expect(body.warnings.join(' ')).toContain('Read-back did not confirm')
  })

  it('warns about a possible duplicate when SharePoint renamed the upload', async () => {
    graphMock.uploadScanFile.mockResolvedValue({
      itemId: 'item-9',
      name: 'Form 1099-NEC 2025 Wells Family 1.pdf',
      webUrl: `${SP}/x.pdf`,
      size: 4,
      renamed: true,
      verified: true,
      uploadPath: 'simple',
    })
    const body = payload(await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)) as {
      warnings: string[]
    }
    expect(body.warnings.join(' ')).toContain('duplicate')
  })

  it('carries the unconfirmed-site warning through to the caller instead of swallowing it', async () => {
    graphMock.getDrive.mockResolvedValue({
      id: 'drive-1',
      name: 'Documents',
      webUrl: `${SP}/sites/PolicyCenter/Shared Documents`,
      driveType: 'documentLibrary',
    })
    const body = payload(await registerAll().get('scan_file_attachment')!.handler(FILE_ARGS)) as {
      filed: boolean
      warnings: string[]
    }
    expect(body.filed).toBe(true)
    expect(body.warnings.join(' ')).toContain('not a confirmed scan destination')
  })
})

describe('scan_render_attachment', () => {
  it('flags a message that did not come from the Raven scanner', async () => {
    graphMock.fetchScanAttachment.mockResolvedValue({
      meta: { id: 'att-1', name: 'contract.pdf', contentType: 'application/pdf', size: 4, isInline: false },
      message: {
        id: 'msg-1',
        subject: 'FYI',
        receivedDateTime: '2026-09-07T13:04:10Z',
        webLink: 'https://outlook.office.com/x',
        fromAddress: 'someone@example.com',
        hasAttachments: true,
        fromRavenScanner: false,
      },
      // Not a PDF, so rendering fails — the sender check must still be visible
      // via the failure path rather than being lost.
      bytes: new Uint8Array([1, 2, 3, 4]),
    })
    const res = await registerAll()
      .get('scan_render_attachment')!
      .handler({ messageId: 'msg-1', attachmentId: 'att-1' })
    expect(res.isError).toBe(true)
    expect((payload(res) as { failure: { reasonCode: string } }).failure.reasonCode).toBe('INVALID_INPUT')
  })

  it('is gated by the kill switch', async () => {
    graphMock.assertScanReady.mockImplementation(() => {
      throw new Error('disabled')
    })
    const res = await registerAll()
      .get('scan_render_attachment')!
      .handler({ messageId: 'msg-1', attachmentId: 'att-1' })
    expect(res.isError).toBe(true)
    expect(graphMock.fetchScanAttachment).not.toHaveBeenCalled()
  })
})
