/**
 * Business Review / QBR system — main orchestrator.
 */

import { prisma } from '@/lib/prisma';
import { buildReportData } from './data-builder';
import { generateRecommendations } from './recommendations';
import { generateNarrative } from './narrative';
import { generatePrintableHTML } from './pdf-export';
import {
  ReviewGenerationParams,
  BusinessReviewPayload,
  ReviewStatus,
  ReportVariant,
} from './types';

export { generatePrintableHTML } from './pdf-export';
export * from './types';

// ============================================
// GENERATE REPORT
// ============================================

/**
 * Generate a complete business review report.
 * Collects data, builds recommendations, generates narrative, saves to DB.
 */
export async function generateBusinessReview(params: ReviewGenerationParams) {
  const { companyId, reportType, variant, periodStart, periodEnd, createdBy } = params;

  // 1. Build report data from materialized tables
  const data = await buildReportData(companyId, reportType, periodStart, periodEnd);

  // SLA exclusion rule: completely hide SLA from customer-facing reports when below 95%.
  // All downstream consumers (narrative, recommendations, PDF) handle null SLA gracefully.
  if (variant === 'customer') {
    const respSla = data.servicePerformance.slaResponseCompliance;
    const resSla = data.servicePerformance.slaResolutionCompliance;
    const bestSla = Math.max(respSla ?? 0, resSla ?? 0);
    if (bestSla > 0 && bestSla < 95) {
      data.servicePerformance.slaResponseCompliance = null;
      data.servicePerformance.slaResolutionCompliance = null;
    }
  }

  // 2. Generate recommendations
  const recommendations = generateRecommendations(data, variant);

  // 3. Generate narrative
  const narrative = generateNarrative(data, recommendations, variant);

  // 4. Build payload
  const payload: BusinessReviewPayload = {
    data,
    recommendations,
    narrative,
    generatedAt: new Date().toISOString(),
    version: 1,
  };

  // 5. Save to DB (upsert by company + type + variant + period)
  const review = await prisma.businessReview.upsert({
    where: {
      companyId_reportType_variant_periodStart: {
        companyId,
        reportType,
        variant,
        periodStart,
      },
    },
    create: {
      companyId,
      reportType,
      variant,
      periodStart,
      periodEnd,
      status: 'draft',
      reportData: JSON.parse(JSON.stringify(payload.data)),
      recommendations: JSON.parse(JSON.stringify(payload.recommendations)),
      narrative: JSON.parse(JSON.stringify(payload.narrative)),
      createdBy,
      sentTo: [],
    },
    update: {
      periodEnd,
      reportData: JSON.parse(JSON.stringify(payload.data)),
      recommendations: JSON.parse(JSON.stringify(payload.recommendations)),
      narrative: JSON.parse(JSON.stringify(payload.narrative)),
      status: 'draft',
    },
  });

  return { id: review.id, payload };
}

// ============================================
// REPORT MANAGEMENT
// ============================================

export async function listBusinessReviews(filters?: {
  companyId?: string;
  reportType?: string;
  status?: string;
  limit?: number;
}) {
  return prisma.businessReview.findMany({
    where: {
      ...(filters?.companyId ? { companyId: filters.companyId } : {}),
      ...(filters?.reportType ? { reportType: filters.reportType } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 50,
    include: {
      company: { select: { displayName: true } },
    },
  });
}

export async function getBusinessReview(id: string) {
  return prisma.businessReview.findUnique({
    where: { id },
    include: {
      company: { select: { displayName: true } },
    },
  });
}

export async function updateReviewStatus(
  id: string,
  status: ReviewStatus,
  reviewedBy?: string,
) {
  const updates: Record<string, unknown> = { status };
  if (status === 'review' || status === 'ready') {
    updates.reviewedBy = reviewedBy || null;
    updates.reviewedAt = new Date();
  }
  if (status === 'sent') {
    updates.sentAt = new Date();
  }

  return prisma.businessReview.update({
    where: { id },
    data: updates,
  });
}

export async function deleteBusinessReview(id: string) {
  return prisma.businessReview.delete({ where: { id } });
}

// ============================================
// PDF GENERATION
// ============================================

export async function getReviewPrintableHTML(id: string) {
  const review = await prisma.businessReview.findUnique({ where: { id } });
  if (!review) throw new Error('Review not found');

  const data = review.reportData as unknown as BusinessReviewPayload['data'];
  const recommendations = (review.recommendations || []) as unknown as BusinessReviewPayload['recommendations'];
  const narrative = (review.narrative || {}) as unknown as BusinessReviewPayload['narrative'];
  const variant = review.variant as ReportVariant;

  // SLA exclusion rule for customer variant PDF
  if (variant === 'customer') {
    const respSla = data.servicePerformance.slaResponseCompliance;
    const resSla = data.servicePerformance.slaResolutionCompliance;
    const bestSla = Math.max(respSla ?? 0, resSla ?? 0);
    if (bestSla > 0 && bestSla < 95) {
      data.servicePerformance.slaResponseCompliance = null;
      data.servicePerformance.slaResolutionCompliance = null;
    }
  }

  return generatePrintableHTML(data, recommendations, narrative, variant);
}

// ============================================
// EMAIL DELIVERY
// ============================================

export async function sendBusinessReviewEmail(id: string, recipients: string[]) {
  const review = await prisma.businessReview.findUnique({
    where: { id },
    include: { company: { select: { displayName: true } } },
  });

  if (!review) throw new Error('Review not found');
  if (review.status !== 'ready') throw new Error('Review must be in "ready" status before sending');

  const data = review.reportData as unknown as BusinessReviewPayload['data'];
  const narrative = (review.narrative || {}) as unknown as BusinessReviewPayload['narrative'];

  // Build email with executive summary
  const subject = `${review.company.displayName} — ${review.reportType === 'monthly' ? 'Monthly' : 'Quarterly'} Business Review`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #f8fafc;">
<div style="max-width: 600px; margin: 0 auto; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="background: linear-gradient(135deg, #0f172a, #0e7490); color: #ffffff; padding: 32px; border-radius: 12px 12px 0 0;">
    <div style="font-size: 12px; color: #06b6d4; font-weight: 600; letter-spacing: 1px;">TRIPLE CITIES TECH</div>
    <h1 style="font-size: 22px; margin: 8px 0 4px;">${review.reportType === 'monthly' ? 'Monthly Business Review' : 'Quarterly Business Review'}</h1>
    <div style="font-size: 14px; color: #94a3b8;">${data.period.label} &mdash; ${review.company.displayName}</div>
  </div>
  <div style="background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <h2 style="font-size: 16px; color: #0e7490; margin-bottom: 12px;">Executive Summary</h2>
    <p style="font-size: 14px; color: #334155; line-height: 1.8;">${narrative.executiveSummary}</p>

    <div style="margin: 24px 0; display: flex; gap: 16px;">
      <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">Tickets</div>
        <div style="font-size: 24px; font-weight: 800; color: #0f172a;">${data.supportActivity.ticketsCreated}</div>
      </div>
      <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">Hours</div>
        <div style="font-size: 24px; font-weight: 800; color: #0f172a;">${data.supportActivity.supportHoursConsumed}</div>
      </div>
      <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">Health</div>
        <div style="font-size: 24px; font-weight: 800; color: #0f172a;">${data.healthSnapshot ? Math.round(data.healthSnapshot.overallScore) : 'N/A'}</div>
      </div>
    </div>

    <p style="font-size: 13px; color: #64748b; margin-top: 24px;">The full report is available in the Triple Cities Tech admin portal.</p>
  </div>
  <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 11px;">
    Triple Cities Tech &mdash; Managed IT Services
  </div>
</div>
</body></html>`;

  // Send via Resend
  const { Resend } = await import('resend');
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) throw new Error('RESEND_API_KEY not configured');

  const resend = new Resend(resendApiKey);
  const fromEmail = process.env.REPORT_FROM_EMAIL || 'reports@triplecitiestech.com';

  await resend.emails.send({
    from: fromEmail,
    to: recipients,
    subject,
    html,
  });

  // Update status
  await prisma.businessReview.update({
    where: { id },
    data: {
      status: 'sent',
      sentAt: new Date(),
      sentTo: recipients,
    },
  });

  return { sent: true, recipients };
}
