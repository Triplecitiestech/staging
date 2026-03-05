-- AlterTable: Add Autotask integration fields to companies
ALTER TABLE "companies" ADD COLUMN "autotaskCompanyId" TEXT;
ALTER TABLE "companies" ADD COLUMN "autotaskLastSync" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "companies_autotaskCompanyId_key" ON "companies"("autotaskCompanyId");

-- AlterTable: Add Autotask integration fields to company_contacts
ALTER TABLE "company_contacts" ADD COLUMN "autotaskContactId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "company_contacts_autotaskContactId_key" ON "company_contacts"("autotaskContactId");

-- AlterTable: Add Autotask integration fields to projects
ALTER TABLE "projects" ADD COLUMN "autotaskProjectId" TEXT;
ALTER TABLE "projects" ADD COLUMN "autotaskLastSync" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "projects_autotaskProjectId_key" ON "projects"("autotaskProjectId");

-- AlterTable: Add Autotask integration fields to phases
ALTER TABLE "phases" ADD COLUMN "autotaskPhaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "phases_autotaskPhaseId_key" ON "phases"("autotaskPhaseId");

-- AlterTable: Add Autotask integration fields to phase_tasks
ALTER TABLE "phase_tasks" ADD COLUMN "autotaskTaskId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "phase_tasks_autotaskTaskId_key" ON "phase_tasks"("autotaskTaskId");

-- CreateTable: Autotask sync log
CREATE TABLE "autotask_sync_logs" (
    "id" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "companiesCreated" INTEGER NOT NULL DEFAULT 0,
    "companiesUpdated" INTEGER NOT NULL DEFAULT 0,
    "projectsCreated" INTEGER NOT NULL DEFAULT 0,
    "projectsUpdated" INTEGER NOT NULL DEFAULT 0,
    "contactsCreated" INTEGER NOT NULL DEFAULT 0,
    "contactsUpdated" INTEGER NOT NULL DEFAULT 0,
    "tasksCreated" INTEGER NOT NULL DEFAULT 0,
    "tasksUpdated" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "autotask_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "autotask_sync_logs_startedAt_idx" ON "autotask_sync_logs"("startedAt");
