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
      if (!user.email) return false

      try {
        let staffUser = await prisma.staffUser.findUnique({
          where: { email: user.email }
        })

        if (staffUser && !staffUser.isActive) {
          console.log(`Sign-in denied for ${user.email} - account deactivated`)
          return false
        }

        if (!staffUser) {
          // Auto-provision new team members from Azure AD as TECHNICIAN
          staffUser = await prisma.staffUser.create({
            data: {
              email: user.email,
              name: user.name || user.email.split('@')[0],
              role: 'TECHNICIAN',
              isActive: true,
              lastLogin: new Date(),
            }
          })
          console.log(`Auto-provisioned new staff user: ${user.email} as TECHNICIAN`)
        } else {
          // Update last login timestamp
          await prisma.staffUser.update({
            where: { email: user.email },
            data: { lastLogin: new Date() }
          })
        }

        return true
      } catch (error) {
        console.error('Error during sign-in:', error)
        return false
      }
    },
    async session({ session }) {
      // Add staff role and details to session
      if (session.user?.email) {
        try {
          const staffUser = await prisma.staffUser.findUnique({
            where: { email: session.user.email }
          })

          if (staffUser) {
            session.user.role = staffUser.role
            session.user.staffId = staffUser.id
            session.user.permissionOverrides = parseOverrides(staffUser.permissionOverrides)
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
