import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/config/site';

// Disable static generation for this API route
export const dynamic = 'force-dynamic';

/**
 * Approve blog post for publication
 * GET /api/blog/approval/[token]/approve
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
        category: true
      }
    });

    if (!blogPost) {
      return new NextResponse(
        generateResultHTML('Not Found', 'This approval link is invalid or has already been used.', 'error'),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    if (blogPost.status !== 'PENDING_APPROVAL') {
      return new NextResponse(
        generateResultHTML('Already Processed', `This blog post has already been ${blogPost.status.toLowerCase().replace('_', ' ')}.`, 'info'),
        {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Calculate next publishing slot
    const scheduledFor = calculateNextPublishingSlot();

    // Update blog post status
    await prisma.blogPost.update({
      where: { id: blogPost.id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: process.env.APPROVAL_EMAIL || 'kurtis@triplecitiestech.com',
        scheduledFor,
        approvalToken: null // Invalidate token
      }
    });

    console.log(`Blog post approved: "${blogPost.title}"`);
    console.log(`Scheduled for: ${scheduledFor.toISOString()}`);

    const baseUrl = getBaseUrl();
    const blogUrl = `${baseUrl}/blog/${blogPost.slug}`;

    return new NextResponse(
      generateResultHTML(
        'Approved',
        `<strong>${blogPost.title}</strong> has been approved and scheduled for publication on <strong>${scheduledFor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong> at 9:00 AM EST.`,
        'success',
        blogUrl
      ),
      {
        headers: { 'Content-Type': 'text/html' }
      }
    );
  } catch (error) {
    console.error('Error approving blog post:', error);

    return new NextResponse(
      generateResultHTML('Error', 'Failed to approve blog post. Please try again or contact support.', 'error'),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}

/**
 * Calculate next publishing slot
 * Posts are published Mon/Wed/Fri at 9 AM EST
 */
function calculateNextPublishingSlot(): Date {
  const now = new Date();
  const publishTime = new Date(now);

  // Set time to 9 AM EST (14:00 UTC)
  publishTime.setHours(14, 0, 0, 0);

  // If it's past 9 AM EST today, move to next day
  if (now.getHours() >= 14) {
    publishTime.setDate(publishTime.getDate() + 1);
  }

  // Publishing days: Mon (1), Wed (3), Fri (5)
  const publishingDays = [1, 3, 5];

  // Find next publishing day
  let daysToAdd = 0;
  const currentDay = publishTime.getDay();

  for (let i = 0; i < 7; i++) {
    const checkDay = (currentDay + i) % 7;
    if (publishingDays.includes(checkDay)) {
      daysToAdd = i;
      break;
    }
  }

  publishTime.setDate(publishTime.getDate() + daysToAdd);

  return publishTime;
}

function generateResultHTML(title: string, message: string, type: 'success' | 'error' | 'info', blogUrl?: string): string {
  const accentColor = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6';
  const icon = type === 'success' ? '&#10003;' : type === 'error' ? '&#10007;' : '&#8505;';

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
      max-width: 500px;
      background: #1e293b;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      text-align: center;
      border: 1px solid #334155;
    }
    .icon-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${accentColor};
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: bold;
      margin: 0 auto 20px;
    }
    h1 {
      color: #f1f5f9;
      margin: 0 0 16px 0;
      font-size: 24px;
    }
    .message {
      color: #94a3b8;
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
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
      margin-top: 24px;
      font-weight: 600;
      font-size: 14px;
      transition: background 0.2s;
    }
    .btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon-circle">${icon}</div>
    <h1>${title}</h1>
    <p class="message">${message}</p>
    ${blogUrl ? `<a href="${blogUrl}" class="btn">View Blog Post</a>` : ''}
  </div>
</body>
</html>
  `;
}
