'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Comment {
  id: string
  content: string
  isInternal: boolean
  createdAt: string
  updatedAt?: string
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (threadRef.current && !threadRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setEditingId(null)
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
      alert('Failed to add note')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return

    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update')
      }

      const updated = await res.json()
      setComments(comments.map(c => c.id === commentId ? updated : c))
      setEditingId(null)
      setEditContent('')
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update note')
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

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' +
      date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const commentCount = comments.length
  const hasComments = commentCount > 0

  return (
    <div className="relative" ref={threadRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 text-xs transition-colors ${
          hasComments
            ? 'text-cyan-400 hover:text-cyan-300'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {hasComments ? (
          <span>{commentCount}</span>
        ) : (
          <span>Add note</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Notes {hasComments && <span className="text-slate-400 font-normal">({commentCount})</span>}
            </h3>

            {/* Conversation thread */}
            {hasComments ? (
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-3 rounded-lg ${
                      comment.isInternal
                        ? 'bg-rose-500/10 border border-rose-500/30'
                        : 'bg-slate-700/50 border border-white/10'
                    }`}
                  >
                    {/* Header: author + timestamp */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">
                          {comment.authorName || comment.authorEmail || 'Unknown'}
                        </span>
                        {comment.isInternal && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                            Internal
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500" title={formatTimestamp(comment.createdAt)}>
                        {formatDate(comment.createdAt)}
                        {comment.updatedAt && comment.updatedAt !== comment.createdAt && ' (edited)'}
                      </span>
                    </div>

                    {/* Content or edit form */}
                    {editingId === comment.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-white/20 rounded text-slate-300 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(comment.id)}
                            className="px-2 py-1 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditContent('') }}
                            className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group/note">
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{comment.content}</p>
                        <button
                          onClick={() => { setEditingId(comment.id); setEditContent(comment.content) }}
                          className="text-[10px] text-slate-500 hover:text-cyan-400 mt-1 opacity-0 group-hover/note:opacity-100 transition-opacity"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-4 italic">No notes yet. Add the first note below.</p>
            )}

            {/* New note form */}
            <form onSubmit={handleSubmit} className="space-y-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a note..."
                className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded text-slate-300 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
                rows={2}
              />

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-500/50"
                  />
                  <span className="text-[10px] text-slate-400">Internal only</span>
                </label>

                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Posting...' : 'Add Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
