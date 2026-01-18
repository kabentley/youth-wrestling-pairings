-- AlterTable
ALTER TABLE "Meet" ADD COLUMN     "maxMatchesPerWrestler" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "restGap" INTEGER NOT NULL DEFAULT 6,
ALTER COLUMN "matchesPerWrestler" SET DEFAULT 2;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "defaultMaxAgeGapDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN     "defaultMaxMatchesPerWrestler" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "defaultRestGap" INTEGER NOT NULL DEFAULT 6,
ALTER COLUMN "homeTeamPreferSameMat" SET DEFAULT true;
