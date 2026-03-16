ALTER TABLE "League"
ALTER COLUMN "emailDeliveryMode" SET DEFAULT 'off';

UPDATE "League"
SET "emailDeliveryMode" = 'off'
WHERE "emailDeliveryMode" IN ('all', 'whitelist');
