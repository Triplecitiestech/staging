/**
 * Annual Service Report — main orchestrator.
 * Extends the existing reporting architecture for comprehensive annual reviews.
 */

import { prisma } from '@/lib/prisma';
import { buildAnnualReportData } from './data-builder';
import { generateAnnualReportHTML } from './pdf-export';
import { AnnualReportParams, AnnualReportData, AnnualReportVariant } from './types';

export { generateAnnualReportHTML } from './pdf-export';
export * from './types';

// ============================================
// GENERATE REPORT
// ============================================

export async function generateAnnualReport(params: AnnualReportParams) {
  const { companyId, variant, periodStart, periodEnd, createdBy } = params;

  // Build report data from all available sources
  const data = await buildAnnualReportData(companyId, periodStart, periodEnd);

  // SLA exclusion rule for customer variant: hide SLA if below 95%
  if (variant === 'customer') {
    const respSla = data.ticketing.responseMetrics.slaResponseCompliance;
    const resSla = data.ticketing.responseMetrics.slaResolutionCompliance;
    const bestSla = Math.max(respSla ?? 0, resSla ?? 0);
    if (bestSla > 0 && bestSla < 95) {
      data.ticketing.responseMetrics.slaResponseCompliance = null;
      data.ticketing.responseMetrics.slaResolutionCompliance = null;
    }
  }

  // Save to DB using BusinessReview model with reportType='annual'
  const review = await prisma.businessReview.upsert({
    where: {
      companyId_reportType_variant_periodStart: {
        companyId,
        reportType: 'annual',
        variant,
        periodStart,
      },
    },
    create: {
      companyId,
      reportType: 'annual',
      variant,
      periodStart,
      periodEnd,
      status: 'draft',
      reportData: JSON.parse(JSON.stringify(data)),
      recommendations: [],
      narrative: JSON.parse(JSON.stringify({
        executiveSummary: buildNarrativeSummary(data),
        supportActivityNarrative: '',
        performanceNarrative: '',
        themesNarrative: '',
        healthNarrative: '',
        recommendationsNarrative: '',
      })),
      createdBy,
      sentTo: [],
    },
    update: {
      periodEnd,
      reportData: JSON.parse(JSON.stringify(data)),
      status: 'draft',
    },
  });

  return { id: review.id, data };
}

// ============================================
// REPORT RETRIEVAL
// ============================================

export async function getAnnualReport(id: string) {
  return prisma.businessReview.findUnique({
    where: { id },
    include: {
      company: { select: { displayName: true } },
    },
  });
}

export async function listAnnualReports(filters?: {
  companyId?: string;
  status?: string;
  limit?: number;
}) {
  return prisma.businessReview.findMany({
    where: {
      reportType: 'annual',
      ...(filters?.companyId ? { companyId: filters.companyId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 50,
    include: {
      company: { select: { displayName: true } },
    },
  });
}

// ============================================
// PDF GENERATION
// ============================================

export async function getAnnualReportPrintableHTML(id: string) {
  const review = await prisma.businessReview.findUnique({ where: { id } });
  if (!review) throw new Error('Annual report not found');

  const data = review.reportData as unknown as AnnualReportData;
  const variant = review.variant as AnnualReportVariant;

  // SLA exclusion for customer variant PDF
  if (variant === 'customer') {
    const respSla = data.ticketing.responseMetrics.slaResponseCompliance;
    const resSla = data.ticketing.responseMetrics.slaResolutionCompliance;
    const bestSla = Math.max(respSla ?? 0, resSla ?? 0);
    if (bestSla > 0 && bestSla < 95) {
      data.ticketing.responseMetrics.slaResponseCompliance = null;
      data.ticketing.responseMetrics.slaResolutionCompliance = null;
    }
  }

  return generateAnnualReportHTML(data, variant);
}

// ============================================
// NARRATIVE BUILDER
// ============================================

function buildNarrativeSummary(data: AnnualReportData): string {
  const parts: string[] = [];

  parts.push(
    `During the reporting period (${data.period.start} to ${data.period.end}), ` +
    `Triple Cities Tech managed ${data.ticketing.totalTickets} support tickets for ${data.company.name}.`
  );

  if (data.ticketing.responseMetrics.avgFirstResponseMinutes !== null) {
    const frt = data.ticketing.responseMetrics.avgFirstResponseMinutes;
    if (frt < 60) {
      parts.push(`The average first response time was ${Math.round(frt)} minutes.`);
    } else {
      parts.push(`The average first response time was ${(frt / 60).toFixed(1)} hours.`);
    }
  }

  if (data.ticketing.responseMetrics.avgResolutionMinutes !== null) {
    const res = data.ticketing.responseMetrics.avgResolutionMinutes;
    if (res < 1440) {
      parts.push(`Average ticket resolution time was ${(res / 60).toFixed(1)} hours.`);
    } else {
      parts.push(`Average ticket resolution time was ${(res / 1440).toFixed(1)} days.`);
    }
  }

  if (data.dattoRmm.available && data.dattoRmm.totalAlerts > 0) {
    parts.push(
      `Endpoint monitoring via Datto RMM processed ${data.dattoRmm.totalAlerts} alerts ` +
      `across ${data.dattoRmm.devicesManaged} managed devices.`
    );
  }

  if (data.security.socIncidents.available && data.security.socIncidents.totalIncidents > 0) {
    parts.push(
      `The SOC Analyst Agent identified and processed ${data.security.socIncidents.totalIncidents} security incidents.`
    );
  }

  if (data.executiveSummary.dataCoverageNotes.length > 0) {
    parts.push(
      'Note: Some data sources are not yet connected. ' +
      'See the Data Source Coverage section for details on available and missing data.'
    );
  }

  return parts.join(' ');
}
