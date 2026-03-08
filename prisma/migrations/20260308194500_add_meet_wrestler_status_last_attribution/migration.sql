ALTER TABLE "MeetWrestlerStatus"
ADD COLUMN "lastChangedById" TEXT,
ADD COLUMN "lastChangedByUsername" TEXT,
ADD COLUMN "lastChangedByRole" TEXT,
ADD COLUMN "lastChangedSource" TEXT,
ADD COLUMN "lastChangedAt" TIMESTAMP(3);
