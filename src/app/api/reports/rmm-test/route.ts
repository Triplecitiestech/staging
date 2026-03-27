/**
 * GET /api/reports/rmm-test?secret=MIGRATION_SECRET
 * Diagnostic endpoint: tests Datto RMM API connectivity step by step.
 * Returns detailed results for each API call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DattoRmmClient } from '@/lib/datto-rmm';
import { matchesCompanyName } from '@/utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};
  const client = new DattoRmmClient();

  results.configured = client.isConfigured();
  results.apiUrl = process.env.DATTO_RMM_API_URL || '(not set, using default concord-api)';
  results.apiKeySet = !!process.env.DATTO_RMM_API_KEY;
  results.apiSecretSet = !!process.env.DATTO_RMM_API_SECRET;

  if (!client.isConfigured()) {
    return NextResponse.json({ ...results, error: 'Datto RMM not configured — missing API key or secret' });
  }

  // Test 1: Auth
  try {
    const tokenUrl = `${process.env.DATTO_RMM_API_URL || 'https://concord-api.centrastage.net'}/auth/oauth/token`;
    const publicAuth = Buffer.from('public-client:public').toString('base64');
    const authRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${publicAuth}`,
      },
      body: `grant_type=password&username=${encodeURIComponent(process.env.DATTO_RMM_API_KEY || '')}&password=${encodeURIComponent(process.env.DATTO_RMM_API_SECRET || '')}`,
      signal: AbortSignal.timeout(10_000),
    });
    const authText = await authRes.text();
    results.auth = {
      status: authRes.status,
      ok: authRes.ok,
      bodyPreview: authText.slice(0, 500),
      isHtml: authText.trimStart().startsWith('<'),
    };
  } catch (err) {
    results.auth = { error: err instanceof Error ? err.message : String(err) };
  }

  // Test 2: Sites — list all names + test company matching
  const search = request.nextUrl.searchParams.get('company');
  try {
    const sites = await client.getSites();
    const allSiteNames = sites.map(s => s.name).sort();
    results.sites = { count: sites.length, allNames: allSiteNames };
    if (search) {
      const matched = sites.filter(s => matchesCompanyName(search, s.name));
      results.companyMatch = {
        searchTerm: search,
        matchedSites: matched.map(s => ({ id: s.id, uid: s.uid, name: s.name, devices: s.devicesCount })),
        matchCount: matched.length,
      };
      // Test per-site device fetch using UID
      if (matched.length > 0) {
        try {
          const siteDevices = await client.getSiteDevices(matched[0].uid);
          results.siteDeviceTest = { siteUid: matched[0].uid, siteName: matched[0].name, deviceCount: siteDevices.length, first3: siteDevices.slice(0, 3).map(d => ({ hostname: d.hostname, deviceType: d.deviceType })) };
        } catch (err) {
          results.siteDeviceTest = { error: err instanceof Error ? err.message : String(err), siteUid: matched[0].uid };
        }
      }
    }
  } catch (err) {
    results.sites = { error: err instanceof Error ? err.message : String(err) };
  }

  // Test 3: Devices (1 page only)
  try {
    const devices = await client.getDevices(1);
    results.devices = { count: devices.length, first3: devices.slice(0, 3).map(d => ({ id: d.id, hostname: d.hostname, siteName: d.siteName, deviceType: d.deviceType })) };
  } catch (err) {
    results.devices = { error: err instanceof Error ? err.message : String(err) };
  }

  // Test 4: Open alerts (1 page)
  try {
    const alerts = await client.getOpenAlerts(1);
    results.openAlerts = { count: alerts.length };
  } catch (err) {
    results.openAlerts = { error: err instanceof Error ? err.message : String(err) };
  }

  // Test 5: Raw device response (to see all available fields including patch data)
  if (search) {
    const matched = (results.companyMatch as { matchedSites: Array<{ uid: string }> } | undefined)?.matchedSites;
    if (matched && matched.length > 0) {
      try {
        const rawData = await client.getRawSiteDevices(matched[0].uid) as { devices?: Array<Record<string, unknown>> };
        const firstDevice = rawData?.devices?.[0];
        results.rawDeviceFields = firstDevice ? Object.keys(firstDevice) : [];
        results.rawDeviceSample = firstDevice || null;

        // Test 6: Try patch endpoint for first device
        const deviceUid = firstDevice?.uid as string | undefined;
        if (deviceUid) {
          try {
            const patchData = await client.getDevicePatch(deviceUid);
            results.patchEndpoint = patchData;
          } catch (err) {
            results.patchEndpoint = { error: err instanceof Error ? err.message : String(err) };
          }
        }
      } catch (err) {
        results.rawDeviceFields = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  return NextResponse.json(results);
}
