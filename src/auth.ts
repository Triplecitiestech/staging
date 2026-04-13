import NextAuth from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { parseOverrides } from "@/lib/permissions"

async function setSignInDebug(reason: string, detail?: string) {
  try {
    const store = await cookies()
    const payload = JSON.stringify({
      reason,
      detail: detail ?? null,
      ts: new Date().toISOString(),
    })
    store.set('tct_signin_debug', payload, {
      httpOnly: false, // readable by the error page client-side too
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    })
  } catch {
    // headers() may be read-only in some contexts — non-fatal
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      // Allow sign-in for any Azure AD user in the tenant
      // Auto-provision as TECHNICIAN if not already in staff_users
      const rawEmail = user?.email ?? (profile as { email?: string; preferred_username?: string } | undefined)?.email
      const rawUpn = (profile as { preferred_username?: string } | undefined)?.preferred_username ?? null

      if (!rawEmail && !rawUpn) {
        console.warn('[auth] Sign-in denied: no email on Azure AD user', { user, profile })
        await setSignInDebug('no_email', `profile keys: ${Object.keys(profile ?? {}).join(',')}`)
        return false
      }

      const email = (rawEmail ?? rawUpn)!.toLowerCase()

      try {
        // Case-insensitive lookup so "Ben@tct.com" matches "ben@tct.com"
        const staffUser = await prisma.staffUser.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true, email: true, name: true, role: true, isActive: true },
        })

        if (staffUser && !staffUser.isActive) {
          console.warn(`[auth] Sign-in denied for ${email}: account is deactivated (staffId=${staffUser.id})`)
          await setSignInDebug('deactivated', `staffId=${staffUser.id}`)
          return false
        }

        if (!staffUser) {
          // Auto-provision new team members from Azure AD as TECHNICIAN
          const created = await prisma.staffUser.create({
            data: {
              email,
              name: user?.name || email.split('@')[0],
              role: 'TECHNICIAN',
              isActive: true,
              lastLogin: new Date(),
            }
          })
          console.log(`[auth] Auto-provisioned new staff user: ${email} as TECHNICIAN (id=${created.id})`)
        } else {
          // Update last login timestamp
          await prisma.staffUser.update({
            where: { id: staffUser.id },
            data: { lastLogin: new Date() }
          })
        }

        return true
      } catch (error) {
        console.error(`[auth] Sign-in error for ${email}:`, error)
        await setSignInDebug('exception', error instanceof Error ? error.message : String(error))
        return false
      }
    },
    async session({ session }) {
      // Add staff role and details to session
      if (session.user?.email) {
        try {
          // Use explicit select to avoid crashes from missing columns
          const staffUser = await prisma.staffUser.findUnique({
            where: { email: session.user.email },
            select: {
              id: true,
              role: true,
              lastLogin: true,
              permissionOverrides: true,
            },
          })

          if (staffUser) {
            session.user.role = staffUser.role
            session.user.staffId = staffUser.id
            session.user.permissionOverrides = parseOverrides(staffUser.permissionOverrides)

            // Keep lastLogin fresh — update if stale by more than 1 hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
            if (!staffUser.lastLogin || staffUser.lastLogin < oneHourAgo) {
              prisma.staffUser.update({
                where: { id: staffUser.id },
                data: { lastLogin: new Date() },
              }).catch(() => {}) // fire-and-forget, don't block session
            }
          }
        } catch (error) {
          console.error('Error fetching staff user for session:', error)
        }
      }

      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: "database",
  },
})
