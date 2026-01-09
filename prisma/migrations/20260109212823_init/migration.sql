-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#000000',
    "address" TEXT,
    "website" TEXT,
    "logoData" BLOB,
    "logoType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "homeTeamPreferSameMat" BOOLEAN NOT NULL DEFAULT false,
    "headCoachId" TEXT,
    CONSTRAINT "Team_headCoachId_fkey" FOREIGN KEY ("headCoachId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "website" TEXT,
    "logoData" BLOB,
    "logoType" TEXT
);

-- CreateTable
CREATE TABLE "Wrestler" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "first" TEXT NOT NULL,
    "last" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "birthdate" DATETIME NOT NULL,
    "experienceYears" INTEGER NOT NULL,
    "skill" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wrestler_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "homeTeamId" TEXT,
    "numMats" INTEGER NOT NULL DEFAULT 4,
    "allowSameTeamMatches" BOOLEAN NOT NULL DEFAULT false,
    "matchesPerWrestler" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT,
    "lockedById" TEXT,
    "lockedAt" DATETIME,
    "lockExpiresAt" DATETIME,
    CONSTRAINT "Meet_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Meet_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Meet_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetWrestlerStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetId" TEXT NOT NULL,
    "wrestlerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MeetWrestlerStatus_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetWrestlerStatus_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetWrestlerStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetId" TEXT NOT NULL,
    "wrestlerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetWrestlerStatusHistory_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetWrestlerStatusHistory_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetWrestlerStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetChange_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "section" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetComment_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMatRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "matIndex" INTEGER NOT NULL,
    "color" TEXT,
    "minExperience" INTEGER NOT NULL,
    "maxExperience" INTEGER NOT NULL,
    "minAge" REAL NOT NULL,
    "maxAge" REAL NOT NULL,
    CONSTRAINT "TeamMatRule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetTeam" (
    "meetId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,

    PRIMARY KEY ("meetId", "teamId"),
    CONSTRAINT "MeetTeam_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bout" (
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

-- CreateTable
CREATE TABLE "ExcludedPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetId" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExcludedPair_meetId_fkey" FOREIGN KEY ("meetId") REFERENCES "Meet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "role" TEXT NOT NULL DEFAULT 'PARENT',
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "emailVerified" DATETIME,
    "image" TEXT,
    "teamId" TEXT,
    "passwordHash" TEXT,
    "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PasswordResetCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TwoFactorCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserChild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wrestlerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserChild_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserChild_wrestlerId_fkey" FOREIGN KEY ("wrestlerId") REFERENCES "Wrestler" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_symbol_key" ON "Team"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Team_headCoachId_key" ON "Team"("headCoachId");

-- CreateIndex
CREATE UNIQUE INDEX "Wrestler_guid_key" ON "Wrestler"("guid");

-- CreateIndex
CREATE INDEX "Wrestler_teamId_idx" ON "Wrestler"("teamId");

-- CreateIndex
CREATE INDEX "Wrestler_last_first_idx" ON "Wrestler"("last", "first");

-- CreateIndex
CREATE UNIQUE INDEX "Wrestler_teamId_first_last_key" ON "Wrestler"("teamId", "first", "last");

-- CreateIndex
CREATE INDEX "MeetWrestlerStatus_meetId_idx" ON "MeetWrestlerStatus"("meetId");

-- CreateIndex
CREATE INDEX "MeetWrestlerStatus_wrestlerId_idx" ON "MeetWrestlerStatus"("wrestlerId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetWrestlerStatus_meetId_wrestlerId_key" ON "MeetWrestlerStatus"("meetId", "wrestlerId");

-- CreateIndex
CREATE INDEX "MeetWrestlerStatusHistory_meetId_idx" ON "MeetWrestlerStatusHistory"("meetId");

-- CreateIndex
CREATE INDEX "MeetWrestlerStatusHistory_wrestlerId_idx" ON "MeetWrestlerStatusHistory"("wrestlerId");

-- CreateIndex
CREATE INDEX "MeetWrestlerStatusHistory_changedById_idx" ON "MeetWrestlerStatusHistory"("changedById");

-- CreateIndex
CREATE INDEX "MeetChange_meetId_idx" ON "MeetChange"("meetId");

-- CreateIndex
CREATE INDEX "MeetChange_actorId_idx" ON "MeetChange"("actorId");

-- CreateIndex
CREATE INDEX "MeetComment_meetId_idx" ON "MeetComment"("meetId");

-- CreateIndex
CREATE INDEX "MeetComment_authorId_idx" ON "MeetComment"("authorId");

-- CreateIndex
CREATE INDEX "TeamMatRule_teamId_idx" ON "TeamMatRule"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMatRule_teamId_matIndex_key" ON "TeamMatRule"("teamId", "matIndex");

-- CreateIndex
CREATE INDEX "Bout_meetId_idx" ON "Bout"("meetId");

-- CreateIndex
CREATE INDEX "ExcludedPair_meetId_idx" ON "ExcludedPair"("meetId");

-- CreateIndex
CREATE UNIQUE INDEX "ExcludedPair_meetId_aId_bId_key" ON "ExcludedPair"("meetId", "aId", "bId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "PasswordResetCode_userId_idx" ON "PasswordResetCode"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetCode_expiresAt_idx" ON "PasswordResetCode"("expiresAt");

-- CreateIndex
CREATE INDEX "TwoFactorCode_userId_idx" ON "TwoFactorCode"("userId");

-- CreateIndex
CREATE INDEX "TwoFactorCode_expiresAt_idx" ON "TwoFactorCode"("expiresAt");

-- CreateIndex
CREATE INDEX "UserChild_userId_idx" ON "UserChild"("userId");

-- CreateIndex
CREATE INDEX "UserChild_wrestlerId_idx" ON "UserChild"("wrestlerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserChild_userId_wrestlerId_key" ON "UserChild"("userId", "wrestlerId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
