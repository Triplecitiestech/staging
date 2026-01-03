'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/auth/AuthButtons'

export default function AdminHeader() {
  const pathname = usePathname()

  const navItems = [
    {
      label: 'Dashboard',
      href: '/admin',
    },
    {
      label: 'Projects',
      href: '/admin/projects',
    },
    {
      label: 'New Project',
      href: '/admin/projects/new',
    },
    {
      label: 'Companies',
      href: '/admin/companies',
    },
    {
      label: 'New Company',
      href: '/admin/companies/new',
    },
  ]

  return (
    <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Image
              src="/logo/tctlogo.webp"
              alt="Triple Cities Tech Logo"
              width={40}
              height={40}
              className="w-10 h-10 object-contain"
            />
            <div>
              <h1 className="text-xl font-bold text-white">Project Management Dashboard</h1>
              <p className="text-xs text-slate-400">Triple Cities Tech</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === item.href
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="h-6 w-px bg-white/10 mx-1" />
            <Link
              href="/"
              className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              ← Website
            </Link>
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  )
}
