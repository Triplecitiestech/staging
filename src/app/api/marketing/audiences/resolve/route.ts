import { NextRequest, NextResponse } from 'next/server';
import { getAudienceProvider } from '@/lib/marketing/audience-providers';

/**
 * POST /api/marketing/audiences/resolve — Preview resolved recipients for filter criteria
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerType, filterCriteria } = body;

    if (!providerType || !filterCriteria) {
      return NextResponse.json(
        { error: 'Missing required fields: providerType, filterCriteria' },
        { status: 400 }
      );
    }

    const provider = getAudienceProvider(providerType);
    const recipients = await provider.resolveRecipients(filterCriteria);

    return NextResponse.json({
      recipientCount: recipients.length,
      recipients: recipients.slice(0, 50), // Preview first 50
      hasMore: recipients.length > 50,
    });
  } catch (error) {
    console.error('Failed to resolve audience:', error);
    return NextResponse.json(
      { error: 'Failed to resolve audience recipients' },
      { status: 500 }
    );
  }
}
