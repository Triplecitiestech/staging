import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

config({ path: '.env.local' })

console.log('🔄 Starting email update...')
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL)
console.log('PRISMA_DATABASE_URL exists:', !!process.env.PRISMA_DATABASE_URL)

const prisma = new PrismaClient({
  accelerateUrl: process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
}).$extends(withAccelerate())

try {
  console.log('📊 Fetching current users...')
  const users = await prisma.staffUser.findMany()
  console.log('Found', users.length, 'user(s)')
  users.forEach(u => console.log('  -', u.email, '/', u.name))

  console.log('\n🔄 Updating email...')
  const result = await prisma.staffUser.updateMany({
    where: { email: 'admin@triplecitiestech.com' },
    data: {
      email: 'kurtis@triplecitiestech.com',
      name: 'Kurtis - Triple Cities Tech'
    }
  })

  console.log('✅ Updated', result.count, 'user(s)')

  console.log('\n📊 Fetching updated users...')
  const updated = await prisma.staffUser.findMany()
  updated.forEach(u => console.log('  -', u.email, '/', u.name))

  console.log('\n✨ Done!')
} catch (e) {
  console.error('❌ Error:', e.message)
  console.error(e)
} finally {
  await prisma.$disconnect()
}
