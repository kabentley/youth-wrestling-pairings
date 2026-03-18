ALTER TABLE "League"
ADD COLUMN IF NOT EXISTS "welcomeEmailSubjectTemplate" TEXT;

ALTER TABLE "League"
ADD COLUMN IF NOT EXISTS "welcomeEmailBodyTemplate" TEXT;
