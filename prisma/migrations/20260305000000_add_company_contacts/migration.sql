-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PhoneType" AS ENUM ('MOBILE', 'WORK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add CUSTOMER_NOTE_ADDED to TaskStatus enum if not exists
DO $$ BEGIN
  ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'CUSTOMER_NOTE_ADDED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "company_contacts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "phoneType" "PhoneType",
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "company_contacts_companyId_email_key" ON "company_contacts"("companyId", "email");

-- AddForeignKey (only if not exists)
DO $$ BEGIN
  ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
