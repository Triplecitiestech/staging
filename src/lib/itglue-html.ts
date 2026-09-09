// src/lib/itglue-html.ts
//
// Plain text in, IT Glue HTML out — for every IT Glue field that stores HTML:
// Textbox traits on flexible assets, document Text/Step sections, and document
// bodies.
//
// WHY THIS EXISTS — two defects, one root cause.
//
//  1. NEWLINES VANISH. IT Glue's Textbox and document-section fields store
//     HTML, not plain text. A `\n` is whitespace in HTML, so text written with
//     newlines collapses into one unreadable wall on the page. There was no
//     converter anywhere in this codebase, so every caller either wrote HTML by
//     hand or produced the wall.
//
//  2. A BARE `>` OR `<` IN PROSE IS DOUBLE-ESCAPED. Writing "> 50 users"
//     rendered as "&gt; 50 users" on the page. That is the signature of
//     escaping applied twice: something turned `>` into `&gt;`, then IT Glue
//     escaped the `&` again into `&amp;gt;`, which displays as the literal
//     text "&gt;". This is the THIRD instance of the same escaping defect,
//     after itglue_add_document_section and the Monday create_update tool.
//
// THE HARD PART, AND WHY A REGEX SWEEP CANNOT DO IT: the input is a MIXTURE.
// The same string may carry prose that uses `<` and `>` as comparison
// operators AND genuine markup the caller intended as markup. Escaping
// everything destroys the markup; escaping nothing destroys the prose (and,
// worse, lets an unbalanced `<` swallow the rest of the paragraph). So the
// decision is made per character, on evidence: a `<` is treated as markup only
// when what follows it actually parses as a tag from the allowlist AND that tag
// is closed. Everything else is prose and is escaped exactly once.
//
// `&` is handled by the same principle: escaped unless it already begins a
// valid entity, so a caller who legitimately writes `&amp;` is not turned into
// `&amp;amp;` — which is how double-escaping starts.
//
// Pure by construction: no I/O, no env, no clock. Every rule below is
// unit-tested in itglue-html.test.ts.

/**
 * Tags a technician might reasonably use in documentation. Anything outside
 * this list is treated as prose and escaped — including `<script>`, which is
 * therefore rendered visible rather than stored as markup.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'a', 'code', 'pre', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'span', 'div',
])

/** Tags that establish block structure — their presence means "already HTML". */
const BLOCK_TAGS = new Set([
  'p', 'div', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'hr',
])

const ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});/

/**
 * Does a `<` at `i` begin an allowlisted, properly closed tag?
 *
 * Returns the index just past the tag's `>` when it does, or null when it does
 * not — in which case the `<` is prose. Requiring the closing `>` is what stops
 * a stray `<` in text ("if x < y then") from being read as an unterminated tag
 * and eating the remainder of the paragraph.
 */
function tagEndsAt(s: string, i: number): { end: number; name: string } | null {
  if (s[i] !== '<') return null
  let j = i + 1
  if (s[j] === '/') j += 1
  const nameStart = j
  while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j += 1
  const name = s.slice(nameStart, j).toLowerCase()
  if (!name || !ALLOWED_TAGS.has(name)) return null

  // Scan to the tag's `>`, skipping quoted attribute values so a `>` inside
  // href="a>b" does not terminate the tag early.
  let quote: string | null = null
  while (j < s.length) {
    const c = s[j]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '<') {
      // A second `<` before this tag closed means the first was never a tag.
      return null
    } else if (c === '>') {
      return { end: j + 1, name }
    }
    j += 1
  }
  return null
}

export interface ItGlueHtmlResult {
  html: string
  /** True when paragraph/line-break structure was generated from plain text. */
  structureAdded: boolean
  /** Tags recognised and passed through as markup. */
  tagsPreserved: string[]
  /** Count of `<`, `>` and `&` characters escaped as prose. */
  charactersEscaped: number
  /** Human-readable notes for the tool response — never silent transformation. */
  notes: string[]
}

/**
 * Escape prose characters while letting allowlisted tags through untouched.
 * Exported for tests; `toItGlueHtml` is what callers use.
 */
export function escapeProseKeepingTags(input: string): {
  out: string
  tagsPreserved: string[]
  charactersEscaped: number
} {
  let out = ''
  const tagsPreserved: string[] = []
  let charactersEscaped = 0

  for (let i = 0; i < input.length; ) {
    const c = input[i]

    if (c === '<') {
      const tag = tagEndsAt(input, i)
      if (tag) {
        out += input.slice(i, tag.end)
        tagsPreserved.push(tag.name)
        i = tag.end
        continue
      }
      // Prose. Escaped ONCE — this is the character that rendered as "&gt;".
      out += '&lt;'
      charactersEscaped += 1
      i += 1
      continue
    }

    if (c === '>') {
      // Any `>` still standing here did not close a recognised tag (those were
      // consumed above), so it is prose.
      out += '&gt;'
      charactersEscaped += 1
      i += 1
      continue
    }

    if (c === '&') {
      // Leave an existing valid entity alone. Re-escaping it is exactly how
      // "&gt;" became the visible text "&gt;".
      const m = ENTITY.exec(input.slice(i))
      if (m) {
        out += m[0]
        i += m[0].length
        continue
      }
      out += '&amp;'
      charactersEscaped += 1
      i += 1
      continue
    }

    out += c
    i += 1
  }

  return { out, tagsPreserved, charactersEscaped }
}

/** Does this input already carry block structure we should not second-guess? */
export function looksLikeStructuredHtml(input: string): boolean {
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] !== '<') continue
    const tag = tagEndsAt(input, i)
    if (tag && BLOCK_TAGS.has(tag.name)) return true
  }
  return false
}

/**
 * Convert a caller's text into HTML suitable for an IT Glue HTML field.
 *
 * Blank-line-separated blocks become `<p>`, single newlines become `<br>`, and
 * a bare `-`/`*`/`•` bullet run becomes a real `<ul>` — because a technician
 * writing a procedure types a list, and a list rendered as run-on lines is the
 * same unreadable wall in a different costume.
 *
 * Input that already carries block structure is passed through with prose
 * characters escaped but its own layout untouched: someone who wrote `<ul>`
 * meant `<ul>`, and re-wrapping it in `<p>` would corrupt it.
 */
export function toItGlueHtml(input: string): ItGlueHtmlResult {
  const raw = input ?? ''
  const notes: string[] = []

  if (!raw.trim()) {
    return { html: '', structureAdded: false, tagsPreserved: [], charactersEscaped: 0, notes: ['Input was empty; nothing was written.'] }
  }

  const alreadyStructured = looksLikeStructuredHtml(raw)

  if (alreadyStructured) {
    const { out, tagsPreserved, charactersEscaped } = escapeProseKeepingTags(raw)
    if (charactersEscaped > 0) {
      notes.push(
        `Kept your HTML structure as written and escaped ${charactersEscaped} bare < > or & character(s) that were prose rather than markup, so they render as themselves instead of as "&gt;".`,
      )
    }
    return { html: out, structureAdded: false, tagsPreserved: [...new Set(tagsPreserved)], charactersEscaped, notes }
  }

  // Plain text. Normalise line endings, then build structure.
  const text = raw.replace(/\r\n?/g, '\n').trim()
  const blocks = text.split(/\n{2,}/)

  let charactersEscaped = 0
  const tagsPreserved: string[] = []

  const renderInline = (s: string): string => {
    const r = escapeProseKeepingTags(s)
    charactersEscaped += r.charactersEscaped
    tagsPreserved.push(...r.tagsPreserved)
    return r.out
  }

  const html = blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trimEnd())
      const bulletRe = /^\s*[-*•]\s+(.*)$/
      const numberedRe = /^\s*\d+[.)]\s+(.*)$/

      const allBullets = lines.length > 0 && lines.every((l) => bulletRe.test(l))
      const allNumbered = lines.length > 0 && lines.every((l) => numberedRe.test(l))

      if (allBullets || allNumbered) {
        const re = allBullets ? bulletRe : numberedRe
        const tag = allBullets ? 'ul' : 'ol'
        const items = lines.map((l) => `<li>${renderInline(re.exec(l)![1])}</li>`).join('')
        return `<${tag}>${items}</${tag}>`
      }

      // Single newlines inside a block are line breaks, not paragraph breaks.
      return `<p>${lines.map(renderInline).join('<br>')}</p>`
    })
    .join('')

  notes.push(
    `Converted plain text to HTML for IT Glue: ${blocks.length} paragraph block(s), single newlines rendered as <br>. IT Glue stores this field as HTML, so a raw \\n would have shown as one run-on wall of text.`,
  )
  if (charactersEscaped > 0) {
    notes.push(`Escaped ${charactersEscaped} bare < > or & character(s) so they render as themselves rather than as "&gt;".`)
  }

  return { html, structureAdded: true, tagsPreserved: [...new Set(tagsPreserved)], charactersEscaped, notes }
}

/**
 * The sentence every HTML-accepting IT Glue tool puts in its own description.
 * Shared so the three tools cannot drift apart in what they promise.
 */
export const ITGLUE_HTML_FIELD_NOTE =
  'THIS FIELD IS STORED AS HTML, NOT PLAIN TEXT. A "\\n" newline is whitespace in HTML and will NOT render — plain text with newlines collapses into one unreadable wall on the page. You may pass HTML directly, or pass plain text and it is converted for you: blank-line-separated blocks become paragraphs, single newlines become line breaks, and a run of "-" or numbered lines becomes a real list. A bare > or < used in prose (e.g. "> 50 users") is escaped exactly once so it renders as itself — it will NOT come out as "&gt;" — while genuine tags you write are passed through as markup. The response reports what was converted, so nothing is transformed silently.'
