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

interface ContactOption {
  name: string
  email: string
  type: 'staff' | 'contact'
}

interface AssignmentPickerProps {
  taskId: string
  assignments: Assignment[]
  currentResponsibleParty?: 'TCT' | 'CUSTOMER' | 'BOTH' | null
  companyName?: string
  projectContacts?: ContactOption[]
}

export default function AssignmentPicker({ taskId, assignments: initialAssignments, currentResponsibleParty, companyName, projectContacts = [] }: AssignmentPickerProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [assignments, setAssignments] = useState(initialAssignments)
  useEffect(() => { setAssignments(initialAssignments) }, [initialAssignments])
  const [assigneeName, setAssigneeName] = useState('')
  const [assigneeEmail, setAssigneeEmail] = useState('')
  const [responsibleParty, setResponsibleParty] = useState<'TCT' | 'CUSTOMER' | 'BOTH' | ''>(currentResponsibleParty || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
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

  const doAssign = async (name: string, email: string) => {
    if (!name.trim() || !email.trim() || isSubmitting) return

    // Check if already assigned
    if (assignments.some(a => a.assigneeEmail.toLowerCase() === email.toLowerCase())) {
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          assigneeName: name.trim(),
          assigneeEmail: email.trim(),
        }),
      })

      if (!res.ok) {
        if (res.status === 409) return // Already assigned
        throw new Error()
      }

      const assignment = await res.json()
      setAssignments([...assignments, assignment])
      setAssigneeName('')
      setAssigneeEmail('')
      setShowManualEntry(false)
      router.refresh()
    } catch {
      alert('Failed to assign task')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    await doAssign(assigneeName, assigneeEmail)
  }

  const handleQuickAssign = async (contact: ContactOption) => {
    await doAssign(contact.name, contact.email)
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

  const hasAssignments = assignments.length > 0
  const assigneeNames = assignments.map(a => a.assigneeName.split(' ')[0]).join(', ')

  // Filter out already-assigned contacts
  const assignedEmails = new Set(assignments.map(a => a.assigneeEmail.toLowerCase()))
  const availableStaff = projectContacts.filter(c => c.type === 'staff' && !assignedEmails.has(c.email.toLowerCase()))
  const availableClients = projectContacts.filter(c => c.type === 'contact' && !assignedEmails.has(c.email.toLowerCase()))
  const hasAvailableContacts = availableStaff.length > 0 || availableClients.length > 0

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 text-xs transition-colors truncate ${
          hasAssignments
            ? 'text-purple-300 hover:text-purple-200'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="truncate">{hasAssignments ? assigneeNames : 'Unassigned'}</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Task Assignment</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

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
                  TCT
                </button>
                <button
                  onClick={() => handleResponsibilityChange('CUSTOMER')}
                  className={`px-3 py-2 text-xs font-semibold rounded border transition-colors ${
                    responsibleParty === 'CUSTOMER'
                      ? 'bg-violet-500/30 text-violet-200 border-violet-500/50'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700'
                  }`}
                >
                  {companyName || 'Client'}
                </button>
                <button
                  onClick={() => handleResponsibilityChange('BOTH')}
                  className={`px-3 py-2 text-xs font-semibold rounded border transition-colors ${
                    responsibleParty === 'BOTH'
                      ? 'bg-indigo-500/30 text-indigo-200 border-indigo-500/50'
                      : 'bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>

            {/* Current assignments */}
            {hasAssignments && (
              <div className="space-y-2 mb-4">
                <label className="text-xs text-slate-400 block">Currently Assigned</label>
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-700/50 border border-white/10"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-200 truncate">{assignment.assigneeName}</div>
                      <div className="text-[10px] text-slate-400 truncate">{assignment.assigneeEmail}</div>
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
            )}

            {/* Quick-assign from contacts */}
            {hasAvailableContacts && (
              <div className="mb-3 border-t border-white/10 pt-3">
                <label className="text-xs text-slate-400 mb-2 block">Quick Assign</label>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {availableStaff.length > 0 && (
                    <>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 pt-1">TCT Team</div>
                      {availableStaff.map(contact => (
                        <button
                          key={contact.email}
                          onClick={() => handleQuickAssign(contact)}
                          disabled={isSubmitting}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700/70 transition-colors text-left disabled:opacity-50"
                        >
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {contact.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-200 truncate">{contact.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">{contact.email}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {availableClients.length > 0 && (
                    <>
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 pt-1">Client Contacts</div>
                      {availableClients.map(contact => (
                        <button
                          key={contact.email}
                          onClick={() => handleQuickAssign(contact)}
                          disabled={isSubmitting}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-700/70 transition-colors text-left disabled:opacity-50"
                        >
                          <div className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {contact.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-200 truncate">{contact.name}</div>
                            <div className="text-[10px] text-slate-500 truncate">{contact.email}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Manual entry toggle + form */}
            <div className="border-t border-white/10 pt-3">
              {!showManualEntry && hasAvailableContacts ? (
                <button
                  onClick={() => setShowManualEntry(true)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  + Add someone not listed
                </button>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
