'use client'

import { useState } from 'react'

interface Task {
  id: string
  taskText: string
  completed: boolean
  orderIndex: number
  status: string
  notes?: string | null
  phaseName: string
  projectName: string
}

interface Phase {
  id: string
  title: string
  description: string | null
  status: string
  customerNotes: string | null
  orderIndex: number
  tasks: { id: string; taskText: string; completed: boolean; orderIndex: number; status: string; notes?: string | null }[]
}

interface Project {
  id: string
  title: string
  projectType: string
  status: string
  phases: Phase[]
  createdAt: Date
  updatedAt: Date
}

interface CustomerDashboardProps {
  projects: Project[]
  companyName?: string
}

type Tab = 'open' | 'closed'

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

function getPhaseStatusLabel(status: string) {
  switch (status) {
    case 'COMPLETE': return 'Complete'
    case 'IN_PROGRESS': return 'In Progress'
    case 'WAITING_ON_CUSTOMER': return 'Waiting on You'
    case 'SCHEDULED': return 'Scheduled'
    case 'NOT_STARTED': return 'Not Started'
    default: return status.replace(/_/g, ' ')
  }
}

export default function CustomerDashboard({ projects, companyName }: CustomerDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('open')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  // Flatten all visible tasks with project/phase context
  const allTasks: Task[] = projects.flatMap(project =>
    project.phases.flatMap(phase =>
      phase.tasks.map(task => ({
        ...task,
        phaseName: phase.title,
        projectName: project.title,
      }))
    )
  )

  const openTasks = allTasks.filter(t => !DONE_STATUSES.includes(t.status))
  const closedTasks = allTasks.filter(t => DONE_STATUSES.includes(t.status))

  const activeTasks = activeTab === 'open' ? openTasks : closedTasks

  // Group tasks by project
  const grouped = activeTasks.reduce<Record<string, Task[]>>((acc, task) => {
    if (!acc[task.projectName]) acc[task.projectName] = []
    acc[task.projectName].push(task)
    return acc
  }, {})

  return (
    <div>
      {/* Company Header */}
      {companyName && (
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-1">{companyName}</h1>
          <p className="text-lg text-cyan-400">Customer Dashboard</p>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800/50 border border-cyan-500/30 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-white">{openTasks.length}</div>
          <div className="text-sm text-gray-400 mt-1">Open Tasks</div>
        </div>
        <div className="bg-gray-800/50 border border-green-500/30 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-green-400">{closedTasks.length}</div>
          <div className="text-sm text-gray-400 mt-1">Completed Tasks</div>
        </div>
        <div className="bg-gray-800/50 border border-purple-500/30 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-purple-400">{projects.length}</div>
          <div className="text-sm text-gray-400 mt-1">Projects</div>
        </div>
        <div className="bg-gray-800/50 border border-orange-500/30 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-orange-400">
            {openTasks.filter(t => t.status === 'WAITING_ON_CLIENT' || t.status === 'CUSTOMER_NOTE_ADDED').length}
          </div>
          <div className="text-sm text-gray-400 mt-1">Needs Your Action</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-800/50 rounded-lg p-1 max-w-sm">
        <button
          onClick={() => setActiveTab('open')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'open'
              ? 'bg-cyan-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Open Tasks ({openTasks.length})
        </button>
        <button
          onClick={() => setActiveTab('closed')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'closed'
              ? 'bg-green-600 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Completed ({closedTasks.length})
        </button>
      </div>

      {/* Tasks List */}
      {activeTasks.length === 0 ? (
        <div className="bg-gray-800/50 border border-white/10 rounded-lg p-12 text-center">
          <p className="text-gray-400">
            {activeTab === 'open' ? 'No open project tasks' : 'No completed project tasks'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([projectName, tasks]) => (
            <div key={projectName}>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {projectName}
              </h3>
              <div className="space-y-2">
                {tasks.map(task => {
                  const badge = getStatusBadge(task.status)
                  const isExpanded = expandedTask === task.id
                  return (
                    <div
                      key={task.id}
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                      className="bg-gray-800/50 border border-white/10 rounded-lg p-4 hover:border-cyan-500/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
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
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${
                              DONE_STATUSES.includes(task.status) ? 'text-gray-500 line-through' : 'text-white'
                            }`}>
                              {task.taskText}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">{task.phaseName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full border whitespace-nowrap ${badge.color}`}>
                            {badge.label}
                          </span>
                          <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/10 text-sm space-y-2" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-6 text-gray-400">
                            <span>Project: <span className="text-white">{task.projectName}</span></span>
                            <span>Phase: <span className="text-white">{task.phaseName}</span></span>
                            <span>Status: <span className="text-white">{getPhaseStatusLabel(task.status)}</span></span>
                          </div>
                          {task.notes && (
                            <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-3 py-2 mt-2">
                              <p className="text-xs font-semibold text-cyan-300 uppercase mb-1">Notes</p>
                              <p className="text-gray-300">{task.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
