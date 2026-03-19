import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/config/site';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Preview blog post before approval
 * GET /api/blog/approval/[token]/preview
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    const { token } = await params;

    // Find blog post by approval token
    const blogPost = await prisma.blogPost.findUnique({
      where: { approvalToken: token },
      include: {
        category: true,
        tags: true,
        author: true
      }
    });

    if (!blogPost) {
      return new NextResponse(
        generateErrorHTML('Post Not Found', 'This approval link is invalid or has already been used.'),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    if (blogPost.status !== 'PENDING_APPROVAL') {
      return new NextResponse(
        generateErrorHTML(
          'Already Processed',
          `This blog post has already been ${blogPost.status.toLowerCase().replace('_', ' ')}.`
        ),
        {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Render preview HTML
    const html = generatePreviewHTML(blogPost);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error) {
    console.error('Error previewing blog post:', error);

    return new NextResponse(
      generateErrorHTML('Error', 'Failed to load preview. Please try again.'),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

interface BlogPostPreview {
  title: string;
  content: string;
  excerpt: string;
  keywords: string[];
  sourceUrls: string[];
  approvalToken: string | null;
  category: { name: string } | null;
}

function generateErrorHTML(title: string, message: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .card { max-width: 500px; background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; border: 1px solid #334155; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0; color: #94a3b8; font-size: 15px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function generatePreviewHTML(post: BlogPostPreview): string {
  // Convert markdown to HTML
  let contentHtml = post.content;
  contentHtml = contentHtml.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  contentHtml = contentHtml.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  contentHtml = contentHtml.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  contentHtml = contentHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  contentHtml = contentHtml.replace(/\*(.*?)\*/g, '<em>$1</em>');
  contentHtml = contentHtml.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  contentHtml = contentHtml.replace(/^\* (.*$)/gim, '<li>$1</li>');
  contentHtml = contentHtml.replace(/^- (.*$)/gim, '<li>$1</li>');
  contentHtml = contentHtml.replace(/\n\n/g, '</p><p>');
  contentHtml = '<p>' + contentHtml + '</p>';

  const baseUrl = getBaseUrl();
  const approveUrl = `${baseUrl}/api/blog/approval/${post.approvalToken}/approve`;
  const rejectUrl = `${baseUrl}/api/blog/approval/${post.approvalToken}/reject`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: ${post.title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #e2e8f0;
      margin: 0;
      padding: 0;
      background: #0f172a;
    }
    .preview-bar {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: #ffffff;
      padding: 16px;
      text-align: center;
      font-weight: bold;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    }
    .preview-bar-label {
      font-size: 13px;
      opacity: 0.9;
      margin-bottom: 10px;
    }
    .action-buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      padding: 10px 28px;
      border: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-block;
    }
    .btn-approve { background: #22c55e; color: white; }
    .btn-approve:hover { background: #16a34a; }
    .btn-reject { background: #ef4444; color: white; }
    .btn-reject:hover { background: #dc2626; }
    .container {
      max-width: 800px;
      margin: 32px auto;
      background: #1e293b;
      padding: 40px;
      border-radius: 12px;
      border: 1px solid #334155;
    }
    .blog-header {
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .blog-title {
      font-size: 34px;
      font-weight: bold;
      color: #f1f5f9;
      margin: 0 0 15px 0;
      line-height: 1.2;
    }
    .blog-meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      color: #94a3b8;
      font-size: 14px;
      align-items: center;
    }
    .category-badge {
      background: #3b82f6;
      color: white;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
    }
    .blog-excerpt {
      font-size: 18px;
      color: #94a3b8;
      font-style: italic;
      margin: 20px 0;
      padding: 20px;
      background: #0f172a;
      border-left: 4px solid #3b82f6;
      border-radius: 0 8px 8px 0;
    }
    .blog-content {
      font-size: 17px;
      line-height: 1.8;
      color: #cbd5e1;
    }
    .blog-content h1, .blog-content h2, .blog-content h3 {
      color: #f1f5f9;
      margin-top: 28px;
      margin-bottom: 14px;
    }
    .blog-content h2 { font-size: 26px; border-bottom: 1px solid #334155; padding-bottom: 8px; }
    .blog-content h3 { font-size: 20px; }
    .blog-content ul, .blog-content ol { margin: 16px 0; padding-left: 28px; }
    .blog-content li { margin: 8px 0; }
    .blog-content a { color: #60a5fa; text-decoration: none; border-bottom: 1px solid #60a5fa; }
    .blog-content a:hover { color: #93c5fd; }
    .keywords {
      margin: 30px 0;
      padding: 20px;
      background: #0f172a;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    .keyword-tag {
      display: inline-block;
      background: #1e3a5f;
      color: #93c5fd;
      padding: 4px 12px;
      border-radius: 20px;
      margin: 4px;
      font-size: 12px;
    }
    .sources {
      margin-top: 30px;
      padding: 20px;
      background: #0f172a;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    .sources h3 { margin-top: 0; color: #60a5fa; }
    .sources ul { list-style: none; padding: 0; }
    .sources li { margin: 8px 0; padding-left: 20px; position: relative; }
    .sources li:before { content: "\\2192"; position: absolute; left: 0; color: #3b82f6; }
    .sources a { color: #60a5fa; word-break: break-all; }
    @media (max-width: 768px) {
      .container { margin: 16px; padding: 20px; }
      .blog-title { font-size: 26px; }
      .blog-content { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="preview-bar">
    <div class="preview-bar-label">PREVIEW MODE &mdash; This post is pending approval</div>
    <div class="action-buttons">
      <a href="${approveUrl}" class="btn btn-approve">Approve &amp; Schedule</a>
      <a href="${rejectUrl}" class="btn btn-reject">Request Changes</a>
    </div>
  </div>

  <div class="container">
    <article class="blog-header">
      <h1 class="blog-title">${post.title}</h1>

      <div class="blog-meta">
        <span class="category-badge">${post.category?.name || 'Uncategorized'}</span>
        <span>${new Date().toLocaleDateString()}</span>
        <span>AI Generated</span>
      </div>

      <div class="blog-excerpt">
        ${post.excerpt}
      </div>
    </article>

    <div class="blog-content">
      ${contentHtml}
    </div>

    <div class="keywords">
      <strong style="color: #94a3b8; font-size: 13px;">SEO Keywords:</strong><br>
      ${post.keywords.map((k: string) => `<span class="keyword-tag">${k}</span>`).join('')}
    </div>

    <div class="sources">
      <h3>Sources</h3>
      <ul>
        ${post.sourceUrls.map((url: string) => `<li><a href="${url}" target="_blank">${url}</a></li>`).join('')}
      </ul>
    </div>
  </div>

  <script>
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.classList.contains('btn-approve')) {
          if (!confirm('Approve this blog post for publication?')) {
            e.preventDefault();
          }
        } else if (btn.classList.contains('btn-reject')) {
          const reason = prompt('Please provide a reason for rejection (optional):');
          if (reason === null) {
            e.preventDefault();
          } else if (reason) {
            btn.href += '?reason=' + encodeURIComponent(reason);
          }
        }
      });
    });
  </script>
</body>
</html>
  `;
}
