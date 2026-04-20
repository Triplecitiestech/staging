import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getCurrentAgent } from '@/lib/agent-auth'
import LoginForm from '@/components/agents/LoginForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Agent Sign In · Triple Cities Tech',
  robots: { index: false, follow: false },
}

export default async function AgentLoginPage() {
  const agent = await getCurrentAgent()
  if (agent) redirect('/agents/dashboard')

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
          <h1 className="text-2xl font-bold text-white">Agent Portal Sign In</h1>
          <p className="text-sm text-slate-400 mt-2">Triple Cities Tech Referral Program</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-8">
          <LoginForm />
          <div className="mt-6 text-center">
            <Link href="/agents/forgot-password" className="text-sm text-cyan-400 hover:text-cyan-300">
              Forgot your password?
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          New agents are invited by Triple Cities Tech staff. If you don't have an account yet,
          contact <a href="mailto:sales@triplecitiestech.com" className="text-cyan-400 hover:text-cyan-300">sales@triplecitiestech.com</a>.
        </p>
      </div>
    </main>
  )
}
