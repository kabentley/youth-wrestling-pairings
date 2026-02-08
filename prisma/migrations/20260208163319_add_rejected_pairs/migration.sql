-- AlterTable
ALTER TABLE "Meet" ALTER COLUMN "girlsWrestleGirls" SET DEFAULT true;

-- CreateTable
CREATE TABLE "MeetRejectedPair" (
    "id" TEXT NOT NULL,
    "meetId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "wrestlerAId" TEXT NOT NULL,
    "wrestlerBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "MeetRejectedPair_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetRejectedPair_meetId_idx" ON "MeetRejectedPair"("meetId");

-- CreateIndex
CREATE INDEX "MeetRejectedPair_wrestlerAId_idx" ON "MeetRejectedPair"("wrestlerAId");

-- CreateIndex
CREATE INDEX "MeetRejectedPair_wrestlerBId_idx" ON "MeetRejectedPair"("wrestlerBId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetRejectedPair_meetId_pairKey_key" ON "MeetRejectedPair"("meetId", "pairKey");

-- AddForeignKey
ALTER TABLE "MeetRejectedPair" ADD CONSTRAINT "MeetRejectedPair_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetRejectedPair" ADD CONSTRAINT "MeetRejectedPair_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetRejectedPair" ADD CONSTRAINT "MeetRejectedPair_wrestlerAId_fkey" FOREIGN KEY ("wrestlerAId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetRejectedPair" ADD CONSTRAINT "MeetRejectedPair_wrestlerBId_fkey" FOREIGN KEY ("wrestlerBId") REFERENCES "Wrestler"("id") ON DELETE CASCADE ON UPDATE CASCADE;
