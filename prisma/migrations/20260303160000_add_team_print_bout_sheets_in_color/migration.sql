-- Team-level default for print color mode on meet bout sheets/wall charts.
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "printBoutSheetsInColor" BOOLEAN NOT NULL DEFAULT false;
