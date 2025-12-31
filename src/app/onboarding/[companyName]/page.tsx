import React from 'react'
import { redirect } from 'next/navigation'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { getOnboardingData, companyExists } from '@/lib/onboarding-data'
import OnboardingPortal from '@/components/onboarding/OnboardingPortal'
import { Metadata } from 'next'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

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

  console.log('[Onboarding Page] Company slug:', companySlug)

  // Check if company exists (for 404 handling)
  const exists = companyExists(companySlug)
  console.log('[Onboarding Page] Company exists:', exists)

  if (!exists) {
    redirect('/404')
  }

  // Check authentication
  const authenticatedCompany = await getAuthenticatedCompany()
  const isAuthenticated = authenticatedCompany === companySlug
  console.log('[Onboarding Page] Authenticated company:', authenticatedCompany)
  console.log('[Onboarding Page] Is authenticated:', isAuthenticated)

  // Get onboarding data only if authenticated
  const onboardingData = isAuthenticated ? getOnboardingData(companySlug) : null
  console.log('[Onboarding Page] Onboarding data loaded:', onboardingData !== null)
  console.log('[Onboarding Page] Onboarding data:', onboardingData)

  // Fetch projects from database if authenticated
  let projects = null
  if (isAuthenticated) {
    try {
      // First find the company by slug
      const company = await prisma.company.findUnique({
        where: { slug: companySlug },
        select: { id: true }
      })

      if (company) {
        // Then fetch projects for this company
        projects = await prisma.project.findMany({
          where: { companyId: company.id },
          include: {
            phases: {
              include: {
                tasks: {
                  select: {
                    id: true,
                    taskText: true,
                    completed: true,
                    orderIndex: true,
                    notes: true
                  }
                }
              },
              orderBy: { orderIndex: 'asc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      }
    } catch (error) {
      console.error('[Onboarding Page] Error fetching projects:', error)
      // If notes column doesn't exist, try without it
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
                    select: {
                      id: true,
                      taskText: true,
                      completed: true,
                      orderIndex: true
                    }
                  }
                },
                orderBy: { orderIndex: 'asc' }
              }
            },
            orderBy: { createdAt: 'desc' }
          })
        }
      } catch {
        console.error('[Onboarding Page] Failed to fetch projects without notes')
      }
    }
  }

  return (
    <OnboardingPortal
      companySlug={companySlug}
      isAuthenticated={isAuthenticated}
      onboardingData={onboardingData}
      projects={projects}
    />
  )
}
