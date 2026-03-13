import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.triplecitiestech.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/onboarding/',
          '/auth/',
          '/test/',
          '/blog/setup',
          '/admin/debug/',
          '/admin/run-migration/',
          '/admin/setup/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
