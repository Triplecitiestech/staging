import React from 'react'
import { notFound, redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-session'
import { getOnboardingData, companyExists } from '@/lib/onboarding-data'
import OnboardingPortal from '@/components/onboarding/OnboardingPortal'
import { DEMO_COMPANY, DEMO_PROJECTS } from '@/lib/demo-mode'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ companyName: string }>
}

// Generate metadata for SEO (but keep it vague for security)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: 'Customer Onboarding | Triple Cities Tech',
    description: 'Track your onboarding progress with Triple Cities Tech',
    robots: {
      index: false, // Don't index these pages
      follow: false,
    },
  }
}

export default async function OnboardingPage({ params }: PageProps) {
  const { companyName } = await params
  const companySlug = companyName.toLowerCase().trim()

  // Check if company exists (throws on DB error instead of silently returning false)
  const exists = await companyExists(companySlug)

  if (!exists) {
    notFound()
  }

  // Check SSO session cookie — redirect to login if missing/expired
  const session = await getPortalSession()

  if (!session || session.companySlug !== companySlug) {
    redirect(`/api/portal/auth/login?company=${encodeURIComponent(companySlug)}`)
  }

  const isAuthenticated = true

  // Get onboarding data only if authenticated
  const onboardingData = isAuthenticated ? await getOnboardingData(companySlug) : null

  // Fetch projects from database if authenticated
  let projects = null
  let companyDisplayName: string | null = null
  const isDemoCompany = companySlug === 'contoso-industries'

  if (isAuthenticated && isDemoCompany) {
    // Demo company: use synthetic data only, never touch the database
    companyDisplayName = DEMO_COMPANY.displayName
    projects = DEMO_PROJECTS
  } else if (isAuthenticated) {
    const { prisma } = await import('@/lib/prisma')
    try {
      // First find the company by slug
      const company = await prisma.company.findUnique({
        where: { slug: companySlug },
        select: { id: true, displayName: true }
      })
      if (company) companyDisplayName = company.displayName

      if (company) {
        // Then fetch projects for this company
        projects = await prisma.project.findMany({
          where: { companyId: company.id },
          include: {
            phases: {
              where: { isVisibleToCustomer: true },
              include: {
                tasks: {
                  where: {
                    isVisibleToCustomer: true,
                    parentTaskId: null
                  },
                  select: {
                    id: true,
                    taskText: true,
                    completed: true,
                    orderIndex: true,
                    notes: true,
                    status: true,
                    autotaskTaskId: true,
                    comments: {
                      where: { isInternal: false },
                      select: { id: true, content: true, authorName: true, createdAt: true },
                      orderBy: { createdAt: 'desc' },
                      take: 10,
                    },
                  },
                  orderBy: { orderIndex: 'asc' }
                }
              },
              orderBy: { orderIndex: 'asc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      }
    } catch (error) {
      console.error('[Onboarding Page] Error fetching projects (possibly parentTaskId column missing):', error)
      // If parentTaskId column doesn't exist yet, try without filtering by it
      try {
        const company = await prisma.company.findUnique({
          where: { slug: companySlug },
          select: { id: true }
        })

        if (company) {
          projects = await prisma.project.findMany({
            where: { companyId: company.id },
            include: {
              phases: {
                include: {
                  tasks: {
                    where: {
                      isVisibleToCustomer: true
                    },
                    select: {
                      id: true,
                      taskText: true,
                      completed: true,
                      orderIndex: true,
                      status: true
                    },
                    orderBy: { orderIndex: 'asc' }
                  }
                },
                orderBy: { orderIndex: 'asc' }
              }
            },
            orderBy: { createdAt: 'desc' }
          })
        }
      } catch (fallbackError) {
        console.error('[Onboarding Page] Failed to fetch projects with fallback:', fallbackError)
      }
    }
  }

  return (
    <OnboardingPortal
      companySlug={companySlug}
      companyDisplayName={companyDisplayName}
      isAuthenticated={isAuthenticated}
      onboardingData={onboardingData}
      projects={projects}
      userEmail={session.email}
      userName={session.name}
      userRole={session.role}
      isManager={session.isManager}
    />
  )
}
