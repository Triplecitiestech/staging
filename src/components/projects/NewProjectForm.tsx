'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Company, ProjectTemplate, ProjectType } from '@prisma/client'

interface NewProjectFormProps {
  companies: Company[]
  templates: ProjectTemplate[]
  userEmail: string
}

export default function NewProjectForm({ companies, templates, userEmail }: NewProjectFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    companyId: '',
    projectType: '' as ProjectType | '',
    title: '',
    templateId: '',
    useTemplate: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          createdBy: userEmail,
          lastModifiedBy: userEmail,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create project')
      }

      const project = await response.json()
      router.push(`/admin/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const selectedTemplate = templates.find(t => t.id === formData.templateId)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Company Selection */}
        <div>
          <label htmlFor="companyId" className="block text-sm font-medium text-gray-700 mb-2">
            Company *
          </label>
          <select
            id="companyId"
            required
            value={formData.companyId}
            onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a company...</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Project Type */}
        <div>
          <label htmlFor="projectType" className="block text-sm font-medium text-gray-700 mb-2">
            Project Type *
          </label>
          <select
            id="projectType"
            required
            value={formData.projectType}
            onChange={(e) => {
              const type = e.target.value as ProjectType
              setFormData({ ...formData, projectType: type, templateId: '' })
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select project type...</option>
            <option value="M365_MIGRATION">Microsoft 365 Migration</option>
            <option value="ONBOARDING">New Client Onboarding</option>
            <option value="FORTRESS">TCT Fortress Security</option>
            <option value="CUSTOM">Custom Project</option>
          </select>
        </div>

        {/* Project Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Project Title *
          </label>
          <input
            type="text"
            id="title"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Microsoft 365 Migration & Security Setup"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Template Selection */}
        {formData.projectType && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Use Template (Optional)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.useTemplate}
                  onChange={(e) => setFormData({ ...formData, useTemplate: e.target.checked, templateId: '' })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Use template</span>
              </label>
            </div>

            {formData.useTemplate && (
              <div>
                <select
                  value={formData.templateId}
                  onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a template...</option>
                  {templates
                    .filter(t => t.projectType === formData.projectType)
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                </select>

                {selectedTemplate && (
                  <div className="mt-3 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-2">Template Preview:</p>
                    <p className="text-sm text-blue-800 mb-3">{selectedTemplate.description}</p>
                    <div className="text-xs text-blue-700">
                      {Array.isArray(selectedTemplate.phasesJson) && (
                        <div>
                          <span className="font-medium">{selectedTemplate.phasesJson.length} phases:</span>
                          <ul className="mt-1 space-y-1 ml-4">
                            {selectedTemplate.phasesJson.map((phase: any, idx: number) => (
                              <li key={idx}>• {phase.title}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/projects')}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </form>
  )
}
