import type { BlogPostDraft } from '../blog-generator';

export interface BlogApprovalEmailProps {
  blogPost: BlogPostDraft;
  approvalToken: string;
  previewUrl: string;
  approveUrl: string;
  rejectUrl: string;
  editUrl: string;
}

/**
 * Generate HTML email for blog post approval
 * Designed for compatibility with Outlook, Gmail, and mobile clients.
 * Uses table-based layout for maximum email client support.
 */
export function generateBlogApprovalEmail(props: BlogApprovalEmailProps): string {
  const { blogPost, approvalToken, previewUrl, approveUrl, rejectUrl, editUrl } = props;

  const contentPreview = convertMarkdownToHtml(blogPost.content.substring(0, 800));
  const truncated = blogPost.content.length > 800;

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Blog Post Approval: ${escapeHtml(blogPost.title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    table { border-spacing: 0; border-collapse: collapse; }
    td { padding: 0; }
    img { border: 0; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
      .btn-stack { display: block !important; width: 100% !important; margin-bottom: 8px !important; }
      .social-grid { display: block !important; }
      .social-grid td { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a;">
  <!-- Preheader text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    New blog post "${escapeHtml(blogPost.title)}" is ready for your review and approval.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700;">New Blog Post Ready for Review</h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.85);">AI-generated draft awaiting your approval</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="mobile-padding" style="background-color: #1e293b; padding: 28px 24px;">

              <!-- Action Required Banner -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="background-color: #1e3a5f; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 0 6px 6px 0;">
                    <p style="margin: 0; font-size: 14px; color: #93c5fd; font-weight: 600;">Action Required</p>
                    <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Review this blog post and approve it for publication or provide feedback.</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Buttons -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="btn-stack" style="padding-right: 8px;">
                          <a href="${approveUrl}" style="display: inline-block; padding: 12px 28px; background-color: #22c55e; color: #ffffff; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; text-align: center;">Approve &amp; Schedule</a>
                        </td>
                        <td class="btn-stack" style="padding-right: 8px;">
                          <a href="${rejectUrl}" style="display: inline-block; padding: 12px 28px; background-color: #ef4444; color: #ffffff; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; text-align: center;">Request Changes</a>
                        </td>
                        <td class="btn-stack">
                          <a href="${previewUrl}" style="display: inline-block; padding: 12px 28px; background-color: #3b82f6; color: #ffffff; font-size: 14px; font-weight: 700; border-radius: 8px; text-decoration: none; text-align: center;">Full Preview</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Blog Post Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <!-- Title -->
                    <h2 style="margin: 0 0 12px; font-size: 20px; color: #e2e8f0; line-height: 1.3;">${escapeHtml(blogPost.title)}</h2>

                    <!-- Meta row -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                      <tr>
                        <td>
                          <span style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">${escapeHtml(blogPost.category)}</span>
                          <span style="color: #64748b; font-size: 12px; margin-left: 12px;">${escapeHtml(blogPost.readingTime)}</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Excerpt -->
                    <p style="margin: 0 0 16px; font-size: 14px; color: #94a3b8; font-style: italic; border-left: 3px solid #3b82f6; padding-left: 12px;">${escapeHtml(blogPost.excerpt)}</p>

                    <!-- Content Preview -->
                    <div style="font-size: 14px; color: #cbd5e1; line-height: 1.7;">
                      ${contentPreview}
                      ${truncated ? `<p style="color: #60a5fa; font-size: 13px;"><a href="${previewUrl}" style="color: #60a5fa;">Read full post &rarr;</a></p>` : ''}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Keywords -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 16px; background-color: #0f172a; border: 1px solid #334155; border-radius: 8px;">
                    <p style="margin: 0 0 8px; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">SEO Keywords</p>
                    <td style="padding: 0;">
                      ${blogPost.keywords.map(k => `<span style="display: inline-block; background-color: #1e3a5f; color: #93c5fd; padding: 3px 10px; border-radius: 12px; font-size: 11px; margin: 2px 4px 2px 0;">${escapeHtml(k)}</span>`).join('')}
                    </td>
                  </td>
                </tr>
              </table>

              <!-- Social Media Previews -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding-bottom: 12px;">
                    <h3 style="margin: 0; font-size: 14px; color: #e2e8f0; font-weight: 600;">Social Media Previews</h3>
                  </td>
                </tr>

                <!-- Facebook -->
                <tr>
                  <td style="padding-bottom: 10px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px 16px;">
                          <span style="display: inline-block; background-color: #1877f2; color: #ffffff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-bottom: 6px;">FACEBOOK</span>
                          <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8; white-space: pre-wrap;">${escapeHtml(blogPost.socialMedia.facebook.description).substring(0, 200)}</p>
                          <p style="margin: 4px 0 0; font-size: 11px; color: #3b82f6;">${blogPost.socialMedia.facebook.hashtags.join(' ')}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Instagram -->
                <tr>
                  <td style="padding-bottom: 10px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px 16px;">
                          <span style="display: inline-block; background-color: #e4405f; color: #ffffff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-bottom: 6px;">INSTAGRAM</span>
                          <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8; white-space: pre-wrap;">${escapeHtml(blogPost.socialMedia.instagram.caption).substring(0, 200)}</p>
                          <p style="margin: 4px 0 0; font-size: 11px; color: #3b82f6;">${blogPost.socialMedia.instagram.hashtags.join(' ')}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- LinkedIn -->
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 6px;">
                      <tr>
                        <td style="padding: 12px 16px;">
                          <span style="display: inline-block; background-color: #0077b5; color: #ffffff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; margin-bottom: 6px;">LINKEDIN</span>
                          <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8; white-space: pre-wrap;">${escapeHtml(blogPost.socialMedia.linkedin.content).substring(0, 200)}</p>
                          <p style="margin: 4px 0 0; font-size: 11px; color: #3b82f6;">${blogPost.socialMedia.linkedin.hashtags.join(' ')}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SEO Metadata -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 16px; background-color: #0f172a; border: 1px solid #334155; border-radius: 8px;">
                    <h3 style="margin: 0 0 10px; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">SEO Metadata</h3>
                    <p style="margin: 0 0 6px; font-size: 13px; color: #cbd5e1;"><strong style="color: #94a3b8;">Title:</strong> ${escapeHtml(blogPost.metaTitle)}</p>
                    <p style="margin: 0; font-size: 13px; color: #cbd5e1;"><strong style="color: #94a3b8;">Description:</strong> ${escapeHtml(blogPost.metaDescription)}</p>
                  </td>
                </tr>
              </table>

              <!-- Sources -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 16px; background-color: #0f172a; border: 1px solid #334155; border-radius: 8px;">
                    <p style="margin: 0 0 8px; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Sources</p>
                    ${blogPost.sourceUrls.map(url => `<p style="margin: 4px 0; font-size: 12px;"><a href="${url}" style="color: #60a5fa; word-break: break-all;">${url}</a></p>`).join('')}
                  </td>
                </tr>
              </table>

              <!-- Edit in Admin -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                <tr>
                  <td align="center">
                    <a href="${editUrl}" style="display: inline-block; padding: 10px 24px; background-color: #334155; color: #e2e8f0; font-size: 13px; font-weight: 600; border-radius: 6px; text-decoration: none;">Edit in Admin Panel</a>
                  </td>
                </tr>
              </table>

              <!-- Token debug info -->
              <p style="margin: 16px 0 0; font-size: 11px; color: #475569; text-align: center;">
                Token: ${approvalToken.substring(0, 16)}... &middot; Model: ${escapeHtml(blogPost.aiModel)}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 20px 24px; border-top: 1px solid #1e293b; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #475569; font-weight: 600;">Triple Cities Tech &middot; Automated Blog System</p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #334155;">Approval links expire after use.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters to prevent XSS in email templates
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Simple markdown to HTML conversion for email content
 */
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 style="margin: 16px 0 8px; font-size: 15px; color: #e2e8f0;">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="margin: 20px 0 10px; font-size: 17px; color: #e2e8f0;">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 style="margin: 20px 0 10px; font-size: 19px; color: #e2e8f0;">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #e2e8f0;">$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong style="color: #e2e8f0;">$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #60a5fa;">$1</a>');

  // Lists
  html = html.replace(/^\* (.*$)/gim, '<li style="margin: 4px 0; color: #cbd5e1;">$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li style="margin: 4px 0; color: #cbd5e1;">$1</li>');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p style="margin: 10px 0; color: #cbd5e1;">');
  html = '<p style="margin: 10px 0; color: #cbd5e1;">' + html + '</p>';

  return html;
}

/**
 * Generate plain text version of approval email
 */
export function generateBlogApprovalEmailText(props: BlogApprovalEmailProps): string {
  const { blogPost, approvalToken, previewUrl, approveUrl, rejectUrl, editUrl } = props;

  return `
NEW BLOG POST READY FOR REVIEW
==============================

Title: ${blogPost.title}
Category: ${blogPost.category}
Reading Time: ${blogPost.readingTime}

EXCERPT:
${blogPost.excerpt}

ACTION REQUIRED:
Please review this blog post and take one of the following actions:

1. APPROVE & SCHEDULE
   ${approveUrl}

2. REQUEST CHANGES
   ${rejectUrl}

3. EDIT IN ADMIN PANEL
   ${editUrl}

4. VIEW FULL PREVIEW
   ${previewUrl}

---

BLOG CONTENT PREVIEW:
${blogPost.content.substring(0, 500)}...

(Full content available at preview URL)

---

SOCIAL MEDIA PREVIEWS:

FACEBOOK:
${blogPost.socialMedia.facebook.title}
${blogPost.socialMedia.facebook.description}
${blogPost.socialMedia.facebook.hashtags.join(' ')}

INSTAGRAM:
${blogPost.socialMedia.instagram.caption.substring(0, 300)}...
${blogPost.socialMedia.instagram.hashtags.join(' ')}

LINKEDIN:
${blogPost.socialMedia.linkedin.title}
${blogPost.socialMedia.linkedin.content}
${blogPost.socialMedia.linkedin.hashtags.join(' ')}

---

SEO METADATA:
Meta Title: ${blogPost.metaTitle}
Meta Description: ${blogPost.metaDescription}
Keywords: ${blogPost.keywords.join(', ')}

---

SOURCES:
${blogPost.sourceUrls.map((url, idx) => `${idx + 1}. ${url}`).join('\n')}

---

Approval Token: ${approvalToken}
Generated by: ${blogPost.aiModel}

---
Triple Cities Tech | Automated Blog System
Approval links expire after use.
  `.trim();
}
