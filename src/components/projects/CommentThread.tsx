'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Comment {
  id: string
  content: string
  isInternal: boolean
  createdAt: string
  authorName: string
  authorEmail: string
}

interface CommentThreadProps {
  taskId: string
  comments: Comment[]
}

export default function CommentThread({ taskId, comments: initialComments }: CommentThreadProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [comments, setComments] = useState(initialComments)
  const [newComment, setNewComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (threadRef.current && !threadRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          content: newComment.trim(),
          isInternal,
        }),
      })

      if (!res.ok) throw new Error()

      const comment = await res.json()
      setComments([...comments, comment])
      setNewComment('')
      setIsInternal(false)
      router.refresh()
    } catch {
      alert('Failed to add comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const commentCount = comments.length
  const hasComments = commentCount > 0

  return (
    <div className="relative" ref={threadRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1 text-xs font-semibold rounded border transition-colors ${
          hasComments
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30'
            : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700'
        }`}
      >
        💬 {commentCount > 0 ? `${commentCount} Comment${commentCount !== 1 ? 's' : ''}` : 'Comment'}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3">Comments</h3>

            {/* Comment list */}
            {hasComments ? (
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-3 rounded-lg ${
                      comment.isInternal
                        ? 'bg-orange-500/10 border border-orange-500/30'
                        : 'bg-slate-700/50 border border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200">
                          {comment.authorName || comment.authorEmail || 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-400">{formatDate(comment.createdAt)}</div>
                      </div>
                      {comment.isInternal && (
                        <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                          Internal
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-4 italic">No comments yet</p>
            )}

            {/* New comment form */}
            <form onSubmit={handleSubmit} className="space-y-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded text-slate-300 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
                rows={3}
              />

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-orange-500 focus:ring-orange-500/50"
                  />
                  <span className="text-xs text-slate-400">
                    Internal only
                    <svg className="inline-block w-3 h-3 ml-1 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
