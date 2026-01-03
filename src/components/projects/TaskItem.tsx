'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TaskStatusDropdown from './TaskStatusDropdown'

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
  status?: string
  completed: boolean
  notes?: string | null
  orderIndex: number
  parentTaskId?: string | null
  subTasks?: Task[]
  comments?: Comment[]
  assignments?: Assignment[]
}

interface TaskItemProps {
  task: Task
  level: number
  isSelected: boolean
  onToggleSelection: (taskId: string) => void
  onEdit: (taskId: string) => void
  editingTaskId: string | null
  draggedTaskId: string | null
  onDragStart: (taskId: string) => void
  onDragOver: (e: React.DragEvent, taskId: string) => void
  onDragEnd: () => void
}

export default function TaskItem({
  task,
  level,
  isSelected,
  onToggleSelection,
  onEdit,
  editingTaskId,
  draggedTaskId,
  onDragStart,
  onDragOver,
  onDragEnd
}: TaskItemProps) {
  const router = useRouter()
  const [taskText, setTaskText] = useState(task.taskText)
  const [notes, setNotes] = useState(task.notes || '')
  const [collapsed, setCollapsed] = useState(false)

  const saveTask = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskText, notes }),
      })
      if (!res.ok) throw new Error()
      onEdit('')
      router.refresh()
    } catch {
      alert('Failed to update task')
    }
  }

  const createSubTask = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskText: 'New sub-task' }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create sub-task')
      }
      setCollapsed(false)
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create sub-task')
    }
  }

  const deleteTask = async () => {
    if (!confirm('Delete this task and all its sub-tasks?')) return

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      alert('Failed to delete task')
    }
  }

  const hasSubTasks = task.subTasks && task.subTasks.length > 0
  const canAddSubTask = level < 3 // Max 3 levels

  return (
    <div className={`${level > 0 ? 'ml-8 border-l-2 border-slate-700 pl-4' : ''}`}>
      <div
        draggable
        onDragStart={() => onDragStart(task.id)}
        onDragOver={(e) => onDragOver(e, task.id)}
        onDragEnd={onDragEnd}
        className={`group flex items-start gap-2 py-2 px-2 rounded transition-colors ${
          draggedTaskId === task.id ? 'opacity-50' : 'hover:bg-slate-800/50'
        }`}
      >
        {/* Selection checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelection(task.id)}
          className="mt-0.5 w-4 h-4 rounded border-2 border-slate-500 bg-transparent checked:bg-cyan-500 checked:border-cyan-500 cursor-pointer accent-cyan-500"
        />

        {/* Collapse button for tasks with subtasks */}
        {hasSubTasks && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="mt-0.5 text-slate-400 hover:text-slate-300"
          >
            <svg className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Spacer if no collapse button */}
        {!hasSubTasks && <div className="w-4" />}

        {/* Task content */}
        <div className="flex-1 min-w-0">
          {editingTaskId === task.id ? (
            <div className="space-y-2">
              <input
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                className="w-full px-2 py-1 bg-slate-800 border border-white/20 rounded text-slate-300 text-sm"
                placeholder="Task text..."
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-2 py-1 bg-slate-800 border border-white/20 rounded text-slate-300 text-xs"
                placeholder="Notes (optional)..."
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={saveTask}
                  className="px-3 py-1 text-xs bg-cyan-500 text-white rounded hover:bg-cyan-600"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setTaskText(task.taskText)
                    setNotes(task.notes || '')
                    onEdit('')
                  }}
                  className="px-3 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                onClick={() => onEdit(task.id)}
                className="cursor-pointer text-sm block text-slate-300"
              >
                {task.taskText}
              </span>
              {task.notes && (
                <span className="text-xs text-slate-500 italic">({task.notes})</span>
              )}
            </div>
          )}
        </div>

        {/* Status dropdown */}
        {task.status && <TaskStatusDropdown taskId={task.id} currentStatus={task.status} />}

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAddSubTask && (
            <button
              onClick={createSubTask}
              className="p-1 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded"
              title="Add sub-task"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <button
            onClick={deleteTask}
            className="p-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
            title="Delete task"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sub-tasks */}
      {hasSubTasks && !collapsed && (
        <div className="mt-1">
          {task.subTasks!.map((subTask) => (
            <TaskItem
              key={subTask.id}
              task={subTask}
              level={level + 1}
              isSelected={isSelected}
              onToggleSelection={onToggleSelection}
              onEdit={onEdit}
              editingTaskId={editingTaskId}
              draggedTaskId={draggedTaskId}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}
