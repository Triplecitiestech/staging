import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedCompany } from '@/lib/onboarding-session'
import { getOnboardingData } from '@/lib/onboarding-data'
import type { OnboardingData } from '@/types/onboarding'

export async function GET(request: NextRequest) {
  try {
    // Get the requested company from query params
    const { searchParams } = new URL(request.url)
    const requestedCompany = searchParams.get('company')

    if (!requestedCompany) {
      return NextResponse.json(
        { error: 'Company parameter is required' },
        { status: 400 }
      )
    }

    // Check authentication
    const authenticatedCompany = await getAuthenticatedCompany()

    if (!authenticatedCompany) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in' },
        { status: 401 }
      )
    }

    // Ensure the authenticated company matches the requested company
    if (authenticatedCompany !== requestedCompany.toLowerCase().trim()) {
      return NextResponse.json(
        { error: 'Unauthorized - Access denied for this company' },
        { status: 403 }
      )
    }

    // Get the onboarding data
    const data = await getOnboardingData(authenticatedCompany)

    if (!data) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(data, { status: 200 })

  } catch (error) {
    console.error('Onboarding data error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
