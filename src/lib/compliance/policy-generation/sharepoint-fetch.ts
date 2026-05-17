/**
 * SharePoint document fetcher — downloads a file from a customer's tenant
 * via Microsoft Graph and extracts plain text for AI policy analysis.
 *
 * Why this exists:
 *   The bulk-import flow used to store `[SHAREPOINT:<webUrl>]` as the
 *   policy content. The downstream AI analyzer then "analyzed" that
 *   ~50-byte placeholder and produced confidently-wrong output that
 *   missed every real control mapping. This module pulls the actual
 *   document bytes and converts them to text so the analyzer sees the
 *   real policy.
 *
 * Preferred path:
 *   The SharePoint scan endpoint already returns the file's Graph
 *   driveId + itemId. Pass those to `fetchSharePointFileText` for a
 *   single-call download — no URL re-parsing, no drive lookup.
 *
 * Fallback path:
 *   For legacy callers that only have a webUrl, `fetchSharePointFileTextByUrl`
 *   re-resolves drive + item via the canonical URL parser, then defers
 *   to the by-id path.
 *
 * Format support:
 *   .txt / .md            → utf-8 decode
 *   .docx                 → mammoth.extractRawText
 *   .pdf                  → pdf-parse (pdfjs-dist under the hood)
 *   .doc / .rtf / other   → throw with a re-save-as-docx message
 */

import { getGraphTokenForCompany } from '@/lib/graph'
import {
  parseSharePointUrl,
  pickMatchingDrive,
  type SharePointDrive,
} from '@/lib/compliance/sharepoint-url'

// Max bytes we'll pull from SharePoint before refusing. Real policies
// run hundreds of KB; a 25MB file is almost certainly a misclick.
const MAX_FILE_BYTES = 25 * 1024 * 1024

// Max bytes of extracted text we'll keep. The downstream Anthropic call
// already substrings to 12k characters, so anything past ~200k is wasted
// DB space and slows analysis. Truncate at the source.
const MAX_TEXT_BYTES = 200_000

export interface SharePointFileRef {
  driveId: string
  itemId: string
  /** Optional — used for extension routing when the file response omits it. */
  fileName?: string
}

export interface FetchedSharePointFile {
  fileName: string
  byteSize: number
  text: string
  /** True when extraction trimmed text to fit within MAX_TEXT_BYTES. */
  truncated: boolean
  /**
   * Original file bytes from SharePoint, preserved so Download .docx
   * can serve a byte-perfect copy of the customer's source document
   * (preserves heading styles, lists, branding, etc. that the text
   * extraction discards).
   */
  bytes: Buffer
  /** MIME type Graph reported for the file, used as the download Content-Type. */
  mimeType: string
}

/**
 * Download a SharePoint file by Graph driveId + itemId and extract text.
 * Throws with a human-readable message on every failure mode.
 */
export async function fetchSharePointFileText(
  companyId: string,
  ref: SharePointFileRef
): Promise<FetchedSharePointFile> {
  const token = await getGraphTokenForCompany(companyId)
  if (!token) {
    throw new Error(
      'M365 credentials are not configured for this company. Connect M365 in the onboarding wizard first.'
    )
  }

  // Step 1 — metadata fetch. Gives us the canonical filename + downloadUrl
  // (a pre-signed URL we can hit without an auth header). The downloadUrl
  // is what Graph itself recommends instead of /content for content > a
  // few MB, because /content goes through the Graph throttling layer.
  const metaUrl = `https://graph.microsoft.com/v1.0/drives/${ref.driveId}/items/${ref.itemId}?$select=id,name,size,@microsoft.graph.downloadUrl,file`
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => '')
    throw new Error(
      `Graph could not load file metadata (${metaRes.status}): ${body.substring(0, 200)}`
    )
  }
  const meta = (await metaRes.json()) as {
    name: string
    size: number
    '@microsoft.graph.downloadUrl'?: string
    file?: { mimeType: string }
  }

  if (meta.size > MAX_FILE_BYTES) {
    throw new Error(
      `File "${meta.name}" is ${(meta.size / 1024 / 1024).toFixed(1)} MB — too large to extract (max 25 MB).`
    )
  }

  const fileName = meta.name || ref.fileName || 'unknown'
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  // Reject unsupported binary formats up front so we don't waste a
  // download. .doc (binary Word 97) and .rtf can be extracted in
  // principle but it's enough of a long tail that we just ask the
  // operator to re-save.
  if (ext === 'doc' || ext === 'rtf') {
    throw new Error(
      `File "${fileName}" is .${ext} — unsupported format. Open it in Word and re-save as .docx, then re-import.`
    )
  }

  // Step 2 — content download. Prefer the pre-signed URL when present
  // (no Authorization header needed, faster), otherwise fall back to
  // the /content endpoint with our bearer token.
  const downloadUrl = meta['@microsoft.graph.downloadUrl']
  const contentRes = downloadUrl
    ? await fetch(downloadUrl, { signal: AbortSignal.timeout(45_000) })
    : await fetch(
        `https://graph.microsoft.com/v1.0/drives/${ref.driveId}/items/${ref.itemId}/content`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(45_000),
          redirect: 'follow',
        }
      )
  if (!contentRes.ok) {
    const body = await contentRes.text().catch(() => '')
    throw new Error(
      `Failed to download "${fileName}" (${contentRes.status}): ${body.substring(0, 200)}`
    )
  }

  const arrayBuffer = await contentRes.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Step 3 — extract based on extension.
  let text: string
  switch (ext) {
    case 'txt':
    case 'md':
      text = buffer.toString('utf-8')
      break
    case 'docx':
      text = await extractDocxText(buffer, fileName)
      break
    case 'pdf':
      text = await extractPdfText(buffer, fileName)
      break
    default:
      throw new Error(
        `File "${fileName}" has an unsupported extension (.${ext || 'none'}). Supported: .txt, .md, .docx, .pdf.`
      )
  }

  const normalized = normalizeWhitespace(text)
  const truncated = normalized.length > MAX_TEXT_BYTES
  return {
    fileName,
    byteSize: meta.size,
    bytes: buffer,
    mimeType: meta.file?.mimeType ?? guessMimeType(ext),
    text: truncated ? normalized.slice(0, MAX_TEXT_BYTES) : normalized,
    truncated,
  }
}

/**
 * Fallback for legacy callers that only know the webUrl. Resolves the
 * drive + item via the canonical SharePoint URL parser, then defers to
 * `fetchSharePointFileText`. One extra Graph round-trip vs the by-id
 * path — use the by-id path whenever the caller has access to it.
 */
export async function fetchSharePointFileTextByUrl(
  companyId: string,
  webUrl: string
): Promise<FetchedSharePointFile> {
  const token = await getGraphTokenForCompany(companyId)
  if (!token) {
    throw new Error(
      'M365 credentials are not configured for this company. Connect M365 in the onboarding wizard first.'
    )
  }

  const parsed = parseSharePointUrl(webUrl)

  // Look up the site, list its drives, and pick the one whose webUrl
  // is a prefix of the file path. Same matcher the scan endpoint uses,
  // so behavior stays consistent across import + scan.
  const siteRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${parsed.hostname}:/sites/${encodeURIComponent(parsed.siteName)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
  )
  if (!siteRes.ok) {
    const body = await siteRes.text().catch(() => '')
    throw new Error(`SharePoint site "${parsed.siteName}" not found (${siteRes.status}): ${body.substring(0, 200)}`)
  }
  const siteData = (await siteRes.json()) as { id: string }

  const drivesRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteData.id}/drives`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
  )
  if (!drivesRes.ok) {
    const body = await drivesRes.text().catch(() => '')
    throw new Error(`Could not list document libraries (${drivesRes.status}): ${body.substring(0, 200)}`)
  }
  const drivesData = (await drivesRes.json()) as { value: SharePointDrive[] }
  const matched = pickMatchingDrive(drivesData.value, parsed.serverRelativePath)
  if (!matched) {
    throw new Error(`Could not match URL to a document library on the site: ${parsed.serverRelativePath}`)
  }

  // The matched drive gives us the root prefix; the rest is the file
  // path inside the drive. Encode each segment so spaces + ampersands
  // survive the Graph round-trip.
  const fileRelative = matched.relativeToDrive
  if (!fileRelative) {
    throw new Error(`URL points at the library root, not a file: ${webUrl}`)
  }
  const encoded = fileRelative.split('/').map((seg) => encodeURIComponent(seg)).join('/')

  const itemRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${matched.drive.id}/root:/${encoded}?$select=id,name`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
  )
  if (!itemRes.ok) {
    const body = await itemRes.text().catch(() => '')
    throw new Error(`File not found in SharePoint: "${fileRelative}" (${itemRes.status}): ${body.substring(0, 200)}`)
  }
  const item = (await itemRes.json()) as { id: string; name: string }

  return fetchSharePointFileText(companyId, {
    driveId: matched.drive.id,
    itemId: item.id,
    fileName: item.name,
  })
}

// ---------------------------------------------------------------------------
// Per-format extractors
// ---------------------------------------------------------------------------

async function extractDocxText(buffer: Buffer, fileName: string): Promise<string> {
  // mammoth is a CJS module; the static-import form works in Next.js's
  // bundler because we already declared it in package.json. Keep the
  // require dynamic so the bundler doesn't try to follow it into edge
  // runtime contexts where node:fs isn't available.
  const mammoth = (await import('mammoth')).default
  try {
    const result = await mammoth.extractRawText({ buffer })
    if (!result.value || result.value.trim().length === 0) {
      throw new Error(`mammoth returned no text — file may be empty, password-protected, or corrupt.`)
    }
    return result.value
  } catch (err) {
    throw new Error(`Failed to extract text from "${fileName}": ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  // pdf-parse v2 ships a class API. Pass the buffer as Uint8Array data;
  // pdfjs-dist converts it internally. verbosity=0 silences pdfjs's
  // console.warn output that clutters server logs.
  const { PDFParse } = await import('pdf-parse')
  try {
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
      verbosity: 0,
    })
    const result = await parser.getText()
    await parser.destroy()
    if (!result.text || result.text.trim().length === 0) {
      throw new Error(`PDF has no extractable text — it may be scanned images. OCR would be needed.`)
    }
    return result.text
  } catch (err) {
    throw new Error(`Failed to extract text from "${fileName}": ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Fallback MIME map used when Graph's file metadata doesn't include
// the mimeType (rare — usually only on legacy file types). Keeping
// .docx/.pdf/.txt right is what matters for the download path; .doc
// and .rtf are rejected during extraction anyway so they shouldn't
// reach this function.
function guessMimeType(ext: string): string {
  switch (ext) {
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'pdf':  return 'application/pdf'
    case 'txt':  return 'text/plain; charset=utf-8'
    case 'md':   return 'text/markdown; charset=utf-8'
    default:     return 'application/octet-stream'
  }
}

// Collapse the gnarly whitespace patterns docx + pdf extractors leave
// behind so the AI sees clean paragraphs. Keep blank lines as paragraph
// separators (two newlines), but strip the long runs of single newlines
// that pdfjs emits for visual line breaks inside a paragraph.
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim()
}
