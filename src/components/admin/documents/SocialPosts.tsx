import CopyButton from '@/components/admin/documents/CopyButton'
import { composePost, platformInfo, postCharCount, type SocialPost } from '@/lib/documents/social-types'

/**
 * Shared branded renderer for a Social Content Dump. Used by the admin view
 * page and the editor's live preview, so the preview matches the saved view.
 * No 'use client' — works in both trees; imports CopyButton (a client island).
 */

const PLATFORM_BADGE: Record<string, string> = {
  linkedin: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10',
  x: 'text-slate-200 border-white/20 bg-white/5',
  instagram: 'text-pink-300 border-pink-400/30 bg-pink-400/10',
  facebook: 'text-blue-300 border-blue-400/30 bg-blue-400/10',
  general: 'text-slate-300 border-white/15 bg-white/5',
}

export interface SocialView {
  title: string
  deck?: string
  posts: SocialPost[]
}

export default function SocialPosts({ doc }: { doc: SocialView }) {
  const posts = doc.posts.filter((p) => p.body.trim() || p.hashtags.trim())
  return (
    <div className="bg-black text-slate-300">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: "url('/herobg.webp')" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-black" />
        <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-pink-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-pink-400" />
            Social campaign
          </div>
          <h1 className="mb-4 text-4xl font-black leading-[0.98] tracking-tight text-white sm:text-5xl">
            {doc.title || 'Untitled campaign'}
          </h1>
          {doc.deck && <p className="max-w-2xl text-lg font-medium leading-relaxed text-white/90">{doc.deck}</p>}
          <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {posts.length} post{posts.length === 1 ? '' : 's'}
          </div>
        </div>
      </section>

      {/* Posts */}
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-12 sm:px-6 lg:px-8">
        {posts.length === 0 ? (
          <p className="text-lg italic text-slate-500">Add posts to see them rendered here…</p>
        ) : (
          posts.map((post, i) => {
            const info = platformInfo(post.platform)
            const count = postCharCount(post)
            const over = info.limit > 0 && count > info.limit
            return (
              <article key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                      PLATFORM_BADGE[post.platform] ?? PLATFORM_BADGE.general
                    }`}
                  >
                    {info.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold tabular-nums ${over ? 'text-rose-400' : 'text-slate-500'}`}>
                      {count}
                      {info.limit > 0 ? ` / ${info.limit}` : ''} chars
                      {over ? ' · over limit' : ''}
                    </span>
                    <CopyButton text={composePost(post)} label="Copy post" variant="dark" />
                  </div>
                </div>
                <div className="px-5 py-4">
                  <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-200">{post.body}</p>
                  {post.hashtags.trim() && (
                    <p className="mt-3 text-sm font-medium text-cyan-400">{post.hashtags}</p>
                  )}
                  {post.note.trim() && (
                    <p className="mt-3 border-t border-white/10 pt-3 text-xs italic text-slate-500">
                      Note: {post.note}
                    </p>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
