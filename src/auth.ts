import NextAuth from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { parseOverrides } from "@/lib/permissions"

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
    async signIn({ user }) {
      // Allow sign-in for any Azure AD user in the tenant
      // Auto-provision as TECHNICIAN if not already in staff_users
      if (!user.email) {
        console.warn('[auth] Sign-in denied: no email on Azure AD user')
        return false
      }

      try {
        // Case-insensitive lookup so "Ben@tct.com" matches "ben@tct.com"
        const staffUser = await prisma.staffUser.findFirst({
          where: { email: { equals: user.email, mode: 'insensitive' } },
          select: { id: true, email: true, name: true, role: true, isActive: true },
        })

        if (staffUser && !staffUser.isActive) {
          console.warn(`[auth] Sign-in denied for ${user.email}: account is deactivated (staffId=${staffUser.id})`)
          return false
        }

        if (!staffUser) {
          // Auto-provision new team members from Azure AD as TECHNICIAN
          const created = await prisma.staffUser.create({
            data: {
              email: user.email.toLowerCase(),
              name: user.name || user.email.split('@')[0],
              role: 'TECHNICIAN',
              isActive: true,
              lastLogin: new Date(),
            }
          })
          console.log(`[auth] Auto-provisioned new staff user: ${user.email} as TECHNICIAN (id=${created.id})`)
        } else {
          // Update last login timestamp
          await prisma.staffUser.update({
            where: { id: staffUser.id },
            data: { lastLogin: new Date() }
          })
        }

        return true
      } catch (error) {
        console.error(`[auth] Sign-in error for ${user.email}:`, error)
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
