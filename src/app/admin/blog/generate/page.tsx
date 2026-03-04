'use client'

import { useState } from 'react'
import Link from 'next/link'
import AdminHeader from '@/components/admin/AdminHeader'

interface GenerationResult {
  success: boolean
  skipped?: boolean
  reason?: string
  message?: string
  error?: string
  details?: string
  validationErrors?: string[]
  blogPost?: {
    id: string
    title: string
    slug: string
    category: string
    status: string
    previewUrl: string
    approveUrl: string
  }
  articlesUsed?: number
  trendingTopic?: string | null
}

export default function GenerateBlogPage() {
  const [status, setStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const handleGenerate = async () => {
    setStatus('generating')
    setResult(null)
    setElapsed(0)

    const timer = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)

    try {
      const response = await fetch('/api/blog/generate-now', {
        signal: AbortSignal.timeout(55000),
      })

      clearInterval(timer)

      // Handle non-JSON responses (e.g. Vercel timeout HTML pages)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setStatus('error')
        setResult({
          success: false,
          error: response.status === 504
            ? 'Request timed out. The blog generation process took too long. Try again — RSS feeds may have been slow to respond.'
            : `Server returned an unexpected response (${response.status}). Check that your environment variables are configured correctly.`,
        })
        return
      }

      const data: GenerationResult = await response.json()

      if (!response.ok) {
        setStatus('error')
        setResult(data)
        return
      }

      if (data.skipped) {
        setStatus('error')
        setResult({ ...data, error: data.reason })
        return
      }

      setStatus('success')
      setResult(data)
    } catch (err) {
      clearInterval(timer)
      setStatus('error')

      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError'
      setResult({
        success: false,
        error: isTimeout
          ? 'Request timed out after 55 seconds. The AI generation may still be running — check the blog dashboard in a minute to see if a post was created.'
          : err instanceof Error ? err.message : 'Network error. Check your connection and try again.',
      })
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
                This will fetch articles from your configured RSS sources, select trending topics, and use AI to write a new blog post. The process typically takes 15-30 seconds.
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
                {elapsed < 5 && 'Fetching RSS feeds and selecting articles...'}
                {elapsed >= 5 && elapsed < 15 && 'Analyzing trending topics and generating content...'}
                {elapsed >= 15 && elapsed < 25 && 'Writing blog post with AI — almost there...'}
                {elapsed >= 25 && 'Still working — this is taking longer than usual...'}
              </p>
              <p className="text-sm text-slate-500 mt-3">{elapsed}s elapsed</p>
            </div>
          </div>
        )}

        {status === 'success' && result?.blogPost && (
          <div className="space-y-6">
            <div className="bg-green-500/10 backdrop-blur-sm border border-green-500/30 rounded-lg p-8 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">✅</span>
                <h2 className="text-xl font-semibold text-green-300">Blog Post Generated!</h2>
              </div>
              <p className="text-slate-300">{result.message}</p>

              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-white text-lg">{result.blogPost.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {result.blogPost.category}
                  </span>
                  <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                    {result.blogPost.status.replace(/_/g, ' ')}
                  </span>
                  {result.articlesUsed && (
                    <span className="px-2 py-1 text-xs rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30">
                      {result.articlesUsed} sources used
                    </span>
                  )}
                  {result.trendingTopic && (
                    <span className="px-2 py-1 text-xs rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Trending: {result.trendingTopic}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/admin/blog/${result.blogPost.id}/edit`}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white rounded-lg transition-all font-medium"
              >
                Edit Post
              </Link>
              <button
                onClick={() => {
                  setStatus('idle')
                  setResult(null)
                }}
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
              <p className="text-slate-300">{result?.error || result?.details || 'An unknown error occurred.'}</p>
              {result?.validationErrors && (
                <ul className="list-disc list-inside text-sm text-red-300/80 space-y-1">
                  {result.validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setStatus('idle')
                  setResult(null)
                }}
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
