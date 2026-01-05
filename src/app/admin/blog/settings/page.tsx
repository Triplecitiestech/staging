import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AdminHeader from '@/components/admin/AdminHeader'
import BlogSettingsManager from '@/components/admin/BlogSettingsManager'

export default async function BlogSettingsPage() {
  const session = await auth()
  if (!session) {
    redirect('/admin')
  }

  const { prisma } = await import('@/lib/prisma')

  // Fetch current settings and content sources
  const contentSources = await prisma.contentSource.findMany({
    orderBy: { name: 'asc' }
  })

  // Serialize dates for client component
  const serializedSources = contentSources.map(source => ({
    id: source.id,
    name: source.name,
    url: source.url,
    rssFeedUrl: source.rssFeedUrl || '',
    apiEndpoint: source.apiEndpoint || '',
    isActive: source.isActive,
    lastFetched: source.lastFetched?.toISOString() || null,
    fetchFrequency: source.fetchFrequency
  }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <AdminHeader />
      <BlogSettingsManager sources={serializedSources} />
    </div>
  )
}
