-- Add soft-delete fields to Meet
ALTER TABLE "Meet" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Meet" ADD COLUMN "deletedById" TEXT;

-- Optional index for filtering non-deleted meets
CREATE INDEX "Meet_deletedAt_idx" ON "Meet"("deletedAt");

-- Track who deleted the meet
ALTER TABLE "Meet"
  ADD CONSTRAINT "Meet_deletedById_fkey"
  FOREIGN KEY ("deletedById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
