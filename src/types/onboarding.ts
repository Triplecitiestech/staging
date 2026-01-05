// Onboarding portal types

export type PhaseStatus =
  | 'Not Started'
  | 'Scheduled'
  | 'Waiting on Customer'
  | 'In Progress'
  | 'Requires Customer Coordination'
  | 'Discussed'
  | 'Complete'

export type PhaseOwner = 'TCT' | 'Customer' | 'Both'

export interface Comment {
  id: string
  content: string
  authorName: string
  createdAt: string // ISO date string
}

export interface OnboardingPhase {
  id: string
  title: string
  description: string
  status: PhaseStatus
  scheduledDate?: string // ISO date string
  owner?: PhaseOwner
  notes?: string
  nextAction?: string
  details?: string[] // Additional bullet points for expanded view
  adminComments?: Comment[] // Comments from admin/staff visible to customer
  tasks?: Array<{
    id: string
    taskText: string
    completed: boolean
    status?: string
    notes?: string
    adminComments?: Comment[] // Task-level comments from admin
  }>
}

export interface OnboardingData {
  companySlug: string
  companyDisplayName: string
  currentPhaseId?: string // ID of the current phase (first incomplete phase)
  phases: OnboardingPhase[]
  lastUpdated: string // ISO date string
}

export interface OnboardingAuthRequest {
  companyName: string
  password: string
}

export interface OnboardingAuthResponse {
  success: boolean
  message: string
  sessionToken?: string
}
