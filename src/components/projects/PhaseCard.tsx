'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Task {
  id: string
  taskText: string
  completed: boolean
  notes?: string | null
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETE': return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'IN_PROGRESS': return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'WAITING_ON_CUSTOMER': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      case 'REQUIRES_CUSTOMER_COORDINATION': return 'bg-orange-500/20 text-orange-300 border-orange-500/30'
      case 'SCHEDULED': return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      case 'DISCUSSED': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    }
  }

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <button onClick={() => setCollapsed(!collapsed)} className="mt-1">
            <svg className={`w-5 h-5 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="flex items-center justify-center w-8 h-8 bg-cyan-500/20 rounded-lg text-cyan-400 font-bold text-sm">{index + 1}</div>
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
          {editing ? (
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="px-2 py-1 bg-slate-800 border border-white/20 rounded text-xs text-white"
            >
              <option value="NOT_STARTED">Not Started</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="WAITING_ON_CUSTOMER">Waiting On Customer</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="REQUIRES_CUSTOMER_COORDINATION">Requires Customer Coordination</option>
              <option value="DISCUSSED">Discussed</option>
              <option value="COMPLETE">Complete</option>
            </select>
          ) : (
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(phase.status)}`}>
              {phase.status.replace('_', ' ')}
            </span>
          )}
          {editing ? (
            <>
              <button onClick={savePhase} className="text-green-400 hover:text-green-300 text-sm px-2">Save</button>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-300 text-sm px-2">Cancel</button>
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

          {phase.tasks.length > 0 && (
            <div className="space-y-2 mb-4">
              {phase.tasks.map(task => (
                <div key={task.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => toggleTask(task.id, !task.completed)}
                      className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center ${
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
                        <span
                          onClick={() => setEditingTask(task.id)}
                          className={`cursor-pointer text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-300'}`}
                        >
                          {task.taskText}
                        </span>
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
            <div className="space-y-2 pt-3 border-t border-white/10 text-xs">
              {phase.customerNotes && (
                <div>
                  <span className="text-slate-400">Customer: </span>
                  <span className="text-slate-300">{phase.customerNotes}</span>
                </div>
              )}
              {phase.internalNotes && (
                <div>
                  <span className="text-slate-400">Internal: </span>
                  <span className="text-slate-300">{phase.internalNotes}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
