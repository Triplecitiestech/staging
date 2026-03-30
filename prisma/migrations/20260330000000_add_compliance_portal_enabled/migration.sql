-- Add compliance portal visibility toggle to companies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'compliancePortalEnabled'
  ) THEN
    ALTER TABLE companies ADD COLUMN "compliancePortalEnabled" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
