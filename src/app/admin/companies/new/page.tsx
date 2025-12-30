import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import NewCompanyForm from '@/components/companies/NewCompanyForm'

export default async function NewCompanyPage() {
  const session = await auth()

  if (!session) {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Image src="/logo/tctlogo.webp" alt="Logo" width={48} height={48} className="w-12 h-12 object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-white">Create New Company</h1>
                <p className="text-sm text-slate-400">Add a new client company</p>
              </div>
            </div>
            <Link href="/admin/companies" className="px-4 py-2 border border-white/20 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-all">
              Cancel
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NewCompanyForm />
      </main>
    </div>
  )
}
