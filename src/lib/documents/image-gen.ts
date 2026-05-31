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

import { trackApiUsage } from '@/lib/api-usage-tracker'

const OPENAI_URL = 'https://api.openai.com/v1/images/generations'

/** gpt-image-1 token pricing, cents per 1M tokens (text in $5, image in $10, image out $40). */
const PRICE_CENTS_PER_1M = { text: 500, imageIn: 1000, out: 4000 }

/** Flat per-image cost (cents) by quality+size — fallback when the response omits usage. */
const FLAT_CENTS: Record<string, Record<string, number>> = {
  low: { '1024x1024': 1, '1536x1024': 2, '1024x1536': 2 },
  medium: { '1024x1024': 4, '1536x1024': 6, '1024x1536': 6 },
  high: { '1024x1024': 17, '1536x1024': 25, '1024x1536': 25 },
}

interface ImageUsage {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { text_tokens?: number; image_tokens?: number }
}

function imageCostCents(usage: ImageUsage | undefined, size: string, quality: string): number {
  if (usage && ((usage.output_tokens ?? 0) > 0 || (usage.input_tokens ?? 0) > 0)) {
    const text = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0
    const imageIn = usage.input_tokens_details?.image_tokens ?? 0
    const out = usage.output_tokens ?? 0
    return (text * PRICE_CENTS_PER_1M.text + imageIn * PRICE_CENTS_PER_1M.imageIn + out * PRICE_CENTS_PER_1M.out) / 1_000_000
  }
  return FLAT_CENTS[quality]?.[size] ?? 25
}

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

  const size = '1536x1024'
  const quality = opts.quality || 'high'
  const startMs = Date.now()

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: buildImagePrompt(opts.headline, opts.hint),
        size,
        quality,
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

    const data = (await res.json()) as { data?: { b64_json?: string }[]; usage?: ImageUsage }
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) throw new Error('Image API returned no image data.')

    await trackApiUsage({
      provider: 'openai',
      feature: 'documents_social_image',
      model: 'gpt-image-1',
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      costCents: imageCostCents(data.usage, size, quality),
      durationMs: Date.now() - startMs,
      statusCode: 200,
      metadata: { size, quality },
    })

    return { b64, mime: 'image/png' }
  } catch (err) {
    await trackApiUsage({
      provider: 'openai',
      feature: 'documents_social_image',
      model: 'gpt-image-1',
      durationMs: Date.now() - startMs,
      statusCode: 500,
      error: err instanceof Error ? err.message : 'Unknown error',
      metadata: { size, quality },
    })
    throw err
  }
}
