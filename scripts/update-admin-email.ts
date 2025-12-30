// Update admin email to kurtis@triplecitiestech.com
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

// Load environment variables from .env.local
config({ path: '.env.local' })

const accelerateUrl = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL

const prisma = new PrismaClient({
  accelerateUrl
}).$extends(withAccelerate())

async function updateAdminEmail() {
  console.log('🔄 Updating admin email...')

  try {
    // Update the admin user's email
    const updatedUser = await prisma.staffUser.update({
      where: { email: 'admin@triplecitiestech.com' },
      data: {
        email: 'kurtis@triplecitiestech.com',
        name: 'Kurtis - Triple Cities Tech'
      }
    })

    console.log('✅ Email updated successfully!')
    console.log(`   New email: ${updatedUser.email}`)
    console.log(`   Name: ${updatedUser.name}`)
    console.log(`   Role: ${updatedUser.role}`)
  } catch (error) {
    console.error('❌ Error updating email:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

updateAdminEmail()
