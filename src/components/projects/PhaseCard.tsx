'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusDropdown from './StatusDropdown'
import TaskItem from './TaskItem'

interface Comment {
  id: string
  content: string
  isInternal: boolean
  createdAt: string
  authorName: string
  authorEmail: string
}

interface Assignment {
  id: string
  assigneeEmail: string
  assigneeName: string
  assignedBy: string
  assignedAt: string
}

interface Task {
  id: string
  taskText: string
  completed: boolean
  notes?: string | null
  orderIndex: number
  status?: string
  parentTaskId?: string | null
  subTasks?: Task[]
  comments?: Comment[]
  assignments?: Assignment[]
}

interface Phase {
  id: string
  title: string
  description: string | null
  status: string
  customerNotes: string | null
  internalNotes: string | null
  estimatedDays: number | null
  owner: string | null
  orderIndex: number
  tasks: Task[]
}

export default function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [draggedTask, setDraggedTask] = useState<string | null>(null)
  const [tasks, setTasks] = useState(phase.tasks.sort((a, b) => a.orderIndex - b.orderIndex))
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkAssignTo, setBulkAssignTo] = useState('')
  const [bulkAssignToName, setBulkAssignToName] = useState('')
  const [formData, setFormData] = useState({
    title: phase.title,
    description: phase.description || '',
    status: phase.status,
    customerNotes: phase.customerNotes || '',
    internalNotes: phase.internalNotes || '',
  })

  const completedTasks = phase.tasks.filter(t => t.completed).length
  const totalTasks = phase.tasks.length
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const savePhase = async () => {
    try {
      const res = await fetch(`/api/phases/${phase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) throw new Error()
      setEditing(false)
      router.refresh()
    } catch {
      alert('Failed to update phase')
    }
  }

  const deletePhase = async () => {
    if (!confirm('Are you sure you want to delete this phase? All tasks will also be deleted.')) return

    try {
      const res = await fetch(`/api/phases/${phase.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      alert('Failed to delete phase')
    }
  }

  // Bulk operations
  const toggleSelectAll = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(tasks.map(t => t.id)))
    }
  }

  const toggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTasks)
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId)
    } else {
      newSelected.add(taskId)
    }
    setSelectedTasks(newSelected)
  }

  const applyBulkStatus = async () => {
    if (!bulkStatus || selectedTasks.size === 0) return

    try {
      await Promise.all(
        Array.from(selectedTasks).map(taskId =>
          fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: bulkStatus }),
          })
        )
      )
      setSelectedTasks(new Set())
      setBulkStatus('')
      setShowBulkActions(false)
      router.refresh()
    } catch {
      alert('Failed to update tasks')
    }
  }

  const applyBulkAssign = async () => {
    if (!bulkAssignTo || selectedTasks.size === 0) return

    try {
      await Promise.all(
        Array.from(selectedTasks).map(taskId =>
          fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assignedTo: bulkAssignTo,
              assignedToName: bulkAssignToName || bulkAssignTo
            }),
          })
        )
      )
      setSelectedTasks(new Set())
      setBulkAssignTo('')
      setBulkAssignToName('')
      router.refresh()
    } catch {
      alert('Failed to assign tasks')
    }
  }

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId)
  }

  const handleDragOver = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault()
    if (!draggedTask || draggedTask === targetTaskId) return

    const draggedIndex = tasks.findIndex(t => t.id === draggedTask)
    const targetIndex = tasks.findIndex(t => t.id === targetTaskId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newTasks = [...tasks]
    const [removed] = newTasks.splice(draggedIndex, 1)
    newTasks.splice(targetIndex, 0, removed)
    setTasks(newTasks)
  }

  const handleDragEnd = async () => {
    if (!draggedTask) return

    // Update orderIndex for all tasks
    const taskOrders = tasks.map((task, idx) => ({
      id: task.id,
      orderIndex: idx,
    }))

    try {
      const res = await fetch('/api/tasks/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskOrders }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      alert('Failed to reorder tasks')
      setTasks(phase.tasks.sort((a, b) => a.orderIndex - b.orderIndex))
    } finally {
      setDraggedTask(null)
    }
  }

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <button onClick={() => setCollapsed(!collapsed)} className="mt-1 flex-shrink-0">
            <svg className={`w-5 h-5 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="flex items-center justify-center w-10 h-10 bg-cyan-500/20 rounded-full text-cyan-400 font-bold text-sm flex-shrink-0">{index + 1}</div>
          <div className="flex-1">
            {editing ? (
              <input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-2 py-1 bg-slate-800 border border-white/20 rounded text-white text-lg font-semibold mb-2"
              />
            ) : (
              <h3 className="text-lg font-semibold text-white mb-1">{phase.title}</h3>
            )}
            {!collapsed && (
              <>
                {editing ? (
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-2 py-1 bg-slate-800 border border-white/20 rounded text-slate-300 text-sm mb-2"
                    rows={2}
                  />
                ) : phase.description && (
                  <p className="text-sm text-slate-300 mb-2">{phase.description}</p>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && <StatusDropdown phaseId={phase.id} currentStatus={phase.status} />}
          {editing ? (
            <>
              <button onClick={savePhase} className="text-green-400 hover:text-green-300 text-sm px-2">Save</button>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-300 text-sm px-2">Cancel</button>
              <button onClick={deletePhase} className="text-red-400 hover:text-red-300 text-sm px-2">Delete</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="text-cyan-400 hover:text-cyan-300 text-sm px-2">Edit</button>
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {totalTasks > 0 && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 bg-slate-700 rounded-full h-2">
                <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-slate-300 font-medium w-12 text-right">{progress}%</span>
            </div>
          )}

          {tasks.length > 0 && (
            <>
              {/* Bulk actions toolbar */}
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-700">
                <input
                  type="checkbox"
                  checked={selectedTasks.size === tasks.length && tasks.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-500"
                />
                <span className="text-xs text-slate-400">
                  {selectedTasks.size > 0 ? `${selectedTasks.size} selected` : 'Select all'}
                </span>
                {selectedTasks.size > 0 && (
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value)}
                      className="px-2 py-1 text-xs bg-slate-800 border border-white/20 rounded text-slate-300"
                    >
                      <option value="">Set Status...</option>
                      <option value="ASSIGNED">Assigned</option>
                      <option value="COMPLETE">Complete</option>
                      <option value="INFORMATION_RECEIVED">Information Received</option>
                      <option value="ITG_DOCUMENTED">ITG Documented</option>
                      <option value="NEEDS_REVIEW">Needs Review</option>
                      <option value="NOT_APPLICABLE">Not Applicable</option>
                      <option value="NOT_STARTED">Not Started</option>
                      <option value="REVIEWED_AND_DONE">Reviewed and Done</option>
                      <option value="STUCK">Stuck</option>
                      <option value="WAITING_ON_CLIENT">Waiting on Client</option>
                      <option value="WAITING_ON_VENDOR">Waiting on Vendor</option>
                      <option value="WORK_IN_PROGRESS">Work in Progress</option>
                    </select>
                    <button
                      onClick={applyBulkStatus}
                      disabled={!bulkStatus}
                      className="px-3 py-1 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Apply Status
                    </button>
                    <div className="h-4 w-px bg-slate-600" />
                    <input
                      type="text"
                      value={bulkAssignTo}
                      onChange={(e) => setBulkAssignTo(e.target.value)}
                      placeholder="Assign to (email)..."
                      className="px-2 py-1 text-xs bg-slate-800 border border-white/20 rounded text-slate-300 w-40"
                    />
                    <button
                      onClick={applyBulkAssign}
                      disabled={!bulkAssignTo}
                      className="px-3 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Assign
                    </button>
                    <button
                      onClick={() => setSelectedTasks(new Set())}
                      className="px-2 py-1 text-xs text-slate-400 hover:text-slate-300"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Task list */}
              <div className="space-y-1 mb-4">
                {tasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    level={0}
                    isSelected={selectedTasks.has(task.id)}
                    onToggleSelection={toggleTaskSelection}
                    onEdit={setEditingTask}
                    editingTaskId={editingTask}
                    draggedTaskId={draggedTask}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </>
          )}

          {editing && (
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Customer Notes</label>
                <textarea
                  value={formData.customerNotes}
                  onChange={(e) => setFormData({ ...formData, customerNotes: e.target.value })}
                  className="w-full px-2 py-1 bg-slate-800 border border-white/20 rounded text-slate-300 text-sm"
                  rows={2}
                  placeholder="Visible to customer"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Internal Notes</label>
                <textarea
                  value={formData.internalNotes}
                  onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                  className="w-full px-2 py-1 bg-slate-800 border border-white/20 rounded text-slate-300 text-sm"
                  rows={2}
                  placeholder="Internal only"
                />
              </div>
            </div>
          )}

          {!editing && (phase.customerNotes || phase.internalNotes) && (
            <div className="space-y-3 pt-3 border-t border-white/10">
              {phase.customerNotes && (
                <div className="bg-cyan-500/10 border-l-4 border-cyan-500 rounded px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wide">Customer Note</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{phase.customerNotes}</p>
                </div>
              )}
              {phase.internalNotes && (
                <div className="bg-orange-500/10 border-l-4 border-orange-500 rounded px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-xs font-semibold text-orange-300 uppercase tracking-wide">Internal Only</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{phase.internalNotes}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
