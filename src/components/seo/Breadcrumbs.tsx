'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRightIcon } from '@/components/icons/TechIcons'

interface BreadcrumbItem {
  name: string
  url: string
}

export default function Breadcrumbs() {
  const pathname = usePathname()

  // Don't show breadcrumbs on home page
  if (pathname === '/') return null

  // Generate breadcrumb items from pathname
  const paths = pathname.split('/').filter(Boolean)
  const breadcrumbItems: BreadcrumbItem[] = [
    { name: 'Home', url: '/' }
  ]

  let currentPath = ''
  paths.forEach((path) => {
    currentPath += `/${path}`
    const name = path
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    breadcrumbItems.push({ name, url: currentPath })
  })

  // Generate JSON-LD structured data
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `https://www.triplecitiestech.com${item.url}`
    }))
  }

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Visual Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="py-4 px-6 max-w-7xl mx-auto">
        <ol className="flex items-center space-x-2 text-sm">
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1

            return (
              <li key={item.url} className="flex items-center">
                {index > 0 && (
                  <ChevronRightIcon className="w-4 h-4 text-white/40 mx-2" />
                )}
                {isLast ? (
                  <span className="text-white/60 font-medium" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <Link
                    href={item.url}
                    className="text-white/80 hover:text-white transition-colors duration-200"
                  >
                    {item.name}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}
