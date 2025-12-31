-- Database Migrations for Triple Cities Tech
-- Run these commands in your Vercel Postgres query console or database dashboard

-- Add notes column to phase_tasks table
ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add invite tracking columns to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invite_count INTEGER DEFAULT 0;

-- Verify the migrations worked
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'phase_tasks' AND column_name = 'notes';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'companies' AND column_name IN ('invited_at', 'invite_count');
