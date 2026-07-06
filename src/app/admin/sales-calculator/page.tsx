import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Image from 'next/image'
import { auth } from '@/auth'
import { SignInButton } from '@/components/auth/AuthButtons'
import CalculatorApp from '@/components/sales-calculator/CalculatorApp'
import { applyThemeToRoot } from '@/lib/sales-calculator/config'
import './sales-calculator.css'

// Internal-only tool: exposes vendor costs and margins. /admin/ is already
// disallowed in robots.txt and excluded from the sitemap; this makes the
// route explicitly noindex as well.
export const metadata: Metadata = {
  title: 'Sales Calculator | Triple Cities Tech',
  description: 'Internal managed services sales calculator',
  robots: { index: false, follow: false },
}

export default async function SalesCalculatorPage() {
  const session = await auth()

  // If not authenticated, show sign-in page (same gate as the rest of /admin)
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-8">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <Image
                src="/logo/tctlogo.webp"
                alt="Triple Cities Tech Logo"
                width={80}
                height={80}
                className="w-20 h-20 object-contain"
              />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Sales Calculator
            </h1>
            <p className="text-slate-300 mb-8">
              Internal tool — sign in with your Microsoft account to continue
            </p>
            <SignInButton />
          </div>
        </div>
      </div>
    )
  }

  // Theme variables from src/config/sales-calculator/theme.json are applied to
  // this wrapper div (NOT <body>) so the calculator's dark theme cannot leak
  // into the rest of the site.
  return (
    <div className="tct-calc-root" style={applyThemeToRoot() as CSSProperties}>
      <CalculatorApp />
    </div>
  )
}
