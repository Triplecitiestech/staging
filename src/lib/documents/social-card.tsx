import { ImageResponse } from 'next/og'

/**
 * TCT-branded social card generator (Satori via next/og).
 *
 * CRITICAL DESIGN PRINCIPLE: the AI image model (when used) renders ONLY the
 * picture — never the words. The headline / sub-headline / logo are drawn here
 * as real text from our stored copy, so the wording is always pixel-perfect and
 * verbatim (image models garble long text; this layer cannot).
 *
 * `bgUrl` is an optional AI-generated background image (textless). Without it,
 * the card uses a branded dark gradient.
 */

export type CardSize = '1200x628' | '800x800'

const DIMS: Record<CardSize, { w: number; h: number }> = {
  '1200x628': { w: 1200, h: 628 },
  '800x800': { w: 800, h: 800 },
}

export function parseCardSize(v: string | null): CardSize {
  return v === '800x800' ? '800x800' : '1200x628'
}

export interface CardCopy {
  headline: string
  subhead: string
}

/**
 * Split the stored copy into a punchy headline + supporting sub-headline.
 * The Kaseya graphic headline is typically "<hook>. <supporting sentence>".
 */
export function deriveCardCopy(note: string, body: string): CardCopy {
  let source = ''
  const m = (note || '').match(/Graphic headline:\s*([\s\S]*)/i)
  if (m && m[1].trim()) source = m[1].trim()
  else source = ((body || '').split('\n').find((l) => l.trim()) || '').trim()

  if (!source) return { headline: 'Triple Cities Tech', subhead: '' }

  // Split on the first sentence boundary.
  const split = source.match(/^(.*?[.!?])\s+(.*)$/)
  if (split && split[1].length <= 70 && split[2]) {
    return { headline: split[1].trim(), subhead: clamp(split[2].trim(), 150) }
  }
  if (source.length <= 90) return { headline: source, subhead: '' }
  return { headline: clamp(source, 90), subhead: '' }
}

function clamp(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

/** Headline font size scales down as the headline gets longer, so it always fits. */
function headlineSizeFor(text: string, square: boolean): number {
  const len = text.length
  const base = square ? 64 : 72
  if (len <= 24) return base
  if (len <= 40) return Math.round(base * 0.82)
  if (len <= 60) return Math.round(base * 0.68)
  return Math.round(base * 0.56)
}

export function renderSocialCard(opts: {
  headline: string
  subhead?: string
  tag?: string
  size: CardSize
  bgUrl?: string
}): ImageResponse {
  const { w, h } = DIMS[opts.size]
  const square = opts.size === '800x800'
  const pad = square ? 64 : 76
  const headline = (opts.headline || 'Triple Cities Tech').trim()
  const subhead = (opts.subhead || '').trim()
  const hSize = headlineSizeFor(headline, square)

  // When an AI picture is supplied, a left-to-right scrim keeps text legible.
  const layers: string[] = []
  if (opts.bgUrl) {
    layers.push('linear-gradient(90deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.80) 45%, rgba(2,6,23,0.40) 100%)')
    layers.push(`url('${opts.bgUrl}')`)
  } else {
    layers.push('radial-gradient(1200px 600px at 100% 0%, rgba(34,211,238,0.16), transparent 60%)')
    layers.push('linear-gradient(135deg, #020617 0%, #0b1220 55%, #04222a 100%)')
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: pad,
          backgroundImage: layers.join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          color: '#ffffff',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', width: 16, height: 16, borderRadius: 9999, background: '#22d3ee' }} />
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, letterSpacing: 4, color: '#22d3ee' }}>
            TRIPLE CITIES TECH
          </div>
        </div>

        {/* Headline block */}
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: w - pad * 2 }}>
          <div style={{ display: 'flex', height: 5, width: 84, borderRadius: 9999, background: '#22d3ee', marginBottom: 22 }} />
          <div style={{ display: 'flex', fontSize: hSize, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1 }}>
            {headline}
          </div>
          {subhead && (
            <div style={{ display: 'flex', marginTop: 20, fontSize: square ? 26 : 28, lineHeight: 1.3, color: '#bae6fd', fontWeight: 500, maxWidth: square ? '100%' : '78%' }}>
              {subhead}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 23, fontWeight: 600, color: '#e2e8f0' }}>triplecitiestech.com</div>
          {opts.tag ? (
            <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, letterSpacing: 1, color: '#22d3ee', border: '1px solid rgba(34,211,238,0.4)', borderRadius: 9999, padding: '6px 16px' }}>
              {opts.tag}
            </div>
          ) : (
            <div style={{ display: 'flex', height: 6, width: square ? 150 : 200, borderRadius: 9999, background: 'linear-gradient(90deg, #22d3ee, #0891b2)' }} />
          )}
        </div>
      </div>
    ),
    { width: w, height: h }
  )
}
