import Image from 'next/image'
import Link from 'next/link'
import SetPasswordForm from '@/components/agents/SetPasswordForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Set Your Password · Triple Cities Tech Agent Portal',
  robots: { index: false, follow: false },
}

interface SearchParams {
  token?: string
}

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const token = sp.token || ''

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/logo/tctlogo.webp"
            alt="Triple Cities Tech"
            width={64}
            height={64}
            className="w-16 h-16 mx-auto object-contain mb-4"
          />
          <h1 className="text-2xl font-bold text-white">Set Your Password</h1>
          <p className="text-sm text-slate-400 mt-2">
            Choose a strong password for your agent portal account.
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-8">
          {token
            ? <SetPasswordForm token={token} />
            : (
              <div className="text-sm text-slate-300">
                This page requires a valid token from your welcome or reset email.
                If your link expired, ask your TCT contact to send a new one or use{' '}
                <Link href="/agents/forgot-password" className="text-cyan-400 hover:text-cyan-300">forgot password</Link>.
              </div>
            )}
        </div>
      </div>
    </main>
  )
}
