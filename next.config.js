/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't try to bundle these — read directly from node_modules at
  // runtime. pdfkit + fontkit ship binary .afm font files that Next.js's
  // bundler doesn't know how to handle; externalizing keeps the file
  // system path intact so pdfkit can find its standard PostScript fonts.
  serverExternalPackages: ['pdfkit', 'fontkit', 'pdf-parse', 'mammoth', 'mupdf'],
  // 'mupdf' is external because it loads a .wasm asset at runtime; bundling it
  // breaks that lookup. It renders Raven scan pages to images server-side
  // (src/lib/scan-filing/render.ts). If the asset ever fails to reach the
  // serverless bundle, scan_render_attachment reports NOT_IMPLEMENTED naming
  // the module rather than taking the connector route down with it.
  // Webpack configuration
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle these server-side packages
      config.externals = [...(config.externals || []), 'pg', 'pg-native']
    }
    return config
  },
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

  // content/field/playbook.html is read from disk at runtime by the
  // contractor-portal route (src/lib/field/playbook.ts); make sure the file
  // travels into that route's serverless bundle.
  outputFileTracingIncludes: {
    '/field/playbook': ['./content/field/**/*'],
  },
  
  // Security headers including CSP
  async headers() {
    const isDev = process.env.NODE_ENV === 'development'

    const cspDirectives = isDev
      ? [
          // Development CSP - more permissive for hot reloading
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://vercel.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://messenger.chatgenie.io https://assets.calendly.com https://assets.apollo.io",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://assets.calendly.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https://pub-fb343e810bf34aa4b3ec0c7f1889d31c.r2.dev",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "frame-src https://challenges.cloudflare.com https://messenger.chatgenie.io https://www.youtube.com https://youtube.com https://calendly.com",
          "connect-src 'self' https://vercel.live https://vercel.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://messenger.chatgenie.io https://api.chatgenie.io https://*.cloudflare.com ws://localhost:* wss://localhost:* https://calendly.com https://*.apollo.io",
        ]
      : [
          // Production CSP - more restrictive
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://vercel.live https://vercel.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://messenger.chatgenie.io https://assets.calendly.com https://assets.apollo.io",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://assets.calendly.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "media-src 'self' blob: https://pub-fb343e810bf34aa4b3ec0c7f1889d31c.r2.dev",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "frame-src https://challenges.cloudflare.com https://messenger.chatgenie.io https://www.youtube.com https://youtube.com https://calendly.com",
          "connect-src 'self' https://vercel.live https://vercel.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://messenger.chatgenie.io https://api.chatgenie.io https://*.cloudflare.com https://calendly.com https://*.apollo.io wss://*.speech.microsoft.com wss://speech.platform.bing.com https://*.google.com",
          "upgrade-insecure-requests",
        ]

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
            value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          // Strict Transport Security (HTTPS only)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.join('; '),
          },
        ],
      },
      // Contractor Portal: /field frames /field/playbook (same origin). The site
      // CSP's frame-src names only third-party hosts, so /field alone adds
      // 'self' to frame-src, and /field/playbook alone allows same-origin
      // framing. Later header entries win per key.
      {
        source: '/field',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives
              .map((d) => (d.startsWith('frame-src ') ? d.replace('frame-src ', "frame-src 'self' ") : d))
              .join('; '),
          },
        ],
      },
      {
        source: '/field/playbook',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: cspDirectives
              .map((d) => (d.startsWith('frame-ancestors') ? "frame-ancestors 'self'" : d))
              .join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
