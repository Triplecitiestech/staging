import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * Test social media connections.
 * Validates that stored credentials can authenticate with each platform.
 *
 * POST /api/blog/social-config/test
 * Body: { platform: "facebook" | "instagram" | "linkedin" }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { platform } = body;

    if (!platform || !['facebook', 'instagram', 'linkedin'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');

    // Load credentials from BlogSettings, with env var fallback
    const creds = await loadPlatformCredentials(prisma, platform);

    if (!creds) {
      return NextResponse.json({
        platform,
        connected: false,
        error: 'No credentials configured for this platform'
      });
    }

    // Test the connection
    const result = await testPlatformConnection(platform, creds);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error testing social connection:', error);
    return NextResponse.json(
      { error: 'Failed to test connection' },
      { status: 500 }
    );
  }
}

interface PlatformCredentials {
  accessToken: string;
  id: string; // pageId, accountId, or orgId
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPlatformCredentials(prisma: any, platform: string): Promise<PlatformCredentials | null> {
  const keyMap: Record<string, { tokenKey: string; idKey: string; envToken: string; envId: string }> = {
    facebook: {
      tokenKey: 'facebook_access_token',
      idKey: 'facebook_page_id',
      envToken: 'FACEBOOK_ACCESS_TOKEN',
      envId: 'FACEBOOK_PAGE_ID'
    },
    instagram: {
      tokenKey: 'instagram_access_token',
      idKey: 'instagram_account_id',
      envToken: 'INSTAGRAM_ACCESS_TOKEN',
      envId: 'INSTAGRAM_ACCOUNT_ID'
    },
    linkedin: {
      tokenKey: 'linkedin_access_token',
      idKey: 'linkedin_org_id',
      envToken: 'LINKEDIN_ACCESS_TOKEN',
      envId: 'LINKEDIN_ORG_ID'
    }
  };

  const config = keyMap[platform];
  if (!config) return null;

  // Try database first
  const dbSettings = await prisma.blogSettings.findMany({
    where: { key: { in: [config.tokenKey, config.idKey] } }
  });
  const dbMap = new Map(dbSettings.map((s: { key: string; value: string }) => [s.key, s.value]));

  const dbToken = dbMap.get(config.tokenKey);
  const dbId = dbMap.get(config.idKey);
  const accessToken = dbToken || (process.env[String(config.envToken)] as string | undefined);
  const id = dbId || (process.env[String(config.envId)] as string | undefined);

  if (!accessToken || !id) return null;

  return { accessToken: accessToken as string, id: id as string };
}

async function testPlatformConnection(
  platform: string,
  creds: PlatformCredentials
): Promise<{ platform: string; connected: boolean; details?: Record<string, string>; error?: string }> {
  try {
    switch (platform) {
      case 'facebook': {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${creds.id}?fields=name,id,access_token&access_token=${creds.accessToken}`
        );
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Facebook API error');
        }
        const data = await response.json();
        return {
          platform: 'facebook',
          connected: true,
          details: { pageName: data.name, pageId: data.id }
        };
      }

      case 'instagram': {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${creds.id}?fields=id,username,name&access_token=${creds.accessToken}`
        );
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Instagram API error');
        }
        const data = await response.json();
        return {
          platform: 'instagram',
          connected: true,
          details: { username: data.username || data.name, accountId: data.id }
        };
      }

      case 'linkedin': {
        const response = await fetch(
          `https://api.linkedin.com/v2/organizations/${creds.id}`,
          {
            headers: {
              'Authorization': `Bearer ${creds.accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0'
            }
          }
        );
        if (!response.ok) {
          // Try the /me endpoint as fallback
          const meResponse = await fetch('https://api.linkedin.com/v2/me', {
            headers: { 'Authorization': `Bearer ${creds.accessToken}` }
          });
          if (!meResponse.ok) {
            throw new Error('LinkedIn API authentication failed');
          }
          return {
            platform: 'linkedin',
            connected: true,
            details: { orgId: creds.id, note: 'Token valid, org access pending verification' }
          };
        }
        const data = await response.json();
        return {
          platform: 'linkedin',
          connected: true,
          details: { orgName: data.localizedName, orgId: String(data.id) }
        };
      }

      default:
        return { platform, connected: false, error: 'Unknown platform' };
    }
  } catch (error) {
    return {
      platform,
      connected: false,
      error: error instanceof Error ? error.message : 'Connection test failed'
    };
  }
}
