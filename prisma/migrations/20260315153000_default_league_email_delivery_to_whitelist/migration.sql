ALTER TABLE "League"
ALTER COLUMN "emailDeliveryMode" SET DEFAULT 'whitelist';

UPDATE "League"
SET "emailDeliveryMode" = 'whitelist'
WHERE "emailDeliveryMode" = 'all';
