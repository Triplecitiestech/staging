'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Assignment {
  id: string
  assigneeEmail: string
  assigneeName: string
  assignedBy: string
  assignedAt: string
}

interface AssignmentPickerProps {
  taskId: string
  assignments: Assignment[]
  currentResponsibleParty?: 'TCT' | 'CUSTOMER' | 'BOTH' | null
  companyName?: string
}

export default function AssignmentPicker({ taskId, assignments: initialAssignments, currentResponsibleParty, companyName }: AssignmentPickerProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [assignments, setAssignments] = useState(initialAssignments)
  const [assigneeName, setAssigneeName] = useState('')
  const [assigneeEmail, setAssigneeEmail] = useState('')
  const [responsibleParty, setResponsibleParty] = useState<'TCT' | 'CUSTOMER' | 'BOTH' | ''>(currentResponsibleParty || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assigneeName.trim() || !assigneeEmail.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          assigneeName: assigneeName.trim(),
          assigneeEmail: assigneeEmail.trim(),
        }),
      })

      if (!res.ok) throw new Error()

      const assignment = await res.json()
      setAssignments([...assignments, assignment])
      setAssigneeName('')
      setAssigneeEmail('')
      router.refresh()
    } catch {
      alert('Failed to assign task')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnassign = async (assignmentId: string) => {
    if (!confirm('Remove this assignment?')) return

    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error()

      setAssignments(assignments.filter(a => a.id !== assignmentId))
      router.refresh()
    } catch {
      alert('Failed to remove assignment')
    }
  }

  const handleResponsibilityChange = async (party: 'TCT' | 'CUSTOMER' | 'BOTH') => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsibleParty: party }),
      })

      if (!res.ok) throw new Error()

      setResponsibleParty(party)
      router.refresh()
    } catch {
      alert('Failed to update responsibility')
    }
  }

  const assignmentCount = assignments.length
  const hasAssignments = assignmentCount > 0

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1 text-xs font-semibold rounded border transition-colors ${
          hasAssignments
            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30'
            : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700'
        }`}
      >
        👤 {hasAssignments ? `${assignmentCount} Assigned` : 'Assign'}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3">Task Assignment</h3>

            {/* Responsibility Party Selector */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 mb-2 block">Responsible Party</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleResponsibilityChange('TCT')}
                  className={`px-3 py-2 text-xs font-semibold rounded border transition-colors ${
                    responsibleParty === 'TCT'
                      ? 'bg-emerald-500/30 text-emerald-200 border-emerald-500/50'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700'
                  }`}
                >
                  🏢 TCT
                </button>
                <button
                  onClick={() => handleResponsibilityChange('CUSTOMER')}
                  className={`px-3 py-2 text-xs font-semibold rounded border transition-colors ${
                    responsibleParty === 'CUSTOMER'
                      ? 'bg-amber-500/30 text-amber-200 border-amber-500/50'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700'
                  }`}
                >
                  👤 {companyName || 'Customer'}
                </button>
                <button
                  onClick={() => handleResponsibilityChange('BOTH')}
                  className={`px-3 py-2 text-xs font-semibold rounded border transition-colors ${
                    responsibleParty === 'BOTH'
                      ? 'bg-indigo-500/30 text-indigo-200 border-indigo-500/50'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700'
                  }`}
                >
                  🤝 Both
                </button>
              </div>
            </div>

            {/* Assignment list */}
            {hasAssignments ? (
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-700/50 border border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-200 truncate">
                        {assignment.assigneeName}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{assignment.assigneeEmail}</div>
                    </div>
                    <button
                      onClick={() => handleUnassign(assignment.id)}
                      className="flex-shrink-0 text-red-400 hover:text-red-300 transition-colors"
                      title="Remove assignment"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-4 italic">No one assigned yet</p>
            )}

            {/* Assignment form */}
            <form onSubmit={handleAssign} className="space-y-2">
              <input
                type="text"
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded text-slate-300 text-sm focus:outline-none focus:border-cyan-500/50"
              />
              <input
                type="email"
                value={assigneeEmail}
                onChange={(e) => setAssigneeEmail(e.target.value)}
                placeholder="Email address"
                className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded text-slate-300 text-sm focus:outline-none focus:border-cyan-500/50"
              />

              <button
                type="submit"
                disabled={!assigneeName.trim() || !assigneeEmail.trim() || isSubmitting}
                className="w-full px-3 py-2 text-xs font-semibold rounded bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Assigning...' : 'Assign Task'}
              </button>
            </form>

            <p className="text-xs text-slate-500 mt-3 italic">
              💡 Tip: M365 integration coming soon for user lookup
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
