import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Approve blog post for publication
 * GET /api/blog/approval/[token]/approve
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    // Find blog post by approval token
    const blogPost = await prisma.blogPost.findUnique({
      where: { approvalToken: token },
      include: {
        category: true
      }
    });

    if (!blogPost) {
      return new NextResponse(
        generateResultHTML('Not Found', 'This approval link is invalid or has expired.', 'error'),
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    if (blogPost.status !== 'PENDING_APPROVAL') {
      return new NextResponse(
        generateResultHTML(
          'Already Processed',
          `This blog post has already been ${blogPost.status.toLowerCase()}.`,
          'warning'
        ),
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
      generateResultHTML(
        'Approved Successfully!',
        `
          <p>The blog post "<strong>${blogPost.title}</strong>" has been approved for publication.</p>
          <p><strong>Scheduled for:</strong> ${scheduledFor.toLocaleString()}</p>
          <p>The post will be automatically published to the website and shared on social media platforms.</p>
          <p>You will receive a confirmation email once it's published.</p>
        `,
        'success'
      ),
      {
        headers: { 'Content-Type': 'text/html' }
      }
    );
  } catch (error) {
    console.error('Error approving blog post:', error);

    return new NextResponse(
      generateResultHTML(
        'Error',
        'Failed to approve blog post. Please try again or contact support.',
        'error'
      ),
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

function generateResultHTML(title: string, message: string, type: 'success' | 'error' | 'warning'): string {
  const colors = {
    success: {
      bg: '#d4edda',
      border: '#c3e6cb',
      text: '#155724',
      icon: '✅'
    },
    error: {
      bg: '#f8d7da',
      border: '#f5c6cb',
      text: '#721c24',
      icon: '❌'
    },
    warning: {
      bg: '#fff3cd',
      border: '#ffeaa7',
      text: '#856404',
      icon: '⚠️'
    }
  };

  const color = colors[type];

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
      max-width: 600px;
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      margin: 0 0 20px 0;
      font-size: 28px;
    }
    .message {
      background: ${color.bg};
      border: 1px solid ${color.border};
      color: ${color.text};
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      text-align: left;
    }
    .message p {
      margin: 10px 0;
    }
    .btn {
      display: inline-block;
      padding: 12px 30px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 20px;
      font-weight: bold;
      transition: background 0.3s;
    }
    .btn:hover {
      background: #5568d3;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${color.icon}</div>
    <h1>${title}</h1>
    <div class="message">
      ${message}
    </div>
    <a href="https://www.triplecitiestech.com" class="btn">Return to Homepage</a>
  </div>
  ${type === 'success' ? '<script>setTimeout(() => window.close(), 5000);</script>' : ''}
</body>
</html>
  `;
}
