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
      return { label: 'Waiting on You', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 'WAITING_ON_VENDOR':
      return { label: 'Waiting on Vendor', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' }
    case 'NEEDS_REVIEW':
    case 'INFORMATION_RECEIVED':
      return { label: 'Under Review', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
    case 'STUCK':
      return { label: 'Needs Attention', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' }
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
      return { label: 'Waiting on You', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 'SCHEDULED':
      return { label: 'Scheduled', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' }
    case 'NOT_STARTED':
      return { label: 'Not Started', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
    default:
      return { label: status.replace(/_/g, ' '), color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
}

function getProjectStatusLabel(status: string) {
  switch (status) {
    case 'ACTIVE': return { label: 'Active', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' }
    case 'COMPLETED': return { label: 'Completed', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
    case 'ON_HOLD': return { label: 'On Hold', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 'CANCELLED': return { label: 'Cancelled', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
    default: return { label: status, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
}

type DashboardView = 'dashboard' | 'open-tickets' | 'action-items'

export default function CustomerDashboard({ projects, companyName, companySlug }: CustomerDashboardProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectViewMode, setProjectViewMode] = useState<'vertical' | 'horizontal'>('vertical')
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set('__all__'))
  const [showAllTickets, setShowAllTickets] = useState(false)
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({})
  const [submittingNote, setSubmittingNote] = useState<string | null>(null)
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [ticketSearch, setTicketSearch] = useState('')
  const [dashboardView, setDashboardView] = useState<DashboardView>('dashboard')

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

  // When entering project detail, collapse all phases by default
  useEffect(() => {
    if (selectedProject) {
      setCollapsedPhases(new Set(selectedProject.phases.map(p => p.id)))
    }
  }, [selectedProject])

  const toggleTask = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const togglePhase = (phaseId: string) => {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
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
  const allTasks = projects.flatMap(p => p.phases.flatMap(ph => ph.tasks))
  const needsAction = allTasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED')
  const activeProjects = projects.filter(p => p.status === 'ACTIVE' || p.status === 'IN_PROGRESS')

  const openTickets = tickets.filter(t => !t.completedDate)
  const closedTickets = tickets.filter(t => !!t.completedDate)

  // Filter tickets by search - prioritize title match, then content
  const filterTickets = (ticketList: Ticket[]) => {
    if (!ticketSearch.trim()) return ticketList
    const query = ticketSearch.toLowerCase()
    const titleMatches: Ticket[] = []
    const otherMatches: Ticket[] = []
    for (const t of ticketList) {
      if (t.title.toLowerCase().includes(query)) {
        titleMatches.push(t)
      } else if (t.ticketNumber.toLowerCase().includes(query) || t.status.toLowerCase().includes(query)) {
        otherMatches.push(t)
      }
    }
    return [...titleMatches, ...otherMatches]
  }

  // If a ticket is selected for timeline view, show it
  if (selectedTicketId && !selectedProject) {
    const selectedTicket = tickets.find(t => t.id === selectedTicketId)
    if (selectedTicket && companySlug) {
      return (
        <div>
          {/* Company Header */}
          {companyName && (
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold text-white mb-1">{companyName} Portal</h1>
            </div>
          )}
          <TicketTimeline
            ticket={selectedTicket}
            companySlug={companySlug}
            onBack={() => setSelectedTicketId(null)}
          />
        </div>
      )
    }
  }

  // Project detail view
  if (selectedProject) {
    const project = selectedProject
    const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)
    const doneTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => DONE_STATUSES.includes(t.status)).length, 0)
    const projectProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

    return (
      <div>
        {/* Back button */}
        <button
          onClick={() => setSelectedProject(null)}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-6 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>

        {/* Project Header with company name */}
        <div className="mb-6">
          {companyName && (
            <p className="text-sm text-cyan-400 mb-1">{companyName}</p>
          )}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
            <h2 className="text-3xl font-bold text-white">{project.title}</h2>
            {/* View Toggle */}
            <div className="flex bg-gray-800/50 border border-white/10 rounded-lg p-1">
              <button
                onClick={() => setProjectViewMode('vertical')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  projectViewMode === 'vertical' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Vertical
              </button>
              <button
                onClick={() => setProjectViewMode('horizontal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  projectViewMode === 'horizontal' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                </svg>
                Horizontal
              </button>
            </div>
          </div>
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
          <div className="bg-gray-800/50 border border-indigo-500/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-indigo-400">{project.phases.length}</div>
            <div className="text-xs text-gray-400 mt-1">Phases</div>
          </div>
          <div className="bg-gray-800/50 border border-red-500/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-400">
              {project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED').length, 0)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Needs Your Action</div>
          </div>
        </div>

        {/* Horizontal view */}
        {projectViewMode === 'horizontal' && (
          <div className="overflow-x-auto pb-4 mb-4">
            <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
              {project.phases.map((phase, phaseIndex) => {
                const phaseTasks = phase.tasks.length
                const phaseComplete = phase.tasks.filter(t => DONE_STATUSES.includes(t.status)).length
                const phaseProgress = phaseTasks > 0 ? Math.round((phaseComplete / phaseTasks) * 100) : 0
                const phaseBadge = getPhaseStatusBadge(phase.status)

                return (
                  <div key={phase.id} className="w-80 flex-shrink-0 bg-gray-800/50 border border-white/10 rounded-lg overflow-visible">
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                          phase.status === 'COMPLETE' ? 'bg-green-500' :
                          phase.status === 'IN_PROGRESS' ? 'bg-cyan-500' :
                          phase.status === 'WAITING_ON_CUSTOMER' ? 'bg-red-500' :
                          'bg-gray-600'
                        }`}>
                          {phase.status === 'COMPLETE' ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : phaseIndex + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-white truncate">{phase.title}</h3>
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full border mt-1 ${phaseBadge.color}`}>
                            {phaseBadge.label}
                          </span>
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{phaseComplete}/{phaseTasks}</span>
                          <span>{phaseProgress}%</span>
                        </div>
                        <div className="bg-gray-700 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full ${phase.status === 'COMPLETE' ? 'bg-green-500' : 'bg-cyan-500'}`} style={{ width: `${phaseProgress}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {phase.tasks.map(task => {
                          const badge = getStatusBadge(task.status)
                          return (
                            <button
                              key={task.id}
                              onClick={() => { setProjectViewMode('vertical'); togglePhase(phase.id); toggleTask(task.id) }}
                              className="w-full flex items-center gap-2 text-left py-1.5 px-2 rounded hover:bg-gray-700/30 transition-colors group"
                            >
                              <div className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 ${
                                DONE_STATUSES.includes(task.status) ? 'bg-green-500 border-green-500' : 'border-gray-600'
                              }`} />
                              <span className={`flex-1 text-xs truncate ${
                                DONE_STATUSES.includes(task.status) ? 'text-gray-500 line-through' : 'text-gray-300 group-hover:text-white'
                              }`}>{task.taskText}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 ${badge.color}`}>{badge.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Vertical view - Phases collapsed by default */}
        {projectViewMode === 'vertical' && <div className="space-y-4">
          {project.phases.map((phase, phaseIndex) => {
            const phaseTasks = phase.tasks.length
            const phaseComplete = phase.tasks.filter(t => DONE_STATUSES.includes(t.status)).length
            const phaseProgress = phaseTasks > 0 ? Math.round((phaseComplete / phaseTasks) * 100) : 0
            const phaseBadge = getPhaseStatusBadge(phase.status)
            const isCollapsed = collapsedPhases.has(phase.id)

            return (
              <div key={phase.id} className="bg-gray-800/50 border border-white/10 rounded-lg overflow-visible">
                {/* Phase Header - clickable to toggle */}
                <button
                  onClick={() => togglePhase(phase.id)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${
                      phase.status === 'COMPLETE' ? 'bg-green-500' :
                      phase.status === 'IN_PROGRESS' ? 'bg-cyan-500' :
                      phase.status === 'WAITING_ON_CUSTOMER' ? 'bg-red-500' :
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
                          Status: {phaseBadge.label}
                        </span>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform ml-auto flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
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
                </button>

                {/* Phase content - shown when expanded */}
                {!isCollapsed && (
                  <div>
                    {/* Description and notes */}
                    {(phase.description || phase.customerNotes) && (
                      <div className="px-5 pb-3 ml-14">
                        {phase.description && (
                          <p className="text-sm text-gray-400 mb-2">{phase.description}</p>
                        )}
                        {phase.customerNotes && (
                          <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-3 py-2">
                            <p className="text-xs font-semibold text-cyan-300 uppercase mb-1">Notes</p>
                            <p className="text-sm text-gray-300 whitespace-pre-wrap">{phase.customerNotes}</p>
                          </div>
                        )}
                      </div>
                    )}

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
                                  Status: {badge.label}
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
                                  {task.notes && (
                                    <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-3 py-2">
                                      <p className="text-xs font-semibold text-cyan-300 uppercase mb-1">Notes</p>
                                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{task.notes}</p>
                                    </div>
                                  )}

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
                )}
              </div>
            )
          })}
        </div>}
      </div>
    )
  }

  // "Open Tickets" sub-view
  if (dashboardView === 'open-tickets') {
    const filtered = filterTickets(openTickets)
    return (
      <div>
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName} Portal</h1>
          </div>
        )}
        <button
          onClick={() => { setDashboardView('dashboard'); setTicketSearch('') }}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-6 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-2xl font-bold text-white">Open Tickets ({openTickets.length})</h2>
          <div className="relative w-full md:w-72">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-full bg-gray-800/50 text-white text-sm rounded-lg pl-10 pr-3 py-2 border border-white/10 focus:border-cyan-500/50 focus:outline-none placeholder-gray-500"
            />
          </div>
        </div>
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{ticketSearch ? 'No tickets match your search.' : 'No open tickets.'}</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filtered.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => { setSelectedTicketId(ticket.id); setDashboardView('dashboard') }}
                  className="w-full flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors text-left group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate group-hover:text-cyan-300 transition-colors">{ticket.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">#{ticket.ticketNumber} - {new Date(ticket.createDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap bg-blue-500/20 text-blue-300">Open</span>
                    <svg className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // "Awaiting Your Action" sub-view
  if (dashboardView === 'action-items') {
    const actionProjects = projects.filter(p => p.phases.some(ph => ph.tasks.some(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED')))
    const actionTickets = openTickets.filter(t => {
      const s = t.status.toLowerCase()
      return s.includes('customer') || s.includes('waiting')
    })
    return (
      <div>
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName} Portal</h1>
          </div>
        )}
        <button
          onClick={() => setDashboardView('dashboard')}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-6 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </button>
        <h2 className="text-2xl font-bold text-white mb-4">Items Awaiting Your Action ({needsAction.length + actionTickets.length})</h2>

        {/* Tasks needing action grouped by project */}
        {actionProjects.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Project Tasks</h3>
            <div className="space-y-3">
              {actionProjects.map(project => {
                const waitingTasks = project.phases.flatMap(ph => ph.tasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED'))
                return (
                  <div key={project.id} className="bg-gray-800/50 border border-red-500/20 rounded-lg p-4">
                    <button
                      onClick={() => setSelectedProject(project)}
                      className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors mb-2 block"
                    >
                      {project.title}
                    </button>
                    <div className="space-y-1.5">
                      {waitingTasks.map(task => (
                        <div key={task.id} className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                          <span className="text-gray-300">{task.taskText}</span>
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-red-500/20 text-red-400 border-red-500/30 whitespace-nowrap ml-auto">Waiting on You</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tickets needing action */}
        {actionTickets.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Tickets Needing Response</h3>
            <div className="bg-gray-800/50 border border-white/10 rounded-lg p-4 space-y-2">
              {actionTickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => { setSelectedTicketId(ticket.id); setDashboardView('dashboard') }}
                  className="w-full flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors text-left group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate group-hover:text-cyan-300">{ticket.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">#{ticket.ticketNumber}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {needsAction.length === 0 && actionTickets.length === 0 && (
          <div className="bg-gray-800/50 border border-green-500/20 rounded-lg p-8 text-center">
            <svg className="w-12 h-12 text-green-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-lg font-medium text-white">All caught up!</p>
            <p className="text-sm text-gray-400 mt-1">No items currently require your action.</p>
          </div>
        )}
      </div>
    )
  }

  // Dashboard view (default)
  return (
    <div>
      {/* Company Header */}
      {companyName && (
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-1">{companyName} Portal</h1>
          <p className="text-lg text-cyan-400">Customer Dashboard</p>
        </div>
      )}

      {/* Summary Cards - all clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => setDashboardView('open-tickets')}
          className="bg-gray-800/50 border border-blue-500/30 hover:border-blue-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-blue-400">{openTickets.length}</div>
          <div className="text-sm text-gray-400 mt-1">Open Tickets</div>
        </button>
        <button
          onClick={() => { setShowAllTickets(true); document.getElementById('tickets-section')?.scrollIntoView({ behavior: 'smooth' }) }}
          className="bg-gray-800/50 border border-green-500/30 hover:border-green-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-green-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-green-400">{closedTickets.length}</div>
          <div className="text-sm text-gray-400 mt-1">Closed Tickets (30d)</div>
        </button>
        <button
          onClick={() => document.getElementById('projects-section')?.scrollIntoView({ behavior: 'smooth' })}
          className="bg-gray-800/50 border border-cyan-500/30 hover:border-cyan-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-cyan-400">{activeProjects.length}</div>
          <div className="text-sm text-gray-400 mt-1">Active Projects</div>
        </button>
        <button
          onClick={() => setDashboardView('action-items')}
          className="bg-gray-800/50 border border-red-500/30 hover:border-red-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-red-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-red-400">{needsAction.length}</div>
          <div className="text-sm text-gray-400 mt-1">Awaiting Your Action</div>
        </button>
      </div>

      {/* Tickets Section */}
      <div id="tickets-section">
        {!ticketsLoading && tickets.length > 0 && (
          <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">Recent Tickets</h2>
              <div className="flex items-center gap-3">
                {/* Ticket search */}
                <div className="relative w-48 md:w-64">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={ticketSearch}
                    onChange={e => setTicketSearch(e.target.value)}
                    placeholder="Search tickets..."
                    className="w-full bg-gray-700/50 text-white text-sm rounded-lg pl-10 pr-3 py-1.5 border border-white/10 focus:border-cyan-500/50 focus:outline-none placeholder-gray-500"
                  />
                </div>
                {tickets.length > 5 && (
                  <button
                    onClick={() => setShowAllTickets(!showAllTickets)}
                    className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap"
                  >
                    {showAllTickets ? 'Show Less' : `View All (${tickets.length})`}
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filterTickets(showAllTickets ? tickets : tickets.slice(0, 5)).map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className="w-full flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors text-left group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate group-hover:text-cyan-300 transition-colors">{ticket.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">#{ticket.ticketNumber} - {new Date(ticket.createDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                      ticket.completedDate
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {ticket.completedDate ? 'Closed' : 'Open'}
                    </span>
                    <svg className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
              {filterTickets(showAllTickets ? tickets : tickets.slice(0, 5)).length === 0 && ticketSearch && (
                <p className="text-sm text-gray-400 text-center py-4">No tickets match your search.</p>
              )}
            </div>
          </div>
        )}
        {ticketsLoading && (
          <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-2">Recent Tickets</h2>
            <p className="text-sm text-gray-400">Loading tickets...</p>
          </div>
        )}
      </div>

      {/* Projects - hidden if no projects, single project gets full width */}
      {projects.length > 0 && (
        <>
          <div id="projects-section" />
          <h2 className="text-xl font-bold text-white mb-4">Your Projects</h2>
          <div className={`grid gap-4 mb-8 ${projects.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            {projects.map(project => {
              const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)
              const doneTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => DONE_STATUSES.includes(t.status)).length, 0)
              const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
              const waiting = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED').length, 0)
              const statusBadge = getProjectStatusLabel(project.status)

              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  className="bg-gray-800/50 border border-white/10 rounded-lg p-6 text-left hover:border-cyan-500/50 transition-all hover:shadow-lg hover:shadow-cyan-500/10 group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">
                      {project.title}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ${statusBadge.color}`}>
                      {statusBadge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
                    <span>{project.phases.length} phases</span>
                    <span>-</span>
                    <span>{totalTasks} tasks</span>
                    {waiting > 0 && (
                      <span className="text-red-400 font-medium">{waiting} needs you</span>
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
        </>
      )}

      {/* Help & Contact Card */}
      <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 mt-8">
        <h2 className="text-lg font-bold text-white mb-4">Need Help or Have Questions?</h2>
        <p className="text-sm text-gray-400 mb-4">Reach out to us through any of these channels:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="tel:(607) 341-7500"
            className="flex items-center gap-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors">Phone Support</p>
              <p className="text-xs text-gray-400">(607) 341-7500</p>
            </div>
          </a>
          <a
            href="mailto:support@triplecitiestech.com"
            className="flex items-center gap-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-emerald-300 transition-colors">Email Support</p>
              <p className="text-xs text-gray-400">support@triplecitiestech.com</p>
            </div>
          </a>
          <a
            href="/livechat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-purple-300 transition-colors">Live Chat</p>
              <p className="text-xs text-gray-400">Chat with us in real-time</p>
            </div>
          </a>
          <a
            href="https://triplecitiestech.itclientportal.com/ClientPortal/Login.aspx"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors">Support Portal</p>
              <p className="text-xs text-gray-400">Create tickets, access docs & training</p>
            </div>
          </a>
          <a
            href="https://triplecitiestech.connectboosterportal.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-rose-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-rose-300 transition-colors">Payment Portal</p>
              <p className="text-xs text-gray-400">View invoices & make payments</p>
            </div>
          </a>
          <a
            href="/contact#customer-support"
            className="flex items-center gap-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors group"
          >
            <div className="w-10 h-10 bg-teal-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white group-hover:text-teal-300 transition-colors">All Support Options</p>
              <p className="text-xs text-gray-400">View all contact & support options</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}

function TicketTimeline({ ticket, companySlug, onBack }: {
  ticket: Ticket
  companySlug: string
  onBack: () => void
}) {
  const [timeline, setTimeline] = useState<{
    id: string
    type: string
    timestamp: string
    author: string
    authorType: string
    content: string
    isInternal: boolean
    hoursWorked?: number
  }[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [replySuccess, setReplySuccess] = useState(false)
  const [showAllEntries, setShowAllEntries] = useState(false)

  useEffect(() => {
    setLoadingTimeline(true)
    fetch(`/api/customer/tickets/timeline?companySlug=${encodeURIComponent(companySlug)}&ticketId=${ticket.id}`)
      .then(res => res.ok ? res.json() : { timeline: [] })
      .then(data => {
        // Filter out any internal notes that might have slipped through
        const filtered = (data.timeline || []).filter((entry: { isInternal: boolean }) => !entry.isInternal)
        setTimeline(filtered)
      })
      .catch(() => setTimeline([]))
      .finally(() => setLoadingTimeline(false))
  }, [companySlug, ticket.id])

  const handleReply = async () => {
    if (!replyText.trim() || submittingReply) return
    setSubmittingReply(true)
    try {
      const res = await fetch('/api/customer/tickets/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companySlug,
          ticketId: ticket.id,
          message: replyText.trim(),
        }),
      })
      if (res.ok) {
        setReplyText('')
        setReplySuccess(true)
        setTimeout(() => setReplySuccess(false), 3000)
        // Refresh timeline
        const refreshRes = await fetch(`/api/customer/tickets/timeline?companySlug=${encodeURIComponent(companySlug)}&ticketId=${ticket.id}`)
        if (refreshRes.ok) {
          const data = await refreshRes.json()
          const filtered = (data.timeline || []).filter((entry: { isInternal: boolean }) => !entry.isInternal)
          setTimeline(filtered)
        }
      }
    } catch {
      // silent
    } finally {
      setSubmittingReply(false)
    }
  }

  const getAuthorLabel = (author: string, authorType: string) => {
    if (authorType === 'customer') return `${author} - Customer`
    if (authorType === 'technician') return `Triple Cities Tech - ${author}`
    return author
  }

  // Determine which entries to show: first, last, and optionally middle
  const hasMiddleEntries = timeline.length > 2
  const visibleEntries = showAllEntries || !hasMiddleEntries
    ? timeline
    : [timeline[0], timeline[timeline.length - 1]].filter(Boolean)

  return (
    <div className="bg-gray-800/50 border border-white/10 rounded-lg p-6 mb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-4 text-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </button>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h3 className="text-xl font-bold text-white">{ticket.title}</h3>
          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
            ticket.completedDate
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
          }`}>
            {ticket.completedDate ? 'Closed' : 'Open'}
          </span>
        </div>
        <p className="text-sm text-gray-400">Ticket #{ticket.ticketNumber}</p>
      </div>

      {/* Timeline */}
      <div className="space-y-0 relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-700" />

        {/* Created entry */}
        <div className="relative pl-10 pb-4">
          <div className="absolute left-2.5 w-3 h-3 bg-cyan-500 rounded-full border-2 border-gray-800" />
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <span className="text-xs font-semibold text-cyan-400">Ticket Created</span>
              <span className="text-xs text-gray-500">
                {new Date(ticket.createDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm text-gray-300">{ticket.title}</p>
          </div>
        </div>

        {/* Loading state */}
        {loadingTimeline && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-2.5 w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800 animate-pulse" />
            <p className="text-sm text-gray-500">Loading communications...</p>
          </div>
        )}

        {/* Show first entry */}
        {!loadingTimeline && visibleEntries.length > 0 && !showAllEntries && hasMiddleEntries && (
          <>
            {/* First entry */}
            <TimelineEntry entry={visibleEntries[0]} getAuthorLabel={getAuthorLabel} />

            {/* Expand button */}
            <div className="relative pl-10 pb-4">
              <div className="absolute left-2.5 w-3 h-3 bg-gray-600 rounded-full border-2 border-gray-800" />
              <button
                onClick={() => setShowAllEntries(true)}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Show conversation history ({timeline.length - 2} more {timeline.length - 2 === 1 ? 'entry' : 'entries'})
              </button>
            </div>

            {/* Last entry */}
            {visibleEntries.length > 1 && (
              <TimelineEntry entry={visibleEntries[visibleEntries.length - 1]} getAuthorLabel={getAuthorLabel} />
            )}
          </>
        )}

        {/* Show all entries when expanded or when 2 or fewer */}
        {!loadingTimeline && (showAllEntries || !hasMiddleEntries) && timeline.map(entry => (
          <TimelineEntry key={entry.id} entry={entry} getAuthorLabel={getAuthorLabel} />
        ))}

        {/* Completed entry */}
        {ticket.completedDate && (
          <div className="relative pl-10 pb-4">
            <div className="absolute left-2.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800" />
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                <span className="text-xs font-semibold text-green-400">Ticket Resolved</span>
                <span className="text-xs text-gray-500">
                  {new Date(ticket.completedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-gray-300">This ticket has been completed and closed.</p>
            </div>
          </div>
        )}
      </div>

      {/* Reply form (only for open tickets) */}
      {!ticket.completedDate && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-sm font-medium text-white mb-2">Reply to this ticket</p>
          <div className="flex gap-2">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Type your reply..."
              rows={3}
              className="flex-1 bg-gray-700/50 text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-cyan-500/50 focus:outline-none placeholder-gray-500 resize-none"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <div>
              {replySuccess && (
                <p className="text-xs text-green-400">Reply sent successfully!</p>
              )}
            </div>
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || submittingReply}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submittingReply ? 'Sending...' : 'Send Reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineEntry({ entry, getAuthorLabel }: {
  entry: { id: string; type: string; timestamp: string; author: string; authorType: string; content: string; hoursWorked?: number }
  getAuthorLabel: (author: string, authorType: string) => string
}) {
  return (
    <div className="relative pl-10 pb-4">
      <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 border-gray-800 ${
        entry.authorType === 'customer' ? 'bg-emerald-500' :
        entry.type === 'time_entry' ? 'bg-indigo-500' : 'bg-cyan-500'
      }`} />
      <div className={`rounded-lg px-4 py-3 ${
        entry.authorType === 'customer'
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'bg-gray-700/30'
      }`}>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${
              entry.authorType === 'customer' ? 'text-emerald-400' : 'text-cyan-400'
            }`}>
              {getAuthorLabel(entry.author, entry.authorType)}
            </span>
            {entry.type === 'time_entry' && entry.hoursWorked && (
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                {entry.hoursWorked}h worked
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500">
            {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{entry.content}</p>
      </div>
    </div>
  )
}
