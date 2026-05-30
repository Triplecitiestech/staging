import { ImageResponse } from 'next/og'

/**
 * TCT-branded social card generator (Satori via next/og). Produces an on-brand
 * image (dark + cyan) carrying the ad's headline — the rebranded replacement
 * for Kaseya's stock-photo ads. Used by the preview route and the zip export.
 */

export type CardSize = '1200x628' | '800x800'

const DIMS: Record<CardSize, { w: number; h: number }> = {
  '1200x628': { w: 1200, h: 628 },
  '800x800': { w: 800, h: 800 },
}

export function parseCardSize(v: string | null): CardSize {
  return v === '800x800' ? '800x800' : '1200x628'
}

/** Best headline for a card: the stored Kaseya graphic headline, else the post's lead line. */
export function deriveHeadline(note: string, body: string): string {
  const m = (note || '').match(/Graphic headline:\s*([\s\S]*)/i)
  if (m && m[1].trim()) return m[1].trim()
  const first = ((body || '').split('\n').find((l) => l.trim()) || '').trim()
  return first.length > 140 ? `${first.slice(0, 137).trim()}…` : first || 'Triple Cities Tech'
}

export function renderSocialCard(opts: { headline: string; tag?: string; size: CardSize }): ImageResponse {
  const { w, h } = DIMS[opts.size]
  const square = opts.size === '800x800'
  const pad = square ? 64 : 72
  const headlineSize = square ? 58 : 62
  const headline = opts.headline.trim() || 'Triple Cities Tech'

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
          background: 'linear-gradient(135deg, #020617 0%, #0b1220 55%, #04222a 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 9999, background: '#22d3ee' }} />
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 4, color: '#22d3ee' }}>
            TRIPLE CITIES TECH
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: headlineSize,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -1,
            maxWidth: w - pad * 2,
          }}
        >
          {headline}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 24, color: '#94a3b8' }}>triplecitiestech.com</div>
          <div
            style={{
              display: 'flex',
              height: 6,
              width: square ? 160 : 220,
              borderRadius: 9999,
              background: 'linear-gradient(90deg, #22d3ee, #0891b2)',
            }}
          />
        </div>
      </div>
    ),
    { width: w, height: h }
  )
}
