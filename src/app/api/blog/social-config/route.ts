import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/**
 * Social media configuration API.
 * Stores platform credentials in BlogSettings table.
 *
 * GET /api/blog/social-config — Get current config status (no secrets returned)
 * POST /api/blog/social-config — Save config for a platform
 */

const PLATFORM_KEYS: Record<string, string[]> = {
  facebook: ['facebook_access_token', 'facebook_page_id'],
  instagram: ['instagram_access_token', 'instagram_account_id'],
  linkedin: ['linkedin_access_token', 'linkedin_org_id']
};

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { prisma } = await import('@/lib/prisma');

    // Get all social config settings
    const settings = await prisma.blogSettings.findMany({
      where: {
        key: {
          in: Object.values(PLATFORM_KEYS).flat()
        }
      }
    });

    const settingsMap = new Map(settings.map(s => [s.key, s.value]));

    // Build status for each platform without revealing actual secrets
    const platforms: Record<string, {
      status: 'not_connected' | 'partially_connected' | 'connected';
      fields: Record<string, { configured: boolean; hint?: string }>;
      updatedAt?: string;
    }> = {};

    for (const [platform, keys] of Object.entries(PLATFORM_KEYS)) {
      const fields: Record<string, { configured: boolean; hint?: string }> = {};
      let configuredCount = 0;

      for (const key of keys) {
        const value = settingsMap.get(key);
        const hasValue = !!value && value.length > 0;
        if (hasValue) configuredCount++;

        fields[key] = {
          configured: hasValue,
          hint: hasValue ? `...${value!.slice(-4)}` : undefined
        };
      }

      // Also check env vars as fallback
      const envConfigured = checkEnvPlatform(platform);

      let status: 'not_connected' | 'partially_connected' | 'connected';
      if (configuredCount === keys.length || envConfigured) {
        status = 'connected';
      } else if (configuredCount > 0) {
        status = 'partially_connected';
      } else {
        status = 'not_connected';
      }

      const platformSettings = settings.filter(s => keys.includes(s.key));
      const latestUpdate = platformSettings.length > 0
        ? platformSettings.reduce((latest, s) => s.updatedAt > latest ? s.updatedAt : latest, platformSettings[0].updatedAt)
        : undefined;

      platforms[platform] = {
        status,
        fields,
        updatedAt: latestUpdate?.toISOString()
      };
    }

    return NextResponse.json({ platforms });
  } catch (error) {
    console.error('Error fetching social config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch social media configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { platform, credentials } = body;

    if (!platform || !PLATFORM_KEYS[platform]) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    if (!credentials || typeof credentials !== 'object') {
      return NextResponse.json({ error: 'Credentials required' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const allowedKeys = PLATFORM_KEYS[platform];

    // Save each credential
    for (const [key, value] of Object.entries(credentials)) {
      if (!allowedKeys.includes(key)) continue;
      if (typeof value !== 'string' || value.length === 0) continue;

      await prisma.blogSettings.upsert({
        where: { key },
        create: {
          key,
          value: value as string,
          updatedBy: session.user?.email || 'admin'
        },
        update: {
          value: value as string,
          updatedBy: session.user?.email || 'admin'
        }
      });
    }

    console.log(`Social media config updated for ${platform} by ${session.user?.email}`);

    return NextResponse.json({ success: true, platform });
  } catch (error) {
    console.error('Error saving social config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}

function checkEnvPlatform(platform: string): boolean {
  switch (platform) {
    case 'facebook':
      return !!(process.env.FACEBOOK_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID);
    case 'instagram':
      return !!(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID);
    case 'linkedin':
      return !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_ID);
    default:
      return false;
  }
}
