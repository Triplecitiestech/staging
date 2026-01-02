import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

// GET notifications for current user
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    const where: {
      recipientEmail: string
      isRead?: boolean
    } = {
      recipientEmail: session.user.email
    }

    if (unreadOnly) {
      where.isRead = false
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to recent 50 notifications
    })

    return NextResponse.json(notifications)
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

// PATCH mark notification(s) as read
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const data = await req.json()

    // Mark all as read
    if (data.markAllRead) {
      await prisma.notification.updateMany({
        where: {
          recipientEmail: session.user.email,
          isRead: false
        },
        data: {
          isRead: true
        }
      })

      return NextResponse.json({ success: true, markedCount: 'all' })
    }

    // Mark specific notification as read
    if (data.id) {
      const notification = await prisma.notification.findUnique({
        where: { id: data.id }
      })

      if (!notification) {
        return NextResponse.json(
          { error: 'Notification not found' },
          { status: 404 }
        )
      }

      // Verify user owns this notification
      if (notification.recipientEmail !== session.user.email) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        )
      }

      const updated = await prisma.notification.update({
        where: { id: data.id },
        data: { isRead: true }
      })

      return NextResponse.json(updated)
    }

    return NextResponse.json(
      { error: 'Must provide either id or markAllRead' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Failed to update notifications:', error)
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    )
  }
}
