import NextAuth from "next-auth"
import AzureADProvider from "next-auth/providers/azure-ad"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

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
      // Only allow sign-in for users in the staff_users table
      if (!user.email) return false

      try {
        const staffUser = await prisma.staffUser.findUnique({
          where: { email: user.email }
        })

        if (!staffUser || !staffUser.isActive) {
          console.log(`Sign-in denied for ${user.email} - not in staff_users or inactive`)
          return false
        }

        // Update last login timestamp
        await prisma.staffUser.update({
          where: { email: user.email },
          data: { lastLogin: new Date() }
        })

        return true
      } catch (error) {
        console.error('Error checking staff user:', error)
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
