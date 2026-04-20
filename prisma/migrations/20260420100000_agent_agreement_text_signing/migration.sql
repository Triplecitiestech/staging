-- Extend agent_agreements to support in-portal text agreements with
-- typed-name e-signatures, in addition to the legacy pre-signed PDF/DOCX
-- upload flow. Both modes coexist on the same row; admin picks one.

-- Make file columns nullable (text-only agreements have no file).
ALTER TABLE "agent_agreements" ALTER COLUMN "fileData"         DROP NOT NULL;
ALTER TABLE "agent_agreements" ALTER COLUMN "originalFilename" DROP NOT NULL;
ALTER TABLE "agent_agreements" ALTER COLUMN "mimeType"         DROP NOT NULL;
ALTER TABLE "agent_agreements" ALTER COLUMN "fileSize"         DROP NOT NULL;

-- Text agreement content + e-signature fields.
ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "contentText"     TEXT;
ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedName"      TEXT;
ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedAt"        TIMESTAMP(3);
ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedIp"        TEXT;
ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "signedUserAgent" TEXT;
ALTER TABLE "agent_agreements" ADD COLUMN IF NOT EXISTS "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
