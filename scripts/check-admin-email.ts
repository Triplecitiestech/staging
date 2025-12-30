// Check admin email in database
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

// Load environment variables from .env.local
config({ path: '.env.local' })

const accelerateUrl = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL

console.log('🔍 Checking database connection...')
console.log('Using URL:', accelerateUrl?.substring(0, 25) + '...')

const prisma = new PrismaClient({
  accelerateUrl
}).$extends(withAccelerate())

async function checkAdminEmail() {
  try {
    console.log('\n📋 Fetching all staff users...\n')

    const users = await prisma.staffUser.findMany()

    console.log(`Found ${users.length} staff user(s):\n`)

    users.forEach(user => {
      console.log(`  📧 Email: ${user.email}`)
      console.log(`  👤 Name: ${user.name}`)
      console.log(`  🔑 Role: ${user.role}`)
      console.log(`  ✅ Active: ${user.isActive}`)
      console.log('')
    })
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkAdminEmail()
