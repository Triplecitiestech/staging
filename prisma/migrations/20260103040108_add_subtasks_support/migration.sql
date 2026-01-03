-- AlterTable
ALTER TABLE "phase_tasks" ADD COLUMN "parentTaskId" TEXT;

-- AddForeignKey
ALTER TABLE "phase_tasks" ADD CONSTRAINT "phase_tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "phase_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
