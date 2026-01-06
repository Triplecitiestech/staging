import { NextRequest, NextResponse } from 'next/server';

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
        generateSimpleHTML('❌ Not Found', 'This approval link is invalid or has expired.'),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    if (blogPost.status !== 'PENDING_APPROVAL') {
      return new NextResponse(
        generateSimpleHTML('⚠️ Already Processed', `This blog post has already been ${blogPost.status.toLowerCase()}.`),
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

    console.log(`✅ Blog post approved: "${blogPost.title}"`);
    console.log(`📅 Scheduled for: ${scheduledFor.toISOString()}`);

    return new NextResponse(
      generateSimpleHTML(
        '✅ Approval Successful',
        `Blog post "${blogPost.title}" approved and will publish on ${scheduledFor.toLocaleDateString()}.`
      ),
      {
        headers: { 'Content-Type': 'text/html' }
      }
    );
  } catch (error) {
    console.error('Error approving blog post:', error);

    return new NextResponse(
      generateSimpleHTML('❌ Error', 'Failed to approve blog post. Please try again or contact support.'),
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

  // Get day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = publishTime.getDay();

  // Publishing days: Mon (1), Wed (3), Fri (5)
  const publishingDays = [1, 3, 5];

  // If it's past 9 AM today, move to next day
  if (now.getHours() >= 14) {
    publishTime.setDate(publishTime.getDate() + 1);
  }

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

function generateSimpleHTML(title: string, message: string): string {
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      max-width: 500px;
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    h1 {
      color: #333;
      margin: 0 0 15px 0;
      font-size: 24px;
    }
    p {
      color: #666;
      margin: 0;
      font-size: 16px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>
  `;
}
