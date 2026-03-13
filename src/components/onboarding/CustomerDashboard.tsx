'use client'

import { useState, useEffect, useCallback } from 'react'
import { TicketTable, TicketDetail } from '@/components/tickets'
import type { UnifiedTicketRow, UnifiedTicketNote, TicketListResponse } from '@/types/tickets'
import { CUSTOMER_VISIBILITY } from '@/types/tickets'

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

// Ticket type alias — uses the unified type system
type Ticket = UnifiedTicketRow

interface CustomerDashboardProps {
  projects: Project[]
  companyName?: string
  companySlug?: string
}

const DONE_STATUSES = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']

/** Autotask "waiting on customer" ticket statuses (7=Waiting Customer, 12=Customer Note Added) */
const WAITING_TICKET_STATUSES = new Set([7, 12])
function isWaitingOnCustomer(status: number): boolean {
  return WAITING_TICKET_STATUSES.has(status)
}

// Task status labels mapped 1:1 to Autotask picklist values
function getStatusBadge(status: string) {
  switch (status) {
    case 'WORK_IN_PROGRESS':
    case 'ASSIGNED':
    case 'NEEDS_REVIEW':
    case 'INFORMATION_RECEIVED':
      return { label: 'In Progress', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' }
    case 'WAITING_ON_CLIENT':
    case 'WAITING_ON_VENDOR':
    case 'CUSTOMER_NOTE_ADDED':
    case 'STUCK':
      return { label: 'Waiting Customer', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 'REVIEWED_AND_DONE':
    case 'ITG_DOCUMENTED':
    case 'NOT_APPLICABLE':
      return { label: 'Complete', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
    default:
      return { label: 'New', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
}

// Phase status labels mapped to Autotask-equivalent statuses
function getPhaseStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETE':
      return { label: 'Complete', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
    case 'IN_PROGRESS':
    case 'SCHEDULED':
      return { label: 'In Progress', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' }
    case 'WAITING_ON_CUSTOMER':
    case 'REQUIRES_CUSTOMER_COORDINATION':
      return { label: 'Waiting Customer', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 'NOT_STARTED':
    default:
      return { label: 'New', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
}

// Project status labels mapped 1:1 to Autotask: Inactive(0), New(1), Active(4), Complete(5)
function getProjectStatusLabel(status: string) {
  switch (status) {
    case 'ACTIVE': return { label: 'Active', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' }
    case 'COMPLETED': return { label: 'Complete', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
    case 'ON_HOLD':
    case 'CANCELLED': return { label: 'Inactive', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
    default: return { label: status, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
  }
}

type DashboardView = 'dashboard' | 'open-tickets' | 'action-items' | 'closed-this-month' | 'hours-this-month'

export default function CustomerDashboard({ projects, companyName, companySlug }: CustomerDashboardProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectViewMode, setProjectViewMode] = useState<'vertical' | 'horizontal'>('vertical')
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set('__all__'))
  const [showAllTickets, setShowAllTickets] = useState(false)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [submittingComment, setSubmittingComment] = useState<string | null>(null)
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [ticketNotes, setTicketNotes] = useState<UnifiedTicketNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [ticketSearch, setTicketSearch] = useState('')
  const [dashboardView, setDashboardView] = useState<DashboardView>('dashboard')
  const [metrics, setMetrics] = useState<{ hoursWorkedThisMonth: number; ticketsClosedThisMonth: number; avgResolutionHours: number | null } | null>(null)

  // Load tickets and metrics when companySlug is available
  useEffect(() => {
    if (!companySlug) return
    setTicketsLoading(true)
    fetch(`/api/tickets?perspective=customer&companySlug=${encodeURIComponent(companySlug)}`)
      .then(res => res.ok ? res.json() : { tickets: [] })
      .then((data: TicketListResponse) => setTickets(data.tickets || []))
      .catch(() => setTickets([]))
      .finally(() => setTicketsLoading(false))

    // Fetch customer metrics (hours worked, tickets closed this month)
    fetch(`/api/customer/metrics?companySlug=${encodeURIComponent(companySlug)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setMetrics(data) })
      .catch(() => {})
  }, [companySlug])

  const fetchTicketNotes = useCallback(async (ticketId: string) => {
    if (!companySlug) return
    setNotesLoading(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/notes?perspective=customer&companySlug=${encodeURIComponent(companySlug)}`)
      if (res.ok) {
        const json = await res.json()
        setTicketNotes(json.notes || [])
      } else {
        setTicketNotes([])
      }
    } catch {
      setTicketNotes([])
    }
    setNotesLoading(false)
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

  const handleSubmitComment = async (taskId: string) => {
    const content = commentInputs[taskId]?.trim()
    if (!content || submittingComment) return

    setSubmittingComment(taskId)
    try {
      const res = await fetch('/api/customer/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, content }),
      })
      if (res.ok) {
        setCommentInputs(prev => ({ ...prev, [taskId]: '' }))
        setCommentSuccess(taskId)
        setTimeout(() => setCommentSuccess(null), 3000)
      }
    } catch {
      // silently fail
    } finally {
      setSubmittingComment(null)
    }
  }

  // Compute stats across all projects
  const allTasks = projects.flatMap(p => p.phases.flatMap(ph => ph.tasks))
  const needsAction = allTasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED')
  const activeProjects = projects.filter(p => p.status === 'ACTIVE' || p.status === 'IN_PROGRESS')

  const openTickets = tickets.filter(t => !t.isResolved)
  const closedTickets = tickets.filter(t => t.isResolved)

  // Compute "closed this month" from live ticket data (not stale DB cache)
  const closedThisMonth = closedTickets.filter(t => {
    if (!t.completedDate) return false
    const completed = new Date(t.completedDate)
    const now = new Date()
    return completed.getMonth() === now.getMonth() && completed.getFullYear() === now.getFullYear()
  })

  // Filter tickets by search - prioritize title match, then content
  const filterTickets = (ticketList: Ticket[]) => {
    if (!ticketSearch.trim()) return ticketList
    const query = ticketSearch.toLowerCase()
    const titleMatches: Ticket[] = []
    const otherMatches: Ticket[] = []
    for (const t of ticketList) {
      if (t.title.toLowerCase().includes(query)) {
        titleMatches.push(t)
      } else if (t.ticketNumber.toLowerCase().includes(query) || t.statusLabel.toLowerCase().includes(query)) {
        otherMatches.push(t)
      }
    }
    return [...titleMatches, ...otherMatches]
  }

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    fetchTicketNotes(ticket.ticketId)
  }

  // If a ticket is selected for detail view, show it
  if (selectedTicket && !selectedProject) {
    return (
      <div>
        {/* Company Header */}
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
          </div>
        )}
        <TicketDetail
          ticket={selectedTicket}
          notes={ticketNotes}
          perspective="customer"
          noteVisibility={CUSTOMER_VISIBILITY}
          onBack={() => setSelectedTicket(null)}
          loading={notesLoading}
          companySlug={companySlug}
          onReplySent={() => fetchTicketNotes(selectedTicket.ticketId)}
        />
      </div>
    )
  }

  // Project detail view
  if (selectedProject) {
    const project = selectedProject
    const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)
    const doneTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => DONE_STATUSES.includes(t.status) || t.completed).length, 0)
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
                        <div className="relative flex-shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
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
                          {phase.status === 'COMPLETE' && (
                            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gray-700 border border-green-500/50 flex items-center justify-center text-[9px] font-bold text-green-300">
                              {phaseIndex + 1}
                            </span>
                          )}
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
                    <div className="relative flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
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
                      {phase.status === 'COMPLETE' && (
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gray-700 border border-green-500/50 flex items-center justify-center text-[10px] font-bold text-green-300">
                          {phaseIndex + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-bold text-white truncate">{phase.title}</h3>
                        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ml-auto ${phaseBadge.color}`}>
                          Status: {phaseBadge.label}
                        </span>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                  <span className="text-xs text-gray-500">{task.comments!.length} comment{task.comments!.length !== 1 ? 's' : ''}</span>
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
                                      <p className="text-xs font-semibold text-cyan-300 uppercase mb-1">Description</p>
                                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{task.notes}</p>
                                    </div>
                                  )}

                                  {hasComments && (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-gray-400 uppercase">Comments</p>
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

                                  <div className="mt-2">
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={commentInputs[task.id] || ''}
                                        onChange={e => setCommentInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSubmitComment(task.id) }}
                                        placeholder="Add a comment..."
                                        className="flex-1 bg-gray-700/50 text-white text-sm rounded-lg px-3 py-2 border border-white/10 focus:border-cyan-500/50 focus:outline-none placeholder-gray-500"
                                      />
                                      <button
                                        onClick={() => handleSubmitComment(task.id)}
                                        disabled={!commentInputs[task.id]?.trim() || submittingComment === task.id}
                                        className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                                      >
                                        {submittingComment === task.id ? 'Sending...' : 'Send'}
                                      </button>
                                    </div>
                                    {commentSuccess === task.id && (
                                      <p className="text-xs text-green-400 mt-1">Comment sent</p>
                                    )}
                                  </div>
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
    // Sort: waiting-on-customer first, then open, both newest first
    const sortedOpen = [...openTickets].sort((a, b) => {
      const aWaiting = isWaitingOnCustomer(a.status) ? 0 : 1
      const bWaiting = isWaitingOnCustomer(b.status) ? 0 : 1
      if (aWaiting !== bWaiting) return aWaiting - bWaiting
      return new Date(b.createDate).getTime() - new Date(a.createDate).getTime()
    })
    const filtered = filterTickets(sortedOpen)
    return (
      <div>
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
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
                  key={ticket.ticketId}
                  onClick={() => { handleSelectTicket(ticket); setDashboardView('dashboard') }}
                  className="w-full flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors text-left group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate group-hover:text-cyan-300 transition-colors">{ticket.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">#{ticket.ticketNumber} - {new Date(ticket.createDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                      isWaitingOnCustomer(ticket.status) ? 'bg-rose-500/20 text-rose-300' : 'bg-blue-500/20 text-blue-300'
                    }`}>{isWaitingOnCustomer(ticket.status) ? 'Waiting on You' : 'Open'}</span>
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
      const s = t.statusLabel.toLowerCase()
      return s.includes('customer') || s.includes('waiting')
    })
    return (
      <div>
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
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
                  key={ticket.ticketId}
                  onClick={() => { handleSelectTicket(ticket); setDashboardView('dashboard') }}
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

  // "Tickets Closed This Month" sub-view
  if (dashboardView === 'closed-this-month') {
    const sortedClosed = [...closedThisMonth].sort((a, b) => {
      const aDate = a.completedDate ? new Date(a.completedDate).getTime() : 0
      const bDate = b.completedDate ? new Date(b.completedDate).getTime() : 0
      return bDate - aDate
    })
    const filtered = filterTickets(sortedClosed)
    return (
      <div>
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
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
          <h2 className="text-2xl font-bold text-white">Tickets Closed This Month ({closedThisMonth.length})</h2>
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
            <p className="text-sm text-gray-400 text-center py-4">{ticketSearch ? 'No tickets match your search.' : 'No tickets closed this month.'}</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filtered.map(ticket => (
                <button
                  key={ticket.ticketId}
                  onClick={() => { handleSelectTicket(ticket); setDashboardView('dashboard') }}
                  className="w-full flex items-center justify-between bg-gray-700/30 hover:bg-gray-700/50 rounded-lg px-4 py-3 transition-colors text-left group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate group-hover:text-cyan-300 transition-colors">{ticket.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">#{ticket.ticketNumber} - Closed {ticket.completedDate ? new Date(ticket.completedDate).toLocaleDateString() : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap bg-green-500/20 text-green-300">Closed</span>
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

  // "Hours This Month" sub-view
  if (dashboardView === 'hours-this-month') {
    // Show hours breakdown from time entries
    const hoursValue = metrics ? metrics.hoursWorkedThisMonth : 0
    return (
      <div>
        {companyName && (
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
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
        <h2 className="text-2xl font-bold text-white mb-4">Hours This Month</h2>
        <div className="bg-gray-800/50 border border-violet-500/20 rounded-lg p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-4xl font-bold text-violet-400">{hoursValue}h</div>
              <div className="text-sm text-gray-400">Total hours logged this month</div>
            </div>
          </div>
          {metrics?.avgResolutionHours != null && (
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xl font-bold text-cyan-400">{metrics.avgResolutionHours}h</div>
                  <div className="text-sm text-gray-400">Avg. resolution time for tickets closed this month</div>
                </div>
              </div>
            </div>
          )}
          {hoursValue === 0 && (
            <p className="text-sm text-gray-500 mt-2">No time entries have been logged for this month yet.</p>
          )}
        </div>
      </div>
    )
  }

  // Dashboard view (default)
  return (
    <div>
      {/* Company Header */}
      {companyName && (
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
          <p className="text-lg text-cyan-400">Triple Cities Tech Support Portal</p>
        </div>
      )}

      {/* Summary Cards - all clickable, ticket cards grouped together */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
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
          <div className="text-sm text-gray-400 mt-1">Tickets Closed</div>
        </button>
        <button
          onClick={() => setDashboardView('closed-this-month')}
          className="bg-gray-800/50 border border-emerald-500/30 hover:border-emerald-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-emerald-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-emerald-400">
            {ticketsLoading ? '-' : closedThisMonth.length}
          </div>
          <div className="text-sm text-gray-400 mt-1">Tickets Closed This Month</div>
        </button>
        <button
          onClick={() => setDashboardView('action-items')}
          className="bg-gray-800/50 border border-red-500/30 hover:border-red-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-red-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-red-400">{needsAction.length}</div>
          <div className="text-sm text-gray-400 mt-1">Awaiting You</div>
        </button>
        <button
          onClick={() => document.getElementById('projects-section')?.scrollIntoView({ behavior: 'smooth' })}
          className="bg-gray-800/50 border border-cyan-500/30 hover:border-cyan-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-cyan-400">{activeProjects.length}</div>
          <div className="text-sm text-gray-400 mt-1">Active Projects</div>
        </button>
        <button
          onClick={() => setDashboardView('hours-this-month')}
          className="bg-gray-800/50 border border-violet-500/30 hover:border-violet-400/60 rounded-lg p-4 text-center transition-all hover:shadow-lg hover:shadow-violet-500/10 cursor-pointer"
        >
          <div className="text-3xl font-bold text-violet-400">
            {metrics ? `${metrics.hoursWorkedThisMonth}h` : '-'}
          </div>
          <div className="text-sm text-gray-400 mt-1">Hours This Month</div>
        </button>
      </div>

      {/* Chat CTA - tell customers to use chat for new tickets */}
      <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg px-5 py-4 mb-8 flex items-center gap-4">
        <div className="flex-shrink-0">
          <svg className="w-8 h-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Need help? Use the chat in the bottom-right corner to create a support ticket.</p>
        </div>
      </div>

      {/* Tickets Section */}
      <div id="tickets-section" className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-xl font-bold text-white">Tickets</h2>
          <div className="flex-1" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={ticketSearch}
            onChange={(e) => setTicketSearch(e.target.value)}
            className="w-full sm:w-64 px-3 py-1.5 text-sm bg-gray-800/50 border border-gray-600/50 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <TicketTable
          tickets={tickets}
          perspective="customer"
          onTicketClick={(ticketId) => {
            const ticket = tickets.find(t => t.ticketId === ticketId)
            if (ticket) handleSelectTicket(ticket)
          }}
          compact
          search={ticketSearch}
          onSearchChange={setTicketSearch}
          maxRows={showAllTickets ? undefined : 5}
          showViewAll={tickets.length > 5}
          onViewAll={() => setShowAllTickets(!showAllTickets)}
          loading={ticketsLoading}
        />
      </div>

      {/* Projects - hidden if no projects, single project gets full width */}
      {projects.length > 0 && (
        <>
          <div id="projects-section" />
          <h2 className="text-xl font-bold text-white mb-4">Your Projects</h2>
          <div className={`grid gap-4 mb-8 ${projects.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            {projects.map(project => {
              const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)
              const doneTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => DONE_STATUSES.includes(t.status) || t.completed).length, 0)
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

    </div>
  )
}

