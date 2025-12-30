'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Project {
  id: string
  title: string
  status: string
  projectType: string
  createdAt: Date
  aiGenerated: boolean
  company: { displayName: string }
  phases: Array<{ status: string }>
}

export default function ProjectList({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete project "${title}"?`)) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      router.refresh()
    } catch (error) {
      alert('Failed to delete project')
      setDeleting(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border border-green-500/30'
      case 'COMPLETED': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
      case 'ON_HOLD': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
      case 'CANCELLED': return 'bg-red-500/20 text-red-300 border border-red-500/30'
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
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

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-white/10">
        <thead className="bg-slate-900/50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Project</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Company</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Progress</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {projects.map((project) => {
            const completedPhases = project.phases.filter(p => p.status === 'COMPLETE').length
            const totalPhases = project.phases.length
            const progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0

            return (
              <tr key={project.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-white">{project.title}</div>
                  {project.aiGenerated && <div className="text-xs text-purple-400 mt-1">AI Generated</div>}
                </td>
                <td className="px-6 py-4 text-sm text-slate-200">{project.company.displayName}</td>
                <td className="px-6 py-4 text-sm text-slate-300">{getProjectTypeLabel(project.projectType)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-700 rounded-full h-2 max-w-[100px]">
                      <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-2 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-slate-300">{progress}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right space-x-3">
                  <Link href={`/admin/projects/${project.id}`} className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(project.id, project.title)}
                    disabled={deleting === project.id}
                    className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
                  >
                    {deleting === project.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
