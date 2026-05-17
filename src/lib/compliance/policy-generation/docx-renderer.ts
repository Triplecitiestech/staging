/**
 * Render a generated policy (Markdown source) as a real .docx Word
 * document. Used by the SharePoint publish executor so policies land
 * in the customer's document library as something they can open in
 * Word directly — not raw HTML that looks like a web page.
 *
 * The AI policy generator (src/lib/compliance/policy-generation/generator.ts)
 * emits a constrained set of Markdown features:
 *   # title
 *   ## section heading
 *   ### subsection heading
 *   - bullet list item
 *   1. numbered list item
 *   **bold span**
 *   regular paragraphs
 *   blank line = paragraph break
 *
 * This renderer handles exactly those. Anything more exotic (tables,
 * code fences, links) falls back to plain text. Keeping the parser
 * small avoids depending on a full Markdown→docx library + keeps the
 * output predictable for downstream Word users.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx'
import type { PolicyDocumentMetadata } from './types'

// Re-export so callers don't need to import from docx directly
export type { PolicyDocumentMetadata }

/**
 * Convert a Markdown policy document to a .docx buffer.
 * The buffer is ready to upload (e.g., to SharePoint via Graph) or
 * save to disk.
 */
export async function renderPolicyDocx(
  markdownContent: string,
  metadata: PolicyDocumentMetadata
): Promise<Buffer> {
  const sections: Paragraph[] = []

  // Header block — title + metadata grid
  sections.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: metadata.policyTitle, bold: true })],
    })
  )
  sections.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: metadata.companyName, italics: true, color: '555555' })],
    })
  )
  sections.push(emptyParagraph())

  const metaPairs: Array<[string, string]> = [
    ['Effective Date', metadata.effectiveDate],
    ['Review Date', metadata.reviewDate],
    ['Version', metadata.version],
    ['Owner', metadata.owner],
    ['Approved By', metadata.approvedBy],
  ]
  for (const [k, v] of metaPairs) {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${k}: `, bold: true, color: '555555', size: 18 }),
          new TextRun({ text: v, color: '555555', size: 18 }),
        ],
      })
    )
  }
  sections.push(emptyParagraph())
  sections.push(horizontalRule())
  sections.push(emptyParagraph())

  // Body parsing — line-by-line, line-buffered for paragraphs.
  const lines = markdownContent.replace(/\r\n/g, '\n').split('\n')
  let paragraphBuffer: string[] = []
  // The AI almost always emits "# Title" as the first non-blank
  // line of the body — same title we already rendered from
  // metadata. Swallow the first H1 we see so it doesn't appear twice.
  let leadingTitleSkipped = false
  // Track whether the line before the one we're about to process was
  // blank. Section-break heuristics use this to avoid promoting inline
  // numbered list items (e.g. "1. Log in to BullPhish") into H2s.
  let prevWasBlank = true

  function flushParagraph() {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join(' ').trim()
    paragraphBuffer = []
    if (text.length === 0) return
    sections.push(new Paragraph({ children: parseInlineRuns(text) }))
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx]
    const line = raw.trimEnd()
    const isBlank = line.length === 0
    // Capture prevWasBlank for THIS iteration, then update for next.
    const afterBlank = prevWasBlank
    prevWasBlank = isBlank

    if (!leadingTitleSkipped && /^#\s+/.test(line)) {
      leadingTitleSkipped = true
      continue
    }

    // Heuristic heading detection for extracted policy text (mammoth /
    // pdf-parse strip the original heading styles, so without this every
    // section runs together as wrapped paragraphs in the rendered docx).
    // Two signals required:
    //   1. previous line was blank (section break, not inline list)
    //   2. line matches "<n>. <Short Title-Case Text>" with no trailing
    //      punctuation, ≤ 60 chars, ≤ 8 words
    // The blank-above requirement is what stops bullet items like
    // "1. Log in to the BullPhish portal" from being promoted.
    if (afterBlank) {
      const numberedHeading = line.match(/^(\d+)\.\s+([A-Z][A-Za-z0-9 &/().,'–—\-]{2,60})$/)
      const headingTail = numberedHeading?.[2]
      if (
        numberedHeading &&
        headingTail &&
        !/[.!?]$/.test(headingTail) &&
        headingTail.split(/\s+/).length <= 8
      ) {
        flushParagraph()
        sections.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({ text: `${numberedHeading[1]}. `, bold: true }),
              ...parseInlineRuns(headingTail),
            ],
          })
        )
        continue
      }
      const appendixHeading = line.match(/^(Appendix\s+[A-Z](?:\s*[–—\-]\s*.+)?)$/)
      if (appendixHeading) {
        flushParagraph()
        sections.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: parseInlineRuns(appendixHeading[1]),
          })
        )
        continue
      }
    }

    if (isBlank) {
      flushParagraph()
      continue
    }

    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      flushParagraph()
      sections.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: parseInlineRuns(h2[1]),
        })
      )
      continue
    }
    const h3 = line.match(/^###\s+(.+)$/)
    if (h3) {
      flushParagraph()
      sections.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: parseInlineRuns(h3[1]),
        })
      )
      continue
    }
    const h4 = line.match(/^####\s+(.+)$/)
    if (h4) {
      flushParagraph()
      sections.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_4,
          children: parseInlineRuns(h4[1]),
        })
      )
      continue
    }

    const bullet = line.match(/^[-*+]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      sections.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(bullet[1]),
        })
      )
      continue
    }

    const numbered = line.match(/^(\d+)\.\s+(.+)$/)
    if (numbered) {
      flushParagraph()
      sections.push(
        new Paragraph({
          // Use a plain numbered prefix as text rather than a real
          // numbered-list reference. Word would auto-renumber a real
          // list and AI sometimes restarts numbering mid-doc; this
          // preserves the AI's original numbers verbatim.
          children: [
            new TextRun({ text: `${numbered[1]}. `, bold: true }),
            ...parseInlineRuns(numbered[2]),
          ],
        })
      )
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line) || /^___+$/.test(line)) {
      flushParagraph()
      sections.push(horizontalRule())
      continue
    }

    // Otherwise accumulate into the current paragraph.
    paragraphBuffer.push(line)
  }
  flushParagraph()

  // Footer
  sections.push(emptyParagraph())
  sections.push(horizontalRule())
  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${metadata.companyName} · ${metadata.policyTitle} · Generated by Triple Cities Tech`,
          color: '888888',
          size: 16,
          italics: true,
        }),
      ],
    })
  )

  const doc = new Document({
    creator: 'Triple Cities Tech',
    title: metadata.policyTitle,
    description: `${metadata.companyName} — ${metadata.policyTitle}`,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 }, // 22 half-points = 11pt
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1in = 1440 twips
          },
        },
        children: sections,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  // docx's Packer.toBuffer returns a Node Buffer in node environments;
  // re-wrap to satisfy strict consumers.
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

/**
 * Parse inline markdown spans (bold + italic) into a list of TextRuns.
 * Returns at least one TextRun even if the input is empty so the
 * paragraph isn't malformed.
 */
function parseInlineRuns(text: string): TextRun[] {
  if (text.length === 0) return [new TextRun({ text: '' })]
  const runs: TextRun[] = []
  // Match: **bold** OR *italic* OR _italic_ OR plain
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }))
    }
    const token = match[0]
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }))
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }))
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }))
  }
  return runs.length > 0 ? runs : [new TextRun({ text })]
}

function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '' })] })
}

/**
 * Crude horizontal rule — docx doesn't have a first-class HR element,
 * so a long string of em-dashes in light gray approximates one.
 */
function horizontalRule(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: '—'.repeat(40), color: 'cccccc' }),
    ],
  })
}

