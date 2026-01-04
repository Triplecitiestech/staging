// Server-only onboarding data - NEVER expose to client
// This file should only be imported in API routes and server components

import { OnboardingData, PhaseStatus, PhaseOwner } from '@/types/onboarding'

// Get password from environment variable
// Format: ONBOARDING_PASSWORD_<COMPANY_SLUG_UPPERCASE>
export function getCompanyPassword(companySlug: string): string | null {
  const envKey = `ONBOARDING_PASSWORD_${companySlug.toUpperCase().replace(/-/g, '_')}`
  return process.env[envKey] || null
}

// Validate password for a company
export async function validateCompanyPassword(companySlug: string, password: string): Promise<boolean> {
  // First check static companies with env passwords
  const correctPassword = getCompanyPassword(companySlug)

  if (correctPassword) {
    console.log('[Password Validation]', {
      companySlug,
      hasPassword: !!correctPassword,
      envKey: `ONBOARDING_PASSWORD_${companySlug.toUpperCase().replace(/-/g, '_')}`,
      passwordProvided: password.length > 0
    })

    // Constant-time comparison to prevent timing attacks
    const isValid = timingSafeEqual(password, correctPassword)
    console.log('[Password Validation] Result:', isValid)
    return isValid
  }

  // Check database for dynamically created companies
  try {
    const { prisma } = await import('@/lib/prisma')
    const bcrypt = await import('bcryptjs')

    const company = await prisma.company.findUnique({
      where: { slug: companySlug },
      select: { passwordHash: true }
    })

    if (!company) {
      console.log('[Password Validation] No password configured for company:', companySlug)
      return false
    }

    // Use bcrypt to compare the password
    const isValid = await bcrypt.compare(password, company.passwordHash)
    console.log('[Password Validation] Database company result:', isValid)
    return isValid
  } catch (error) {
    console.error('[Password Validation] Error:', error)
    return false
  }
}

// Timing-safe string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}

// Get onboarding data for a company
// Returns null if company doesn't exist
export async function getOnboardingData(companySlug: string): Promise<OnboardingData | null> {
  // First try to get from database (dynamic projects)
  try {
    const { prisma } = await import('@/lib/prisma')

    const company = await prisma.company.findUnique({
      where: { slug: companySlug },
      include: {
        projects: {
          where: {
            projectType: 'ONBOARDING'
          },
          include: {
            phases: {
              orderBy: { orderIndex: 'asc' }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 1 // Get the most recent onboarding project
        }
      }
    })

    if (company && company.projects.length > 0) {
      const project = company.projects[0]

      // Map database phase statuses to OnboardingData format
      const mapPhaseStatus = (status: string): PhaseStatus => {
        switch (status) {
          case 'NOT_STARTED': return 'Not Started'
          case 'SCHEDULED': return 'Scheduled'
          case 'WAITING_ON_CUSTOMER': return 'Waiting on Customer'
          case 'IN_PROGRESS': return 'In Progress'
          case 'REQUIRES_CUSTOMER_COORDINATION': return 'Requires Customer Coordination'
          case 'DISCUSSED': return 'Discussed'
          case 'COMPLETE': return 'Complete'
          case 'COMPLETED': return 'Complete' // Map old COMPLETED to Complete
          default: return 'Not Started'
        }
      }

      return {
        companySlug: company.slug,
        companyDisplayName: company.displayName,
        currentPhaseId: project.phases.find(p => p.status === 'IN_PROGRESS')?.id,
        lastUpdated: project.updatedAt.toISOString(),
        phases: project.phases.map(phase => ({
          id: phase.id,
          title: phase.title,
          description: phase.description || '',
          status: mapPhaseStatus(phase.status),
          owner: (phase.owner as PhaseOwner) || 'TCT',
          notes: phase.customerNotes || undefined,
          nextAction: undefined,
          details: []
        }))
      }
    }
  } catch (error) {
    console.error('[getOnboardingData] Error fetching from database:', error)
  }

  // Fall back to static data if no database entry
  const data = onboardingDatabase.get(companySlug)
  return data || null
}

// Check if a company exists
export async function companyExists(companySlug: string): Promise<boolean> {
  // First check the static map
  if (onboardingDatabase.has(companySlug)) {
    return true
  }

  // Then check the database for dynamically created companies
  try {
    const { prisma } = await import('@/lib/prisma')

    const company = await prisma.company.findUnique({
      where: { slug: companySlug }
    })

    return !!company
  } catch (error) {
    console.error('[companyExists] Error checking database:', error)
    return false
  }
}

// Server-only database of onboarding data
// In a real implementation, this would be a database or CMS
const onboardingDatabase = new Map<string, OnboardingData>([
  [
    'ecospect',
    {
      companySlug: 'ecospect',
      companyDisplayName: 'Ecospect',
      currentPhaseId: 'phase-3', // Currently on Information Gathering
      lastUpdated: new Date().toISOString(),
      phases: [
        {
          id: 'phase-1',
          title: 'Welcome & Support Overview',
          description: 'Introduction to our support services and how to request help',
          status: 'Complete',
          owner: 'TCT',
          details: [
            'Overview of support channels (phone, email, portal)',
            'Priority levels and response times explained',
            'After-hours support procedures',
            'Escalation process for critical issues',
          ],
        },
        {
          id: 'phase-2',
          title: 'Kickoff Call',
          description: 'Initial meeting to discuss expectations and timeline',
          status: 'Complete',
          scheduledDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          owner: 'Both',
          notes: 'Completed on schedule. Team aligned on priorities.',
          details: [
            'Met with key stakeholders',
            'Reviewed current IT infrastructure',
            'Established communication protocols',
            'Set project timeline and milestones',
          ],
        },
        {
          id: 'phase-3',
          title: 'Information Gathering',
          description: 'Collecting access credentials, documentation, and system information',
          status: 'In Progress',
          owner: 'Both',
          nextAction: 'Awaiting Office 365 admin credentials',
          details: [
            'Network diagram and documentation',
            'User list and access requirements',
            'Current software licenses and subscriptions',
            'Hardware inventory',
            'Security policies and compliance requirements',
          ],
        },
        {
          id: 'phase-4',
          title: 'Implementation & Configuration',
          description: 'Setting up email, MFA, security tools, and device onboarding',
          status: 'Not Started',
          owner: 'TCT',
          details: [
            'Email migration and configuration',
            'Multi-factor authentication deployment',
            'Endpoint protection installation',
            'Backup solution implementation',
            'Network security hardening',
          ],
        },
        {
          id: 'phase-5',
          title: 'End-User Impact Review (Phone Call Required)',
          description: 'Discussion of changes that will affect end users',
          status: 'Not Started',
          owner: 'Both',
          notes: 'Call must be scheduled before proceeding with user-facing changes',
          details: [
            'Review password policy changes',
            'MFA rollout communication plan',
            'Software updates and changes',
            'User training requirements',
            'Timing for minimal disruption',
          ],
        },
        {
          id: 'phase-6',
          title: 'Post-Change Recap',
          description: 'Summary of implemented changes and user expectations',
          status: 'Not Started',
          owner: 'TCT',
          details: [
            'Documentation of all changes',
            'Updated network diagrams',
            'Password and access changes summary',
            'New procedures for users',
            'Points of contact for issues',
          ],
        },
        {
          id: 'phase-7',
          title: '30-Day Onboarding Review',
          description: 'Comprehensive review of platforms, tools, and best practices',
          status: 'Not Started',
          scheduledDate: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000).toISOString(),
          owner: 'Both',
          details: [
            'Support portal walkthrough',
            'Payment portal demonstration',
            'Security tools training',
            'Best practices review',
            'Feedback session and adjustments',
          ],
        },
      ],
    },
  ],
  [
    'all-spec-finishing',
    {
      companySlug: 'all-spec-finishing',
      companyDisplayName: 'All Spec Finishing',
      currentPhaseId: 'phase-5', // Currently on End-User Impact Review
      lastUpdated: new Date().toISOString(),
      phases: [
        {
          id: 'phase-1',
          title: 'Welcome & Support Overview',
          description: 'Introduction to our support services and how to request help',
          status: 'Complete',
          owner: 'TCT',
          details: [
            'Overview of support channels (phone, email, portal)',
            'Priority levels and response times explained',
            'After-hours support procedures',
            'Escalation process for critical issues',
          ],
        },
        {
          id: 'phase-2',
          title: 'Kickoff Call',
          description: 'Initial meeting to discuss expectations and timeline',
          status: 'Complete',
          scheduledDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
          owner: 'Both',
          details: [
            'Met with key stakeholders',
            'Reviewed current IT infrastructure',
            'Established communication protocols',
            'Set project timeline and milestones',
          ],
        },
        {
          id: 'phase-3',
          title: 'Information Gathering',
          description: 'Collecting access credentials, documentation, and system information',
          status: 'Complete',
          owner: 'Both',
          notes: 'All required information received',
          details: [
            'Network diagram and documentation',
            'User list and access requirements',
            'Current software licenses and subscriptions',
            'Hardware inventory',
            'Security policies and compliance requirements',
          ],
        },
        {
          id: 'phase-4',
          title: 'Implementation & Configuration',
          description: 'Setting up email, MFA, security tools, and device onboarding',
          status: 'Complete',
          owner: 'TCT',
          notes: 'All backend systems configured and ready for deployment',
          details: [
            'Email migration and configuration',
            'Multi-factor authentication deployment',
            'Endpoint protection installation',
            'Backup solution implementation',
            'Network security hardening',
          ],
        },
        {
          id: 'phase-5',
          title: 'End-User Impact Review (Phone Call Required)',
          description: 'Discussion of changes that will affect end users',
          status: 'Scheduled',
          scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          owner: 'Both',
          nextAction: 'Phone call scheduled for 2 days from now',
          notes: 'Review prepared, awaiting call to get approval for MFA rollout',
          details: [
            'Review password policy changes',
            'MFA rollout communication plan',
            'Software updates and changes',
            'User training requirements',
            'Timing for minimal disruption',
          ],
        },
        {
          id: 'phase-6',
          title: 'Post-Change Recap',
          description: 'Summary of implemented changes and user expectations',
          status: 'Not Started',
          owner: 'TCT',
          details: [
            'Documentation of all changes',
            'Updated network diagrams',
            'Password and access changes summary',
            'New procedures for users',
            'Points of contact for issues',
          ],
        },
        {
          id: 'phase-7',
          title: '30-Day Onboarding Review',
          description: 'Comprehensive review of platforms, tools, and best practices',
          status: 'Not Started',
          scheduledDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          owner: 'Both',
          details: [
            'Support portal walkthrough',
            'Payment portal demonstration',
            'Security tools training',
            'Best practices review',
            'Feedback session and adjustments',
          ],
        },
      ],
    },
  ],
])
