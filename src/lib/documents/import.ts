/**
 * Kaseya "Download Full Campaign" zip → TCT-branded documents.
 *
 * Parses the .docx assets (email / blog / landing / social), strips the Kaseya
 * "Powered Services" legal boilerplate, keeps the wording verbatim, and creates
 * branded_documents rows grouped under one `campaign` slug. Graphics (.jpg/.pdf/
 * .psd/.indd) are left for the branded-card generator (handled separately).
 */

import JSZip from 'jszip'
import mammoth from 'mammoth'
import { createDoc, createSocialDoc, slugify } from './store'
import type { SocialPost } from './social-types'

export interface ImportResult {
  campaign: string
  created: { kind: string; slug: string; title: string }[]
  skipped: string[]
  warnings: string[]
}

type AssetKind = 'email' | 'blog' | 'landing' | 'social'

// ─── text helpers ────────────────────────────────────────────────────────────

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, '')).trim()
}

/** Remove the Kaseya legal/boilerplate tail and MSP notes. Keeps real content verbatim. */
function stripBoilerplate(text: string): string {
  let t = text.replace(/\r\n/g, '\n')
  const cut = [/About Powered Services/i, /Copyright and limited permissions/i, /©\s*\d{4}\s*Kaseya/i]
  for (const re of cut) {
    const idx = t.search(re)
    if (idx >= 0) t = t.slice(0, idx)
  }
  // Line-level removals (intros/notes that aren't at the tail).
  t = t
    .split('\n')
    .filter(
      (l) =>
        !/^\s*#{0,3}\s*Note to MSPs/i.test(l) &&
        !/^\s*#{0,3}\s*Please note:\s*Hashtags are recommendations/i.test(l) &&
        !/^\s*#{1,6}\s*$/.test(l) // drop empty headings produced by blank bold paragraphs
    )
    .join('\n')
  return t.trim()
}

/** Minimal HTML→Markdown for mammoth output (blog). mammoth emits clean h/p/ul/strong/em/a. */
function htmlToMarkdown(html: string): string {
  let s = html
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `\n# ${stripTags(t)}\n`)
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `\n## ${stripTags(t)}\n`)
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `\n### ${stripTags(t)}\n`)
  s = s.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, (_m, t) => `\n### ${stripTags(t)}\n`)
  // A paragraph that is entirely bold is a section heading in these templates.
  s = s.replace(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/gi, (_m, t) => `\n## ${stripTags(t)}\n`)
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => `**${stripTags(inner)}**`)
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => `*${stripTags(inner)}*`)
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => `[${stripTags(t)}](${href})`)
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `\n- ${stripTags(t)}`)
  s = s.replace(/<\/(ul|ol)>/gi, '\n')
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, t) => `\n${stripTags(t)}\n`)
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = stripTags(s)
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/** Parse a labeled Kaseya block ("Subject Line\n<value>\nHeader\n<value>…"). */
function parseLabeled(block: string, labels: string[]): Record<string, string> {
  const lower = labels.map((l) => l.toLowerCase())
  const result: Record<string, string[]> = {}
  let current: string | null = null
  for (const raw of block.split('\n')) {
    const line = raw.trim()
    const idx = lower.indexOf(line.toLowerCase())
    if (idx >= 0) {
      current = labels[idx]
      result[current] = []
      continue
    }
    if (current && line) result[current].push(line)
  }
  const out: Record<string, string> = {}
  for (const k of Object.keys(result)) out[k] = result[k].join('\n\n').trim()
  return out
}

function detectKind(path: string): AssetKind | null {
  const p = path.toLowerCase()
  if (/social/.test(p) && /post/.test(p)) return 'social'
  if (/blog/.test(p)) return 'blog'
  if (/landing/.test(p)) return 'landing'
  if (/email/.test(p)) return 'email'
  return null
}

export function deriveCampaignSlug(zipName: string): string {
  let n = zipName.replace(/\.zip$/i, '')
  n = n.replace(/^[0-9a-f]{6,}-/i, '') // upload hash prefix
  n = n.replace(/[_-]?SourceFiles.*$/i, '')
  n = n.replace(/^QK[-_ ]*/i, '')
  n = n.replace(/[_-]?final\b/gi, '')
  n = n.replace(/[0-9a-f]{16,}/gi, '') // trailing content hashes
  n = n.replace(/[_]+/g, ' ')
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase → words
  return slugify(n) || 'campaign'
}

// ─── per-type parsers ─────────────────────────────────────────────────────────

function parseSocialPosts(text: string): { posts: SocialPost[]; headlines: string[] } {
  const clean = stripBoilerplate(text)
  const lines = clean.split('\n').map((l) => l.trim())
  const posts: SocialPost[] = []
  const headlines: string[] = []
  let cur: { headline: string; body: string[]; hashtags: string } | null = null
  const flush = () => {
    if (cur && (cur.body.length || cur.headline)) {
      headlines.push(cur.headline)
      posts.push({
        platform: 'linkedin',
        body: cur.body.join('\n\n').trim(),
        hashtags: cur.hashtags.trim(),
        note: cur.headline ? `Graphic headline: ${cur.headline}` : '',
      })
    }
    cur = null
  }
  for (const line of lines) {
    const ad = line.match(/^Ad\s*\d+:\s*(.*)$/i)
    if (ad) {
      flush()
      cur = { headline: ad[1].trim(), body: [], hashtags: '' }
      continue
    }
    if (!cur) continue
    const tag = line.match(/^Hashtag suggestion\(s\):\s*(.*)$/i)
    if (tag) {
      cur.hashtags = tag[1].trim()
      continue
    }
    if (line) cur.body.push(line)
  }
  flush()
  return { posts, headlines }
}

interface ParsedDoc {
  title: string
  deck: string
  body: string
  ctaLabel: string
}

function parseEmails(text: string): ParsedDoc[] {
  const clean = stripBoilerplate(text)
  const labels = ['Template Name', 'Subject Line', 'Header', 'Body Copy', 'Button']
  // Split into per-email blocks on "Email #N".
  const blocks = clean.split(/\n(?=Email\s*#?\s*\d+)/i)
  const out: ParsedDoc[] = []
  for (const block of blocks) {
    const f = parseLabeled(block, labels)
    const subject = f['Subject Line'] || ''
    const header = f['Header'] || subject
    const body = f['Body Copy'] || ''
    if (!body && !header) continue
    out.push({ title: header || subject || 'Email', deck: subject && subject !== header ? subject : '', body, ctaLabel: f['Button'] || '' })
  }
  return out
}

function parseLanding(text: string): ParsedDoc | null {
  const clean = stripBoilerplate(text)
  const f = parseLabeled(clean, ['Template Name', 'Header 1', 'Header 2', 'Main Content', 'Call To Action', 'Button Content'])
  const title = f['Header 1'] || ''
  const body = f['Main Content'] || ''
  if (!title && !body) return null
  return { title: title || 'Landing page', deck: f['Header 2'] || '', body, ctaLabel: f['Button Content'] || f['Call To Action'] || '' }
}

function parseBlogHtml(html: string): ParsedDoc {
  // Convert to markdown first, then strip boilerplate on the clean text.
  const md = stripBoilerplate(htmlToMarkdown(html))
  const all = md.split('\n')
  const firstIdx = all.findIndex((l) => l.trim())
  const title = (firstIdx >= 0 ? all[firstIdx] : 'Blog post').replace(/[*#]/g, '').trim() || 'Blog post'
  const body = all.slice(firstIdx + 1).join('\n').trim()
  return { title, deck: '', body, ctaLabel: '' }
}

// ─── orchestrator ──────────────────────────────────────────────────────────────

export interface DocxFile {
  name: string
  buffer: Buffer
}

/**
 * Core importer: parse already-extracted .docx files into branded docs.
 * The browser extracts the .docx from the (large) Kaseya zip and posts only
 * these small files — the 48 MB of graphics never hit the server.
 */
export async function importDocxFiles(
  files: DocxFile[],
  campaignNameSource: string,
  authorEmail: string | null
): Promise<ImportResult> {
  const campaign = deriveCampaignSlug(campaignNameSource)
  const created: ImportResult['created'] = []
  const skipped: string[] = []
  const warnings: string[] = []

  for (const f of files) {
    const path = f.name
    if (!/\.docx$/i.test(path)) {
      skipped.push(path)
      continue
    }
    const kind = detectKind(path)
    if (!kind) {
      warnings.push(`Couldn't classify ${path} — skipped.`)
      continue
    }
    const buf = f.buffer

    try {
      if (kind === 'social') {
        const text = (await mammoth.extractRawText({ buffer: buf })).value
        const { posts } = parseSocialPosts(text)
        if (posts.length === 0) {
          warnings.push(`No posts parsed from ${path}.`)
          continue
        }
        const title = `${campaignTitleLocal(campaign)} — Social posts`
        const doc = await createSocialDoc(
          { title, deck: 'Imported from Kaseya. Rebranded for TCT.', posts, status: 'draft' },
          authorEmail,
          { campaign }
        )
        created.push({ kind: 'social', slug: doc.slug, title })
      } else if (kind === 'email') {
        const text = (await mammoth.extractRawText({ buffer: buf })).value
        const emails = parseEmails(text)
        if (emails.length === 0) warnings.push(`No emails parsed from ${path}.`)
        let i = 0
        for (const e of emails) {
          i += 1
          const title = `${campaignTitleLocal(campaign)} — Email ${i}: ${e.title}`
          const doc = await createDoc(
            {
              title,
              eyebrow: 'Email',
              deck: e.deck,
              body: e.body,
              meta: [],
              cta: { heading: '', sub: '', primaryLabel: e.ctaLabel || 'Get in touch', primaryHref: '/contact' },
              status: 'draft',
            },
            authorEmail,
            { campaign, assetKind: 'email' }
          )
          created.push({ kind: 'email', slug: doc.slug, title })
        }
      } else {
        // landing or blog → single marketing doc
        let parsed: ParsedDoc | null
        let eyebrow: string
        if (kind === 'blog') {
          const html = (await mammoth.convertToHtml({ buffer: buf })).value
          parsed = parseBlogHtml(html)
          eyebrow = 'Blog'
        } else {
          const text = (await mammoth.extractRawText({ buffer: buf })).value
          parsed = parseLanding(text)
          eyebrow = 'Landing page'
        }
        if (!parsed) {
          warnings.push(`No content parsed from ${path}.`)
          continue
        }
        const title = `${campaignTitleLocal(campaign)} — ${eyebrow}: ${parsed.title}`
        const doc = await createDoc(
          {
            title,
            eyebrow,
            deck: parsed.deck,
            body: parsed.body,
            meta: [],
            cta: { heading: '', sub: '', primaryLabel: parsed.ctaLabel || 'Get in touch', primaryHref: '/contact' },
            status: 'draft',
          },
          authorEmail,
          { campaign, assetKind: kind }
        )
        created.push({ kind, slug: doc.slug, title })
      }
    } catch (err) {
      warnings.push(`Failed to parse ${path}: ${(err as Error).message}`)
    }
  }

  return { campaign, created, skipped, warnings }
}

/** Convenience: extract .docx from a campaign zip server-side, then import. */
export async function importCampaignZip(
  zipBuf: Buffer,
  zipName: string,
  authorEmail: string | null
): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(zipBuf)
  const files: DocxFile[] = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name.startsWith('__MACOSX') || /\/\._/.test(entry.name) || /\.DS_Store$/.test(entry.name)) continue
    if (/\.docx$/i.test(entry.name)) files.push({ name: entry.name, buffer: Buffer.from(await entry.async('nodebuffer')) })
  }
  return importDocxFiles(files, zipName, authorEmail)
}

// Local copy to avoid importing campaignTitle before it's defined elsewhere.
function campaignTitleLocal(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
