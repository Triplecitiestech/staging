'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface TaskStatusDropdownProps {
  taskId: string
  currentStatus: string
}

// Task statuses mapped 1:1 to Autotask picklist values
// AT 1=New, AT 4=In Progress, AT 5=Complete, AT 7=Waiting Customer
const statuses = [
  { value: 'NOT_STARTED', label: 'New', dotColor: 'bg-slate-400', textColor: 'text-slate-300' },
  { value: 'WORK_IN_PROGRESS', label: 'In Progress', dotColor: 'bg-sky-400', textColor: 'text-sky-300' },
  { value: 'REVIEWED_AND_DONE', label: 'Complete', dotColor: 'bg-green-400', textColor: 'text-green-300' },
  { value: 'WAITING_ON_CLIENT', label: 'Waiting Customer', dotColor: 'bg-red-400', textColor: 'text-red-400' },
]

export default function TaskStatusDropdown({ taskId, currentStatus }: TaskStatusDropdownProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [syncWarning, setSyncWarning] = useState('')
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
      const result = await res.json()
      if (result.autotaskSyncFailed) {
        setSyncWarning('Status updated locally but could not sync to Autotask')
        setTimeout(() => setSyncWarning(''), 8000)
      } else {
        setSyncWarning('')
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
      {syncWarning && (
        <div className="absolute left-0 mt-1 w-56 px-2 py-1.5 bg-violet-900/80 border border-violet-500/30 rounded text-xs text-violet-200 z-50">
          {syncWarning}
        </div>
      )}
    </div>
  )
}
