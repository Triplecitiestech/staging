// Simple script to update admin email
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

config({ path: '.env.local' })

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

async function main() {
  console.log('Starting...')

  // First check what's there
  const allUsers = await prisma.staffUser.findMany()
  console.log('Current users:', JSON.stringify(allUsers, null, 2))

  // Update the email
  const updated = await prisma.staffUser.updateMany({
    where: { email: 'admin@triplecitiestech.com' },
    data: {
      email: 'kurtis@triplecitiestech.com',
      name: 'Kurtis - Triple Cities Tech'
    }
  })

  console.log('Updated count:', updated.count)

  // Check again
  const afterUpdate = await prisma.staffUser.findMany()
  console.log('After update:', JSON.stringify(afterUpdate, null, 2))

  await prisma.$disconnect()
  console.log('Done!')
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
