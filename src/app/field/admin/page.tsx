import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import FieldAdminPanel from '@/components/field/FieldAdminPanel'

export const dynamic = 'force-dynamic'

/**
 * /field/admin — staff management of contractor-portal access. Gated by the
 * same NextAuth (Entra) staff session as /admin; the API routes re-check it.
 * Not a contractor route: the middleware exempts it from the field_session gate.
 */
export default async function FieldAdminPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/admin')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-bold text-white">Contractor Portal — Access</h1>
            <p className="text-sm text-slate-400">Who can open the Field Playbook at /field, and their current sign-in codes.</p>
          </div>
          <Link href="/admin" className="text-sm text-cyan-400 hover:text-cyan-300">← Admin</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <FieldAdminPanel staffEmail={session.user.email} />
      </main>
    </div>
  )
}
