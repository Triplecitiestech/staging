'use client'

import { signIn, signOut } from 'next-auth/react'

export function SignInButton() {
  return (
    <button
      onClick={() => signIn('azure-ad', { callbackUrl: '/admin' })}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/>
      </svg>
      Sign in with Microsoft
    </button>
  )
}

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="w-full flex items-center justify-center gap-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white font-medium py-2 px-3 rounded-lg transition-colors text-sm border border-slate-600/50 hover:border-slate-500/50"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      Sign Out
    </button>
  )
}
