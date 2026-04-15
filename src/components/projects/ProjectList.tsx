'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Project {
  id: string
  title: string
  status: string
  projectType: string
  createdAt: Date
  aiGenerated: boolean
  autotaskProjectId?: string | null
  isVisibleToCustomer?: boolean
  company: { displayName: string; slug: string }
  phases: Array<{ status: string; tasks?: Array<{ status: string; completed: boolean }> }>
}

type SortKey = 'title' | 'company' | 'type' | 'status' | 'progress' | 'created'
type SortDir = 'asc' | 'desc'

export default function ProjectList({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation()
    if (!confirm(`Delete project "${title}"?`)) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      router.refresh()
    } catch {
      alert('Failed to delete project')
      setDeleting(null)
    }
  }

  const handleToggleVisibility = async (e: React.MouseEvent, id: string, currentlyVisible: boolean) => {
    e.stopPropagation()
    setTogglingVisibility(id)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisibleToCustomer: !currentlyVisible }),
      })
      if (!res.ok) throw new Error('Failed to update visibility')
      router.refresh()
    } catch {
      alert('Failed to update project visibility')
    } finally {
      setTogglingVisibility(null)
    }
  }

  // Project status colors mapped to Autotask: Inactive(0), Active(4), Complete(5)
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border border-green-500/30'
      case 'COMPLETED': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
      case 'ON_HOLD':
      case 'CANCELLED': return 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
    }
  }

  // Display labels matching Autotask project statuses
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active'
      case 'COMPLETED': return 'Complete'
      case 'ON_HOLD':
      case 'CANCELLED': return 'Inactive'
      default: return status.replace(/_/g, ' ')
    }
  }

  const getProjectTypeLabel = (type: string) => {
    switch (type) {
      case 'M365_MIGRATION': return 'M365 Migration'
      case 'ONBOARDING': return 'Client Onboarding'
      case 'FORTRESS': return 'TCT Fortress'
      case 'CUSTOM': return 'Custom'
      default: return type
    }
  }

  const DONE_STATUSES = ['REVIEWED_AND_DONE', 'NOT_APPLICABLE', 'ITG_DOCUMENTED']

  const getProgress = (phases: Array<{ status: string; tasks?: Array<{ status: string; completed: boolean }> }>) => {
    // Task-based progress: count completed tasks across all phases
    const allTasks = phases.flatMap(p => p.tasks || [])
    if (allTasks.length === 0) {
      // Fallback to phase-based if no task data
      if (phases.length === 0) return 0
      const completed = phases.filter(p => p.status === 'COMPLETE').length
      return Math.round((completed / phases.length) * 100)
    }
    const doneTasks = allTasks.filter(t => DONE_STATUSES.includes(t.status) || t.completed).length
    return Math.round((doneTasks / allTasks.length) * 100)
  }

  const statusOrder: Record<string, number> = useMemo(() => ({ ACTIVE: 0, ON_HOLD: 1, COMPLETED: 2, CANCELLED: 3 }), [])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return (
        <svg className="w-3 h-3 text-slate-600 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortDir === 'asc' ? (
      <svg className="w-3 h-3 text-cyan-400 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-cyan-400 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const result = projects.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.company.displayName.toLowerCase().includes(q) ||
      getProjectTypeLabel(p.projectType).toLowerCase().includes(q) ||
      p.status.toLowerCase().replace('_', ' ').includes(q)
    )

    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'company':
          cmp = a.company.displayName.localeCompare(b.company.displayName)
          break
        case 'type':
          cmp = getProjectTypeLabel(a.projectType).localeCompare(getProjectTypeLabel(b.projectType))
          break
        case 'status':
          cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
          break
        case 'progress':
          cmp = getProgress(a.phases) - getProgress(b.phases)
          break
        case 'created':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [projects, search, sortKey, sortDir, statusOrder])

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <div className="relative w-full sm:max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-400">{search ? 'No projects match your search' : 'No projects yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-slate-900/50">
                <tr>
                  <th
                    onClick={() => handleSort('title')}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Project <SortIcon column="title" />
                  </th>
                  <th
                    onClick={() => handleSort('company')}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Company <SortIcon column="company" />
                  </th>
                  <th
                    onClick={() => handleSort('type')}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Type <SortIcon column="type" />
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Status <SortIcon column="status" />
                  </th>
                  <th
                    onClick={() => handleSort('progress')}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Progress <SortIcon column="progress" />
                  </th>
                  <th
                    onClick={() => handleSort('created')}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
                  >
                    Created <SortIcon column="created" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((project) => {
                  const progress = getProgress(project.phases)

                  return (
                    <tr
                      key={project.id}
                      onClick={() => router.push(`/admin/projects/${project.id}`)}
                      className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white">{project.title}</div>
                        {project.aiGenerated && <div className="text-xs text-purple-400 mt-0.5">AI Generated</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-200">{project.company.displayName}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{getProjectTypeLabel(project.projectType)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
                          {getStatusLabel(project.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-700 rounded-full h-2 max-w-[100px]">
                            <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-2 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-slate-300">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-4">
                          {project.autotaskProjectId && (
                            <a
                              href={`/api/autotask/link?type=project&id=${project.autotaskProjectId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                              title="Open in Autotask"
                            >
                              AT
                            </a>
                          )}
                          <button
                            onClick={(e) => handleToggleVisibility(e, project.id, project.isVisibleToCustomer !== false)}
                            disabled={togglingVisibility === project.id}
                            className={`text-sm font-medium disabled:opacity-50 ${project.isVisibleToCustomer === false ? 'text-slate-500 hover:text-slate-300' : 'text-cyan-400 hover:text-cyan-300'}`}
                            title={project.isVisibleToCustomer === false ? 'Hidden from customer portal — click to show' : 'Visible on customer portal — click to hide'}
                          >
                            {togglingVisibility === project.id ? '...' : project.isVisibleToCustomer === false ? 'Hidden' : 'Visible'}
                          </button>
                          <Link
                            href={`/admin/projects/${project.id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-cyan-400 hover:text-cyan-300 text-sm font-medium"
                          >
                            View
                          </Link>
                          <button
                            onClick={(e) => handleDelete(e, project.id, project.title)}
                            disabled={deleting === project.id}
                            className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
                          >
                            {deleting === project.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
