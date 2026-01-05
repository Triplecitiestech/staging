import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Creating first blog post...')

  // Create cybersecurity category if it doesn't exist
  const category = await prisma.blogCategory.upsert({
    where: { slug: 'cybersecurity' },
    update: {},
    create: {
      name: 'Cybersecurity',
      slug: 'cybersecurity',
      description: 'Best practices and insights on cybersecurity for small businesses'
    }
  })

  console.log('✓ Category created:', category.name)

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
      content: `Cybersecurity isn't just a concern for large enterprises anymore. Small and mid-sized businesses are increasingly becoming prime targets for cybercriminals. Why? Because attackers know that smaller organizations often lack the resources and expertise to implement robust security measures.

## The Reality of Cyber Threats for Small Businesses

According to recent studies, over 60% of small businesses that experience a major cyber attack go out of business within six months. The financial impact is devastating, but the damage to reputation and customer trust can be even more severe.

Here are the five most common cybersecurity mistakes we see in Central New York businesses—and more importantly, what you can do about them.

## 1. Weak Password Policies

**The Mistake:** Many businesses still allow employees to use simple passwords like "Password123" or reuse the same password across multiple accounts. Without multi-factor authentication (MFA), a single compromised password can give attackers access to your entire network.

**The Fix:**
- Implement a password manager for your team
- Require strong, unique passwords for every account
- Enable multi-factor authentication on all business applications
- Consider using passwordless authentication where available

## 2. Outdated Software and Missing Patches

**The Mistake:** Running outdated software is like leaving your front door unlocked. Cybercriminals actively scan for systems with known vulnerabilities that haven't been patched.

**The Fix:**
- Enable automatic updates wherever possible
- Establish a monthly patch management schedule
- Keep an inventory of all software and systems
- Replace software that's no longer supported by the vendor

## 3. No Employee Security Training

**The Mistake:** Your employees are your first line of defense—but without proper training, they're also your biggest vulnerability. Phishing attacks have become incredibly sophisticated, and even tech-savvy employees can be fooled.

**The Fix:**
- Conduct regular security awareness training
- Run simulated phishing tests to identify vulnerabilities
- Create clear policies for handling sensitive information
- Encourage a culture where employees feel comfortable reporting suspicious emails

## 4. Lack of Data Backup and Recovery Plan

**The Mistake:** Many businesses don't realize the importance of backups until it's too late. Ransomware attacks can encrypt all your data in minutes, and without backups, you're forced to either pay the ransom or lose everything.

**The Fix:**
- Implement the 3-2-1 backup rule: 3 copies of data, on 2 different media types, with 1 copy offsite
- Test your backups regularly—a backup you can't restore is useless
- Ensure backups are not connected to your network (to prevent ransomware encryption)
- Document your recovery procedures

## 5. No Network Segmentation or Access Controls

**The Mistake:** Giving everyone access to everything might seem convenient, but it dramatically increases your risk. If an attacker compromises one account, they shouldn't be able to access your entire network.

**The Fix:**
- Implement the principle of least privilege—employees should only have access to what they need
- Segment your network to isolate critical systems
- Use Virtual Private Networks (VPNs) for remote access
- Regularly review and update access permissions

## Where to Start?

If you're reading this list and feeling overwhelmed, you're not alone. The good news is that you don't have to tackle everything at once. Here's a practical starting point:

1. **This Week:** Enable multi-factor authentication on your most critical accounts (email, banking, cloud storage)
2. **This Month:** Conduct a security awareness training session with your team
3. **This Quarter:** Implement a proper backup solution and test your recovery process

## The Bottom Line

Cybersecurity doesn't have to be complicated or expensive. Many of the most effective security measures are simple best practices that just need to be implemented consistently.

At Triple Cities Tech, we work with businesses throughout Central New York to implement practical, affordable security solutions. We understand that you need to focus on running your business, not becoming a cybersecurity expert.

If you're concerned about your organization's security posture, we're here to help. Our cybersecurity assessments identify your specific vulnerabilities and provide a clear roadmap for improvement—without the technical jargon or unnecessary complexity.`,
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
        'patch management',
        'network security',
        'multi-factor authentication',
        'Central New York IT'
      ],
      categoryId: category.id,
      views: 0
    }
  })

  console.log('✓ Blog post created:', blogPost.title)
  console.log('  Slug:', blogPost.slug)
  console.log('  Status:', blogPost.status)
  console.log('  Published at:', blogPost.publishedAt)
  console.log('\nBlog post is now live at: /blog/' + blogPost.slug)
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
