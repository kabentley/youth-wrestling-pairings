-- Add isGirl column to Wrestler with default false.
ALTER TABLE "Wrestler" ADD COLUMN "isGirl" BOOLEAN NOT NULL DEFAULT false;
-- Add girlsWrestleGirls setting to Meet.
ALTER TABLE "Meet" ADD COLUMN "girlsWrestleGirls" BOOLEAN NOT NULL DEFAULT false;
