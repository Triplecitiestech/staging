// src/lib/scan-filing/render.ts
//
// Turning a scanned PDF into something Claude can actually read.
//
// THE CONSTRAINT THAT SHAPED THIS. The obvious design — hand the model the
// attachment as base64 — is not viable: a typical Raven scan is ~936,000 bytes,
// which is ~1,248,000 base64 characters, on the order of 400,000 tokens for one
// document. Eight scans arrived between 08:34 and 10:05 on 2026-09-07 alone.
// So bytes never pass through the conversation. Pages are rendered here, on the
// server, and returned as MCP image content blocks: a letter page at 150 DPI is
// 1275x1650, roughly 3,000 tokens as an image rather than 400,000 as text.
//
// AND THE OTHER ONE. Two already-filed Raven PDFs returned zero extracted text,
// and the SharePoint index only ever matches the literal string "Raven_Scan" and
// never document body text — so these scans generally have no text layer and
// something has to look at the pixels. Where a text layer IS present it is both
// cheaper and more precise, so this module checks first and only rasterises when
// text cannot carry the document. It reports which path it took and why, every
// time: "no text found" and "I did not look" must never be indistinguishable.
//
// The renderer is MuPDF (WASM, no native binary, no external process), loaded by
// dynamic import so that a packaging failure degrades to ONE tool reporting a
// missing module instead of taking down the whole connector route.

import { throwClassified } from '@/lib/connector/failure-envelope'
import { deflateSync } from 'node:zlib'

// ---------------------------------------------------------------------------
// Tunables (named, so a threshold is reviewable rather than buried in a branch)
// ---------------------------------------------------------------------------

/** Default render resolution. A letter page lands at 1275x1650. */
export const DEFAULT_DPI = 150
export const MIN_DPI = 72
export const MAX_DPI = 300

/** Default page cap. Raven scans are short; the cap protects context, not correctness. */
export const DEFAULT_MAX_PAGES = 3
export const MAX_PAGES_CEILING = 10

/**
 * Long-edge pixel cap. Claude downscales an image whose long edge exceeds 1568
 * px, so rendering beyond it spends bytes on detail that is thrown away before
 * the model ever sees it. A US-letter page at 150 DPI is 1650 px tall, so this
 * does bite — by a little, deliberately: the alternative is paying for an
 * upload that is immediately resampled.
 */
export const MAX_LONG_EDGE_PX = 1568

/**
 * How much extractable text makes the text path trustworthy.
 *
 * Set high on purpose. A scanned page often carries a SLIVER of real text — a
 * fax header, a stamped page number, an OCR artefact — and a low threshold
 * would return those few characters as though they were the document, which is
 * the worst outcome available here: confident, cheap, and wrong. Below these
 * numbers the pixels are the evidence.
 */
export const TEXT_MODE_MIN_TOTAL_CHARS = 200
export const TEXT_MODE_MIN_FIRST_PAGE_CHARS = 100

/** Cap on returned text, so a 200-page text PDF cannot flood the context. */
export const MAX_TEXT_CHARS = 20_000

/** JPEG quality for the rasterised page. */
const JPEG_QUALITY = 80

// ---------------------------------------------------------------------------
// Pure planning helpers
// ---------------------------------------------------------------------------

export interface RenderPlan {
  dpi: number
  maxPages: number
  notes: string[]
}

/** Clamp caller input into the supported range, saying so when a value moved. */
export function planRender(input: { dpi?: number; maxPages?: number }): RenderPlan {
  const notes: string[] = []

  let dpi = Math.round(input.dpi ?? DEFAULT_DPI)
  if (!Number.isFinite(dpi)) dpi = DEFAULT_DPI
  if (dpi < MIN_DPI) {
    notes.push(`dpi ${input.dpi} raised to the ${MIN_DPI} minimum.`)
    dpi = MIN_DPI
  } else if (dpi > MAX_DPI) {
    notes.push(`dpi ${input.dpi} lowered to the ${MAX_DPI} maximum.`)
    dpi = MAX_DPI
  }

  let maxPages = Math.round(input.maxPages ?? DEFAULT_MAX_PAGES)
  if (!Number.isFinite(maxPages)) maxPages = DEFAULT_MAX_PAGES
  if (maxPages < 1) {
    notes.push(`maxPages ${input.maxPages} raised to 1.`)
    maxPages = 1
  } else if (maxPages > MAX_PAGES_CEILING) {
    notes.push(`maxPages ${input.maxPages} lowered to the ${MAX_PAGES_CEILING} ceiling.`)
    maxPages = MAX_PAGES_CEILING
  }

  return { dpi, maxPages, notes }
}

/**
 * Scale factor for one page, honouring the requested DPI but never producing an
 * image longer than MAX_LONG_EDGE_PX on its long edge.
 */
export function scaleForPage(
  widthPt: number,
  heightPt: number,
  dpi: number
): { scale: number; cappedByLongEdge: boolean } {
  const base = dpi / 72
  const longEdgePt = Math.max(widthPt, heightPt)
  if (longEdgePt <= 0) return { scale: base, cappedByLongEdge: false }
  const longEdgePx = longEdgePt * base
  if (longEdgePx <= MAX_LONG_EDGE_PX) return { scale: base, cappedByLongEdge: false }
  return { scale: MAX_LONG_EDGE_PX / longEdgePt, cappedByLongEdge: true }
}

export type RenderMode = 'text' | 'images'

export interface ModeDecision {
  mode: RenderMode
  reason: string
}

/**
 * Choose the text path or the image path from what the text layer actually
 * yielded. `requested` forces a path; 'auto' applies the thresholds above.
 */
export function decideMode(input: {
  requested: 'auto' | RenderMode
  totalTextChars: number
  firstPageTextChars: number
}): ModeDecision {
  const { requested, totalTextChars, firstPageTextChars } = input

  if (requested === 'text') {
    return {
      mode: 'text',
      reason:
        totalTextChars >= TEXT_MODE_MIN_TOTAL_CHARS
          ? `Text path forced by the caller; the document yielded ${totalTextChars} characters.`
          : `Text path FORCED by the caller, but the document yielded only ${totalTextChars} characters — ` +
            `too few to identify it. Call again with mode "images" before concluding anything about this scan.`,
    }
  }
  if (requested === 'images') {
    return { mode: 'images', reason: 'Image path forced by the caller.' }
  }

  if (totalTextChars >= TEXT_MODE_MIN_TOTAL_CHARS && firstPageTextChars >= TEXT_MODE_MIN_FIRST_PAGE_CHARS) {
    return {
      mode: 'text',
      reason:
        `The PDF has a usable text layer (${totalTextChars} characters total, ${firstPageTextChars} on page 1), ` +
        `so the text is returned instead of page images — cheaper and more precise than reading pixels.`,
    }
  }

  return {
    mode: 'images',
    reason:
      `The PDF has no usable text layer (${totalTextChars} characters total, ${firstPageTextChars} on page 1; ` +
      `the thresholds are ${TEXT_MODE_MIN_TOTAL_CHARS} and ${TEXT_MODE_MIN_FIRST_PAGE_CHARS}). Pages are ` +
      `returned as images. A handful of characters on a scan is usually a fax header or an OCR artefact, ` +
      `not the document, which is why the bar is set where it is.`,
  }
}

/** Trim returned text to the cap, saying so rather than truncating silently. */
export function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false }
  return {
    text:
      text.slice(0, MAX_TEXT_CHARS) +
      `\n\n[TRUNCATED at ${MAX_TEXT_CHARS} characters of ${text.length}.]`,
    truncated: true,
  }
}

// ---------------------------------------------------------------------------
// MuPDF loading
// ---------------------------------------------------------------------------

// Deliberately loose: the mupdf typings are not worth modelling here, and the
// only surface used is documented and exercised by the probe.
/* eslint-disable @typescript-eslint/no-explicit-any */
type MuPdf = any

let muPdfPromise: Promise<MuPdf> | null = null

/**
 * Load MuPDF once per instance.
 *
 * A load failure is a CONNECTOR problem (a WASM asset that did not survive
 * bundling), not a vendor limit and not a caller error, so it is reported as
 * NOT_IMPLEMENTED with the module name in the evidence — the one classification
 * that routes it to whoever can fix the packaging.
 */
export async function loadMuPdf(): Promise<MuPdf> {
  if (!muPdfPromise) {
    muPdfPromise = import('mupdf').catch((err) => {
      muPdfPromise = null
      throw err
    })
  }
  try {
    return await muPdfPromise
  } catch (err) {
    throwClassified({
      reasonCode: 'NOT_IMPLEMENTED',
      message:
        'The PDF renderer could not be loaded, so this scan cannot be turned into page images.',
      evidence: `import("mupdf") failed: ${err instanceof Error ? err.message : String(err)}`,
      remediation:
        'This is a deployment/packaging problem in the connector, not a permissions or vendor issue. ' +
        'Report it to Kurtis as a build task: the mupdf WASM asset is not reaching the serverless bundle. ' +
        'scan_probe_render reports the same fact without needing a real scan.',
      surface: 'scan_filer',
    })
  }
}

/** Whether the renderer is available, and its version — for the probe. */
export async function renderEngineStatus(): Promise<{
  available: boolean
  detail: string
}> {
  try {
    const mupdf = await loadMuPdf()
    const v =
      typeof mupdf.installedFonts === 'object' || typeof mupdf.Document?.openDocument === 'function'
        ? 'Document.openDocument present'
        : 'module loaded but Document.openDocument is missing'
    return { available: true, detail: `mupdf loaded (${v}).` }
  } catch (err) {
    return {
      available: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderedPage {
  pageNumber: number
  widthPx: number
  heightPx: number
  /** 'image/jpeg' or 'image/png' — whichever encoded smaller for this page. */
  mimeType: string
  /** Base64 image payload for the MCP image content block. */
  base64: string
  bytes: number
  cappedByLongEdge: boolean
}

export interface RenderResult {
  pageCount: number
  pagesRendered: number
  mode: RenderMode
  modeReason: string
  /** Extracted text — always reported, even when the image path was taken. */
  text: string
  textChars: number
  firstPageTextChars: number
  textTruncated: boolean
  images: RenderedPage[]
  dpi: number
  notes: string[]
}

/**
 * Extract text and, when the text cannot carry the document, rasterise pages.
 *
 * Text is ALWAYS extracted and reported, even on the image path, because
 * "0 characters" is the finding that justifies rasterising — reporting it makes
 * the choice auditable instead of asking the reader to trust it.
 */
export async function renderPdf(
  bytes: Uint8Array,
  opts: { dpi?: number; maxPages?: number; mode?: 'auto' | RenderMode } = {}
): Promise<RenderResult> {
  const plan = planRender(opts)
  const notes = [...plan.notes]
  const mupdf = await loadMuPdf()

  let doc: any
  try {
    doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  } catch (err) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: 'The attachment could not be opened as a PDF.',
      evidence: `mupdf.Document.openDocument threw: ${err instanceof Error ? err.message : String(err)}`,
      remediation:
        'Confirm the attachment really is the scanner PDF. A Raven scan email carries exactly one ' +
        'application/pdf attachment; an inline image or a signature graphic is not it.',
      surface: 'scan_filer',
    })
  }

  const pageCount: number = doc.countPages()
  if (pageCount <= 0) {
    throwClassified({
      reasonCode: 'INVALID_INPUT',
      message: 'The PDF opened but reports zero pages.',
      surface: 'scan_filer',
      remediation: 'Open the message in Outlook and check the attachment is not a truncated download.',
    })
  }

  const pagesToTouch = Math.min(pageCount, plan.maxPages)

  // Pass 1: text. Cheap, and its result decides whether pass 2 happens at all.
  const perPageText: string[] = []
  for (let i = 0; i < pagesToTouch; i++) {
    const page = doc.loadPage(i)
    try {
      const st = page.toStructuredText('preserve-whitespace')
      perPageText.push(String(st.asText() ?? ''))
    } catch {
      perPageText.push('')
    } finally {
      destroy(page)
    }
  }
  const joined = perPageText
    .map((t, i) => (pagesToTouch > 1 ? `--- page ${i + 1} ---\n${t}` : t))
    .join('\n\n')
    .trim()
  const totalTextChars = countMeaningful(perPageText.join(''))
  const firstPageTextChars = countMeaningful(perPageText[0] ?? '')

  const decision = decideMode({
    requested: opts.mode ?? 'auto',
    totalTextChars,
    firstPageTextChars,
  })
  const capped = capText(joined)

  const images: RenderedPage[] = []
  if (decision.mode === 'images') {
    for (let i = 0; i < pagesToTouch; i++) {
      images.push(renderOnePage(mupdf, doc, i, plan.dpi))
    }
  }

  if (pageCount > pagesToTouch) {
    notes.push(
      `The document has ${pageCount} pages; ${pagesToTouch} were processed (maxPages). Raise maxPages if ` +
        `the document type is not clear from what came back — but a scan whose type needs 6 pages to ` +
        `establish probably belongs in _Needs Review.`
    )
  }

  return {
    pageCount,
    pagesRendered: images.length,
    mode: decision.mode,
    modeReason: decision.reason,
    text: capped.text,
    textChars: totalTextChars,
    firstPageTextChars,
    textTruncated: capped.truncated,
    images,
    dpi: plan.dpi,
    notes,
  }
}

function renderOnePage(mupdf: MuPdf, doc: any, index: number, dpi: number): RenderedPage {
  const page = doc.loadPage(index)
  let pix: any = null
  try {
    const bounds = page.getBounds() as number[]
    const widthPt = Math.abs((bounds?.[2] ?? 612) - (bounds?.[0] ?? 0))
    const heightPt = Math.abs((bounds?.[3] ?? 792) - (bounds?.[1] ?? 0))
    const { scale, cappedByLongEdge } = scaleForPage(widthPt, heightPt, dpi)

    pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)

    // Encode both and keep the smaller. A line-art scan compresses better as
    // PNG; a photographic one as JPEG. Guessing from the document type would be
    // a guess; the byte count is a measurement, and the second encode is cheap
    // next to the rasterise that already happened.
    const png: Uint8Array = pix.asPNG()
    let best: { mime: string; data: Uint8Array } = { mime: 'image/png', data: png }
    try {
      const jpeg: Uint8Array = pix.asJPEG(JPEG_QUALITY, false)
      if (jpeg.length < png.length) best = { mime: 'image/jpeg', data: jpeg }
    } catch {
      // JPEG encoder unavailable in this build — PNG already works.
    }

    return {
      pageNumber: index + 1,
      widthPx: pix.getWidth(),
      heightPx: pix.getHeight(),
      mimeType: best.mime,
      base64: Buffer.from(best.data).toString('base64'),
      bytes: best.data.length,
      cappedByLongEdge,
    }
  } finally {
    destroy(pix)
    destroy(page)
  }
}

function destroy(o: any): void {
  try {
    o?.destroy?.()
  } catch {
    // Freeing is best-effort; a failure here must not mask the real result.
  }
}

/** Non-whitespace character count — whitespace is not evidence of a text layer. */
export function countMeaningful(text: string): number {
  return text.replace(/\s+/g, '').length
}

// ---------------------------------------------------------------------------
// Artifact validation
// ---------------------------------------------------------------------------
//
// WHAT THIS REPLACED, AND WHY. The first integrity guard compared the length of
// the /$value body against the `size` field on the attachment collection, and
// called any difference a short download. Live, that rejected 8 of 8 real scans:
// the shortfall was EXACTLY 392 bytes across 7 files ranging 155,669 to
// 1,565,339 bytes, and byte-identical on retry. A constant offset independent of
// file size is an envelope, not data loss — those two fields measure different
// things for a fileAttachment, and Microsoft does not document which one `size`
// counts. The guard was measuring the wrong quantity, so it failed 100% of the
// time and told the caller to retry a call that could never succeed.
//
// The intent was right and is kept: do not file a truncated PDF. The measurement
// is now the ARTIFACT itself, which is what the intent was always about —
// a %PDF- header, a %%EOF trailer, and MuPDF opening it with at least one page.
//
// There is deliberately NO 392-byte tolerance. The constant is undocumented and
// may differ by attachment type or tenant; encoding it would replace a wrong
// measurement with a fragile one.

/** How far back from the end to look for the EOF marker. */
const EOF_SEARCH_WINDOW = 2048

/** Does the byte stream start with the PDF magic number? */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  if (!bytes || bytes.byteLength < 5) return false
  // "%PDF-" — the spec allows leading junk, but Raven output does not have any,
  // and accepting arbitrary leading bytes would weaken the check for no gain.
  return (
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  )
}

/**
 * Does the stream carry a %%EOF trailer near its end?
 *
 * This is the check that actually catches truncation: a cut-off PDF keeps its
 * header and loses its tail. Incremental updates leave several %%EOF markers,
 * so the LAST one is what matters, and trailing whitespace after it is legal.
 */
export function hasPdfEof(bytes: Uint8Array): boolean {
  if (!bytes || bytes.byteLength < 5) return false
  const start = Math.max(0, bytes.byteLength - EOF_SEARCH_WINDOW)
  const tail = Buffer.from(bytes.buffer, bytes.byteOffset + start, bytes.byteLength - start)
  return tail.lastIndexOf('%%EOF', undefined, 'latin1') !== -1
}

export interface PdfArtifactVerdict {
  ok: boolean
  headerOk: boolean
  eofOk: boolean
  /** Page count from MuPDF, or null when the renderer could not be consulted. */
  pageCount: number | null
  /** true / false / null — null means NOT CHECKED, never "assumed fine". */
  openable: boolean | null
  /** Why openable is null, when it is. */
  openabilityNote?: string
  problems: string[]
}

/**
 * Validate that these bytes are a complete, openable PDF.
 *
 * The MuPDF step degrades rather than blocks: if the renderer cannot be loaded
 * at all, `openable` is null with a stated reason and the two structural checks
 * still stand. Filing a scan should not become impossible because the RENDERER
 * is missing — but "not checked" must never be reported as "fine", which is why
 * it is a third state and not a default true.
 */
export async function validatePdfArtifact(bytes: Uint8Array): Promise<PdfArtifactVerdict> {
  const problems: string[] = []
  const headerOk = hasPdfHeader(bytes)
  const eofOk = hasPdfEof(bytes)

  if (!headerOk) problems.push('The file does not begin with the PDF magic number "%PDF-".')
  if (!eofOk) {
    problems.push(
      `No "%%EOF" trailer in the last ${EOF_SEARCH_WINDOW} bytes — the file is truncated or is not a PDF.`
    )
  }

  let pageCount: number | null = null
  let openable: boolean | null = null
  let openabilityNote: string | undefined

  if (headerOk) {
    try {
      const mupdf = await loadMuPdf()
      let doc: any = null
      try {
        doc = mupdf.Document.openDocument(bytes, 'application/pdf')
        pageCount = doc.countPages()
        openable = typeof pageCount === 'number' && pageCount >= 1
        if (!openable) problems.push(`MuPDF opened the file but reports ${pageCount} pages.`)
      } catch (err) {
        openable = false
        problems.push(
          `MuPDF could not open the file: ${err instanceof Error ? err.message : String(err)}`
        )
      } finally {
        try {
          doc?.destroy?.()
        } catch {
          /* freeing is best-effort */
        }
      }
    } catch (err) {
      // The renderer itself is unavailable — a packaging problem, not a problem
      // with this document. Report it as unchecked rather than failing the file.
      openabilityNote =
        `The PDF renderer could not be loaded, so openability was NOT checked ` +
        `(${err instanceof Error ? err.message : String(err)}). The structural checks above still applied.`
    }
  }

  return {
    ok: headerOk && eofOk && openable !== false,
    headerOk,
    eofOk,
    pageCount,
    openable,
    ...(openabilityNote ? { openabilityNote } : {}),
    problems,
  }
}

// ---------------------------------------------------------------------------
// Probe image (no PDF, no credentials, no MuPDF)
// ---------------------------------------------------------------------------
//
// scan_probe_render answers ONE question — do MCP image content blocks reach the
// model through this connector? — and it must answer it without depending on
// anything else, because the whole pipeline design is gated on that answer and
// the alternative (a paid OCR service) is provisioned only if it is "no".
//
// So the probe draws its own image from scratch and prints a code in it. If the
// caller reads the code back correctly, images render AND are legible. A probe
// that only returned "an image block was produced" would prove that the CONNECTOR
// built one, which was never the thing in doubt.

/** 5x7 bitmaps, one string per row, '#' = ink. Digits only — that is all the code needs. */
const DIGIT_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
}

const GLYPH_W = 5
const GLYPH_H = 7

export interface ProbeImage {
  code: string
  widthPx: number
  heightPx: number
  mimeType: 'image/png'
  base64: string
  bytes: number
}

/**
 * Build a PNG containing `code` in large block digits on a white field.
 * `code` must be digits — the glyph table has nothing else, on purpose.
 */
export function buildProbeImage(code: string, pixelSize = 12, margin = 24): ProbeImage {
  const digits = [...code].filter((c) => DIGIT_GLYPHS[c])
  if (digits.length === 0) throw new Error('Probe code must contain at least one digit 0-9.')

  const gap = 1
  const cols = digits.length * GLYPH_W + (digits.length - 1) * gap
  const width = cols * pixelSize + margin * 2
  const height = GLYPH_H * pixelSize + margin * 2

  // White RGB canvas.
  const rgb = new Uint8Array(width * height * 3).fill(255)

  digits.forEach((d, di) => {
    const glyph = DIGIT_GLYPHS[d]
    const colOffset = di * (GLYPH_W + gap)
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = glyph[gy]
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (row[gx] !== '#') continue
        const x0 = margin + (colOffset + gx) * pixelSize
        const y0 = margin + gy * pixelSize
        for (let py = 0; py < pixelSize; py++) {
          for (let px = 0; px < pixelSize; px++) {
            const off = ((y0 + py) * width + (x0 + px)) * 3
            rgb[off] = 0
            rgb[off + 1] = 0
            rgb[off + 2] = 0
          }
        }
      }
    }
  })

  const png = encodePng(rgb, width, height)
  return {
    code: digits.join(''),
    widthPx: width,
    heightPx: height,
    mimeType: 'image/png',
    base64: Buffer.from(png).toString('base64'),
    bytes: png.length,
  }
}

/** Minimal 8-bit truecolour PNG encoder. No dependency, ~40 lines, exact. */
export function encodePng(rgb: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type 0 (None)
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(raw)),
      pngChunk('IEND', Buffer.alloc(0)),
    ])
  )
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([len, typeAndData, crc])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
