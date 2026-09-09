// src/lib/itglue-html.test.ts
//
// Locks the escaping defect and the newline defect.
//
// The escaping case is the important one. Writing "> 50 users" into an IT Glue
// Textbox rendered on the page as the literal text "&gt; 50 users" — the
// signature of escaping applied twice. This is the THIRD instance of the same
// defect (after itglue_add_document_section and the Monday create_update tool),
// so the rules are pinned rather than left to a reviewer's eye.

import { describe, expect, it } from 'vitest'
import { escapeProseKeepingTags, looksLikeStructuredHtml, toItGlueHtml } from './itglue-html'

describe('bare < and > in prose survive', () => {
  it('escapes a prose > exactly once — never to a visible &gt;', () => {
    const { html } = toItGlueHtml('Recommended for > 50 users')
    expect(html).toBe('<p>Recommended for &gt; 50 users</p>')
    // The failure mode: &amp;gt;, which the browser shows as the text "&gt;".
    expect(html).not.toContain('&amp;gt;')
  })

  it('escapes a prose < exactly once', () => {
    const { html } = toItGlueHtml('Fails if latency < 5 ms')
    expect(html).toBe('<p>Fails if latency &lt; 5 ms</p>')
    expect(html).not.toContain('&amp;lt;')
  })

  it('does not re-escape an entity the caller already wrote', () => {
    // This is precisely how double-escaping starts.
    const { html } = toItGlueHtml('AT&amp;T circuit')
    expect(html).toBe('<p>AT&amp;T circuit</p>')
    expect(html).not.toContain('&amp;amp;')
  })

  it('escapes a bare & that is not an entity', () => {
    expect(toItGlueHtml('AT&T circuit').html).toBe('<p>AT&amp;T circuit</p>')
  })

  it('passes genuine tags through as markup while escaping prose in the same string', () => {
    const { html, tagsPreserved } = toItGlueHtml('<p>Use <strong>fibre</strong> when > 50 users</p>')
    expect(html).toBe('<p>Use <strong>fibre</strong> when &gt; 50 users</p>')
    expect(tagsPreserved).toContain('strong')
  })

  it('treats an unterminated < as prose rather than letting it eat the paragraph', () => {
    // The dangerous case: a naive parser reads "<5 ms then check" as a tag and
    // silently drops the rest of the line.
    const { html } = toItGlueHtml('If latency <5 ms then check the switch')
    expect(html).toContain('&lt;5 ms then check the switch')
  })

  it('does not pass a script tag through as markup', () => {
    const { out, tagsPreserved } = escapeProseKeepingTags('<script>alert(1)</script>')
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(tagsPreserved).toEqual([])
  })

  it('does not let a > inside a quoted attribute close the tag early', () => {
    const { out } = escapeProseKeepingTags('<a href="https://x/a>b">link</a>')
    expect(out).toBe('<a href="https://x/a>b">link</a>')
  })

  it('counts what it escaped so nothing is transformed silently', () => {
    const r = toItGlueHtml('a > b and c < d and e & f')
    expect(r.charactersEscaped).toBe(3)
    expect(r.notes.some((n) => /Escaped 3 bare/.test(n))).toBe(true)
  })
})

describe('newlines become real HTML structure', () => {
  it('turns blank-line-separated blocks into paragraphs', () => {
    expect(toItGlueHtml('First para.\n\nSecond para.').html).toBe('<p>First para.</p><p>Second para.</p>')
  })

  it('turns single newlines into line breaks, not paragraph breaks', () => {
    expect(toItGlueHtml('Line one\nLine two').html).toBe('<p>Line one<br>Line two</p>')
  })

  it('a raw \\n never survives into the output', () => {
    // The original defect: \n is whitespace in HTML, so the page showed one wall.
    const { html } = toItGlueHtml('Step one\nStep two\n\nNotes here')
    expect(html).not.toContain('\n')
    expect(html).toContain('<br>')
    expect(html).toContain('</p><p>')
  })

  it('turns a dash/bullet run into a real list', () => {
    expect(toItGlueHtml('- Check WAN\n- Check DNS\n- Reboot').html).toBe(
      '<ul><li>Check WAN</li><li>Check DNS</li><li>Reboot</li></ul>',
    )
    expect(toItGlueHtml('* One\n* Two').html).toBe('<ul><li>One</li><li>Two</li></ul>')
  })

  it('turns a numbered run into an ordered list', () => {
    expect(toItGlueHtml('1. First\n2. Second').html).toBe('<ol><li>First</li><li>Second</li></ol>')
  })

  it('does not treat a mixed block as a list', () => {
    const { html } = toItGlueHtml('Intro line\n- a bullet')
    expect(html).toBe('<p>Intro line<br>- a bullet</p>')
  })

  it('normalises CRLF', () => {
    expect(toItGlueHtml('a\r\nb').html).toBe('<p>a<br>b</p>')
  })

  it('returns empty for empty input and says so', () => {
    const r = toItGlueHtml('   ')
    expect(r.html).toBe('')
    expect(r.notes[0]).toMatch(/empty/)
  })
})

describe('already-structured HTML is not second-guessed', () => {
  it('leaves a caller\'s own block structure alone', () => {
    const input = '<ul><li>One</li><li>Two</li></ul>'
    const r = toItGlueHtml(input)
    expect(r.html).toBe(input)
    expect(r.structureAdded).toBe(false)
  })

  it('does not wrap existing paragraphs in more paragraphs', () => {
    const r = toItGlueHtml('<p>Already a paragraph.</p>')
    expect(r.html).toBe('<p>Already a paragraph.</p>')
    expect(r.html).not.toContain('<p><p>')
  })

  it('still escapes prose characters inside structured HTML', () => {
    const r = toItGlueHtml('<p>Fibre when > 50 users</p>')
    expect(r.html).toBe('<p>Fibre when &gt; 50 users</p>')
    expect(r.charactersEscaped).toBe(1)
  })

  it('recognises block structure only from allowlisted block tags', () => {
    expect(looksLikeStructuredHtml('<p>x</p>')).toBe(true)
    expect(looksLikeStructuredHtml('<ul><li>x</li></ul>')).toBe(true)
    // Inline markup alone is not block structure, so plain-text conversion
    // still applies and the newlines still render.
    expect(looksLikeStructuredHtml('use <strong>this</strong>')).toBe(false)
    expect(toItGlueHtml('use <strong>this</strong>\nand that').html).toBe('<p>use <strong>this</strong><br>and that</p>')
  })

  it('is idempotent — converting twice does not double-escape', () => {
    const once = toItGlueHtml('Recommended for > 50 users').html
    const twice = toItGlueHtml(once).html
    expect(twice).toBe(once)
  })
})
