-- PTO / Time-Off System
-- Creates: gusto_connections, pto_employee_mappings, time_off_requests, time_off_audit_logs

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TimeOffRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TimeOffRequestKind" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'BEREAVEMENT', 'JURY_DUTY', 'UNPAID', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: gusto_connections
CREATE TABLE IF NOT EXISTS "gusto_connections" (
  "id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "companyUuid" TEXT,
  "companyName" TEXT,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "scope" TEXT,
  "connectedByEmail" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRefreshedAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncStatus" TEXT,
  "lastSyncError" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gusto_connections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "gusto_connections_isActive_idx" ON "gusto_connections"("isActive");

-- CreateTable: pto_employee_mappings
CREATE TABLE IF NOT EXISTS "pto_employee_mappings" (
  "id" TEXT NOT NULL,
  "staffUserId" TEXT NOT NULL,
  "staffEmail" TEXT NOT NULL,
  "gustoEmployeeUuid" TEXT NOT NULL,
  "gustoWorkEmail" TEXT,
  "gustoPersonalEmail" TEXT,
  "gustoFirstName" TEXT,
  "gustoLastName" TEXT,
  "matchMethod" TEXT NOT NULL,
  "mappedByStaffId" TEXT,
  "lastGustoSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pto_employee_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pto_employee_mappings_staffUserId_key" ON "pto_employee_mappings"("staffUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "pto_employee_mappings_gustoEmployeeUuid_key" ON "pto_employee_mappings"("gustoEmployeeUuid");
CREATE INDEX IF NOT EXISTS "pto_employee_mappings_staffEmail_idx" ON "pto_employee_mappings"("staffEmail");
CREATE INDEX IF NOT EXISTS "pto_employee_mappings_gustoEmployeeUuid_idx" ON "pto_employee_mappings"("gustoEmployeeUuid");

-- CreateTable: time_off_requests
CREATE TABLE IF NOT EXISTS "time_off_requests" (
  "id" TEXT NOT NULL,
  "mappingId" TEXT NOT NULL,
  "employeeStaffId" TEXT NOT NULL,
  "employeeEmail" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "gustoEmployeeUuid" TEXT NOT NULL,
  "kind" "TimeOffRequestKind" NOT NULL DEFAULT 'VACATION',
  "gustoPolicyUuid" TEXT,
  "gustoPolicyName" TEXT,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "hoursPerDay" JSONB DEFAULT '{}',
  "totalHours" DECIMAL(7, 2) NOT NULL,
  "notes" TEXT,
  "coverage" TEXT,
  "status" "TimeOffRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByStaffId" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "managerNotes" TEXT,
  "gustoBalanceAdjustmentAt" TIMESTAMP(3),
  "gustoSyncStatus" TEXT,
  "gustoSyncError" TEXT,
  "gustoSyncAttempts" INTEGER NOT NULL DEFAULT 0,
  "graphEventId" TEXT,
  "graphInviteEventId" TEXT,
  "graphSyncStatus" TEXT,
  "graphSyncError" TEXT,
  "graphSyncAttempts" INTEGER NOT NULL DEFAULT 0,
  "submitterNotifiedAt" TIMESTAMP(3),
  "approversNotifiedAt" TIMESTAMP(3),
  "employeeNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "time_off_requests_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "pto_employee_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "time_off_requests_employeeStaffId_status_idx" ON "time_off_requests"("employeeStaffId", "status");
CREATE INDEX IF NOT EXISTS "time_off_requests_status_startDate_idx" ON "time_off_requests"("status", "startDate");
CREATE INDEX IF NOT EXISTS "time_off_requests_startDate_endDate_idx" ON "time_off_requests"("startDate", "endDate");

-- CreateTable: time_off_audit_logs
CREATE TABLE IF NOT EXISTS "time_off_audit_logs" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorStaffId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "actorName" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_off_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "time_off_audit_logs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "time_off_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "time_off_audit_logs_requestId_createdAt_idx" ON "time_off_audit_logs"("requestId", "createdAt" DESC);
