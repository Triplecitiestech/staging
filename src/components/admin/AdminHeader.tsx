import Link from 'next/link'
import Image from 'next/image'
import { SignOutButton } from '@/components/auth/AuthButtons'
import AdminNav from '@/components/admin/AdminNav'

export default function AdminHeader() {
  return (
    <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Image
              src="/logo/tctlogo.webp"
              alt="Triple Cities Tech Logo"
              width={48}
              height={48}
              className="w-12 h-12 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Project Management Dashboard</h1>
              <p className="text-sm text-slate-400">Triple Cities Tech</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              ← Back to Website
            </Link>
            <AdminNav />
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  )
}
