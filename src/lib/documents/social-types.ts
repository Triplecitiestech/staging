/**
 * Client-safe types + constants for Social Content Dumps. No pg/server imports
 * here, so both the client editor and the server store can import it.
 *
 * A "social dump" is a campaign (title + optional summary) holding a list of
 * platform-tagged posts. Staff paste raw agency copy, split it into posts,
 * brand it, and copy each one out to the actual platform.
 */

export interface SocialPost {
  platform: string
  body: string
  hashtags: string
  note: string
}

export interface SocialDoc {
  id: number
  slug: string
  title: string
  deck: string
  posts: SocialPost[]
  status: 'draft' | 'published'
  authorEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface SocialDocInput {
  title: string
  deck: string
  posts: SocialPost[]
  status: 'draft' | 'published'
}

export interface PlatformInfo {
  key: string
  label: string
  /** Character limit for the composed post; 0 = no limit / no warning. */
  limit: number
}

export const SOCIAL_PLATFORMS: PlatformInfo[] = [
  { key: 'linkedin', label: 'LinkedIn', limit: 3000 },
  { key: 'x', label: 'X / Twitter', limit: 280 },
  { key: 'instagram', label: 'Instagram', limit: 2200 },
  { key: 'facebook', label: 'Facebook', limit: 0 },
  { key: 'general', label: 'General', limit: 0 },
]

export function platformInfo(key: string): PlatformInfo {
  return SOCIAL_PLATFORMS.find((p) => p.key === key) ?? SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1]
}

/** The full text that gets published/copied: body plus hashtags. */
export function composePost(post: { body: string; hashtags?: string }): string {
  const tags = (post.hashtags || '').trim()
  return tags ? `${post.body.trim()}\n\n${tags}` : post.body.trim()
}

export function postCharCount(post: { body: string; hashtags?: string }): number {
  return composePost(post).length
}

export const EMPTY_POST: SocialPost = { platform: 'linkedin', body: '', hashtags: '', note: '' }

/**
 * Split a raw "dump" of social copy into individual posts. Splits on lines that
 * are only dashes (---) or on blank-line gaps, whichever the pasted copy uses.
 */
export function splitDumpIntoPosts(raw: string): SocialPost[] {
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  // Prefer explicit --- separators; otherwise split on blank-line gaps.
  const chunks = /\n\s*-{3,}\s*\n/.test(text)
    ? text.split(/\n\s*-{3,}\s*\n/)
    : text.split(/\n\s*\n\s*\n*/)
  return chunks
    .map((c) => c.trim())
    .filter(Boolean)
    .map((chunk) => {
      // Pull trailing hashtags onto the hashtags field.
      const lines = chunk.split('\n')
      const last = (lines[lines.length - 1] || '').trim()
      if (lines.length > 1 && /^#[^\s]/.test(last) && /#/.test(last)) {
        return { platform: 'linkedin', body: lines.slice(0, -1).join('\n').trim(), hashtags: last, note: '' }
      }
      return { platform: 'linkedin', body: chunk, hashtags: '', note: '' }
    })
}
