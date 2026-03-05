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

interface ContactOption {
  name: string
  email: string
  type: 'staff' | 'contact'
}

interface CommentThreadProps {
  taskId: string
  comments: Comment[]
  projectContacts?: ContactOption[]
}

export default function CommentThread({ taskId, comments: initialComments, projectContacts = [] }: CommentThreadProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [comments, setComments] = useState(initialComments)
  useEffect(() => { setComments(initialComments) }, [initialComments])
  const [newComment, setNewComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [notifyEmails, setNotifyEmails] = useState<string[]>([])
  const [showNotifyPicker, setShowNotifyPicker] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (threadRef.current && !threadRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setEditingId(null)
        setShowNotifyPicker(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Auto-scroll to bottom when new comments come in
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [comments, isOpen])

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
          notifyEmails: notifyEmails.length > 0 ? notifyEmails : undefined,
        }),
      })

      if (!res.ok) throw new Error()

      const comment = await res.json()
      setComments([...comments, comment])
      setNewComment('')
      setIsInternal(false)
      setNotifyEmails([])
      setShowNotifyPicker(false)
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

  const toggleNotifyEmail = (email: string) => {
    setNotifyEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    )
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
  const internalCount = comments.filter(c => c.isInternal).length
  const externalCount = commentCount - internalCount

  // Separate contacts by type
  const staffContacts = projectContacts.filter(c => c.type === 'staff')
  const clientContacts = projectContacts.filter(c => c.type === 'contact')

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
        <div className="absolute right-0 mt-2 w-[420px] max-w-[calc(100vw-2rem)] bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50">
          {/* Header */}
          <div className="px-4 pt-4 pb-2 border-b border-white/10">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">Notes</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {hasComments && (
              <div className="flex items-center gap-3 text-[10px]">
                <span className="text-slate-400">{commentCount} total</span>
                {externalCount > 0 && (
                  <span className="flex items-center gap-1 text-cyan-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    {externalCount} external
                  </span>
                )}
                {internalCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    {internalCount} internal
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-4">
            {/* Conversation thread */}
            {hasComments ? (
              <div ref={scrollRef} className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-2.5">
                    {/* Avatar */}
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      comment.isInternal
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-cyan-500/20 text-cyan-300'
                    }`}>
                      {(comment.authorName || '?')[0].toUpperCase()}
                    </div>

                    {/* Message bubble */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {comment.authorName || comment.authorEmail || 'Unknown'}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                          comment.isInternal
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                        }`}>
                          {comment.isInternal ? 'Internal' : 'External'}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-auto flex-shrink-0" title={formatTimestamp(comment.createdAt)}>
                          {formatDate(comment.createdAt)}
                          {comment.updatedAt && comment.updatedAt !== comment.createdAt && ' (edited)'}
                        </span>
                      </div>

                      {/* Content or edit form */}
                      {editingId === comment.id ? (
                        <div className="space-y-2 mt-1">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full px-2.5 py-2 bg-slate-900 border border-white/20 rounded-lg text-slate-300 text-sm resize-none focus:outline-none focus:border-cyan-500/50"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(comment.id)}
                              className="px-2.5 py-1 text-xs bg-cyan-500 text-white rounded-md hover:bg-cyan-600"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditContent('') }}
                              className="px-2.5 py-1 text-xs bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`rounded-lg px-3 py-2 ${
                          comment.isInternal
                            ? 'bg-rose-500/10 border border-rose-500/20'
                            : 'bg-slate-700/50 border border-white/5'
                        }`}>
                          <p className="text-[13px] text-slate-300 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
                          <button
                            onClick={() => { setEditingId(comment.id); setEditContent(comment.content) }}
                            className="text-[10px] text-slate-500 hover:text-cyan-400 mt-1.5 transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-4 italic text-center py-6">No notes yet. Start the conversation below.</p>
            )}

            {/* New note form */}
            <form onSubmit={handleSubmit} className="space-y-2 border-t border-white/10 pt-3">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a note..."
                className="w-full px-3 py-2.5 bg-slate-900 border border-white/15 rounded-lg text-slate-300 text-sm resize-none focus:outline-none focus:border-cyan-500/50 placeholder:text-slate-600"
                rows={2}
              />

              {/* Controls row */}
              <div className="flex items-center gap-3">
                {/* Internal/External toggle */}
                <div className="flex rounded-md overflow-hidden border border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsInternal(false)}
                    className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      !isInternal
                        ? 'bg-cyan-500/20 text-cyan-300 border-r border-cyan-500/30'
                        : 'bg-slate-800 text-slate-500 border-r border-white/10 hover:text-slate-400'
                    }`}
                  >
                    External
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInternal(true)}
                    className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      isInternal
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    Internal
                  </button>
                </div>

                {/* Notify button */}
                {projectContacts.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowNotifyPicker(!showNotifyPicker)}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md border transition-colors ${
                        notifyEmails.length > 0
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'bg-slate-800 text-slate-500 border-white/10 hover:text-slate-400'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      Notify{notifyEmails.length > 0 && ` (${notifyEmails.length})`}
                    </button>

                    {showNotifyPicker && (
                      <div className="absolute bottom-full left-0 mb-1 w-64 bg-slate-900 border border-white/20 rounded-lg shadow-xl z-50 max-h-52 overflow-y-auto">
                        {staffContacts.length > 0 && (
                          <>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-800/80 sticky top-0">
                              TCT Team
                            </div>
                            {staffContacts.map(contact => (
                              <label
                                key={contact.email}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={notifyEmails.includes(contact.email)}
                                  onChange={() => toggleNotifyEmail(contact.email)}
                                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-purple-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-slate-200 truncate">{contact.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate">{contact.email}</div>
                                </div>
                              </label>
                            ))}
                          </>
                        )}
                        {clientContacts.length > 0 && (
                          <>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-800/80 sticky top-0">
                              Client Contacts
                            </div>
                            {clientContacts.map(contact => (
                              <label
                                key={contact.email}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={notifyEmails.includes(contact.email)}
                                  onChange={() => toggleNotifyEmail(contact.email)}
                                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-purple-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-slate-200 truncate">{contact.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate">{contact.email}</div>
                                </div>
                              </label>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1" />

                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Posting...' : 'Add Note'}
                </button>
              </div>

              {/* Notify summary */}
              {notifyEmails.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-purple-400">Notifying:</span>
                  {notifyEmails.map(email => {
                    const contact = projectContacts.find(c => c.email === email)
                    return (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-purple-500/15 text-purple-300 rounded-full border border-purple-500/20"
                      >
                        {contact?.name?.split(' ')[0] || email}
                        <button
                          type="button"
                          onClick={() => toggleNotifyEmail(email)}
                          className="hover:text-purple-100"
                        >
                          &times;
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
