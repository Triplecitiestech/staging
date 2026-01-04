'use client'

import { useState } from 'react'
import type { Company, ProjectTemplate } from '@prisma/client'
import NewProjectForm from './NewProjectForm'
import AIProjectAssistant from '../admin/AIProjectAssistant'

interface AIPhase {
  name: string
  description?: string
  orderIndex: number
  tasks?: Array<{
    taskText: string
    completed: boolean
    orderIndex: number
    notes?: string
  }>
}

interface NewProjectWithAIProps {
  companies: Company[]
  templates: ProjectTemplate[]
  userEmail: string
}

export default function NewProjectWithAI({ companies, templates, userEmail }: NewProjectWithAIProps) {
  const [aiPhases, setAiPhases] = useState<AIPhase[]>([])
  const [projectContext, setProjectContext] = useState({
    projectName: 'New Project'
  })

  const handleInsertStructure = (structure: unknown) => {
    const data = structure as { phases?: AIPhase[] }
    if (data.phases && Array.isArray(data.phases)) {
      setAiPhases(data.phases)
    }
  }

  return (
    <>
      <NewProjectForm
        companies={companies}
        templates={templates}
        userEmail={userEmail}
        aiPhases={aiPhases}
        onProjectInfoChange={(info) => {
          setProjectContext({
            projectName: info.title || 'New Project'
          })
        }}
      />

      <AIProjectAssistant
        projectContext={projectContext}
        onInsertStructure={handleInsertStructure}
      />
    </>
  )
}
