'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface DueDatePickerProps {
  taskId: string
  currentDueDate: string | null
}

export default function DueDatePicker({ taskId, currentDueDate }: DueDatePickerProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(currentDueDate || '')
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

  const handleDateChange = async (date: string) => {
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: date || null }),
      })

      if (!res.ok) throw new Error()

      setSelectedDate(date)
      setIsOpen(false)
      router.refresh()
    } catch {
      alert('Failed to update due date')
    } finally {
      setIsSubmitting(false)
    }
  }

  const clearDate = async () => {
    await handleDateChange('')
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const hasDueDate = selectedDate && selectedDate.length > 0

  // Check if overdue
  const isOverdue = hasDueDate && new Date(selectedDate) < new Date()

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 text-xs transition-colors ${
          isOverdue
            ? 'text-red-400 hover:text-red-300'
            : hasDueDate
            ? 'text-slate-300 hover:text-white'
            : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{hasDueDate ? formatDate(selectedDate) : 'No date'}</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-slate-800 border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Due Date</h3>

            <input
              type="date"
              value={selectedDate ? new Date(selectedDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleDateChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="w-full px-3 py-2 bg-slate-900 border border-white/20 rounded text-slate-300 text-sm focus:outline-none focus:border-cyan-500/50"
              disabled={isSubmitting}
            />

            {hasDueDate && (
              <button
                onClick={clearDate}
                disabled={isSubmitting}
                className="w-full mt-2 px-3 py-1.5 text-xs font-semibold rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Clear Date
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
