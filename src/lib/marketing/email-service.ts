/**
 * Campaign Email Notification Service
 *
 * Sends email notifications to campaign recipients with a link to the published post.
 * Uses Resend for delivery. Tracks per-recipient delivery status.
 * Supports visibility-aware templates (PUBLIC, CUSTOMER, INTERNAL).
 */

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'Triple Cities Tech <notifications@triplecitiestech.com>';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';

export interface CampaignEmailParams {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  previewText: string;
  postTitle: string;
  postExcerpt: string;
  postUrl: string;
  contentType: string;
  visibility?: string; // PUBLIC | CUSTOMER | INTERNAL
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a single notification email to a recipient
 */
export async function sendCampaignEmail(params: CampaignEmailParams): Promise<SendResult> {
  if (!resend) {
    return { success: false, error: 'Resend API key not configured' };
  }

  const html = generateNotificationEmailHtml(params);
  const text = generateNotificationEmailText(params);

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [params.recipientEmail],
      subject: params.subject,
      html,
      text,
      headers: {
        'X-Entity-Ref-ID': `campaign-${Date.now()}`,
      },
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Send a test email to a single address (for preview/testing)
 */
export async function sendTestCampaignEmail(
  testEmail: string,
  params: Omit<CampaignEmailParams, 'recipientEmail' | 'recipientName'>
): Promise<SendResult> {
  return sendCampaignEmail({
    ...params,
    recipientEmail: testEmail,
    recipientName: 'Test Recipient',
  });
}

// ============================================
// VISIBILITY-AWARE HELPERS
// ============================================

function getCtaDetails(visibility: string | undefined, postUrl: string): { label: string; url: string; instructions: string } {
  switch (visibility) {
    case 'INTERNAL':
      return {
        label: 'Sign In to Read',
        url: `${BASE_URL}/admin`,
        instructions: `<p style="font-size: 14px; color: #64748b; margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #7c3aed;">
          <strong style="color: #475569;">How to access:</strong> Visit <a href="${BASE_URL}/admin" style="color: #7c3aed;">${BASE_URL}/admin</a> and sign in with your Triple Cities Tech Microsoft 365 account. This content is for internal team members only.
        </p>`,
      };
    case 'CUSTOMER':
      return {
        label: 'View in Your Portal',
        url: postUrl,
        instructions: `<p style="font-size: 14px; color: #64748b; margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #0891b2;">
          <strong style="color: #475569;">How to access:</strong> Log in to your customer portal at <a href="${BASE_URL}" style="color: #0891b2;">${BASE_URL}</a> to view this and other updates specific to your account. If you need login assistance, contact our support team.
        </p>`,
      };
    default: // PUBLIC
      return {
        label: 'Read Full Article',
        url: postUrl,
        instructions: '',
      };
  }
}

function getVisibilityBadge(visibility: string | undefined): string {
  switch (visibility) {
    case 'INTERNAL':
      return '<span style="display: inline-block; background: #7c3aed; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px;">Internal</span>';
    case 'CUSTOMER':
      return '<span style="display: inline-block; background: #0891b2; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px;">Customer Portal</span>';
    default:
      return '';
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

function generateNotificationEmailHtml(params: CampaignEmailParams): string {
  const { recipientName, postTitle, postExcerpt, contentType, visibility } = params;

  const contentTypeLabel = getContentTypeLabel(contentType);
  const accentColor = getContentTypeColor(contentType);
  const cta = getCtaDetails(visibility, params.postUrl);
  const visBadge = getVisibilityBadge(visibility);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${postTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; padding: 32px; text-align: center; }
    .header img { height: 48px; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .badge { display: inline-block; background: ${accentColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
    .content { padding: 32px; }
    .greeting { font-size: 16px; color: #475569; margin-bottom: 20px; }
    .post-title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; line-height: 1.3; }
    .post-excerpt { font-size: 15px; color: #64748b; line-height: 1.7; margin-bottom: 24px; }
    .cta-button { display: inline-block; background: ${accentColor}; color: white !important; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .cta-button:hover { opacity: 0.9; }
    .footer { padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 13px; color: #94a3b8; }
    .footer a { color: #64748b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Triple Cities Tech</h1>
    </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 24px;">
        <span class="badge">${contentTypeLabel}</span>${visBadge}
      </div>
      <p class="greeting">Hi ${recipientName},</p>
      <h2 class="post-title">${postTitle}</h2>
      <p class="post-excerpt">${postExcerpt}</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${cta.url}" class="cta-button">${cta.label}</a>
      </div>
      ${cta.instructions}
    </div>
    <div class="footer">
      <p>Triple Cities Tech &bull; Managed IT Services</p>
      <p><a href="${BASE_URL}">triplecitiestech.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

function generateNotificationEmailText(params: CampaignEmailParams): string {
  const cta = getCtaDetails(params.visibility, params.postUrl);

  let instructions = '';
  if (params.visibility === 'INTERNAL') {
    instructions = `\nHow to access: Visit ${BASE_URL}/admin and sign in with your Triple Cities Tech Microsoft 365 account. This content is for internal team members only.\n`;
  } else if (params.visibility === 'CUSTOMER') {
    instructions = `\nHow to access: Log in to your customer portal at ${BASE_URL} to view this and other updates. Contact our support team if you need login assistance.\n`;
  }

  return `Hi ${params.recipientName},

${getContentTypeLabel(params.contentType)}

${params.postTitle}

${params.postExcerpt}

${cta.label}: ${cta.url}
${instructions}
---
Triple Cities Tech | Managed IT Services
${BASE_URL}`;
}

function getContentTypeLabel(contentType: string): string {
  const labels: Record<string, string> = {
    CYBERSECURITY_ALERT: 'Cybersecurity Alert',
    SERVICE_UPDATE: 'Service Update',
    MAINTENANCE_NOTICE: 'Maintenance Notice',
    VENDOR_NOTICE: 'Vendor Notice',
    BEST_PRACTICE: 'Best Practice',
    COMPANY_ANNOUNCEMENT: 'Company Announcement',
    GENERAL_COMMUNICATION: 'Update',
  };
  return labels[contentType] || 'Update';
}

function getContentTypeColor(contentType: string): string {
  const colors: Record<string, string> = {
    CYBERSECURITY_ALERT: '#dc2626',
    SERVICE_UPDATE: '#0891b2',
    MAINTENANCE_NOTICE: '#7c3aed',
    VENDOR_NOTICE: '#ea580c',
    BEST_PRACTICE: '#059669',
    COMPANY_ANNOUNCEMENT: '#2563eb',
    GENERAL_COMMUNICATION: '#0891b2',
  };
  return colors[contentType] || '#0891b2';
}
