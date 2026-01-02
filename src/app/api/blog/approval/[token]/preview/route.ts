import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Preview blog post before approval
 * GET /api/blog/approval/[token]/preview
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
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
        '<html><body><h1>404 - Post Not Found</h1><p>This approval link is invalid or has expired.</p></body></html>',
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    if (blogPost.status !== 'PENDING_APPROVAL') {
      return new NextResponse(
        `<html><body><h1>Post Already Processed</h1><p>This blog post has already been ${blogPost.status.toLowerCase()}.</p></body></html>`,
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
      '<html><body><h1>500 - Error</h1><p>Failed to load preview.</p></body></html>',
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

function generatePreviewHTML(post: BlogPostPreview): string {
  // Convert markdown to HTML (simple version)
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.triplecitiestech.com';
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
      color: #333;
      margin: 0;
      padding: 0;
      background: #f5f5f5;
    }
    .preview-bar {
      background: #ffc107;
      color: #000;
      padding: 15px;
      text-align: center;
      font-weight: bold;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .action-buttons {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 10px 25px;
      border: none;
      border-radius: 6px;
      font-weight: bold;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.3s;
      display: inline-block;
    }
    .btn-approve { background: #28a745; color: white; }
    .btn-approve:hover { background: #218838; }
    .btn-reject { background: #dc3545; color: white; }
    .btn-reject:hover { background: #c82333; }
    .container {
      max-width: 800px;
      margin: 40px auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .blog-header {
      border-bottom: 3px solid #667eea;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .blog-title {
      font-size: 36px;
      font-weight: bold;
      color: #1a1a1a;
      margin: 0 0 15px 0;
      line-height: 1.2;
    }
    .blog-meta {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      color: #666;
      font-size: 14px;
    }
    .blog-meta span {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .category-badge {
      background: #667eea;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
    }
    .blog-excerpt {
      font-size: 20px;
      color: #555;
      font-style: italic;
      margin: 20px 0;
      padding: 20px;
      background: #f8f9fa;
      border-left: 4px solid #667eea;
    }
    .blog-content {
      font-size: 18px;
      line-height: 1.8;
      color: #333;
    }
    .blog-content h1,
    .blog-content h2,
    .blog-content h3 {
      color: #1a1a1a;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    .blog-content h2 {
      font-size: 28px;
      border-bottom: 2px solid #eee;
      padding-bottom: 10px;
    }
    .blog-content h3 {
      font-size: 22px;
    }
    .blog-content ul,
    .blog-content ol {
      margin: 20px 0;
      padding-left: 30px;
    }
    .blog-content li {
      margin: 10px 0;
    }
    .blog-content a {
      color: #667eea;
      text-decoration: none;
      border-bottom: 1px solid #667eea;
    }
    .blog-content a:hover {
      color: #5568d3;
      border-bottom-color: #5568d3;
    }
    .keywords {
      margin: 30px 0;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .keyword-tag {
      display: inline-block;
      background: #e7f3ff;
      color: #0066cc;
      padding: 4px 12px;
      border-radius: 20px;
      margin: 5px;
      font-size: 12px;
    }
    .sources {
      margin-top: 40px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .sources h3 {
      margin-top: 0;
      color: #667eea;
    }
    .sources ul {
      list-style: none;
      padding: 0;
    }
    .sources li {
      margin: 10px 0;
      padding-left: 25px;
      position: relative;
    }
    .sources li:before {
      content: "→";
      position: absolute;
      left: 0;
      color: #667eea;
    }
    .sources a {
      color: #0066cc;
      word-break: break-all;
    }
    @media (max-width: 768px) {
      .container {
        margin: 20px;
        padding: 20px;
      }
      .blog-title {
        font-size: 28px;
      }
      .blog-content {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="preview-bar">
    ⚠️ PREVIEW MODE - This post is pending approval
    <div class="action-buttons">
      <a href="${approveUrl}" class="btn btn-approve">✅ Approve & Schedule</a>
      <a href="${rejectUrl}" class="btn btn-reject">❌ Request Changes</a>
    </div>
  </div>

  <div class="container">
    <article class="blog-header">
      <h1 class="blog-title">${post.title}</h1>

      <div class="blog-meta">
        <span class="category-badge">${post.category?.name || 'Uncategorized'}</span>
        <span>📅 ${new Date().toLocaleDateString()}</span>
        <span>👤 AI Generated</span>
      </div>

      <div class="blog-excerpt">
        ${post.excerpt}
      </div>
    </article>

    <div class="blog-content">
      ${contentHtml}
    </div>

    <div class="keywords">
      <strong>SEO Keywords:</strong>
      ${post.keywords.map((k: string) => `<span class="keyword-tag">${k}</span>`).join('')}
    </div>

    <div class="sources">
      <h3>📚 Sources</h3>
      <ul>
        ${post.sourceUrls.map((url: string) => `<li><a href="${url}" target="_blank">${url}</a></li>`).join('')}
      </ul>
    </div>
  </div>

  <script>
    // Simple confirmation for actions
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
