'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface TaskStatusDropdownProps {
  taskId: string
  currentStatus: string
}

const statuses = [
  { value: 'NOT_STARTED', label: 'Not Started', dotColor: 'bg-pink-400', textColor: 'text-pink-300' },
  { value: 'ASSIGNED', label: 'Assigned', dotColor: 'bg-purple-400', textColor: 'text-purple-300' },
  { value: 'WORK_IN_PROGRESS', label: 'Work in Progress', dotColor: 'bg-sky-400', textColor: 'text-sky-300' },
  { value: 'WAITING_ON_CLIENT', label: 'Waiting on Client', dotColor: 'bg-orange-400', textColor: 'text-orange-300' },
  { value: 'WAITING_ON_VENDOR', label: 'Waiting on Vendor', dotColor: 'bg-rose-400', textColor: 'text-rose-300' },
  { value: 'NEEDS_REVIEW', label: 'Needs Review', dotColor: 'bg-cyan-400', textColor: 'text-cyan-300' },
  { value: 'STUCK', label: 'Stuck', dotColor: 'bg-red-400', textColor: 'text-red-300' },
  { value: 'INFORMATION_RECEIVED', label: 'Info Received', dotColor: 'bg-teal-400', textColor: 'text-teal-300' },
  { value: 'REVIEWED_AND_DONE', label: 'Done', dotColor: 'bg-green-400', textColor: 'text-green-300' },
  { value: 'ITG_DOCUMENTED', label: 'ITG Documented', dotColor: 'bg-indigo-400', textColor: 'text-indigo-300' },
  { value: 'NOT_APPLICABLE', label: 'N/A', dotColor: 'bg-slate-400', textColor: 'text-slate-400' },
  { value: 'CUSTOMER_NOTE_ADDED', label: 'Customer Note', dotColor: 'bg-violet-400', textColor: 'text-violet-300' },
]

export default function TaskStatusDropdown({ taskId, currentStatus }: TaskStatusDropdownProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentStatusObj = statuses.find(s => s.value === currentStatus) || statuses[0]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  const changeStatus = async (newStatus: string) => {
    if (newStatus === currentStatus || updating) return

    setUpdating(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('Status update failed:', res.status, errorData)
        throw new Error(errorData.error || 'Failed to update')
      }
      setIsOpen(false)
      router.refresh()
    } catch (error) {
      console.error('Task status update error:', error)
      alert(`Failed to update task status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={updating}
        className="flex items-center gap-1.5 text-xs hover:opacity-80 transition-opacity disabled:opacity-50"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${currentStatusObj.dotColor}`} />
        <span className={`font-medium ${currentStatusObj.textColor}`}>
          {updating ? 'Saving...' : currentStatusObj.label}
        </span>
        <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-52 bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
          {statuses.map((status) => (
            <button
              key={status.value}
              onClick={() => changeStatus(status.value)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                status.value === currentStatus
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dotColor}`} />
              {status.label}
              {status.value === currentStatus && (
                <svg className="w-3.5 h-3.5 ml-auto text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
