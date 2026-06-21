/**
 * GET /api/reports/tbr
 *
 * Presentation-style Technology Business Review / Monthly Customer Summary for
 * a single company, rendered in the 2026 TBR deck design. Reuses the platform's
 * existing integration clients via the reusable generator in
 * src/lib/reporting/tbr/. Read-only.
 *
 * This is the polished, customer-facing renderer. For the raw multi-year data
 * export (JSON), use /api/reports/tbr-export.
 *
 * Auth: logged-in staff session OR MIGRATION_SECRET (Bearer header / ?secret=).
 *
 * Query params:
 *   company    - Company name (partial, case-insensitive). Required unless companyId.
 *   companyId  - Exact Autotask company ID (skips the name search).
 *   type       - "tbr" (default) or "monthly_summary".
 *   years      - Lookback window in years (default 3 for tbr, 1 for monthly; clamped 1–10).
 *   datto      - "false" to skip Datto RMM collection. Default on.
 *   format     - "html" (default) or "json".
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkSecretAuth } from '@/lib/api-auth';
import { AutotaskClient, type AutotaskCompany } from '@/lib/autotask';
import { generateTbrReport, renderTbrReport } from '@/lib/reporting/tbr';
import type { TbrReportType } from '@/lib/reporting/tbr';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lowercase + strip non-alphanumerics for punctuation-insensitive matching. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  // Staff session OR MIGRATION_SECRET (shareable internal links never need a secret).
  const session = await auth();
  if (!session?.user?.email) {
    const denied = checkSecretAuth(request);
    if (denied) return denied;
  }

  const sp = request.nextUrl.searchParams;
  const companyQuery = sp.get('company');
  const companyIdParam = sp.get('companyId');
  const reportType: TbrReportType = sp.get('type') === 'monthly_summary' ? 'monthly_summary' : 'tbr';
  const yearsParam = sp.get('years');
  const years = yearsParam ? Math.min(10, Math.max(1, parseInt(yearsParam, 10) || 3)) : undefined;
  const includeDatto = sp.get('datto') !== 'false';
  const format = sp.get('format') || 'html';

  if (!companyQuery && !companyIdParam) {
    return NextResponse.json(
      { error: 'Provide ?company=<name> (partial match) or ?companyId=<autotaskId>' },
      { status: 400 },
    );
  }

  let client: AutotaskClient;
  try {
    client = new AutotaskClient();
  } catch (err) {
    return NextResponse.json(
      { error: `Autotask client not configured: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  try {
    // Resolve the company live from Autotask (same pattern as /tbr-export).
    let company: AutotaskCompany | null = null;
    if (companyIdParam) {
      company = await client.getCompany(parseInt(companyIdParam, 10));
    } else if (companyQuery) {
      let matches = await client.searchCompanies(companyQuery);
      if (matches.length === 0) {
        const nq = normalizeName(companyQuery);
        if (nq.length >= 2) {
          const all = await client.getActiveCompanies();
          matches = all.filter((c) => {
            const nc = normalizeName(c.companyName);
            return nc.includes(nq) || nq.includes(nc);
          });
        }
      }
      if (matches.length === 0) {
        return NextResponse.json(
          { error: `No active Autotask company matches "${companyQuery}".` },
          { status: 404 },
        );
      }
      const exact = matches.find((m) => normalizeName(m.companyName) === normalizeName(companyQuery));
      if (!exact && matches.length > 1) {
        return NextResponse.json({
          ambiguous: true,
          message: `"${companyQuery}" matched ${matches.length} companies. Re-run with the exact name or ?companyId=<id>.`,
          matches: matches.map((m) => ({ id: m.id, name: m.companyName })),
        });
      }
      company = exact || matches[0];
    }
    if (!company) {
      return NextResponse.json({ error: 'Company could not be resolved.' }, { status: 404 });
    }

    const report = await generateTbrReport({
      company: {
        autotaskId: company.id,
        name: company.companyName,
        classification: company.classificationName ?? null,
      },
      reportType,
      years,
      includeDatto,
    });

    if (format === 'json') {
      // Omit per-section HTML in JSON mode — return meta + coverage roll-up.
      return NextResponse.json({ meta: report.meta, coverage: report.coverage });
    }
    return new NextResponse(renderTbrReport(report), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('[reports/tbr] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
