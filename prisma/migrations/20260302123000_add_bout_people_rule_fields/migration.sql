-- Add people-rule assignment metadata for bout mat assignment tracing.
ALTER TABLE "Bout" ADD COLUMN IF NOT EXISTS "assignedByPeopleRule" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Bout" ADD COLUMN IF NOT EXISTS "peopleRuleUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Bout_peopleRuleUserId_idx" ON "Bout"("peopleRuleUserId");
