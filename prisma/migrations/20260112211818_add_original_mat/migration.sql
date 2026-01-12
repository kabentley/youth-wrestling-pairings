/*
  Warnings:

  - You are about to drop the `ExcludedPair` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Bout" ADD COLUMN "originalMat" INTEGER;
UPDATE "Bout" SET "originalMat" = "mat";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ExcludedPair";
PRAGMA foreign_keys=on;
