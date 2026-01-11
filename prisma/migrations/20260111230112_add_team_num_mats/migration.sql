-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#000000',
    "address" TEXT,
    "website" TEXT,
    "logoData" BLOB,
    "logoType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "numMats" INTEGER NOT NULL DEFAULT 4,
    "homeTeamPreferSameMat" BOOLEAN NOT NULL DEFAULT false,
    "headCoachId" TEXT,
    CONSTRAINT "Team_headCoachId_fkey" FOREIGN KEY ("headCoachId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("address", "color", "createdAt", "headCoachId", "homeTeamPreferSameMat", "id", "logoData", "logoType", "name", "symbol", "website") SELECT "address", "color", "createdAt", "headCoachId", "homeTeamPreferSameMat", "id", "logoData", "logoType", "name", "symbol", "website" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");
CREATE UNIQUE INDEX "Team_symbol_key" ON "Team"("symbol");
CREATE UNIQUE INDEX "Team_headCoachId_key" ON "Team"("headCoachId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
