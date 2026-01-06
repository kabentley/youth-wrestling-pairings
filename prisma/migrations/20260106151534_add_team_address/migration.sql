/*
  Warnings:

  - You are about to drop the column `locked` on the `Bout` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "TwoFactorCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetId" TEXT NOT NULL,
    "redId" TEXT NOT NULL,
    "greenId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "notes" TEXT,
    "mat" INTEGER,
    "order" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultWinnerId" TEXT,
    "resultType" TEXT,
    "resultScore" TEXT,
    "resultPeriod" INTEGER,
    "resultTime" TEXT,
    "resultNotes" TEXT,
    "resultAt" DATETIME,
    CONSTRAINT "Bout_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bout_resultWinnerId_fkey" FOREIGN KEY ("resultWinnerId") REFERENCES "Wrestler" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Bout" ("createdAt", "greenId", "id", "mat", "meetId", "notes", "order", "redId", "resultAt", "resultNotes", "resultPeriod", "resultScore", "resultTime", "resultType", "resultWinnerId", "score", "type") SELECT "createdAt", "greenId", "id", "mat", "meetId", "notes", "order", "redId", "resultAt", "resultNotes", "resultPeriod", "resultScore", "resultTime", "resultType", "resultWinnerId", "score", "type" FROM "Bout";
DROP TABLE "Bout";
ALTER TABLE "new_Bout" RENAME TO "Bout";
CREATE INDEX "Bout_meetId_idx" ON "Bout"("meetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TwoFactorCode_userId_idx" ON "TwoFactorCode"("userId");

-- CreateIndex
CREATE INDEX "TwoFactorCode_expiresAt_idx" ON "TwoFactorCode"("expiresAt");
