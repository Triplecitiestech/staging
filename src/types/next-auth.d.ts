import { StaffRole } from "@prisma/client"
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      role?: StaffRole
      staffId?: string
    } & DefaultSession["user"]
  }
}
