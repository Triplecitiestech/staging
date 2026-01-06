import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma')

    // Create cybersecurity category if it doesn't exist
    const category = await prisma.blogCategory.upsert({
      where: { slug: 'cybersecurity-news' },
      update: {},
      create: {
        name: 'Cybersecurity News',
        slug: 'cybersecurity-news',
        description: 'Latest cybersecurity news and insights for small businesses'
      }
    })

    // Create the first blog post
    const blogPost = await prisma.blogPost.upsert({
      where: { slug: '5-cybersecurity-mistakes-small-businesses' },
      update: {
        status: 'PUBLISHED',
        publishedAt: new Date()
      },
      create: {
        slug: '5-cybersecurity-mistakes-small-businesses',
        title: '5 Critical Cybersecurity Mistakes Small Businesses Make (And How to Fix Them)',
        excerpt: 'Small businesses are increasingly targeted by cybercriminals. Learn about the most common security mistakes and practical steps to protect your company.',
        content: `Cybersecurity isn't just a concern for large enterprises anymore. Small and mid-sized businesses are increasingly becoming prime targets for cybercriminals.

## The Reality of Cyber Threats for Small Businesses

According to recent studies, over 60% of small businesses that experience a major cyber attack go out of business within six months. The financial impact is devastating, but the damage to reputation and customer trust can be even more severe.

## 1. Weak Password Policies

**The Mistake:** Many businesses still allow employees to use simple passwords like "Password123" or reuse the same password across multiple accounts.

**The Fix:**
- Implement a password manager for your team
- Require strong, unique passwords for every account
- Enable multi-factor authentication on all business applications

## 2. Outdated Software and Missing Patches

**The Mistake:** Running outdated software is like leaving your front door unlocked. Cybercriminals actively scan for systems with known vulnerabilities.

**The Fix:**
- Enable automatic updates wherever possible
- Establish a monthly patch management schedule
- Keep an inventory of all software and systems

## 3. No Employee Security Training

**The Mistake:** Your employees are your first line of defense—but without proper training, they're also your biggest vulnerability.

**The Fix:**
- Conduct regular security awareness training
- Run simulated phishing tests
- Create clear policies for handling sensitive information

## 4. Lack of Data Backup and Recovery Plan

**The Mistake:** Many businesses don't realize the importance of backups until it's too late.

**The Fix:**
- Implement the 3-2-1 backup rule
- Test your backups regularly
- Ensure backups are not connected to your network

## 5. No Network Segmentation or Access Controls

**The Mistake:** Giving everyone access to everything might seem convenient, but it dramatically increases your risk.

**The Fix:**
- Implement the principle of least privilege
- Segment your network to isolate critical systems
- Use VPNs for remote access
- Regularly review and update access permissions

## The Bottom Line

At Triple Cities Tech, we work with businesses throughout Central New York to implement practical, affordable security solutions. If you're concerned about your organization's security posture, we're here to help.`,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        metaTitle: '5 Critical Cybersecurity Mistakes Small Businesses Make | Triple Cities Tech',
        metaDescription: 'Discover the most common cybersecurity mistakes small businesses make and learn practical steps to protect your company from cyber threats.',
        keywords: [
          'cybersecurity',
          'small business security',
          'password security',
          'data backup',
          'employee training',
          'Central New York IT'
        ],
        categoryId: category.id,
        views: 0
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Blog post created successfully!',
      post: {
        title: blogPost.title,
        slug: blogPost.slug,
        status: blogPost.status,
        url: `/blog/${blogPost.slug}`
      }
    })
  } catch (error) {
    console.error('Error creating blog post:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create blog post',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
