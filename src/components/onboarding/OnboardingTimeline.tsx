'use client'

import React, { useState, useRef } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle, Calendar, User, ChevronLeft, ChevronRight, Edit, Save, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { OnboardingPhase, PhaseStatus } from '@/types/onboarding'

interface OnboardingTimelineProps {
  phases: OnboardingPhase[]
  currentPhaseId?: string
  title?: string
  companySlug?: string
}

// Status color mappings - vibrant bubble colors with original icon colors
const statusColors: Record<PhaseStatus, { bg: string; text: string; border: string; icon: string }> = {
  'Complete': {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/50',
    icon: 'text-emerald-600'
  },
  'In Progress': {
    bg: 'bg-blue-500/20',
    text: 'text-blue-300',
    border: 'border-blue-500/50',
    icon: 'text-blue-600'
  },
  'Scheduled': {
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    border: 'border-purple-500/50',
    icon: 'text-purple-600'
  },
  'Waiting on Customer': {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/50',
    icon: 'text-amber-600'
  },
  'Requires Customer Coordination': {
    bg: 'bg-orange-500/20',
    text: 'text-orange-300',
    border: 'border-orange-500/50',
    icon: 'text-orange-600'
  },
  'Discussed': {
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-300',
    border: 'border-indigo-500/50',
    icon: 'text-indigo-600'
  },
  'Not Started': {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-300',
    icon: 'text-gray-400'
  },
}

// Status icon mappings
const getStatusIcon = (status: PhaseStatus) => {
  switch (status) {
    case 'Complete':
      return CheckCircle
    case 'In Progress':
    case 'Discussed':
      return Clock
    case 'Scheduled':
      return Calendar
    case 'Waiting on Customer':
    case 'Requires Customer Coordination':
      return AlertCircle
    default:
      return Clock
  }
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PhaseCard({ phase, isCurrent, isLast }: { phase: OnboardingPhase; isCurrent: boolean; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(isCurrent)
  const colors = statusColors[phase.status]
  const StatusIcon = getStatusIcon(phase.status)

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500 to-cyan-300" />
      )}

      {/* Phase card */}
      <div
        className={cn(
          'relative bg-gray-800/50 backdrop-blur-sm rounded-lg border-2 transition-all duration-200',
          isCurrent
            ? 'border-cyan-500 shadow-lg shadow-cyan-500/30'
            : 'border-gray-700',
          'hover:shadow-md hover:shadow-cyan-500/10'
        )}
      >
        {/* Current phase indicator */}
        {isCurrent && (
          <div className="absolute -top-3 left-4 bg-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
            YOU ARE HERE
          </div>
        )}

        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-6 text-left flex items-start gap-4 hover:bg-gray-700/30 transition-colors rounded-lg"
        >
          {/* Status icon */}
          <div className={cn('flex-shrink-0 mt-1', colors.icon)}>
            <StatusIcon size={28} strokeWidth={2} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3 className="text-lg font-bold text-white leading-tight">
                {phase.title}
              </h3>
              <div className={cn('flex-shrink-0', isExpanded ? 'text-gray-300' : 'text-gray-500')}>
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>

            <p className="text-sm text-gray-300 mb-3">
              {phase.description}
            </p>

            <div className="flex flex-wrap gap-2">
              {/* Status badge */}
              <span className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold',
                colors.bg,
                colors.text
              )}>
                {phase.status}
              </span>

              {/* Owner badge */}
              {phase.owner && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-300 border border-gray-600">
                  <User size={12} />
                  {phase.owner}
                </span>
              )}

              {/* Scheduled date badge */}
              {phase.scheduledDate && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                  <Calendar size={12} />
                  {formatDate(phase.scheduledDate)}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-6 pb-6 pt-2 border-t border-gray-100">
            {/* Next action */}
            {phase.nextAction && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-1">Next Action:</p>
                <p className="text-sm text-blue-800">{phase.nextAction}</p>
              </div>
            )}

            {/* Notes */}
            {phase.notes && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-semibold text-amber-900 mb-1">Notes:</p>
                <p className="text-sm text-amber-800">{phase.notes}</p>
              </div>
            )}

            {/* Details */}
            {phase.details && phase.details.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-white mb-2">Details:</p>
                <ul className="space-y-2">
                  {phase.details.map((detail, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function OnboardingTimeline({ phases, currentPhaseId, title, companySlug }: OnboardingTimelineProps) {
  const [selectedPhase, setSelectedPhase] = useState<OnboardingPhase | null>(null)
  const [viewMode, setViewMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [editingPhaseNote, setEditingPhaseNote] = useState<string | null>(null)
  const [editingTaskNote, setEditingTaskNote] = useState<string | null>(null)
  const [phaseNoteText, setPhaseNoteText] = useState('')
  const [taskNoteText, setTaskNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' })
    }
  }

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' })
    }
  }

  const handleSavePhaseNote = async (phaseId: string) => {
    if (!companySlug) return

    setSavingNote(true)
    try {
      const response = await fetch('/api/customer/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId,
          content: phaseNoteText,
          companySlug
        })
      })

      if (response.ok) {
        // Update local state
        if (selectedPhase && selectedPhase.id === phaseId) {
          setSelectedPhase({ ...selectedPhase, notes: phaseNoteText })
        }
        setEditingPhaseNote(null)
        // Refresh the page to get updated data
        window.location.reload()
      }
    } catch (error) {
      console.error('Error saving phase note:', error)
    } finally {
      setSavingNote(false)
    }
  }

  const handleSaveTaskNote = async (taskId: string) => {
    if (!companySlug) return

    setSavingNote(true)
    try {
      const response = await fetch('/api/customer/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          content: taskNoteText,
          companySlug
        })
      })

      if (response.ok) {
        setEditingTaskNote(null)
        // Refresh the page to get updated data
        window.location.reload()
      }
    } catch (error) {
      console.error('Error saving task note:', error)
    } finally {
      setSavingNote(false)
    }
  }

  // Scroll to current phase or Phase 1 on mount
  React.useEffect(() => {
    if (scrollContainerRef.current && viewMode === 'horizontal') {
      const container = scrollContainerRef.current
      // Find the current phase or default to Phase 1 (index 0)
      const currentPhaseIndex = currentPhaseId
        ? phases.findIndex(p => p.id === currentPhaseId)
        : 0

      const phaseIndex = currentPhaseIndex >= 0 ? currentPhaseIndex : 0

      // Calculate scroll position to center the phase
      // Each phase node is approximately 120px wide with 80px spacing
      const phaseWidth = 200
      const scrollPosition = (phaseIndex * phaseWidth) - (container.offsetWidth / 2) + (phaseWidth / 2)

      // Scroll with a slight delay to ensure DOM is ready
      setTimeout(() => {
        container.scrollTo({ left: Math.max(0, scrollPosition), behavior: 'smooth' })
      }, 100)
    }
  }, [phases, currentPhaseId, viewMode])

  return (
    <div className="space-y-8">
      {/* Timeline header with toggle */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">{title || 'Project Timeline'}</h2>
        <p className="text-gray-300 mb-4">Follow each phase as we bring your project to life</p>

        {/* View toggle */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setViewMode('horizontal')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              viewMode === 'horizontal'
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Horizontal View
          </button>
          <button
            onClick={() => setViewMode('vertical')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              viewMode === 'vertical'
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Vertical View
          </button>
        </div>
      </div>

      {/* Horizontal Timeline */}
      {viewMode === 'horizontal' && (
        <div className="relative pb-8">
          {/* Left fade overlay - gradual smooth fade */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-gray-900 via-gray-900/80 via-gray-900/40 to-transparent z-10 pointer-events-none" />

          {/* Right fade overlay - gradual smooth fade */}
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-gray-900 via-gray-900/80 via-gray-900/40 to-transparent z-10 pointer-events-none" />

          {/* Left arrow - positioned outside the fade area */}
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all"
            aria-label="Scroll left"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Right arrow - positioned outside the fade area */}
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all"
            aria-label="Scroll right"
          >
            <ChevronRight size={20} />
          </button>

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto scrollbar-hide px-12"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex items-start gap-3 px-4 justify-center"
            style={{ minWidth: '100%' }}>
            {/* Start Marker */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/50 mb-3">
                <span className="text-white font-bold text-sm">START</span>
              </div>
              <span className="text-xs text-gray-400 font-medium">Day 1</span>
            </div>

            {/* Phases */}
            {phases.map((phase, index) => {
              const isCurrent = phase.id === currentPhaseId
              const colors = statusColors[phase.status]
              const StatusIcon = getStatusIcon(phase.status)

              return (
                <React.Fragment key={phase.id}>
                  {/* Connector Line */}
                  <div className="flex-shrink-0 h-1 w-6 md:w-16 bg-gradient-to-r from-cyan-500 to-cyan-400" style={{ marginTop: '32px' }} />

                  {/* Phase Node */}
                  <div className="flex flex-col items-center flex-shrink-0 relative">
                    {/* "YOU ARE HERE" indicator */}
                    {isCurrent && (
                      <div className="absolute -top-8 whitespace-nowrap bg-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg z-10">
                        YOU ARE HERE
                      </div>
                    )}

                    {/* Phase Circle */}
                    <button
                      onClick={() => setSelectedPhase(selectedPhase?.id === phase.id ? null : phase)}
                      className={cn(
                        'w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all mb-3 border-4',
                        isCurrent
                          ? 'border-cyan-400 bg-gradient-to-br from-cyan-500 to-cyan-600 shadow-cyan-500/50 scale-110'
                          : 'border-gray-700 bg-gray-800 hover:border-cyan-500/50 hover:scale-105',
                        selectedPhase?.id === phase.id && 'ring-4 ring-cyan-500/30'
                      )}
                    >
                      <StatusIcon
                        size={24}
                        className={isCurrent ? 'text-white' : colors.icon}
                        strokeWidth={2.5}
                      />
                    </button>

                    {/* Phase Number */}
                    <span className="text-xs text-cyan-400 font-bold mb-1">
                      Phase {index + 1}
                    </span>

                    {/* Phase Title (truncated) */}
                    <span className="text-xs text-gray-300 font-medium text-center max-w-[120px] line-clamp-2">
                      {phase.title}
                    </span>

                    {/* Status Badge */}
                    <span className={cn(
                      'mt-2 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap border',
                      colors.bg,
                      colors.text,
                      colors.border
                    )}>
                      {phase.status}
                    </span>
                  </div>
                </React.Fragment>
              )
            })}

            {/* End Marker */}
            <>
              <div className="flex-shrink-0 h-1 w-6 md:w-16 bg-gradient-to-r from-cyan-500 to-cyan-400" style={{ marginTop: '32px' }} />
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/50 mb-3">
                  <span className="text-white font-bold text-sm text-center leading-tight">
                    FINISH
                  </span>
                </div>
                <span className="text-xs text-gray-400 font-medium whitespace-nowrap">30 Days</span>
              </div>
            </>
          </div>
          </div>
        </div>
      )}

      {/* Vertical Timeline */}
      {viewMode === 'vertical' && (
        <div className="space-y-6">
          {phases.map((phase, index) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              isCurrent={phase.id === currentPhaseId}
              isLast={index === phases.length - 1}
            />
          ))}
        </div>
      )}

      {/* Selected Phase Details */}
      {selectedPhase && (
        <div className="bg-gray-800/50 backdrop-blur-sm border-2 border-cyan-500 rounded-lg p-6 shadow-lg shadow-cyan-500/20">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">{selectedPhase.title}</h3>
              <p className="text-gray-300">{selectedPhase.description}</p>
            </div>
            <button
              onClick={() => setSelectedPhase(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ChevronUp size={24} />
            </button>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold',
              statusColors[selectedPhase.status].bg,
              statusColors[selectedPhase.status].text
            )}>
              {selectedPhase.status}
            </span>
            {selectedPhase.owner && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-300 border border-gray-600">
                <User size={12} />
                {selectedPhase.owner}
              </span>
            )}
          </div>

          {/* Next Action */}
          {selectedPhase.nextAction && (
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg">
              <p className="text-sm font-semibold text-blue-300 mb-1">Next Action:</p>
              <p className="text-sm text-blue-200">{selectedPhase.nextAction}</p>
            </div>
          )}

          {/* Notes */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white uppercase">Your Notes</p>
              {editingPhaseNote !== selectedPhase.id && (
                <button
                  onClick={() => {
                    setEditingPhaseNote(selectedPhase.id)
                    setPhaseNoteText(selectedPhase.notes || '')
                  }}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded transition-colors"
                >
                  <Edit size={12} />
                  {selectedPhase.notes ? 'Edit Note' : 'Add Note'}
                </button>
              )}
            </div>

            {editingPhaseNote === selectedPhase.id ? (
              <div className="space-y-2">
                <textarea
                  value={phaseNoteText}
                  onChange={(e) => setPhaseNoteText(e.target.value)}
                  placeholder="Add your notes about this phase..."
                  className="w-full p-3 bg-gray-900/50 border border-gray-600 rounded-lg text-sm text-gray-300 focus:border-cyan-500 focus:outline-none resize-none"
                  rows={4}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSavePhaseNote(selectedPhase.id)}
                    disabled={savingNote}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-cyan-500 hover:bg-cyan-600 text-white rounded transition-colors disabled:opacity-50"
                  >
                    <Save size={12} />
                    {savingNote ? 'Saving...' : 'Save Note'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingPhaseNote(null)
                      setPhaseNoteText('')
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                  >
                    <X size={12} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : selectedPhase.notes ? (
              <div className="p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg">
                <p className="text-sm text-amber-200">{selectedPhase.notes}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No notes yet. Click "Add Note" to add your thoughts.</p>
            )}
          </div>

          {/* Tasks (if available from project data) */}
          {(selectedPhase as unknown as { tasks?: Array<{ id: string; taskText: string; completed: boolean; notes?: string }> }).tasks && (selectedPhase as unknown as { tasks: Array<{ id: string; taskText: string; completed: boolean; notes?: string }> }).tasks.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-semibold text-white uppercase mb-3">Tasks ({(selectedPhase as unknown as { tasks: Array<unknown> }).tasks.length})</p>
              <div className="space-y-2">
                {(selectedPhase as unknown as { tasks: Array<{ id: string; taskText: string; completed: boolean; notes?: string }> }).tasks.map((task) => (
                  <div key={task.id} className="p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        task.completed ? 'bg-green-500 border-green-500' : 'border-gray-600'
                      }`}>
                        {task.completed && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <span className={`text-sm ${task.completed ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                          {task.taskText}
                        </span>
                      </div>
                      {editingTaskNote !== task.id && (
                        <button
                          onClick={() => {
                            setEditingTaskNote(task.id)
                            setTaskNoteText(task.notes || '')
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded transition-colors flex-shrink-0"
                        >
                          <Edit size={10} />
                          Note
                        </button>
                      )}
                    </div>

                    {editingTaskNote === task.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={taskNoteText}
                          onChange={(e) => setTaskNoteText(e.target.value)}
                          placeholder="Add your notes about this task..."
                          className="w-full p-2 bg-gray-800/50 border border-gray-600 rounded text-xs text-gray-300 focus:border-cyan-500 focus:outline-none resize-none"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveTaskNote(task.id)}
                            disabled={savingNote}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-cyan-500 hover:bg-cyan-600 text-white rounded transition-colors disabled:opacity-50"
                          >
                            <Save size={10} />
                            {savingNote ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setEditingTaskNote(null)
                              setTaskNoteText('')
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                          >
                            <X size={10} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : task.notes ? (
                      <p className="text-xs text-amber-300 mt-2 p-2 bg-amber-900/20 border border-amber-500/30 rounded">
                        <strong>Your note:</strong> {task.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Details */}
          {selectedPhase.details && selectedPhase.details.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-white mb-2">Details:</p>
              <ul className="space-y-2">
                {selectedPhase.details.map((detail, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 p-6 bg-gray-800/30 rounded-lg border border-gray-700">
        <h3 className="text-sm font-semibold text-white mb-4">Status Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(statusColors).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-2">
              <span className={cn('w-3 h-3 rounded-full', colors.bg, colors.border, 'border-2')} />
              <span className="text-xs text-gray-300">{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
