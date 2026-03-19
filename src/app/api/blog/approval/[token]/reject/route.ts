import { NextRequest, NextResponse } from 'next/server';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Reject blog post and request changes
 * GET /api/blog/approval/[token]/reject
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // Dynamic import to prevent Prisma loading during build
    const { prisma } = await import('@/lib/prisma');

    const { token } = await params;
    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason') || 'No reason provided';

    // Find blog post by approval token
    const blogPost = await prisma.blogPost.findUnique({
      where: { approvalToken: token }
    });

    if (!blogPost) {
      return new NextResponse(
        generateRejectionHTML('Not Found', 'This approval link is invalid or has expired.', true),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    if (blogPost.status !== 'PENDING_APPROVAL') {
      return new NextResponse(
        generateRejectionHTML(
          'Already Processed',
          `This blog post has already been ${blogPost.status.toLowerCase()}.`,
          true
        ),
        {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Update blog post status
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        revisionCount: blogPost.revisionCount + 1,
        approvalToken: null // Invalidate token
      }
    });

    console.log(`❌ Blog post rejected: "${blogPost.title}"`);
    console.log(`📝 Reason: ${reason}`);

    // TODO: In future, trigger AI regeneration with feedback
    // For now, just mark as rejected and require manual intervention

    return new NextResponse(
      generateRejectionHTML(
        'Rejection Recorded',
        `
          <p>The blog post "<strong>${blogPost.title}</strong>" has been rejected.</p>
          <p><strong>Feedback provided:</strong> ${reason}</p>
          <p>The post will be archived and a new draft can be generated.</p>
          <p>Future enhancement: AI will automatically regenerate based on your feedback.</p>
        `,
        false
      ),
      {
        headers: { 'Content-Type': 'text/html' }
      }
    );
  } catch (error) {
    console.error('Error rejecting blog post:', error);

    return new NextResponse(
      generateRejectionHTML(
        'Error',
        'Failed to reject blog post. Please try again or contact support.',
        true
      ),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

/**
 * POST method for rejection with form data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const formData = await request.formData();
    const reason = formData.get('reason') as string || 'No reason provided';

    // Redirect to GET with reason in query params
    const url = new URL(request.url);
    url.searchParams.set('reason', reason);

    return NextResponse.redirect(url.toString());
  } catch (error) {
    console.error('Error processing rejection form:', error);

    return new NextResponse(
      generateRejectionHTML(
        'Error',
        'Failed to process rejection. Please try again.',
        true
      ),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

function generateRejectionHTML(title: string, message: string, isError: boolean): string {
  const bgColor = isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';
  const borderColor = isError ? '#ef4444' : '#3b82f6';
  const textColor = isError ? '#fca5a5' : '#93c5fd';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
    }
    .container {
      max-width: 600px;
      background: #1e293b;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      text-align: center;
      border: 1px solid #334155;
    }
    h1 {
      color: #f1f5f9;
      margin: 0 0 20px 0;
      font-size: 24px;
    }
    .message {
      background: ${bgColor};
      border: 1px solid ${borderColor};
      color: ${textColor};
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      text-align: left;
      line-height: 1.6;
    }
    .message p {
      margin: 8px 0;
    }
    .message strong {
      color: #e2e8f0;
    }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      margin-top: 20px;
      font-weight: 600;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <div class="message">
      ${message}
    </div>
    <a href="https://www.triplecitiestech.com" class="btn">Return to Homepage</a>
  </div>
</body>
</html>
  `;
}
