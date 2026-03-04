CREATE TABLE IF NOT EXISTS "MeetLockAccess" (
  "meetId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetLockAccess_pkey" PRIMARY KEY ("meetId", "userId"),
  CONSTRAINT "MeetLockAccess_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MeetLockAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "MeetLockAccess_userId_idx" ON "MeetLockAccess"("userId");
