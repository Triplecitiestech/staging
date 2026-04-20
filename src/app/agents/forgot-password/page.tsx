import Image from 'next/image'
import Link from 'next/link'
import ForgotPasswordForm from '@/components/agents/ForgotPasswordForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Forgot Password · Triple Cities Tech Agent Portal',
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
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
          <h1 className="text-2xl font-bold text-white">Reset Your Password</h1>
          <p className="text-sm text-slate-400 mt-2">
            Enter the email associated with your agent account and we'll send you a reset link.
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-8">
          <ForgotPasswordForm />
          <div className="mt-6 text-center">
            <Link href="/agents/login" className="text-sm text-cyan-400 hover:text-cyan-300">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
