-- Overtime request workflow (separate from PTO)
-- Parallel two-stage approval: PENDING_INTAKE → PENDING_APPROVAL →
-- APPROVED / DENIED / CANCELLED. Simpler than PTO — no calendar sync,
-- no coverage picker. HR (e.g. Rio) marks approved overtime as
-- "recorded in payroll" to close the loop.

DO $$ BEGIN
  CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING_INTAKE', 'PENDING_APPROVAL', 'APPROVED', 'DENIED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "overtime_requests" (
  "id" TEXT NOT NULL,
  "employeeStaffId" TEXT NOT NULL,
  "employeeEmail" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "startTime" TEXT,
  "estimatedHours" DECIMAL(5,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING_INTAKE',
  "intakeByStaffId" TEXT,
  "intakeByName" TEXT,
  "intakeAt" TIMESTAMP(3),
  "intakeNotes" TEXT,
  "intakeSkipped" BOOLEAN NOT NULL DEFAULT false,
  "intakeNotifiedAt" TIMESTAMP(3),
  "reviewedByStaffId" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "managerNotes" TEXT,
  "actualHoursWorked" DECIMAL(5,2),
  "payrollRecordedAt" TIMESTAMP(3),
  "payrollRecordedByStaffId" TEXT,
  "payrollRecordedByName" TEXT,
  "submitterNotifiedAt" TIMESTAMP(3),
  "approversNotifiedAt" TIMESTAMP(3),
  "employeeNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "overtime_requests_employeeStaffId_status_idx"
  ON "overtime_requests"("employeeStaffId", "status");
CREATE INDEX IF NOT EXISTS "overtime_requests_status_workDate_idx"
  ON "overtime_requests"("status", "workDate");

CREATE TABLE IF NOT EXISTS "overtime_audit_logs" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorStaffId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "actorName" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overtime_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "overtime_audit_logs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "overtime_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "overtime_audit_logs_requestId_createdAt_idx"
  ON "overtime_audit_logs"("requestId", "createdAt" DESC);
