'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'

interface PollResult {
  id: string
  status: 'generating' | 'complete' | 'failed'
  title: string
  slug: string
  category?: string
  blogStatus: string
  error?: string
}

export default function GenerateBlogPage() {
  const [status, setStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [postId, setPostId] = useState<string | null>(null)
  const [postTitle, setPostTitle] = useState<string | null>(null)
  const [postCategory, setPostCategory] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const handleGenerate = async () => {
    setStatus('generating')
    setErrorMsg(null)
    setPostId(null)
    setPostTitle(null)
    setPostCategory(null)
    setElapsed(0)

    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)

    try {
      // Step 1: Start generation (returns immediately)
      const res = await fetch('/api/blog/generate-now', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        cleanup()
        setStatus('error')
        setErrorMsg(data.error || data.reason || 'Failed to start generation')
        return
      }

      if (data.skipped) {
        cleanup()
        setStatus('error')
        setErrorMsg(data.reason || 'Generation was skipped')
        return
      }

      const id = data.blogPostId
      setPostId(id)

      // Step 2: Poll for completion every 3 seconds
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/blog/generate-now?id=${id}`)
          const pollData: PollResult = await pollRes.json()

          if (pollData.status === 'complete') {
            cleanup()
            setPostTitle(pollData.title)
            setPostCategory(pollData.category || null)
            setStatus('success')
          } else if (pollData.status === 'failed') {
            cleanup()
            setStatus('error')
            setErrorMsg(pollData.error || 'Generation failed')
          }
          // If still 'generating', keep polling
        } catch {
          // Polling network error — don't stop, just try again next interval
          console.warn('Poll request failed, retrying...')
        }
      }, 3000)

      // Safety timeout: stop polling after 90 seconds
      setTimeout(() => {
        if (pollRef.current) {
          cleanup()
          setStatus('error')
          setErrorMsg('Generation is taking longer than expected. Check the blog dashboard — the post may still appear shortly.')
        }
      }, 90000)
    } catch (err) {
      cleanup()
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Network error. Check your connection and try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/admin/blog" className="text-sm text-slate-400 hover:text-cyan-400 transition-colors">
            &larr; Back to Blog Management
          </Link>
          <h1 className="text-3xl font-bold text-white mt-4">Generate Blog Post</h1>
          <p className="text-slate-400 mt-2">
            AI will fetch recent cybersecurity news from your RSS feeds and generate a new blog post draft.
          </p>
        </div>

        {status === 'idle' && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-8 text-center space-y-6">
            <div className="text-6xl">🤖</div>
            <div>
              <h2 className="text-xl font-semibold text-white">Ready to Generate</h2>
              <p className="text-slate-400 mt-2 max-w-md mx-auto">
                This will fetch articles from your configured RSS sources, select trending topics, and use AI to write a new blog post. The process typically takes 30-60 seconds.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleGenerate}
                className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-semibold text-lg shadow-lg shadow-cyan-500/20"
              >
                Generate New Post
              </button>
              <p className="text-xs text-slate-500">
                Make sure RSS feeds are configured in{' '}
                <Link href="/admin/blog/settings" className="text-cyan-400 hover:text-cyan-300">Blog Settings</Link>
              </p>
            </div>
          </div>
        )}

        {status === 'generating' && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-cyan-500/30 rounded-full" />
                <div className="absolute inset-0 w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Generating Blog Post...</h2>
              <p className="text-slate-400 mt-2">
                {elapsed < 5 && 'Starting generation and fetching RSS feeds...'}
                {elapsed >= 5 && elapsed < 15 && 'Fetching articles and analyzing trending topics...'}
                {elapsed >= 15 && elapsed < 30 && 'Writing blog post with AI...'}
                {elapsed >= 30 && elapsed < 50 && 'AI is crafting your content — almost there...'}
                {elapsed >= 50 && 'Still working — this is taking longer than usual...'}
              </p>
              <p className="text-sm text-slate-500 mt-3">{elapsed}s elapsed</p>
            </div>
          </div>
        )}

        {status === 'success' && postId && (
          <div className="space-y-6">
            <div className="bg-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-lg p-8 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">✅</span>
                <h2 className="text-xl font-semibold text-green-300">Blog Post Generated!</h2>
              </div>
              <p className="text-slate-300">
                Your blog post has been created and an approval email has been sent.
              </p>

              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-white text-lg">{postTitle}</h3>
                <div className="flex flex-wrap gap-2">
                  {postCategory && (
                    <span className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {postCategory}
                    </span>
                  )}
                  <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                    PENDING APPROVAL
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/admin/blog/${postId}/edit`}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium"
              >
                Edit Post
              </Link>
              <button
                onClick={() => { setStatus('idle'); setPostId(null); setPostTitle(null); setPostCategory(null); setErrorMsg(null) }}
                className="px-5 py-2.5 border border-white/20 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all font-medium"
              >
                Generate Another
              </button>
              <Link
                href="/admin/blog"
                className="px-5 py-2.5 border border-white/20 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all font-medium"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6">
            <div className="bg-red-500/10 backdrop-blur-sm border border-red-500/30 rounded-lg p-8 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">❌</span>
                <h2 className="text-xl font-semibold text-red-300">Generation Failed</h2>
              </div>
              <p className="text-slate-300">{errorMsg || 'An unknown error occurred.'}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => { setStatus('idle'); setPostId(null); setErrorMsg(null) }}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium"
              >
                Try Again
              </button>
              <Link
                href="/admin/blog/settings"
                className="px-5 py-2.5 border border-white/20 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all font-medium"
              >
                Check Settings
              </Link>
              <Link
                href="/admin/blog"
                className="px-5 py-2.5 border border-white/20 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-all font-medium"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
