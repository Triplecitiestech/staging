import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Image from 'next/image'
import { auth } from '@/auth'
import { SignInButton } from '@/components/auth/AuthButtons'
import { PricingEditor, PricingEditorHeader } from '@/components/sales-calculator/PricingEditor'
import { applyThemeToRoot } from '@/lib/sales-calculator/config'
import '../sales-calculator.css'

// Internal pricing data — staff gate + explicit noindex (route also inherits
// the robots.txt /admin/ disallow and sitemap exclusion).
export const metadata: Metadata = {
  title: 'Sales Calculator Pricing | Triple Cities Tech',
  description: 'Internal sales calculator pricing editor',
  robots: { index: false, follow: false },
}

export default async function SalesCalculatorPricingPage() {
  const session = await auth()

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
              Sales Calculator Pricing
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

  return (
    <div className="tct-calc-root" style={applyThemeToRoot() as CSSProperties}>
      <main className="max-w-[1100px] mx-auto px-5 py-6 min-h-screen">
        <PricingEditorHeader />
        <PricingEditor />
      </main>
    </div>
  )
}
