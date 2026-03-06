'use client'

import { useState, useEffect } from 'react'

interface Comment {
  id: string
  content: string
  authorName: string
  createdAt: string | Date
}

interface Task {
  id: string
  taskText: string
  completed: boolean
  orderIndex: number
  status: string
  notes?: string | null
  autotaskTaskId?: string | null
  comments?: Comment[]
}

interface Phase {
  id: string
  title: string
  description: string | null
  status: string
  customerNotes: string | null
  orderIndex: number
  tasks: Task[]
}

interface Project {
  id: string
  title: string
  projectType: string
  status: string
  phases: Phase[]
  createdAt: string | Date
  updatedAt: string | Date
}

interface Ticket {
  id: number
  ticketNumber: string
  title: string
  status: string
  createDate: string
  completedDate?: string | null
  priority: string
}

interface CustomerDashboardProps {
  projects: Project[]
  companyName?: string
  companySlug?: string
}

const DONE_STATUSES = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']

function getStatusBadge(status: string) {
  switch (status) {
    case 'WORK_IN_PROGRESS':
    case 'ASSIGNED':
      return { label: 'In Progress', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' }
    case 'WAITING_ON_CLIENT':
    case 'CUSTOMER_NOTE_ADDED':
      return { label: 'Waiting on You', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' }
    case 'WAITING_ON_VENDOR':
      return { label: 'Waiting on Vendor', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' }
    case 'NEEDS_REVIEW':
    case 'INFORMATION_RECEIVED':
      return { label: 'Under Review', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
    case 'STUCK':
      return { label: 'Needs Attention', color: 'bg-red-500/20 text-red-300 border-red-500/30' }
    case 'REVIEWED_AND_DONE':
    case 'ITG_DOCUMENTED':
      return { label: 'Complete', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
    case 'NOT_APPLICABLE':
      return { label: 'N/A', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
    default:
      return { label: 'New', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
}

function getPhaseStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETE':
      return { label: 'Complete', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
    case 'IN_PROGRESS':
      return { label: 'In Progress', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' }
    case 'WAITING_ON_CUSTOMER':
      return { label: 'Waiting on You', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' }
    case 'SCHEDULED':
      return { label: 'Scheduled', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' }
    case 'NOT_STARTED':
      return { label: 'Not Started', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
    default:
      return { label: status.replace(/_/g, ' '), color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
}

export default function CustomerDashboard({ projects, companyName, companySlug }: CustomerDashboardProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(
    projects.length === 1 ? projects[0] : null
  )
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({})
  const [submittingNote, setSubmittingNote] = useState<string | null>(null)
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)

  // Load tickets when companySlug is available
  useEffect(() => {
    if (!companySlug) return
    setTicketsLoading(true)
    fetch(`/api/customer/tickets?companySlug=${encodeURIComponent(companySlug)}`)
      .then(res => res.ok ? res.json() : { tickets: [] })
      .then(data => setTickets(data.tickets || []))
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false))
  }, [companySlug])

  const toggleTask = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const handleSubmitNote = async (taskId: string) => {
    const content = noteInputs[taskId]?.trim()
    if (!content || submittingNote) return

    setSubmittingNote(taskId)
    try {
      const res = await fetch('/api/customer/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, content }),
      })
      if (res.ok) {
        setNoteInputs(prev => ({ ...prev, [taskId]: '' }))
        setNoteSuccess(taskId)
        setTimeout(() => setNoteSuccess(null), 3000)
      }
    } catch {
      // silently fail
    } finally {
      setSubmittingNote(null)
    }
  }

  // Compute stats across all projects
  const allTasks = projects.flatMap(p =>
    p.phases.flatMap(ph => ph.tasks)
  )
  const openTasks = allTasks.filter(t => !DONE_STATUSES.includes(t.status))
  const completedTasks = allTasks.filter(t => DONE_STATUSES.includes(t.status))
  const needsAction = openTasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED')

  const openTickets = tickets.filter(t => !t.completedDate)
  const closedTickets = tickets.filter(t => !!t.completedDate)

  // Project selection view (when multiple projects)
  if (!selectedProject && projects.length > 1) {
    return (
      <div>
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
            <p className="text-lg text-cyan-400">Customer Dashboard</p>
          </div>
        )}

        {/* Stats Cards - Clickable */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <button onClick={() => setSelectedProject(projects[0])} className="bg-gray-800/50 border border-cyan-500/30 hover:border-cyan-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer">
            <div className="text-3xl font-bold text-white">{openTasks.length}</div>
            <div className="text-sm text-gray-400 mt-1">Open Tasks</div>
          </button>
          <button onClick={() => setSelectedProject(projects[0])} className="bg-gray-800/50 border border-green-500/30 hover:border-green-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-green-500/10 cursor-pointer">
            <div className="text-3xl font-bold text-green-400">{completedTasks.length}</div>
            <div className="text-sm text-gray-400 mt-1">Completed Tasks</div>
          </button>
          <button onClick={() => {/* scroll to projects */}} className="bg-gray-800/50 border border-purple-500/30 hover:border-purple-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer">
            <div className="text-3xl font-bold text-purple-400">{projects.length}</div>
            <div className="text-sm text-gray-400 mt-1">Projects</div>
          </button>
          <button onClick={() => setSelectedProject(projects.find(p => p.phases.some(ph => ph.tasks.some(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED'))) || projects[0])} className="bg-gray-800/50 border border-orange-500/30 hover:border-orange-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-orange-500/10 cursor-pointer">
            <div className="text-3xl font-bold text-orange-400">{needsAction.length}</div>
            <div className="text-sm text-gray-400 mt-1">Needs Your Action</div>
          </button>
        </div>

        {/* Tickets Card */}
        {renderTicketsCard(ticketsLoading, openTickets, closedTickets, tickets, selectedTicketId, setSelectedTicketId)}

        {/* Project Cards */}
        <h2 className="text-xl font-bold text-white mb-4">Your Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(project => {
            const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)
            const doneTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => DONE_STATUSES.includes(t.status)).length, 0)
            const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
            const waiting = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED').length, 0)

            return (
              <button
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className="bg-gray-800/50 border border-white/10 rounded-lg p-6 text-left hover:border-cyan-500/50 transition-all hover:shadow-lg hover:shadow-cyan-500/10 group"
              >
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors mb-2">
                  {project.title}
                </h3>
                <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
                  <span>{project.phases.length} phases</span>
                  <span>-</span>
                  <span>{totalTasks} tasks</span>
                  {waiting > 0 && (
                    <span className="text-orange-400 font-medium">{waiting} needs you</span>
                  )}
                </div>
                <div className="bg-gray-700 rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500">{progress}% complete</div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Single project detail view
  const project = selectedProject || projects[0]
  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">No projects found</p>
      </div>
    )
  }

  const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)
  const doneTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => DONE_STATUSES.includes(t.status)).length, 0)
  const projectProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div>
      {/* Back button for multi-project */}
      {projects.length > 1 && (
        <button
          onClick={() => setSelectedProject(null)}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-6 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to All Projects
        </button>
      )}

      {/* Project Header */}
      {companyName && !selectedProject && (
        <div className="mb-4 text-center">
          <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
        </div>
      )}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">{project.title}</h2>
        <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
          <span>{projectProgress}% complete</span>
          <span>-</span>
          <span>{doneTasks} of {totalTasks} tasks done</span>
        </div>
        <div className="bg-gray-800/50 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all duration-500"
            style={{ width: `${projectProgress}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-gray-800/50 border border-cyan-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">{totalTasks - doneTasks}</div>
          <div className="text-xs text-gray-400 mt-1">Open Tasks</div>
        </div>
        <div className="bg-gray-800/50 border border-green-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{doneTasks}</div>
          <div className="text-xs text-gray-400 mt-1">Completed Tasks</div>
        </div>
        <div className="bg-gray-800/50 border border-purple-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">{project.phases.length}</div>
          <div className="text-xs text-gray-400 mt-1">Phases</div>
        </div>
        <div className="bg-gray-800/50 border border-orange-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-400">
            {project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED').length, 0)}
          </div>
          <div className="text-xs text-gray-400 mt-1">Needs Your Action</div>
        </div>
      </div>

      {/* Tickets Card (single project view) */}
      {projects.length === 1 && renderTicketsCard(ticketsLoading, openTickets, closedTickets, tickets, selectedTicketId, setSelectedTicketId)}

      {/* Phases */}
      <div className="space-y-4">
        {project.phases.map((phase, phaseIndex) => {
          const phaseTasks = phase.tasks.length
          const phaseComplete = phase.tasks.filter(t => DONE_STATUSES.includes(t.status)).length
          const phaseProgress = phaseTasks > 0 ? Math.round((phaseComplete / phaseTasks) * 100) : 0
          const phaseBadge = getPhaseStatusBadge(phase.status)

          return (
            <div key={phase.id} className="bg-gray-800/50 border border-white/10 rounded-lg overflow-hidden">
              {/* Phase Header */}
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                    phase.status === 'COMPLETE' ? 'bg-green-500' :
                    phase.status === 'IN_PROGRESS' ? 'bg-cyan-500' :
                    phase.status === 'WAITING_ON_CUSTOMER' ? 'bg-orange-500' :
                    'bg-gray-600'
                  }`}>
                    {phase.status === 'COMPLETE' ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      phaseIndex + 1
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="text-lg font-bold text-white">{phase.title}</h3>
                      <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${phaseBadge.color}`}>
                        {phaseBadge.label}
                      </span>
                    </div>
                    {phase.description && (
                      <p className="text-sm text-gray-400 mb-2">{phase.description}</p>
                    )}
                    {phaseTasks > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">{phaseComplete}/{phaseTasks} tasks</span>
                          <span className="text-xs text-gray-500">{phaseProgress}%</span>
                        </div>
                        <div className="bg-gray-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              phase.status === 'COMPLETE' ? 'bg-green-500' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${phaseProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tasks */}
              {phaseTasks > 0 && (
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {phase.tasks.map(task => {
                    const badge = getStatusBadge(task.status)
                    const isExpanded = expandedTasks.has(task.id)
                    const hasComments = task.comments && task.comments.length > 0

                    return (
                      <div key={task.id} className="px-5">
                        {/* Task row */}
                        <button
                          onClick={() => toggleTask(task.id)}
                          className="w-full py-3 flex items-center gap-3 text-left group"
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            DONE_STATUSES.includes(task.status)
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-600'
                          }`}>
                            {DONE_STATUSES.includes(task.status) && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className={`flex-1 text-sm ${
                            DONE_STATUSES.includes(task.status) ? 'text-gray-500 line-through' : 'text-white'
                          }`}>
                            {task.taskText}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ${badge.color}`}>
                            {badge.label}
                          </span>
                          {hasComments && (
                            <span className="text-xs text-gray-500">{task.comments!.length} note{task.comments!.length !== 1 ? 's' : ''}</span>
                          )}
                          <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Expanded task details */}
                        {isExpanded && (
                          <div className="pb-4 pl-8 space-y-3">
                            {/* Task notes */}
                            {task.notes && (
                              <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-3 py-2">
                                <p className="text-xs font-semibold text-cyan-300 uppercase mb-1">Notes</p>
                                <p className="text-sm text-gray-300 whitespace-pre-wrap">{task.notes}</p>
                              </div>
                            )}

                            {/* External comments/notes */}
                            {hasComments && (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-400 uppercase">Activity</p>
                                {task.comments!.map(comment => (
                                  <div key={comment.id} className="bg-gray-700/50 rounded-lg px-3 py-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-cyan-400">{comment.authorName}</span>
                                      <span className="text-xs text-gray-500">
                                        {new Date(comment.createdAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-300">{comment.content}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add note form */}
                            {!DONE_STATUSES.includes(task.status) && (
                              <div className="mt-2">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={noteInputs[task.id] || ''}
                                    onChange={e => setNoteInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSubmitNote(task.id) }}
                                    placeholder="Add a note..."
                                    className="flex-1 bg-gray-700/50 text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-cyan-500/50 focus:outline-none placeholder-gray-500"
                                  />
                                  <button
                                    onClick={() => handleSubmitNote(task.id)}
                                    disabled={!noteInputs[task.id]?.trim() || submittingNote === task.id}
                                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    {submittingNote === task.id ? 'Sending...' : 'Send'}
                                  </button>
                                </div>
                                {noteSuccess === task.id && (
                                  <p className="text-xs text-green-400 mt-1">Note sent successfully</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function renderTicketsCard(
  loading: boolean,
  openTickets: Ticket[],
  closedTickets: Ticket[],
  allTickets: Ticket[],
  selectedTicketId: number | null,
  setSelectedTicketId: (id: number | null) => void
) {
  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-bold text-white mb-2">Recent Tickets (Last 30 Days)</h3>
        <p className="text-sm text-gray-400">Loading tickets...</p>
      </div>
    )
  }

  if (allTickets.length === 0) return null

  const selectedTicket = selectedTicketId ? allTickets.find(t => t.id === selectedTicketId) : null

  // If a ticket is selected, show the detail view
  if (selectedTicket) {
    return (
      <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 mb-8">
        <button
          onClick={() => setSelectedTicketId(null)}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-4 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Tickets
        </button>
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-bold text-white">{selectedTicket.title}</h3>
            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
              selectedTicket.completedDate
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
            }`}>
              {selectedTicket.completedDate ? 'Closed' : 'Open'}
            </span>
          </div>
          <p className="text-sm text-gray-400">Ticket #{selectedTicket.ticketNumber}</p>
        </div>

        {/* Ticket Timeline */}
        <div className="space-y-3">
          <div className="bg-gray-700/30 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-cyan-400">Ticket Created</span>
              <span className="text-xs text-gray-500">{new Date(selectedTicket.createDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
            <p className="text-sm text-gray-300">{selectedTicket.title}</p>
          </div>
          {selectedTicket.completedDate && (
            <div className="bg-green-500/10 rounded-lg px-4 py-3 border border-green-500/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-green-400">Ticket Resolved</span>
                <span className="text-xs text-gray-500">{new Date(selectedTicket.completedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
              <p className="text-sm text-gray-300">This ticket has been completed and closed.</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4">For detailed ticket notes, contact your account manager or call (607) 341-7500.</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 mb-8">
      <h3 className="text-lg font-bold text-white mb-4">Recent Tickets (Last 30 Days)</h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-400">{openTickets.length}</div>
          <div className="text-xs text-gray-400">Open</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{closedTickets.length}</div>
          <div className="text-xs text-gray-400">Closed</div>
        </div>
      </div>
      {allTickets.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {allTickets.slice(0, 10).map(ticket => (
            <button
              key={ticket.id}
              onClick={() => setSelectedTicketId(ticket.id)}
              className="w-full flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 rounded px-3 py-2 transition-colors text-left group cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate group-hover:text-cyan-300 transition-colors">{ticket.title}</p>
                <p className="text-xs text-gray-500">#{ticket.ticketNumber} - {new Date(ticket.createDate).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                  ticket.completedDate
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-orange-500/20 text-orange-300'
                }`}>
                  {ticket.completedDate ? 'Closed' : 'Open'}
                </span>
                <svg className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
