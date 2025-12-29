'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, Clock, AlertCircle, Calendar, User } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { OnboardingPhase, PhaseStatus } from '@/types/onboarding'

interface OnboardingTimelineProps {
  phases: OnboardingPhase[]
  currentPhaseId?: string
}

// Status color mappings
const statusColors: Record<PhaseStatus, { bg: string; text: string; border: string; icon: string }> = {
  'Complete': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    icon: 'text-emerald-600'
  },
  'In Progress': {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-300',
    icon: 'text-blue-600'
  },
  'Scheduled': {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-300',
    icon: 'text-purple-600'
  },
  'Waiting on Customer': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    icon: 'text-amber-600'
  },
  'Requires Customer Coordination': {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-300',
    icon: 'text-orange-600'
  },
  'Discussed': {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-300',
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

export default function OnboardingTimeline({ phases, currentPhaseId }: OnboardingTimelineProps) {
  const [selectedPhase, setSelectedPhase] = useState<OnboardingPhase | null>(null)

  return (
    <div className="space-y-8">
      {/* Timeline header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Onboarding Timeline</h2>
        <p className="text-gray-300">Track the progress through our comprehensive onboarding process</p>
      </div>

      {/* Horizontal Timeline */}
      <div className="relative overflow-x-auto pb-8">
        <div className="flex items-center min-w-max px-4">
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
                <div className="flex-shrink-0 h-1 w-12 md:w-24 bg-gradient-to-r from-cyan-500 to-cyan-400" />

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
                    'mt-2 px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap',
                    colors.bg,
                    colors.text
                  )}>
                    {phase.status}
                  </span>
                </div>
              </React.Fragment>
            )
          })}

          {/* End Marker */}
          <>
            <div className="flex-shrink-0 h-1 w-12 md:w-24 bg-gradient-to-r from-cyan-500 to-cyan-400" />
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
          {selectedPhase.notes && (
            <div className="mb-4 p-3 bg-amber-900/30 border border-amber-500/50 rounded-lg">
              <p className="text-sm font-semibold text-amber-300 mb-1">Notes:</p>
              <p className="text-sm text-amber-200">{selectedPhase.notes}</p>
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
