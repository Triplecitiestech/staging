-- PTO coverage approval flow.
-- When an employee submits a PTO request they pick a covering teammate
-- from a dropdown. That teammate receives an email with accept/decline
-- buttons; their response is shown to HR during intake and to the final
-- approver before approval. All new columns are optional so old requests
-- that used the free-form `coverage` text field remain valid.

ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageStaffId" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageStaffName" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageStaffEmail" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageResponse" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageRespondedAt" TIMESTAMP(3);
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageResponseNotes" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageToken" TEXT;
ALTER TABLE "time_off_requests" ADD COLUMN IF NOT EXISTS "coverageRequestSentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "time_off_requests_coverageToken_key"
  ON "time_off_requests"("coverageToken");
