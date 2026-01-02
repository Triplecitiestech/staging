'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface StatusDropdownProps {
  phaseId: string
  currentStatus: string
}

export default function StatusDropdown({ phaseId, currentStatus }: StatusDropdownProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const statuses = [
    { value: 'NOT_STARTED', label: 'Not Started', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    { value: 'SCHEDULED', label: 'Scheduled', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    { value: 'WAITING_ON_CUSTOMER', label: 'Waiting On Customer', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
    { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
    { value: 'REQUIRES_CUSTOMER_COORDINATION', label: 'Requires Coordination', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    { value: 'DISCUSSED', label: 'Discussed', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    { value: 'COMPLETE', label: 'Complete', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  ]

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
      const res = await fetch(`/api/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      setIsOpen(false)
      router.refresh()
    } catch {
      alert('Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={updating}
        className={`px-3 py-1 text-xs font-semibold rounded-full border ${currentStatusObj.color} hover:opacity-80 transition-opacity disabled:opacity-50`}
      >
        {updating ? 'Updating...' : currentStatusObj.label}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
          {statuses.map((status) => (
            <button
              key={status.value}
              onClick={() => changeStatus(status.value)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                status.value === currentStatus
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
