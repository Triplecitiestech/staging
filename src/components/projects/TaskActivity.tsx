'use client'

import { useState, useCallback, useEffect } from 'react'

interface ActivityItem {
  id: string
  type: 'note' | 'time_entry'
  title: string
  description: string
  authorName: string
  authorResourceId: number | null
  createdAt: string
  isInternal: boolean
  hoursWorked?: number
  dateWorked?: string
}

interface TaskActivityProps {
  autotaskTaskId: string | null
  taskId: string
}

export default function TaskActivity({ autotaskTaskId, taskId }: TaskActivityProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [autoFetched, setAutoFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New note form
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteIsInternal, setNoteIsInternal] = useState(false)
  const [submittingNote, setSubmittingNote] = useState(false)

  // New time entry form
  const [showTimeForm, setShowTimeForm] = useState(false)
  const [timeHours, setTimeHours] = useState('')
  const [timeDate, setTimeDate] = useState(new Date().toISOString().split('T')[0])
  const [timeSummary, setTimeSummary] = useState('')
  const [timeInternal, setTimeInternal] = useState('')
  const [submittingTime, setSubmittingTime] = useState(false)

  // Filter state
  const [showSystemNotes, setShowSystemNotes] = useState(true)

  const fetchActivity = useCallback(async () => {
    if (!autotaskTaskId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/autotask/activity?taskId=${autotaskTaskId}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch')
      }
      const data = await res.json()
      setActivities(data.activities || [])
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [autotaskTaskId])

  // Auto-fetch activity on mount so comms trail is visible immediately
  useEffect(() => {
    if (autotaskTaskId && !autoFetched) {
      setAutoFetched(true)
      fetchActivity()
    }
  }, [autotaskTaskId, autoFetched, fetchActivity])

  const toggleExpanded = () => {
    const nextExpanded = !isExpanded
    setIsExpanded(nextExpanded)
    if (nextExpanded && !loaded && autotaskTaskId) {
      fetchActivity()
    }
  }

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteText.trim() || !autotaskTaskId) return
    setSubmittingNote(true)
    try {
      const res = await fetch('/api/autotask/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autotaskTaskId,
          description: noteText.trim(),
          isInternal: noteIsInternal,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create note')
      }
      setNoteText('')
      setNoteIsInternal(false)
      setShowNoteForm(false)
      fetchActivity()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create note')
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleCreateTimeEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!timeHours || !autotaskTaskId) return
    setSubmittingTime(true)
    try {
      const res = await fetch('/api/autotask/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autotaskTaskId,
          hoursWorked: timeHours,
          dateWorked: timeDate,
          summaryNotes: timeSummary,
          internalNotes: timeInternal,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create time entry')
      }
      setTimeHours('')
      setTimeSummary('')
      setTimeInternal('')
      setShowTimeForm(false)
      fetchActivity()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create time entry')
    } finally {
      setSubmittingTime(false)
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return (parts[0]?.[0] || '?').toUpperCase()
  }

  // No Autotask ID means this task isn't synced — hide activity
  if (!autotaskTaskId) {
    void taskId // consumed to satisfy interface
    return null
  }

  const filteredActivities = showSystemNotes
    ? activities
    : activities.filter(a => !a.title.includes('System') && a.authorName !== 'System')

  return (
    <div className="mt-2">
      {/* Toggle button */}
      <button
        onClick={toggleExpanded}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium">Activity</span>
        {loaded && <span className="text-slate-500">({activities.length})</span>}
      </button>

      {isExpanded && (
        <div className="mt-2 ml-1 border-l-2 border-cyan-500/30 pl-4">
          {/* Action buttons row — matching Autotask UI */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-700/50">
            <button
              onClick={() => { setShowTimeForm(!showTimeForm); setShowNoteForm(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                showTimeForm
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800/50 text-slate-400 border-slate-600/50 hover:text-slate-300 hover:border-slate-500/50'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              New Time Entry
            </button>
            <button
              onClick={() => { setShowNoteForm(!showNoteForm); setShowTimeForm(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                showNoteForm
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800/50 text-slate-400 border-slate-600/50 hover:text-slate-300 hover:border-slate-500/50'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              New Note
            </button>
            {/* Open in Autotask */}
            <a
              href={`/api/autotask/link?type=task&id=${autotaskTaskId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Open in Autotask"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Autotask
            </a>
            <button
              onClick={fetchActivity}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
              title="Refresh activity"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* New Note Form */}
          {showNoteForm && (
            <form onSubmit={handleCreateNote} className="mb-4 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg space-y-2">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note..."
                className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-sm text-slate-300 resize-none focus:outline-none focus:border-cyan-500/50"
                rows={3}
                autoFocus
              />
              <div className="flex items-center gap-3">
                <div className="flex rounded-md overflow-hidden border border-white/10">
                  <button
                    type="button"
                    onClick={() => setNoteIsInternal(false)}
                    className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      !noteIsInternal ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    All (External)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteIsInternal(true)}
                    className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      noteIsInternal ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    Internal Only
                  </button>
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setShowNoteForm(false)}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!noteText.trim() || submittingNote}
                  className="px-3 py-1.5 text-xs font-semibold bg-cyan-500 text-white rounded-md hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingNote ? 'Posting...' : 'Add Note'}
                </button>
              </div>
            </form>
          )}

          {/* New Time Entry Form */}
          {showTimeForm && (
            <form onSubmit={handleCreateTimeEntry} className="mb-4 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 block">Date</label>
                  <input
                    type="date"
                    value={timeDate}
                    onChange={(e) => setTimeDate(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-white/10 rounded-md text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 block">Hours</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={timeHours}
                    onChange={(e) => setTimeHours(e.target.value)}
                    placeholder="0.50"
                    className="w-full px-2 py-1.5 bg-slate-900 border border-white/10 rounded-md text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>
              <textarea
                value={timeSummary}
                onChange={(e) => setTimeSummary(e.target.value)}
                placeholder="Summary notes..."
                className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-sm text-slate-300 resize-none focus:outline-none focus:border-cyan-500/50"
                rows={2}
              />
              <textarea
                value={timeInternal}
                onChange={(e) => setTimeInternal(e.target.value)}
                placeholder="Internal notes (optional)..."
                className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-sm text-slate-300 resize-none focus:outline-none focus:border-cyan-500/50"
                rows={2}
              />
              <div className="flex items-center gap-3">
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setShowTimeForm(false)}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!timeHours || submittingTime}
                  className="px-3 py-1.5 text-xs font-semibold bg-cyan-500 text-white rounded-md hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingTime ? 'Saving...' : 'Log Time'}
                </button>
              </div>
            </form>
          )}

          {/* Filter controls */}
          {loaded && activities.length > 0 && (
            <div className="flex items-center gap-3 mb-3 text-[10px]">
              <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSystemNotes}
                  onChange={(e) => setShowSystemNotes(e.target.checked)}
                  className="w-3 h-3 rounded border-slate-600 bg-slate-900 accent-cyan-500"
                />
                Show System Notes
              </label>
            </div>
          )}

          {/* Loading state */}
          {loading && !loaded && (
            <div className="py-4 text-center">
              <div className="inline-block w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-500 mt-2">Loading activity...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="py-3 px-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
              <button onClick={fetchActivity} className="text-xs text-red-300 hover:text-red-200 mt-1 underline">
                Retry
              </button>
            </div>
          )}

          {/* Activity feed */}
          {loaded && !loading && (
            <>
              {filteredActivities.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 italic">No activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {filteredActivities.map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      {/* Author avatar */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        activity.type === 'time_entry'
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : activity.isInternal
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-cyan-500/20 text-cyan-300'
                      }`}>
                        {getInitials(activity.authorName)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Author + icon */}
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-semibold ${
                            activity.type === 'time_entry' ? 'text-indigo-300' : 'text-cyan-300'
                          }`}>
                            {activity.type === 'note' && (
                              <svg className="w-3.5 h-3.5 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            )}
                            {activity.type === 'time_entry' && (
                              <svg className="w-3.5 h-3.5 inline mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            {activity.authorName}
                          </span>
                        </div>

                        {/* Title (bold) */}
                        <p className="text-xs font-semibold text-white mb-0.5">{activity.title}</p>

                        {/* Description */}
                        {activity.description && (
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{activity.description}</p>
                        )}

                        {/* Internal badge + timestamp */}
                        <div className="flex items-center gap-2 mt-1">
                          {activity.isInternal && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Internal Only
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">{formatDateTime(activity.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
