'use client'

import { useState } from 'react'

interface Task {
  id: string
  taskText: string
  completed: boolean
  orderIndex: number
  notes?: string | null
  status?: string
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
  createdAt: Date
  updatedAt: Date
}

interface ProjectsViewProps {
  projects: Project[]
}

const DONE_STATUSES = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']

export default function ProjectsView({ projects }: ProjectsViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">No active projects</p>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'bg-green-500'
      case 'IN_PROGRESS': return 'bg-cyan-500'
      case 'WAITING_ON_CUSTOMER': return 'bg-red-500'
      case 'REQUIRES_CUSTOMER_COORDINATION': return 'bg-red-500'
      case 'SCHEDULED': return 'bg-purple-500'
      case 'DISCUSSED': return 'bg-blue-500'
      case 'NOT_STARTED': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusLabel = (status: string) => {
    // Map phase statuses to Autotask-matching labels
    switch (status) {
      case 'COMPLETE': return 'Complete'
      case 'IN_PROGRESS':
      case 'SCHEDULED':
      case 'DISCUSSED': return 'In Progress'
      case 'WAITING_ON_CUSTOMER':
      case 'REQUIRES_CUSTOMER_COORDINATION': return 'Waiting Customer'
      case 'NOT_STARTED': return 'New'
      default: return status
    }
  }

  // Project statuses mapped to Autotask: Inactive(0), Active(4), Complete(5)
  const getProjectStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE': return { label: 'Active', color: 'bg-green-500/20 text-green-300 border-green-500/30' }
      case 'COMPLETED': return { label: 'Complete', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
      case 'ON_HOLD':
      case 'CANCELLED': return { label: 'Inactive', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
      default: return { label: status, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
    }
  }

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) : null

  // If no project is selected, show the project list
  if (!selectedProject) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">All Projects ({projects.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(project => {
            const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0)
            const doneTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => DONE_STATUSES.includes(t.status || '') || t.completed).length, 0)
            const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
            const badge = getProjectStatusBadge(project.status)

            return (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className="bg-gray-800/50 border border-white/10 rounded-lg p-6 text-left hover:border-cyan-500/50 transition-all hover:shadow-lg hover:shadow-cyan-500/10 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">
                    {project.title}
                  </h3>
                  <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ml-2 ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
                  <span>{project.phases.length} phases</span>
                  <span>-</span>
                  <span>{totalTasks} tasks</span>
                </div>
                <div className="bg-gray-700 rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{progress}% complete</span>
                  <span className="text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    View Details
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Project detail view
  const project = selectedProject
  const completedPhases = project.phases.filter(p => p.status === 'COMPLETE').length
  const totalPhases = project.phases.length
  const progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0

  return (
    <div>
      {/* Back button */}
      {projects.length > 1 && (
        <button
          onClick={() => setSelectedProjectId(null)}
          className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors mb-6 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to All Projects
        </button>
      )}

      {/* Project Header */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">{project.title}</h2>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>Progress: {progress}%</span>
          <span>-</span>
          <span>{completedPhases} of {totalPhases} phases completed</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8 bg-gray-800/50 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Project Phases */}
      <div className="space-y-4">
        {project.phases.map((phase, index) => {
          const phaseTasks = phase.tasks.length
          const completedTasks = phase.tasks.filter(t => t.status ? DONE_STATUSES.includes(t.status) : t.completed).length
          const phaseProgress = phaseTasks > 0 ? Math.round((completedTasks / phaseTasks) * 100) : 0

          return (
            <div key={phase.id} className="bg-gray-800/50 border border-cyan-500/30 rounded-lg p-6">
              <div className="flex items-start gap-4">
                {/* Phase Number */}
                <div className={`w-12 h-12 rounded-full ${getStatusColor(phase.status)} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                  {phase.status === 'COMPLETE' ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                <div className="flex-1">
                  {/* Phase Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">{phase.title}</h3>
                      {phase.description && (
                        <p className="text-sm text-gray-400 mb-2">{phase.description}</p>
                      )}
                      <span className={`inline-block px-3 py-1 rounded-full text-xs ${getStatusColor(phase.status)} text-white`}>
                        {getStatusLabel(phase.status)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {phaseTasks > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Progress</span>
                        <span className="text-xs text-gray-400">{completedTasks}/{phaseTasks} tasks - {phaseProgress}%</span>
                      </div>
                      <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full ${getStatusColor(phase.status)} transition-all`}
                          style={{ width: `${phaseProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Tasks */}
                  {phase.tasks && phaseTasks > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Tasks</p>
                      <div className="space-y-1">
                        {phase.tasks.map((task) => {
                          const isDone = task.status ? DONE_STATUSES.includes(task.status) : task.completed
                          return (
                            <div key={task.id} className="flex items-start gap-2">
                              <div className={`mt-1 w-4 h-4 rounded border-2 flex items-center justify-center ${
                                isDone ? 'bg-green-500 border-green-500' : 'border-gray-600'
                              }`}>
                                {isDone && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <span className={`text-sm ${isDone ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                {task.taskText}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Customer Notes */}
                  {phase.customerNotes && (
                    <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-xs font-semibold text-cyan-300 uppercase">Note</span>
                      </div>
                      <p className="text-sm text-gray-300">{phase.customerNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
