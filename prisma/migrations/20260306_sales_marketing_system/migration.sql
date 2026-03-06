-- Sales & Marketing System Migration
-- Creates audience, campaign, recipient, and audit tables
-- Also adds soft-delete support and blog post campaign link

-- Enums
CREATE TYPE "AudienceProviderType" AS ENUM ('AUTOTASK', 'HUBSPOT', 'CSV_IMPORT', 'MANUAL');
CREATE TYPE "CommunicationContentType" AS ENUM ('CYBERSECURITY_ALERT', 'SERVICE_UPDATE', 'MAINTENANCE_NOTICE', 'VENDOR_NOTICE', 'BEST_PRACTICE', 'COMPANY_ANNOUNCEMENT', 'GENERAL_COMMUNICATION');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'GENERATING', 'CONTENT_READY', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'BOUNCED');

-- Audience Sources
CREATE TABLE "audience_sources" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "providerType" "AudienceProviderType" NOT NULL,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audience_sources_pkey" PRIMARY KEY ("id")
);

-- Audiences
CREATE TABLE "audiences" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceId" TEXT NOT NULL,
    "providerType" "AudienceProviderType" NOT NULL,
    "filterCriteria" JSONB NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audiences_pkey" PRIMARY KEY ("id")
);

-- Communication Campaigns
CREATE TABLE "communication_campaigns" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "contentType" "CommunicationContentType" NOT NULL,
    "topic" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedTitle" TEXT,
    "generatedExcerpt" TEXT,
    "generatedContent" TEXT,
    "generatedMetaTitle" TEXT,
    "generatedMetaDescription" TEXT,
    "generatedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiModel" TEXT,
    "aiPrompt" TEXT,
    "emailSubject" TEXT,
    "emailPreviewText" TEXT,
    "emailBodyHtml" TEXT,
    "blogPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailTotalCount" INTEGER NOT NULL DEFAULT 0,
    "emailSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "emailFailureCount" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "lastModifiedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "communication_campaigns_pkey" PRIMARY KEY ("id")
);

-- Campaign Recipients
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyName" TEXT,
    "companyId" TEXT,
    "emailStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "sourceContactId" TEXT,
    "sourceType" "AudienceProviderType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- Campaign Audit Logs
CREATE TABLE "campaign_audit_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "campaignId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "staffEmail" TEXT NOT NULL,
    "staffName" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Deleted Records (soft-delete support)
CREATE TABLE "deleted_records" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityData" JSONB NOT NULL,
    "relatedData" JSONB,
    "deletedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),
    "restoredBy" TEXT,
    CONSTRAINT "deleted_records_pkey" PRIMARY KEY ("id")
);

-- Add campaignId to blog_posts
ALTER TABLE "blog_posts" ADD COLUMN "campaignId" TEXT;

-- Foreign keys
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "audience_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_campaigns" ADD CONSTRAINT "communication_campaigns_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "audiences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "communication_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_audit_logs" ADD CONSTRAINT "campaign_audit_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "communication_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "communication_campaigns_status_idx" ON "communication_campaigns"("status");
CREATE INDEX "communication_campaigns_createdAt_idx" ON "communication_campaigns"("createdAt");
CREATE INDEX "communication_campaigns_contentType_idx" ON "communication_campaigns"("contentType");
CREATE INDEX "campaign_recipients_campaignId_idx" ON "campaign_recipients"("campaignId");
CREATE INDEX "campaign_recipients_email_idx" ON "campaign_recipients"("email");
CREATE INDEX "campaign_recipients_emailStatus_idx" ON "campaign_recipients"("emailStatus");
CREATE INDEX "campaign_audit_logs_campaignId_idx" ON "campaign_audit_logs"("campaignId");
CREATE INDEX "campaign_audit_logs_createdAt_idx" ON "campaign_audit_logs"("createdAt");
CREATE INDEX "deleted_records_entityType_entityId_idx" ON "deleted_records"("entityType", "entityId");
CREATE INDEX "deleted_records_deletedAt_idx" ON "deleted_records"("deletedAt");
