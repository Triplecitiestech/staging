'use client'

import { useState } from 'react'
import { LayoutList, LayoutGrid } from 'lucide-react'

interface Task {
  id: string
  taskText: string
  completed: boolean
  orderIndex: number
  notes?: string | null
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

export default function ProjectsView({ projects }: ProjectsViewProps) {
  const [viewMode, setViewMode] = useState<'horizontal' | 'vertical'>('horizontal')

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
      case 'WAITING_ON_CUSTOMER': return 'bg-yellow-500'
      case 'REQUIRES_CUSTOMER_COORDINATION': return 'bg-orange-500'
      case 'SCHEDULED': return 'bg-purple-500'
      case 'DISCUSSED': return 'bg-blue-500'
      case 'NOT_STARTED': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'Complete'
      case 'IN_PROGRESS': return 'In Progress'
      case 'WAITING_ON_CUSTOMER': return 'Waiting on Customer'
      case 'REQUIRES_CUSTOMER_COORDINATION': return 'Requires Customer Coordination'
      case 'SCHEDULED': return 'Scheduled'
      case 'DISCUSSED': return 'Discussed'
      case 'NOT_STARTED': return 'Not Started'
      default: return status
    }
  }

  return (
    <div>
      {projects.map((project) => {
        const completedPhases = project.phases.filter(p => p.status === 'COMPLETE').length
        const totalPhases = project.phases.length
        const progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0

        return (
          <div key={project.id} className="mb-12">
            {/* Project Header */}
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-white mb-2">{project.title}</h2>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <span>Progress: {progress}%</span>
                <span>•</span>
                <span>{completedPhases} of {totalPhases} phases completed</span>
              </div>
            </div>

            {/* View Toggle */}
            <div className="flex justify-end mb-6">
              <div className="inline-flex bg-gray-800/50 border border-cyan-500/30 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('horizontal')}
                  className={`px-4 py-2 rounded-md transition-all flex items-center gap-2 ${
                    viewMode === 'horizontal'
                      ? 'bg-cyan-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid size={16} />
                  Horizontal
                </button>
                <button
                  onClick={() => setViewMode('vertical')}
                  className={`px-4 py-2 rounded-md transition-all flex items-center gap-2 ${
                    viewMode === 'vertical'
                      ? 'bg-cyan-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <LayoutList size={16} />
                  Vertical
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-8 bg-gray-800/50 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Horizontal View (Timeline) */}
            {viewMode === 'horizontal' && (
              <div className="relative">
                {/* Timeline connector line */}
                <div className="absolute top-10 left-0 right-0 h-1 bg-gray-700" style={{ marginLeft: '48px', marginRight: '48px' }} />
                <div
                  className="absolute top-10 left-0 h-1 bg-gradient-to-r from-cyan-500 to-cyan-600 transition-all duration-500"
                  style={{
                    width: `calc(${progress}% - 48px)`,
                    marginLeft: '48px'
                  }}
                />

                {/* Phases */}
                <div className="grid gap-8" style={{ gridTemplateColumns: `repeat(${Math.min(project.phases.length, 5)}, 1fr)` }}>
                  {project.phases.map((phase, index) => {
                    const phaseTasks = phase.tasks.length
                    const completedTasks = phase.tasks.filter(t => t.completed).length
                    const phaseProgress = phaseTasks > 0 ? Math.round((completedTasks / phaseTasks) * 100) : 0

                    return (
                      <div key={phase.id} className="flex flex-col items-center text-center">
                        {/* Phase Icon */}
                        <div className={`w-20 h-20 rounded-full ${getStatusColor(phase.status)} flex items-center justify-center text-white font-bold text-lg mb-3 shadow-lg relative z-10`}>
                          {index + 1}
                        </div>

                        {/* Phase Title */}
                        <div className="mb-2">
                          <h3 className="font-bold text-white text-sm mb-1">{phase.title}</h3>
                          <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusColor(phase.status)} text-white`}>
                            {getStatusLabel(phase.status)}
                          </span>
                        </div>

                        {/* Phase Progress */}
                        {phaseTasks > 0 && (
                          <div className="text-xs text-gray-400 mb-2">
                            {completedTasks}/{phaseTasks} tasks • {phaseProgress}%
                          </div>
                        )}

                        {/* Customer Notes */}
                        {phase.customerNotes && (
                          <div className="mt-2 w-full bg-cyan-500/10 border border-cyan-500/30 rounded p-2 text-left">
                            <p className="text-xs text-cyan-300 font-semibold mb-1">Note:</p>
                            <p className="text-xs text-gray-300">{phase.customerNotes}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Vertical View (List) */}
            {viewMode === 'vertical' && (
              <div className="space-y-4">
                {project.phases.map((phase, index) => {
                  const phaseTasks = phase.tasks.length
                  const completedTasks = phase.tasks.filter(t => t.completed).length
                  const phaseProgress = phaseTasks > 0 ? Math.round((completedTasks / phaseTasks) * 100) : 0

                  return (
                    <div key={phase.id} className="bg-gray-800/50 border border-cyan-500/30 rounded-lg p-6">
                      <div className="flex items-start gap-4">
                        {/* Phase Number */}
                        <div className={`w-12 h-12 rounded-full ${getStatusColor(phase.status)} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                          {index + 1}
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
                                <span className="text-xs text-gray-400">{completedTasks}/{phaseTasks} tasks • {phaseProgress}%</span>
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
                          {phaseTasks > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Tasks</p>
                              <div className="space-y-1">
                                {phase.tasks.map((task) => (
                                  <div key={task.id} className="flex items-start gap-2">
                                    <div className={`mt-1 w-4 h-4 rounded border-2 flex items-center justify-center ${
                                      task.completed ? 'bg-green-500 border-green-500' : 'border-gray-600'
                                    }`}>
                                      {task.completed && (
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </div>
                                    <span className={`text-sm ${task.completed ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                      {task.taskText}
                                    </span>
                                  </div>
                                ))}
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
            )}
          </div>
        )
      })}
    </div>
  )
}
