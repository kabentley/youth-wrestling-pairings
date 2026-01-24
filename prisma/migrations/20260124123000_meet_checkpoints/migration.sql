-- Create MeetCheckpoint table
CREATE TABLE "MeetCheckpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "meetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payload" JSON NOT NULL,
  "teamSignature" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "MeetCheckpoint_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetCheckpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MeetCheckpoint_meetId_idx" ON "MeetCheckpoint"("meetId");
CREATE INDEX "MeetCheckpoint_createdById_idx" ON "MeetCheckpoint"("createdById");
