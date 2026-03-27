'use client'

import { BackgroundThemeProvider, BackgroundLayer } from '@/components/ui/BackgroundTheme'

/**
 * Client-side wrapper that provides the background theme to admin pages.
 * Admin pages remain server components — they just wrap their content in this.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <BackgroundThemeProvider>
      <div className="min-h-screen relative">
        <BackgroundLayer />
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </BackgroundThemeProvider>
  )
}
