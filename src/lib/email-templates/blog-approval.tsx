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
 */
export function generateBlogApprovalEmail(props: BlogApprovalEmailProps): string {
  const { blogPost, approvalToken, previewUrl, approveUrl, rejectUrl, editUrl } = props;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog Post Approval: ${blogPost.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      padding: 30px;
    }
    .alert {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .alert-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .blog-preview {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .blog-preview h2 {
      margin-top: 0;
      color: #667eea;
    }
    .blog-content {
      line-height: 1.8;
      color: #495057;
    }
    .meta-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin: 20px 0;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .meta-item {
      font-size: 14px;
    }
    .meta-label {
      font-weight: bold;
      color: #6c757d;
      display: block;
      margin-bottom: 5px;
    }
    .social-previews {
      margin: 30px 0;
    }
    .social-preview {
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
      background: white;
    }
    .social-preview h3 {
      margin-top: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .platform-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .facebook { background: #1877f2; color: white; }
    .instagram { background: #e4405f; color: white; }
    .linkedin { background: #0077b5; color: white; }
    .social-content {
      padding: 15px;
      background: #f8f9fa;
      border-radius: 4px;
      margin-top: 10px;
      white-space: pre-wrap;
    }
    .hashtags {
      color: #667eea;
      margin-top: 10px;
      font-size: 14px;
    }
    .action-buttons {
      display: flex;
      gap: 15px;
      margin: 30px 0;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-block;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-approve {
      background: #28a745;
      color: white;
    }
    .btn-approve:hover {
      background: #218838;
    }
    .btn-reject {
      background: #dc3545;
      color: white;
    }
    .btn-reject:hover {
      background: #c82333;
    }
    .btn-edit {
      background: #6c757d;
      color: white;
    }
    .btn-edit:hover {
      background: #5a6268;
    }
    .btn-preview {
      background: #667eea;
      color: white;
    }
    .btn-preview:hover {
      background: #5568d3;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 14px;
      color: #6c757d;
      border-top: 1px solid #dee2e6;
    }
    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .keyword-tag {
      background: #e7f3ff;
      color: #0066cc;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
    }
    @media (max-width: 600px) {
      .container {
        margin: 0;
        border-radius: 0;
      }
      .action-buttons {
        flex-direction: column;
      }
      .btn {
        width: 100%;
      }
      .meta-info {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>🎉 New Blog Post Ready for Review</h1>
      <p style="margin: 10px 0 0; opacity: 0.9;">AI-generated draft awaiting your approval</p>
    </div>

    <!-- Main Content -->
    <div class="content">
      <!-- Alert -->
      <div class="alert">
        <div class="alert-title">⏰ Action Required</div>
        <div>Please review this blog post and either approve it for publication or provide feedback for revision.</div>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <a href="${approveUrl}" class="btn btn-approve">✅ Approve & Schedule</a>
        <a href="${rejectUrl}" class="btn btn-reject">❌ Request Changes</a>
        <a href="${editUrl}" class="btn btn-edit">✏️ Edit in Admin Panel</a>
        <a href="${previewUrl}" class="btn btn-preview">👁️ Full Preview</a>
      </div>

      <!-- Blog Post Preview -->
      <div class="blog-preview">
        <h2>${blogPost.title}</h2>

        <div class="meta-info">
          <div class="meta-item">
            <span class="meta-label">Category</span>
            ${blogPost.category}
          </div>
          <div class="meta-item">
            <span class="meta-label">Reading Time</span>
            ${blogPost.readingTime}
          </div>
          <div class="meta-item">
            <span class="meta-label">Excerpt</span>
            ${blogPost.excerpt}
          </div>
          <div class="meta-item">
            <span class="meta-label">SEO Keywords</span>
            <div class="keywords">
              ${blogPost.keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="blog-content">
          ${convertMarkdownToHtml(blogPost.content.substring(0, 1000))}
          ${blogPost.content.length > 1000 ? `<p><em>... (content truncated in email, <a href="${previewUrl}">view full post</a>)</em></p>` : ''}
        </div>
      </div>

      <!-- Social Media Previews -->
      <div class="social-previews">
        <h3 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px;">
          📱 Social Media Previews
        </h3>

        <!-- Facebook -->
        <div class="social-preview">
          <h3>
            <span class="platform-badge facebook">Facebook</span>
            ${blogPost.socialMedia.facebook.title}
          </h3>
          <div class="social-content">
${blogPost.socialMedia.facebook.description}

Read more: www.triplecitiestech.com/blog
          </div>
          <div class="hashtags">${blogPost.socialMedia.facebook.hashtags.join(' ')}</div>
        </div>

        <!-- Instagram -->
        <div class="social-preview">
          <h3>
            <span class="platform-badge instagram">Instagram</span>
            Instagram Post
          </h3>
          <div class="social-content">${blogPost.socialMedia.instagram.caption.substring(0, 500)}${blogPost.socialMedia.instagram.caption.length > 500 ? '...' : ''}</div>
          <div class="hashtags">${blogPost.socialMedia.instagram.hashtags.join(' ')}</div>
        </div>

        <!-- LinkedIn -->
        <div class="social-preview">
          <h3>
            <span class="platform-badge linkedin">LinkedIn</span>
            ${blogPost.socialMedia.linkedin.title}
          </h3>
          <div class="social-content">
${blogPost.socialMedia.linkedin.content}

Article: www.triplecitiestech.com/blog
          </div>
          <div class="hashtags">${blogPost.socialMedia.linkedin.hashtags.join(' ')}</div>
        </div>
      </div>

      <!-- SEO Metadata -->
      <div style="margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 8px;">
        <h3 style="margin-top: 0; color: #667eea;">🔍 SEO Metadata</h3>
        <div class="meta-item" style="margin-bottom: 15px;">
          <span class="meta-label">Meta Title</span>
          ${blogPost.metaTitle}
        </div>
        <div class="meta-item">
          <span class="meta-label">Meta Description</span>
          ${blogPost.metaDescription}
        </div>
      </div>

      <!-- Source Attribution -->
      <div style="margin: 20px 0; padding: 15px; background: #e7f3ff; border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 10px;">📚 Sources Used:</div>
        <ul style="margin: 0; padding-left: 20px;">
          ${blogPost.sourceUrls.map(url => `<li><a href="${url}" style="color: #0066cc;">${url}</a></li>`).join('')}
        </ul>
      </div>

      <!-- Simple Reply Instructions -->
      <div style="margin: 30px 0; padding: 20px; background: #fff3cd; border-radius: 8px;">
        <h4 style="margin-top: 0;">💡 Quick Approval Options:</h4>
        <ol style="margin: 0;">
          <li><strong>Click "Approve & Schedule"</strong> button above to publish immediately</li>
          <li><strong>Click "Request Changes"</strong> to provide feedback for AI regeneration</li>
          <li><strong>Click "Edit in Admin Panel"</strong> for manual editing before approval</li>
        </ol>
      </div>

      <!-- Token Info (for debugging) -->
      <div style="margin: 20px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px; color: #6c757d;">
        <strong>Approval Token:</strong> ${approvalToken.substring(0, 16)}...
        <br>
        <strong>Generated by:</strong> ${blogPost.aiModel}
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p><strong>Triple Cities Tech</strong> | Automated Blog System</p>
      <p>This is an automated email. Links expire in 7 days.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Simple markdown to HTML conversion
 */
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\_\_(.*?)\_\_/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/\_(.*?)\_/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Lists
  html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>');

  // Wrap lists
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

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
This email was sent to: kurtis@triplecitiestech.com
Links expire in 7 days.
  `.trim();
}
