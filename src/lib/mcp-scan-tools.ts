// src/lib/mcp-scan-tools.ts
//
// The Raven scan filing pipeline's connector tools.
//
// WHAT THE PIPELINE IS. Every scan from Kurtis's Raven scanner arrives in his
// mailbox as "Document From Kurtis Florance" with an attachment called something
// like 20260907_090410_Raven_Scan.pdf, which says nothing about the document.
// Eight arrived between 08:34 and 10:05 on 2026-09-07 alone. Somebody has to
// open each one, work out what it is, rename it, file it, and tell Rio. These
// tools are the machine half of that: read the scan, file the bytes, log the row.
// Deciding WHAT the document is stays with the model; deciding WHERE it may go
// is enforced here (see ./scan-filing/destinations.ts).
//
// THE ONE DESIGN RULE. Bytes never pass through the conversation. A 936 KB scan
// is ~1.25M base64 characters — on the order of 400,000 tokens for one document.
// So the connector fetches from Graph and either rasterises server-side (image
// content blocks, ~3,000 tokens a page) or uploads server-side. There is
// deliberately NO tool that returns a raw attachment, and one must not be added.
//
// Writes are DIRECT, not staged. The staged-approval gate exists for INSTANCE
// CONFIGURATION; these are single documents filed into a folder and one appended
// log row, both correctable by hand. The guardrails that do apply are: a kill
// switch over the whole surface, a destination check against the routing policy
// before any byte is written, no way to express "replace" on an upload, and
// read-back verification on everything.

import { z } from 'zod'
import {
  failureResult,
  toolFailure,
  FAILURE_ENVELOPE_TOOL_NOTE,
} from '@/lib/connector/failure-envelope'
import {
  assertScanReady,
  auditScanWrite,
  fetchScanAttachment,
  getDrive,
  getDriveItem,
  listScanAttachments,
  getScanMessage,
  uploadScanFile,
  RAVEN_SENDER,
  SCAN_MAILBOX,
} from '@/lib/scan-filing/graph'
import { classifyDestination, validateScanFilename } from '@/lib/scan-filing/destinations'
import {
  buildProbeImage,
  DEFAULT_DPI,
  DEFAULT_MAX_PAGES,
  MAX_PAGES_CEILING,
  MAX_DPI,
  MIN_DPI,
  renderEngineStatus,
  renderPdf,
} from '@/lib/scan-filing/render'
import {
  appendScanLogRow,
  describeScanLogTable,
  CONFIDENCE_VALUES,
  RIO_NOTIFIED_VALUES,
  SCAN_LOG_HEADER_ROW,
} from '@/lib/scan-filing/log'

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function fail(err: unknown, tool: string) {
  return toolFailure(err, { surface: 'scan_filer', tool })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerScanTools(server: any) {
  const emailOf = (extra: any): string | undefined => extra?.authInfo?.extra?.email

  // ── Probe: does an image content block reach the model at all? ────────────
  server.registerTool(
    'scan_probe_render',
    {
      title: 'Scan: probe image rendering',
      description:
        'READ. Diagnostic. Returns a small generated PNG containing a random 4-digit code, plus a separate ' +
        'report on whether the PDF rendering engine loads. Needs NO credentials and touches NO mailbox or ' +
        'document, so it can be run before the pipeline is configured. ' +
        'IT ANSWERS TWO SEPARATE QUESTIONS AND REPORTS THEM SEPARATELY, on purpose: (1) do MCP image content ' +
        'blocks reach the model through this connector, and are they legible — READ THE FOUR DIGITS BACK to ' +
        'the user, because a tool merely returning an image proves only that the connector built one; ' +
        '(2) does the mupdf renderer load in this deployment. A failure of (2) with (1) working means the ' +
        'image path is sound and only the packaging is broken. If (1) fails, the whole design falls back to ' +
        'server-side OCR and Kurtis needs to know before anything else is built. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {},
    },
    async (_args: any, extra: any) => {
      try {
        // Random per call so a remembered answer cannot pass for a read one.
        const code = String(Math.floor(1000 + Math.random() * 9000))
        const image = buildProbeImage(code)
        const engine = await renderEngineStatus()

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  probe: 'scan_probe_render',
                  imageBlock: {
                    returned: true,
                    widthPx: image.widthPx,
                    heightPx: image.heightPx,
                    mimeType: image.mimeType,
                    bytes: image.bytes,
                    instruction:
                      'An image content block follows. Report the 4-digit number you can see in it. ' +
                      'If you cannot see an image at all, say exactly that — do not guess a number, and do ' +
                      'not report the code from any other source. Whether you can READ it is the finding.',
                  },
                  renderEngine: {
                    available: engine.available,
                    detail: engine.detail,
                    note:
                      'This is a SEPARATE observation from the image block above. The two are reported ' +
                      'apart because collapsing them would make a failure uninterpretable.',
                  },
                  caller: emailOf(extra) ?? 'unknown',
                },
                null,
                2
              ),
            },
            { type: 'image' as const, data: image.base64, mimeType: image.mimeType },
          ],
        }
      } catch (e) {
        return fail(e, 'scan_probe_render')
      }
    }
  )

  // ── Read a scan so the model can identify it ──────────────────────────────
  server.registerTool(
    'scan_render_attachment',
    {
      title: 'Scan: read a Raven scan attachment',
      description:
        'READ. Fetch one PDF attachment from a scan email in ' +
        SCAN_MAILBOX +
        ' and return something readable: the extracted text when the PDF has a real text layer, otherwise ' +
        'the pages rendered as images. The raw file is NEVER returned — a single scan as base64 is on the ' +
        'order of 400,000 tokens, which is why this tool exists at all. ' +
        'Raven scans generally have NO text layer (two already-filed ones extracted zero characters), so ' +
        'expect the image path. The response always reports how many characters the text layer yielded and ' +
        'why the path was chosen, so "no text found" is never indistinguishable from "did not look". ' +
        'Read the pages, identify the document, then choose the filename and destination folder — ' +
        'match the naming convention already in use, e.g. ' +
        '"Form 1099-NEC 2025 Wells Family $7815.15 Compensation.pdf". ' +
        'If the pages do not establish what the document is, say so and route it to _Needs Review rather ' +
        'than filing a guess. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        messageId: z.string().describe('Graph message id of the scan email'),
        attachmentId: z
          .string()
          .describe('Graph attachment id. Call with a wrong id to be told which ids the message has.'),
        maxPages: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGES_CEILING)
          .optional()
          .describe(`Pages to process (default ${DEFAULT_MAX_PAGES}, ceiling ${MAX_PAGES_CEILING})`),
        dpi: z
          .number()
          .int()
          .min(MIN_DPI)
          .max(MAX_DPI)
          .optional()
          .describe(
            `Render resolution (default ${DEFAULT_DPI}; a letter page lands at 1275x1650). Raising it ` +
              `rarely helps — the long edge is capped at the size the model resizes to anyway.`
          ),
        mode: z
          .enum(['auto', 'text', 'images'])
          .optional()
          .describe(
            'auto (default) picks the text layer only when it is substantial enough to identify the ' +
              'document. Force "images" if the returned text looks like a fax header rather than the document.'
          ),
      },
    },
    async (args: any, extra: any) => {
      const actor = emailOf(extra)
      try {
        assertScanReady()
        const { bytes, meta, message, artifact } = await fetchScanAttachment(
          args.messageId,
          args.attachmentId
        )
        const result = await renderPdf(bytes, {
          dpi: args.dpi,
          maxPages: args.maxPages,
          mode: args.mode ?? 'auto',
        })

        auditScanWrite('scan_render_attachment', actor, 'success', {
          messageId: args.messageId,
          attachmentId: args.attachmentId,
          attachmentBytes: bytes.byteLength,
          pageCount: result.pageCount,
          mode: result.mode,
          pagesRendered: result.pagesRendered,
        })

        const summary = {
          message: {
            id: message.id,
            subject: message.subject,
            receivedDateTime: message.receivedDateTime,
            webLink: message.webLink,
            from: message.fromAddress,
            fromRavenScanner: message.fromRavenScanner,
          },
          attachment: {
            id: meta.id,
            name: meta.name,
            contentType: meta.contentType,
            bytes: bytes.byteLength,
            // The attachment resource's own size field runs a constant ~392
            // bytes larger than the downloaded body and is NOT an integrity
            // measure; both are reported so neither is mistaken for the other.
            reportedSize: meta.size,
            integrity: artifact,
          },
          pageCount: result.pageCount,
          mode: result.mode,
          modeReason: result.modeReason,
          textChars: result.textChars,
          firstPageTextChars: result.firstPageTextChars,
          textTruncated: result.textTruncated,
          pagesRendered: result.pagesRendered,
          dpi: result.dpi,
          notes: [
            ...result.notes,
            ...(message.fromRavenScanner
              ? []
              : [
                  `This message is from ${message.fromAddress ?? 'an unknown sender'}, not the Raven ` +
                    `scanner (${RAVEN_SENDER}). It was read anyway, but it is outside the pipeline's scope ` +
                    `as specified — say so before filing it.`,
                ]),
          ],
          extractedText: result.text,
          nextStep:
            'Identify the document, then call scan_file_attachment with the destination driveId + ' +
            'parentItemId and the new filename. Do not report what the document is unless the pages or ' +
            'the text actually show it.',
        }

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(summary, null, 2) },
            ...result.images.map((p) => ({
              type: 'image' as const,
              data: p.base64,
              mimeType: p.mimeType,
            })),
          ],
        }
      } catch (e) {
        auditScanWrite('scan_render_attachment', actor, 'error', {
          messageId: args.messageId,
          attachmentId: args.attachmentId,
          error: e instanceof Error ? e.message : String(e),
        })
        return fail(e, 'scan_render_attachment')
      }
    }
  )

  // ── List a message's attachments (metadata only, no bytes) ────────────────
  server.registerTool(
    'scan_list_attachments',
    {
      title: 'Scan: list a message\'s attachments',
      description:
        'READ. List the attachments on one scan email — id, name, contentType, size — WITHOUT their bytes. ' +
        'Use it to get an attachmentId before calling scan_render_attachment. A Raven scan email carries ' +
        'exactly one application/pdf attachment; more than one means the message is not a plain scan. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        messageId: z.string().describe('Graph message id of the scan email'),
      },
    },
    async (args: any) => {
      try {
        assertScanReady()
        const [message, attachments] = await Promise.all([
          getScanMessage(args.messageId),
          listScanAttachments(args.messageId),
        ])
        return ok({
          mailbox: SCAN_MAILBOX,
          message: {
            id: message.id,
            subject: message.subject,
            receivedDateTime: message.receivedDateTime,
            webLink: message.webLink,
            from: message.fromAddress,
            fromRavenScanner: message.fromRavenScanner,
          },
          attachmentCount: attachments.length,
          attachments,
        })
      } catch (e) {
        return fail(e, 'scan_list_attachments')
      }
    }
  )

  // ── File the scan ─────────────────────────────────────────────────────────
  server.registerTool(
    'scan_file_attachment',
    {
      title: 'Scan: file an attachment to SharePoint or OneDrive',
      description:
        'WRITE (direct). Copy one scan attachment from the mailbox into a SharePoint or OneDrive folder ' +
        'under a new, meaningful filename. The bytes go mailbox to destination SERVER-SIDE and never ' +
        'through the conversation. ' +
        'THE DESTINATION IS CHECKED BEFORE ANYTHING IS WRITTEN, against the drive\'s own webUrl as Graph ' +
        'reports it, not against anything the caller asserts. Filing into the App Catalog, the INKY ' +
        'mail-security sites, the empty All Company sites, the dead Outlook Customer Manager site, the ' +
        'classic tenant root, or another person\'s OneDrive is refused outright. A real site that is not a ' +
        'confirmed scan destination is allowed and FLAGGED — surface that warning, do not swallow it. ' +
        'There is no "replace" conflict behaviour and no parameter that could express one: a scan ' +
        'overwriting a filed document destroys a record with nothing to recover it from. ' +
        'The upload is READ-BACK VERIFIED — the returned webUrl and size come from re-reading the item ' +
        'after the write, not from the write\'s own response. Only report the scan as filed if verified is ' +
        'true. Then call scan_log_append, and notify Rio only after this call has returned. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        messageId: z.string().describe('Graph message id of the scan email'),
        attachmentId: z.string().describe('Graph attachment id (from scan_list_attachments)'),
        driveId: z.string().describe('Destination drive id (SharePoint document library or OneDrive)'),
        parentItemId: z.string().describe('Destination FOLDER item id within that drive'),
        filename: z
          .string()
          .describe(
            'Final filename including .pdf. Must describe the document — a name still containing ' +
              '"Raven_Scan" is refused, because replacing it is the point of this pipeline.'
          ),
        conflictBehavior: z
          .enum(['rename', 'fail'])
          .optional()
          .describe(
            'What to do if the name is taken: "rename" (default, Graph appends a number) or "fail". ' +
              'There is no "replace" option by design.'
          ),
      },
    },
    async (args: any, extra: any) => {
      const actor = emailOf(extra)
      try {
        assertScanReady()

        const nameCheck = validateScanFilename(args.filename)
        if (!nameCheck.ok) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message: `The filename "${args.filename}" was rejected, so nothing was written.`,
            evidence: nameCheck.problems.join(' '),
            remediation:
              'Choose a filename that describes the document and ends in .pdf, then call again. The name ' +
              'is not repaired automatically: a filename nobody reviewed is the problem this pipeline exists ' +
              'to fix.',
            surface: 'scan_filer',
            tool: 'scan_file_attachment',
          })
        }

        // Establish what this driveId actually IS before writing to it.
        const drive = await getDrive(args.driveId)
        const verdict = classifyDestination(drive.webUrl)
        if (!verdict.allowed) {
          auditScanWrite('scan_file_attachment', actor, 'error', {
            driveId: args.driveId,
            siteKey: verdict.siteKey,
            refusedBy: 'destination-policy',
          })
          return failureResult({
            reasonCode: 'POLICY_BLOCKED',
            message: `Refused to file into this destination. ${verdict.reason}`,
            evidence:
              `Graph reports the drive's own webUrl as ${drive.webUrl ?? '(none)'}, which resolves to ` +
              `${verdict.siteKey ?? 'no site path'} (${verdict.kind}). The verdict comes from that URL, not ` +
              `from anything the caller supplied.`,
            remediation:
              'This guardrail HELD — do not look for a way around it. Pick a department site, or file the ' +
              'scan to Kurtis\'s OneDrive Scans/_Needs Review if the document could not be identified.',
            surface: 'scan_filer',
            tool: 'scan_file_attachment',
            details: { siteKey: verdict.siteKey, destinationKind: verdict.kind },
          })
        }

        const parent = await getDriveItem(args.driveId, args.parentItemId)
        if (!parent.isFolder) {
          return failureResult({
            reasonCode: 'INVALID_INPUT',
            message:
              `parentItemId ${args.parentItemId} is "${parent.name ?? 'unnamed'}", which is not a folder. ` +
              `A scan is filed INTO a folder; passing a file id here would be an attempt to write over it.`,
            remediation:
              'Pass the item id of the destination FOLDER. A folder item reports a "folder" facet; a ' +
              'document does not.',
            surface: 'scan_filer',
            tool: 'scan_file_attachment',
          })
        }

        const { bytes, meta, message, artifact } = await fetchScanAttachment(
          args.messageId,
          args.attachmentId
        )

        const upload = await uploadScanFile({
          driveId: args.driveId,
          parentItemId: args.parentItemId,
          filename: nameCheck.filename,
          bytes,
          conflictBehavior: args.conflictBehavior ?? 'rename',
        })

        const warnings = [...verdict.warnings]
        if (upload.renamed) {
          warnings.push(
            `The destination already held "${nameCheck.filename}", so SharePoint filed this copy as ` +
              `"${upload.name}". Check whether this scan is a duplicate of the existing document before ` +
              `logging it as a new filing.`
          )
        }
        if (!upload.verified) {
          warnings.push(
            `Read-back did not confirm the expected size (${bytes.byteLength} bytes sent, ` +
              `${upload.size ?? 'unknown'} read back). Do not tell anyone this scan is filed until the ` +
              `document has been opened in SharePoint.`
          )
        }

        auditScanWrite('scan_file_attachment', actor, 'success', {
          messageId: args.messageId,
          attachmentId: args.attachmentId,
          driveId: args.driveId,
          parentItemId: args.parentItemId,
          itemId: upload.itemId,
          siteKey: verdict.siteKey,
          destinationKind: verdict.kind,
          bytes: bytes.byteLength,
          verified: upload.verified,
          renamed: upload.renamed,
          uploadPath: upload.uploadPath,
        })

        return ok({
          filed: upload.verified,
          itemId: upload.itemId,
          fileName: upload.name,
          webUrl: upload.webUrl,
          sizeBytes: upload.size,
          verified: upload.verified,
          renamed: upload.renamed,
          uploadPath: upload.uploadPath,
          destination: {
            driveName: drive.name,
            driveWebUrl: drive.webUrl,
            folder: parent.name,
            folderWebUrl: parent.webUrl,
            siteKey: verdict.siteKey,
            kind: verdict.kind,
            label: verdict.label,
            reason: verdict.reason,
          },
          source: {
            originalFilename: meta.name,
            messageId: message.id,
            messageWebLink: message.webLink,
            receivedDateTime: message.receivedDateTime,
            bytes: bytes.byteLength,
            reportedSize: meta.size,
            integrity: artifact,
          },
          warnings,
          nextStep:
            'Record this in the scan log with scan_log_append (use webUrl for "Filed to" and ' +
            'messageWebLink for "Source email"). Notify Rio only for a work document, and only now that ' +
            'the upload is verified.',
        })
      } catch (e) {
        auditScanWrite('scan_file_attachment', actor, 'error', {
          messageId: args.messageId,
          driveId: args.driveId,
          error: e instanceof Error ? e.message : String(e),
        })
        return fail(e, 'scan_file_attachment')
      }
    }
  )

  // ── Log ───────────────────────────────────────────────────────────────────
  server.registerTool(
    'scan_log_append',
    {
      title: 'Scan: append a row to the scan log',
      description:
        'WRITE (direct). Append ONE row to the scan log workbook. The Scan ID is computed as the next ' +
        'SCAN-NNNN from the sheet\'s own Scan ID column — never pass one. ' +
        'The row width and column ORDER come from the table\'s LIVE header row on every call, so a column ' +
        'Kurtis adds to the sheet does not break this tool: any column no parameter fills is left blank ' +
        'and reported in unmappedColumns. Surface that list, because a blank there may be a column ' +
        'somebody expects to be filled. ' +
        'Append-only — it never overwrites an existing row — and read-back verified. ' +
        'Log EVERY processed scan, including one that could not be identified and one that was routed to ' +
        '_Needs Review. Log a run that found no scans too, as a note: a scanner that silently stops ' +
        'producing email looks exactly like a quiet week. ' +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {
        originalFilename: z
          .string()
          .describe('The scanner\'s own filename, e.g. 20260907_090410_Raven_Scan.pdf'),
        identifiedAs: z
          .string()
          .describe(
            'What the document was determined to be. If it could not be determined, say that here rather ' +
              'than writing a guess.'
          ),
        sourceEmail: z.string().describe('Outlook webLink for the source message (a clickable link)'),
        received: z
          .string()
          .optional()
          .describe('Message receivedDateTime (ISO). Stored as Eastern local time.'),
        renamedTo: z.string().optional().describe('The final filename it was filed under'),
        filedTo: z
          .string()
          .optional()
          .describe('The webUrl returned by scan_file_attachment (a clickable link)'),
        rioNotified: z
          .enum(RIO_NOTIFIED_VALUES)
          .optional()
          .describe(
            'Yes if Rio was messaged, No if a work document was filed and he has not been told yet, ' +
              'N/A for a personal document (he has no use for those).'
          ),
        confidence: z
          .enum(CONFIDENCE_VALUES)
          .optional()
          .describe('High or Low — Low means the identification is not settled.'),
        notes: z
          .string()
          .optional()
          .describe(
            'Why it went where it went, when that is not obvious: routed to _Needs Review, filed to an ' +
              'unconfirmed site, a possible duplicate, a zero-scan run.'
          ),
      },
    },
    async (args: any, extra: any) => {
      const actor = emailOf(extra)
      try {
        const result = await appendScanLogRow({
          originalFilename: args.originalFilename,
          identifiedAs: args.identifiedAs,
          sourceEmail: args.sourceEmail,
          received: args.received,
          renamedTo: args.renamedTo,
          filedTo: args.filedTo,
          rioNotified: args.rioNotified,
          confidence: args.confidence,
          notes: args.notes,
        })
        auditScanWrite('scan_log_append', actor, 'success', {
          scanId: result.scanId,
          rowIndex: result.rowIndex,
          verified: result.verified,
          duplicateScanIdDetected: result.duplicateScanIdDetected,
          tableColumnCount: result.tableColumns.length,
          unmappedColumnCount: result.unmappedColumns.length,
        })
        return ok(result)
      } catch (e) {
        auditScanWrite('scan_log_append', actor, 'error', {
          error: e instanceof Error ? e.message : String(e),
        })
        return fail(e, 'scan_log_append')
      }
    }
  )

  server.registerTool(
    'scan_log_columns',
    {
      title: 'Scan: report the scan log\'s live shape',
      description:
        'READ. Report the scan log table\'s LIVE header row, its row count, the last Scan ID used and the ' +
        'next one, plus which columns scan_log_append can and cannot fill. WRITES NOTHING. ' +
        'Call this to inspect or set up the log — attempting an append and reading the error is not a way ' +
        'to find out what a workbook looks like. ' +
        `Expected headers when creating the workbook: ${SCAN_LOG_HEADER_ROW.join(' | ')}. ` +
        FAILURE_ENVELOPE_TOOL_NOTE,
      inputSchema: {},
    },
    async () => {
      try {
        return ok({ ...(await describeScanLogTable()), expectedHeaders: SCAN_LOG_HEADER_ROW })
      } catch (e) {
        return fail(e, 'scan_log_columns')
      }
    }
  )
}
