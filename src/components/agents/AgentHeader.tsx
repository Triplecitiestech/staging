'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

interface AgentHeaderProps {
  agentName: string
}

export default function AgentHeader({ agentName }: AgentHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const nav = [
    { label: 'Dashboard', href: '/agents/dashboard' },
    { label: 'Submit Referral', href: '/agents/refer' },
    { label: 'My Agreement', href: '/agents/agreement' },
    { label: 'Training', href: '/agents/training' },
  ]

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await fetch('/api/agent-portal/logout', { method: 'POST' })
    } catch {
      // ignore — we're navigating away anyway
    }
    router.push('/agents/login')
  }

  return (
    <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 gap-3">
          <Link href="/agents/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <Image
              src="/logo/tctlogo.webp"
              alt="Triple Cities Tech"
              width={32}
              height={32}
              className="w-8 h-8 object-contain"
            />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-white leading-tight">Agent Portal</h1>
              <p className="text-[10px] text-slate-400 leading-tight">Triple Cities Tech</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0 ml-4">
            {nav.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  isActive(item.href)
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3 ml-auto">
            <span className="text-xs text-slate-400">Hi, {agentName}</span>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="text-xs text-slate-300 hover:text-white px-3 py-1.5 border border-white/15 rounded-md transition-colors disabled:opacity-50"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden ml-auto p-2 text-slate-300 hover:text-white"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden py-3 border-t border-white/10">
            <nav className="flex flex-col gap-1">
              {nav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive(item.href)
                      ? 'bg-cyan-500 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-white/10 my-1" />
              <div className="px-3 py-1 text-xs text-slate-400">Signed in as {agentName}</div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-left px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/5 rounded-md disabled:opacity-50"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
