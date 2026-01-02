'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusDropdown from './StatusDropdown'
import TaskStatusDropdown from './TaskStatusDropdown'
import CommentThread from './CommentThread'

interface Comment {
  id: string
  content: string
  isInternal: boolean
  createdAt: string
  authorName: string
  authorEmail: string
}

interface Task {
  id: string
  taskText: string
  completed: boolean
  notes?: string | null
  orderIndex: number
  status?: string
  comments?: Comment[]
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

  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      alert('Failed to update task')
    }
  }

  const saveTask = async (taskId: string, taskText: string, notes: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskText, notes }),
      })
      if (!res.ok) throw new Error()
      setEditingTask(null)
      router.refresh()
    } catch {
      alert('Failed to update task')
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
            <div className="space-y-2 mb-4">
              {tasks.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                  onDragOver={(e) => handleDragOver(e, task.id)}
                  onDragEnd={handleDragEnd}
                  className={`group space-y-2 ${draggedTask === task.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 cursor-move opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 3h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm4-16h2v2h-2V3zm0 4h2v2h-2V7zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
                      </svg>
                    </div>
                    <button
                      onClick={() => toggleTask(task.id, !task.completed)}
                      className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        task.completed ? 'bg-cyan-500 border-cyan-500' : 'border-slate-500'
                      }`}
                    >
                      {task.completed && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="flex-1">
                      {editingTask === task.id ? (
                        <input
                          defaultValue={task.taskText}
                          onBlur={(e) => saveTask(task.id, e.target.value, task.notes || '')}
                          className="w-full px-2 py-1 bg-slate-800 border border-white/20 rounded text-slate-300 text-sm"
                          autoFocus
                        />
                      ) : (
                        <div className="space-y-2">
                          <span
                            onClick={() => setEditingTask(task.id)}
                            className={`cursor-pointer text-sm block ${task.completed ? 'text-slate-400 line-through' : 'text-slate-300'}`}
                          >
                            {task.taskText}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {task.status && (
                              <TaskStatusDropdown taskId={task.id} currentStatus={task.status} />
                            )}
                            <button className="px-2 py-1 text-xs font-semibold rounded border bg-slate-700/50 text-slate-300 border-slate-600/50 hover:bg-slate-700 transition-colors" title="Assign task (coming soon)">
                              👤 Assign
                            </button>
                            <CommentThread taskId={task.id} comments={task.comments || []} />
                          </div>
                        </div>
                      )}
                      {task.notes && <p className="text-xs text-slate-500 mt-1 italic">{task.notes}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
