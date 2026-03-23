import { StaffRole } from "@prisma/client"
import { DefaultSession } from "next-auth"
import { PermissionOverrides } from "@/lib/permissions"

declare module "next-auth" {
  interface Session {
    user: {
      role?: StaffRole
      staffId?: string
      permissionOverrides?: PermissionOverrides | null
    } & DefaultSession["user"]
  }
}
