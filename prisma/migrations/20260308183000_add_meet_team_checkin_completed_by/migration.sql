ALTER TABLE "MeetTeam" ADD COLUMN IF NOT EXISTS "checkinCompletedById" TEXT;
CREATE INDEX IF NOT EXISTS "MeetTeam_checkinCompletedById_idx" ON "MeetTeam"("checkinCompletedById");
