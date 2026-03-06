-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'error',
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "userId" TEXT,
    "metadata" JSONB,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_logs_source_level_idx" ON "error_logs"("source", "level");
CREATE INDEX "error_logs_lastSeen_idx" ON "error_logs"("lastSeen");
CREATE INDEX "error_logs_resolved_idx" ON "error_logs"("resolved");
CREATE INDEX "error_logs_message_idx" ON "error_logs"("message");
