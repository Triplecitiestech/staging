/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow build to succeed with ESLint warnings (not errors)
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: false, // Keep linting but don't fail on warnings
  },
  images: {
    domains: ['localhost'],
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Enable modern features
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  
  // Security headers including CSP
  async headers() {
    const isDev = process.env.NODE_ENV === 'development'
    
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Control referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // XSS Protection
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Permissions Policy
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          // Strict Transport Security (HTTPS only)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: isDev
              ? [
                  // Development CSP - more permissive for hot reloading
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://vercel.com https://challenges.cloudflare.com",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                  "font-src 'self' https://fonts.gstatic.com",
                  "img-src 'self' data: blob: https:",
                  "media-src 'self' blob: https://pub-fb343e810bf34aa4b3ec0c7f1889d31c.r2.dev",
                  "object-src 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  "frame-ancestors 'none'",
                  "frame-src https://challenges.cloudflare.com",
                  "connect-src 'self' https://vercel.live https://vercel.com https://challenges.cloudflare.com ws://localhost:* wss://localhost:*",
                ].join('; ')
              : [
                  // Production CSP - more restrictive
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' https://vercel.live https://vercel.com https://challenges.cloudflare.com",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                  "font-src 'self' https://fonts.gstatic.com",
                  "img-src 'self' data: blob: https:",
                  "media-src 'self' blob: https://pub-fb343e810bf34aa4b3ec0c7f1889d31c.r2.dev",
                  "object-src 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  "frame-ancestors 'none'",
                  "frame-src https://challenges.cloudflare.com",
                  "connect-src 'self' https://vercel.live https://vercel.com https://challenges.cloudflare.com",
                  "upgrade-insecure-requests",
                ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
