import { NextRequest, NextResponse } from 'next/server';
import { getAudienceProvider } from '@/lib/marketing/audience-providers';

/**
 * GET /api/marketing/audiences/targeting?provider=AUTOTASK — Get available targeting options
 */
export async function GET(request: NextRequest) {
  try {
    const providerType = request.nextUrl.searchParams.get('provider') || 'AUTOTASK';

    const provider = getAudienceProvider(providerType);
    const options = await provider.getTargetingOptions();

    return NextResponse.json({ options, providerType });
  } catch (error) {
    console.error('Failed to fetch targeting options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch targeting options' },
      { status: 500 }
    );
  }
}
