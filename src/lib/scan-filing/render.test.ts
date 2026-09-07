// src/lib/scan-filing/render.test.ts
//
// Covers the decisions that determine whether a scan gets read correctly or
// expensively, and the probe image that answers whether image blocks work at
// all. The MuPDF path itself is exercised end-to-end here against a PDF built
// in the test, so a packaging regression fails locally rather than in
// production on the first real scan.

import { describe, it, expect } from 'vitest'
import { deflateSync, inflateSync } from 'node:zlib'
import {
  buildProbeImage,
  capText,
  countMeaningful,
  decideMode,
  encodePng,
  planRender,
  renderPdf,
  scaleForPage,
  DEFAULT_DPI,
  DEFAULT_MAX_PAGES,
  MAX_DPI,
  MAX_LONG_EDGE_PX,
  MAX_PAGES_CEILING,
  MAX_TEXT_CHARS,
  MIN_DPI,
  TEXT_MODE_MIN_FIRST_PAGE_CHARS,
  TEXT_MODE_MIN_TOTAL_CHARS,
} from './render'

describe('planRender', () => {
  it('uses the documented defaults when nothing is asked for', () => {
    expect(planRender({})).toEqual({ dpi: DEFAULT_DPI, maxPages: DEFAULT_MAX_PAGES, notes: [] })
  })

  it('clamps out-of-range values and SAYS it moved them', () => {
    const p = planRender({ dpi: 5000, maxPages: 900 })
    expect(p.dpi).toBe(MAX_DPI)
    expect(p.maxPages).toBe(MAX_PAGES_CEILING)
    expect(p.notes).toHaveLength(2)
  })

  it('clamps upward too', () => {
    const p = planRender({ dpi: 10, maxPages: 0 })
    expect(p.dpi).toBe(MIN_DPI)
    expect(p.maxPages).toBe(1)
  })

  it('survives NaN rather than producing a NaN-sized render', () => {
    expect(planRender({ dpi: Number.NaN, maxPages: Number.NaN })).toMatchObject({
      dpi: DEFAULT_DPI,
      maxPages: DEFAULT_MAX_PAGES,
    })
  })
})

describe('scaleForPage', () => {
  it('honours the requested DPI when the page fits under the long-edge cap', () => {
    // A5 at 150 DPI is well under the cap.
    const { scale, cappedByLongEdge } = scaleForPage(420, 595, 150)
    expect(scale).toBeCloseTo(150 / 72)
    expect(cappedByLongEdge).toBe(false)
  })

  it('caps a US-letter page at the size the model would resize it to anyway', () => {
    const { scale, cappedByLongEdge } = scaleForPage(612, 792, 150)
    expect(cappedByLongEdge).toBe(true)
    expect(792 * scale).toBeCloseTo(MAX_LONG_EDGE_PX)
  })

  it('caps by the LONG edge on a landscape page, not by height', () => {
    const { scale } = scaleForPage(792, 612, 300)
    expect(792 * scale).toBeCloseTo(MAX_LONG_EDGE_PX)
  })

  it('does not divide by zero on a degenerate page', () => {
    expect(scaleForPage(0, 0, 150).scale).toBeCloseTo(150 / 72)
  })
})

describe('decideMode', () => {
  it('takes the image path when the scan has no text layer at all', () => {
    const d = decideMode({ requested: 'auto', totalTextChars: 0, firstPageTextChars: 0 })
    expect(d.mode).toBe('images')
    expect(d.reason).toContain('no usable text layer')
  })

  it('takes the IMAGE path for a sliver of text — a fax header is not the document', () => {
    const d = decideMode({
      requested: 'auto',
      totalTextChars: TEXT_MODE_MIN_TOTAL_CHARS - 1,
      firstPageTextChars: TEXT_MODE_MIN_FIRST_PAGE_CHARS - 1,
    })
    expect(d.mode).toBe('images')
  })

  it('requires BOTH thresholds — a text-heavy page 2 does not vouch for a scanned page 1', () => {
    const d = decideMode({
      requested: 'auto',
      totalTextChars: 5000,
      firstPageTextChars: TEXT_MODE_MIN_FIRST_PAGE_CHARS - 1,
    })
    expect(d.mode).toBe('images')
  })

  it('takes the text path for a real text layer', () => {
    const d = decideMode({ requested: 'auto', totalTextChars: 4000, firstPageTextChars: 1200 })
    expect(d.mode).toBe('text')
  })

  it('honours a forced mode but WARNS when forced text found almost nothing', () => {
    const d = decideMode({ requested: 'text', totalTextChars: 3, firstPageTextChars: 3 })
    expect(d.mode).toBe('text')
    expect(d.reason).toContain('too few to identify it')
  })

  it('always reports the character counts, so "found none" is distinguishable from "did not look"', () => {
    expect(decideMode({ requested: 'auto', totalTextChars: 0, firstPageTextChars: 0 }).reason).toContain(
      '0 characters'
    )
  })
})

describe('countMeaningful and capText', () => {
  it('does not count whitespace as evidence of a text layer', () => {
    expect(countMeaningful('   \n\t  \n ')).toBe(0)
    expect(countMeaningful(' a b\tc\n')).toBe(3)
  })

  it('leaves short text alone', () => {
    expect(capText('hello')).toEqual({ text: 'hello', truncated: false })
  })

  it('says so when it truncates rather than trimming silently', () => {
    const r = capText('x'.repeat(MAX_TEXT_CHARS + 500))
    expect(r.truncated).toBe(true)
    expect(r.text).toContain('[TRUNCATED at')
  })
})

describe('probe image', () => {
  it('produces a decodable PNG whose header matches the reported size', () => {
    const img = buildProbeImage('1234')
    const png = Buffer.from(img.base64, 'base64')

    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    // IHDR body starts at byte 16: width, height, depth, colour type.
    expect(png.readUInt32BE(16)).toBe(img.widthPx)
    expect(png.readUInt32BE(20)).toBe(img.heightPx)
    expect(png[24]).toBe(8)
    expect(png[25]).toBe(2)
    expect(img.bytes).toBe(png.length)
    expect(img.mimeType).toBe('image/png')
  })

  it('actually draws the digits — a blank image would make the probe meaningless', () => {
    const blank = buildProbeImage('1')
    // The '1' glyph inks 13 of 35 cells; a canvas with no black pixels would
    // still be a valid PNG and would silently pass a shape-only check.
    const dark = countDarkPixels(blank)
    expect(dark).toBeGreaterThan(0)

    // More ink for a digit with more strokes.
    expect(countDarkPixels(buildProbeImage('8'))).toBeGreaterThan(dark)
  })

  it('widens with the number of digits', () => {
    expect(buildProbeImage('1234').widthPx).toBeGreaterThan(buildProbeImage('12').widthPx)
    expect(buildProbeImage('1234').heightPx).toBe(buildProbeImage('12').heightPx)
  })

  it('refuses a code it cannot draw rather than returning an empty image', () => {
    expect(() => buildProbeImage('abc')).toThrow(/at least one digit/)
  })

  it('encodePng round-trips the exact pixels it was given', () => {
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0])
    const png = encodePng(rgb, 2, 2)
    expect(decodeRawScanlines(Buffer.from(png), 2, 2)).toEqual(Array.from(rgb))
  })
})

/** Count non-white pixels by inflating the IDAT and stripping filter bytes. */
function countDarkPixels(img: { base64: string; widthPx: number; heightPx: number }): number {
  const px = decodeRawScanlines(Buffer.from(img.base64, 'base64'), img.widthPx, img.heightPx)
  let dark = 0
  for (let i = 0; i < px.length; i += 3) {
    if (px[i] < 128 && px[i + 1] < 128 && px[i + 2] < 128) dark++
  }
  return dark
}

/** Pull the RGB bytes back out of a filter-type-0 truecolour PNG. */
function decodeRawScanlines(png: Buffer, width: number, height: number): number[] {
  // Walk the chunks to find IDAT rather than assuming a fixed offset.
  let offset = 8
  const parts: Buffer[] = []
  while (offset < png.length) {
    const len = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + len))
    offset += 12 + len
  }
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * 3
  const out: number[] = []
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)]).toBe(0) // filter type None
    for (let i = 0; i < stride; i++) out.push(raw[y * (stride + 1) + 1 + i])
  }
  return out
}

describe('renderPdf against a real PDF', () => {
  it('extracts text and takes the TEXT path when the PDF has a text layer', async () => {
    const pdf = await buildTextPdf()
    const r = await renderPdf(pdf, { maxPages: 2 })

    expect(r.pageCount).toBe(2)
    expect(r.mode).toBe('text')
    expect(r.text).toContain('INVOICE 12345')
    expect(r.textChars).toBeGreaterThanOrEqual(TEXT_MODE_MIN_TOTAL_CHARS)
    // The text path must not spend the tokens rendering pages nobody asked for.
    expect(r.images).toHaveLength(0)
    expect(r.pagesRendered).toBe(0)
  })

  it('renders page images when forced, at the documented letter size', async () => {
    const pdf = await buildTextPdf()
    const r = await renderPdf(pdf, { maxPages: 1, mode: 'images' })

    expect(r.pagesRendered).toBe(1)
    const [page] = r.images
    expect(page.pageNumber).toBe(1)
    expect(Math.max(page.widthPx, page.heightPx)).toBe(MAX_LONG_EDGE_PX)
    expect(page.cappedByLongEdge).toBe(true)
    expect(['image/png', 'image/jpeg']).toContain(page.mimeType)
    expect(page.bytes).toBeGreaterThan(0)
    expect(Buffer.from(page.base64, 'base64').length).toBe(page.bytes)
    // Text is still reported on the image path — the count is the evidence
    // that justifies rasterising in the first place.
    expect(r.textChars).toBeGreaterThan(0)
  })

  it('takes the IMAGE path for a PDF with no text layer, which is the normal Raven case', async () => {
    const pdf = await buildImageOnlyPdf()
    const r = await renderPdf(pdf, { maxPages: 1 })

    expect(r.textChars).toBeLessThan(TEXT_MODE_MIN_TOTAL_CHARS)
    expect(r.mode).toBe('images')
    expect(r.pagesRendered).toBe(1)
  })

  it('honours maxPages and says the document was longer', async () => {
    const pdf = await buildTextPdf()
    const r = await renderPdf(pdf, { maxPages: 1, mode: 'images' })
    expect(r.pageCount).toBe(2)
    expect(r.pagesRendered).toBe(1)
    expect(r.notes.join(' ')).toContain('2 pages')
  })

  it('refuses a non-PDF with a routed failure rather than a raw crash', async () => {
    await expect(renderPdf(Buffer.from('this is not a pdf'))).rejects.toMatchObject({
      failure: { reasonCode: 'INVALID_INPUT' },
    })
  })
})

// --- fixtures ---------------------------------------------------------------

/** Two US-letter pages of real text, built with the pdfkit already in the repo. */
async function buildTextPdf(): Promise<Uint8Array> {
  const { default: PDFDocument } = await import('pdfkit')
  const doc = new PDFDocument({ size: 'LETTER' })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()))

  doc.fontSize(24).text('INVOICE 12345', 72, 100)
  doc.fontSize(12).text('Acme Corp Statement of Account. '.repeat(12), 72, 140)
  doc.addPage().fontSize(12).text('Continuation page with more body text. '.repeat(12), 72, 100)
  doc.end()

  await done
  return new Uint8Array(Buffer.concat(chunks))
}

/**
 * A one-page PDF whose only content is a drawn rectangle — the closest thing to
 * a scanner's output that can be built without shipping a binary fixture.
 */
async function buildImageOnlyPdf(): Promise<Uint8Array> {
  const { default: PDFDocument } = await import('pdfkit')
  const doc = new PDFDocument({ size: 'LETTER' })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()))

  doc.rect(72, 72, 400, 500).fill('#cccccc')
  doc.end()

  await done
  return new Uint8Array(Buffer.concat(chunks))
}

// Keeps the import used even if a future edit drops the only deflate call.
void deflateSync
