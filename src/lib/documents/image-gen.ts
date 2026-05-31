/**
 * AI background generation for branded social cards (OpenAI gpt-image-1).
 *
 * IMPORTANT: the model generates ONLY a textless picture. All words (headline,
 * sub-headline, logo) are rendered on top in code by renderSocialCard, so the
 * ad copy is always verbatim and crisp — image models garble long text, so we
 * never let them render it.
 *
 * Configured via OPENAI_API_KEY (or DOCUMENTS_IMAGE_API_KEY to scope a separate
 * key). When unset, isImageGenConfigured() is false and callers fall back to the
 * branded gradient — the feature is purely additive.
 */

const OPENAI_URL = 'https://api.openai.com/v1/images/generations'

export function imageApiKey(): string | null {
  return process.env.DOCUMENTS_IMAGE_API_KEY || process.env.OPENAI_API_KEY || null
}

export function isImageGenConfigured(): boolean {
  return !!imageApiKey()
}

export interface GeneratedImage {
  b64: string
  mime: string
}

/**
 * Turn an ad headline into a prompt for a striking, on-brand, TEXTLESS image.
 * The visual is the rebrand of the Kaseya concept (e.g. hard hat, parachute),
 * reinterpreted in the TCT palette.
 */
export function buildImagePrompt(headline: string, hint?: string): string {
  const subject = (hint || headline || 'managed IT security').trim()
  return [
    'Premium, modern, photorealistic marketing background image for a managed-IT / cybersecurity brand.',
    `Concept inspired by: "${subject}".`,
    'Style: dark navy-to-black background, dramatic cinematic rim lighting, bright cyan (#22d3ee) accent glow, subtle hexagon tech texture, shallow depth of field, lots of clean negative space on the LEFT side for text overlay.',
    'Composition: the focal subject sits on the RIGHT third; the left two-thirds is dark and uncluttered.',
    'STRICTLY NO TEXT, no words, no letters, no logos, no watermarks anywhere in the image.',
    'Color rule: ONLY dark navy, black, slate, white, and cyan tones. Absolutely NO yellow, amber, gold, or orange.',
    'High-end, enterprise, agency-quality. Not cheesy, not clip-art.',
  ].join(' ')
}

/**
 * Generate one textless background via gpt-image-1. Returns base64 PNG.
 * Landscape (1536x1024) — the card cover-crops it to either size.
 * Throws on misconfiguration or API error (callers should fall back).
 */
export async function generateAdBackground(opts: {
  headline: string
  hint?: string
  quality?: 'low' | 'medium' | 'high'
}): Promise<GeneratedImage> {
  const key = imageApiKey()
  if (!key) throw new Error('Image generation is not configured (set OPENAI_API_KEY).')

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: buildImagePrompt(opts.headline, opts.hint),
      size: '1536x1024',
      quality: opts.quality || 'high',
      output_format: 'png',
      n: 1,
    }),
    // gpt-image-1 can take 10–30s; keep a generous ceiling.
    signal: AbortSignal.timeout(110_000),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: { message?: string } }
      detail = j?.error?.message || ''
    } catch {
      /* ignore */
    }
    throw new Error(`Image API ${res.status}${detail ? `: ${detail}` : ''}`)
  }

  const data = (await res.json()) as { data?: { b64_json?: string }[] }
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('Image API returned no image data.')
  return { b64, mime: 'image/png' }
}
