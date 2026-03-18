import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;
const MIN_USERNAME_LEN = 6;
const MAX_USERNAME_LEN = 32;

const ImportParentRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  firstName: z.string().trim().max(50).optional().default(""),
  lastName: z.string().trim().max(50).optional().default(""),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  kids: z.array(z.string().trim().min(1)).max(20).optional().default([]),
});

const ImportParentsSchema = z.object({
  password: z.string().trim().optional().default(""),
  rows: z.array(ImportParentRowSchema).min(1).max(500),
});

type ImportParentRow = z.infer<typeof ImportParentRowSchema>;
type TeamWrestlerLookupEntry = {
  id: string;
  firstNormalized: string;
  lastNormalized: string;
  fullNormalized: string;
  firstTokens: string[];
};

const normalizeUsernameToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeNameToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const buildGeneratedUsernameBase = (firstName: string, lastName: string) => {
  const first = normalizeUsernameToken(firstName);
  const last = normalizeUsernameToken(lastName);
  const initial = first.slice(0, 1);
  let base = `${initial}${last}`;
  if (!base) return "";
  if (base.length < MIN_USERNAME_LEN) {
    base = `${base}${"1".repeat(MIN_USERNAME_LEN - base.length)}`;
  }
  if (base.length > MAX_USERNAME_LEN) {
    base = base.slice(0, MAX_USERNAME_LEN);
  }
  return base;
};

const withUsernameSuffix = (base: string, suffix: number) => {
  if (suffix <= 0) return base;
  const suffixText = String(suffix);
  const maxBaseLen = Math.max(1, MAX_USERNAME_LEN - suffixText.length);
  return `${base.slice(0, maxBaseLen)}${suffixText}`;
};

const validateOptionalEmail = (email: string) => {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const parsed = z.string().email().safeParse(trimmed);
  return parsed.success ? null : "Email must be a valid email address.";
};

const normalizeOptionalPhone = (phone: string) => {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return trimmed;
};

const validateOptionalPhone = (phone: string) => {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  return PHONE_PATTERN.test(trimmed) ? null : "Phone must be a valid international number.";
};

const generateTemporaryPassword = () => {
  const digits = randomBytes(6);
  let password = "";
  for (let index = 0; index < 6; index += 1) {
    password += String(digits[index] % 10);
  }
  return password;
};

const buildTeamWrestlerLookup = (teamWrestlers: Array<{ id: string; first: string; last: string }>) => {
  const entries: TeamWrestlerLookupEntry[] = teamWrestlers.map((wrestler) => {
    const firstNormalized = normalizeNameToken(wrestler.first);
    const lastNormalized = normalizeNameToken(wrestler.last);
    return {
      id: wrestler.id,
      firstNormalized,
      lastNormalized,
      fullNormalized: normalizeNameToken(`${wrestler.first} ${wrestler.last}`),
      firstTokens: firstNormalized.split(" ").filter(Boolean),
    };
  });
  const byFullName = new Map(entries.map((entry) => [entry.fullNormalized, entry.id]));
  return { entries, byFullName };
};

const resolveImportedKidName = (
  kidName: string,
  parentLastName: string,
  lookup: ReturnType<typeof buildTeamWrestlerLookup>,
) => {
  const normalizedKid = normalizeNameToken(kidName);
  if (!normalizedKid) {
    return null;
  }

  const exactMatch = lookup.byFullName.get(normalizedKid);
  if (exactMatch) {
    return exactMatch;
  }

  const kidTokens = normalizedKid.split(" ").filter(Boolean);
  if (kidTokens.length !== 1) {
    return null;
  }

  const firstToken = kidTokens[0];
  const normalizedParentLastName = normalizeNameToken(parentLastName);
  const sameFamilyMatches = lookup.entries.filter((entry) =>
    entry.lastNormalized === normalizedParentLastName &&
    (entry.firstNormalized === firstToken || entry.firstTokens.includes(firstToken)),
  );
  if (sameFamilyMatches.length === 1) {
    return sameFamilyMatches[0].id;
  }

  const uniqueFirstMatches = lookup.entries.filter((entry) =>
    entry.firstNormalized === firstToken || entry.firstTokens.includes(firstToken),
  );
  if (uniqueFirstMatches.length === 1) {
    return uniqueFirstMatches[0].id;
  }

  return null;
};

const resolveUsername = async (
  row: ImportParentRow,
  reservedUsernames: Set<string>,
) => {
  const base = buildGeneratedUsernameBase(row.firstName, row.lastName);
  if (!base) {
    return { error: "Unable to generate a username from the provided name." };
  }

  for (let suffix = 0; suffix <= 500; suffix += 1) {
    const candidate = withUsernameSuffix(base, suffix);
    if (reservedUsernames.has(candidate)) continue;
    return {
      username: candidate,
      adjusted: suffix > 0,
    };
  }

  return { error: "Unable to find an available username." };
};

export async function POST(request: Request) {
  const { user } = await requireRole("COACH");
  const url = new URL(request.url);
  const requestedTeamId = url.searchParams.get("teamId");
  const teamId = user.role === "ADMIN" && requestedTeamId
    ? requestedTeamId
    : user.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "You must be assigned a team." }, { status: 403 });
  }
  if (requestedTeamId && user.role !== "ADMIN" && requestedTeamId !== user.teamId) {
    return NextResponse.json({ error: "That team is not assigned to you." }, { status: 403 });
  }

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, symbol: true, headCoachId: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }
  if (user.role !== "ADMIN" && user.id !== team.headCoachId) {
    return NextResponse.json({ error: "Only the head coach or an admin can import parent accounts." }, { status: 403 });
  }

  const parsed = ImportParentsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const payload = parsed.data;
  const sharedPassword = payload.password.trim();
  const useSharedPassword = sharedPassword.length > 0;
  const rowErrors: string[] = [];
  const warningRows: Array<{
    rowNumber: number;
    reason: string;
  }> = [];
  const failedRows: Array<{
    rowNumber: number;
    reason: string;
  }> = [];
  const plannedRows: Array<{
    rowNumber: number;
    firstName: string;
    lastName: string;
    username: string;
    temporaryPassword: string;
    email: string;
    phone: string;
    adjustedUsername: boolean;
    wrestlerIds: string[];
  }> = [];
  const skippedRows: Array<{
    rowNumber: number;
    username: string;
    name: string | null;
    email: string;
    phone: string;
    reason: string;
  }> = [];
  const [existingTeamUsers, existingUsers] = await Promise.all([
    db.user.findMany({
      where: { teamId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phone: true,
      },
    }),
    db.user.findMany({
      select: { username: true },
    }),
  ]);
  const reservedUsernames = new Set(existingUsers.map((entry) => entry.username));
  const existingByName = new Map(
    existingTeamUsers
      .filter((user) => user.name && user.name.trim().length > 0)
      .map((user) => [normalizeNameToken(user.name ?? ""), user] as const),
  );
  const teamWrestlers = await db.wrestler.findMany({
    where: { teamId, active: true },
    select: { id: true, first: true, last: true },
  });
  const wrestlerLookup = buildTeamWrestlerLookup(teamWrestlers);

  for (const row of payload.rows) {
    const firstName = row.firstName.trim();
    const lastName = row.lastName.trim();
    if (!firstName) {
      const reason = "First name is required.";
      rowErrors.push(`Row ${row.rowNumber}: ${reason}`);
      failedRows.push({ rowNumber: row.rowNumber, reason });
      continue;
    }
    if (!lastName) {
      const reason = "Last name is required.";
      rowErrors.push(`Row ${row.rowNumber}: ${reason}`);
      failedRows.push({ rowNumber: row.rowNumber, reason });
      continue;
    }
    const existingUser = existingByName.get(normalizeNameToken(`${firstName} ${lastName}`));
    if (existingUser) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        username: existingUser.username,
        name: existingUser.name,
        email: existingUser.email,
        phone: existingUser.phone,
        reason: "Existing account",
      });
      continue;
    }
    const emailError = validateOptionalEmail(row.email);
    if (emailError) {
      rowErrors.push(`Row ${row.rowNumber}: ${emailError}`);
      failedRows.push({ rowNumber: row.rowNumber, reason: emailError });
      continue;
    }
    const normalizedPhone = normalizeOptionalPhone(row.phone);
    const phoneError = validateOptionalPhone(normalizedPhone);
    if (phoneError) {
      rowErrors.push(`Row ${row.rowNumber}: ${phoneError}`);
      failedRows.push({ rowNumber: row.rowNumber, reason: phoneError });
      continue;
    }
    const wrestlerIds: string[] = [];
    const unknownKids: string[] = [];
    for (const kidName of row.kids) {
      const normalizedKid = kidName.trim().toLowerCase().replace(/\s+/g, " ");
      if (!normalizedKid) continue;
      const wrestlerId = resolveImportedKidName(kidName, lastName, wrestlerLookup);
      if (!wrestlerId) {
        unknownKids.push(kidName.trim());
        continue;
      }
      if (!wrestlerIds.includes(wrestlerId)) {
        wrestlerIds.push(wrestlerId);
      }
    }
    if (unknownKids.length > 0) {
      const reason = `Wrestler${unknownKids.length === 1 ? "" : "s"} not found on this team: ${unknownKids.join(", ")}.`;
      rowErrors.push(
        `Row ${row.rowNumber}: ${reason}`,
      );
      warningRows.push({ rowNumber: row.rowNumber, reason });
    }

    const resolved = await resolveUsername(row, reservedUsernames);
    if (!resolved.username) {
      const reason = resolved.error ?? "Unable to determine username.";
      rowErrors.push(`Row ${row.rowNumber}: ${reason}`);
      failedRows.push({ rowNumber: row.rowNumber, reason });
      continue;
    }

    reservedUsernames.add(resolved.username);
      const temporaryPassword = useSharedPassword
        ? sharedPassword
        : generateTemporaryPassword();
      plannedRows.push({
        rowNumber: row.rowNumber,
        firstName,
        lastName,
        username: resolved.username,
        temporaryPassword,
        email: row.email.trim().toLowerCase(),
        phone: normalizedPhone,
        adjustedUsername: Boolean(resolved.adjusted),
        wrestlerIds,
      });
  }

  if (plannedRows.length === 0) {
    return NextResponse.json({
      error: "Import file has problems.",
      rowErrors,
      warningRows,
      failedRows,
      createdCount: 0,
      skippedCount: skippedRows.length,
      adjustedUsernameCount: 0,
      created: [],
      skipped: skippedRows,
    }, { status: 400 });
  }

  const passwordHashByRow = new Map<number, string>();
  if (useSharedPassword) {
    const sharedPasswordHash = await bcrypt.hash(sharedPassword, 10);
    for (const row of plannedRows) {
      passwordHashByRow.set(row.rowNumber, sharedPasswordHash);
    }
  } else {
    const hashes = await Promise.all(
      plannedRows.map(async (row) => [row.rowNumber, await bcrypt.hash(row.temporaryPassword, 10)] as const),
    );
    for (const [rowNumber, hash] of hashes) {
      passwordHashByRow.set(rowNumber, hash);
    }
  }

  try {
    const adjustedRowNumbers = new Set(
      plannedRows.filter((row) => row.adjustedUsername).map((row) => row.rowNumber),
    );
    const created: Array<{
      rowNumber: number;
      id: string;
      username: string;
      email: string;
      name: string | null;
      temporaryPassword: string;
    }> = [];
    for (const row of plannedRows) {
      const passwordHash = passwordHashByRow.get(row.rowNumber);
      if (!passwordHash) {
        throw new Error(`Missing password hash for import row ${row.rowNumber}.`);
      }
      try {
        const createdUser = await db.$transaction(async (tx) => {
          const userRecord = await tx.user.create({
            data: {
              username: row.username,
              email: row.email,
              phone: row.phone,
              name: `${row.firstName} ${row.lastName}`,
              role: "PARENT",
              teamId,
              passwordHash,
              mustResetPassword: useSharedPassword,
            },
            select: {
              id: true,
              username: true,
              email: true,
              name: true,
            },
          });
          if (row.wrestlerIds.length > 0) {
            await Promise.all(
              row.wrestlerIds.map((wrestlerId) =>
                tx.userChild.create({
                  data: {
                    userId: userRecord.id,
                    wrestlerId,
                  },
                }),
              ),
            );
          }
          return userRecord;
        });
        created.push({
          rowNumber: row.rowNumber,
          ...createdUser,
          temporaryPassword: row.temporaryPassword,
        });
      } catch (error: unknown) {
        let reason = "Unable to import this row.";
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          reason = "A username or account conflict was detected while importing this row.";
        }
        rowErrors.push(`Row ${row.rowNumber}: ${reason}`);
        failedRows.push({ rowNumber: row.rowNumber, reason });
      }
    }
    const league = await db.league.findFirst({
      select: { name: true },
    });
    const leagueName = league?.name?.trim() ?? null;
    await Promise.all(
      created
        .filter((entry) => entry.email.trim().length > 0)
        .map(async (entry) => {
          try {
            await sendWelcomeEmail({
              request,
              email: entry.email,
              username: entry.username,
              userId: entry.id,
              tempPassword: entry.temporaryPassword,
              teamId: team.id,
              teamName: team.name,
              teamLabel: `${team.name} (${team.symbol})`,
              leagueName,
              mustResetPassword: useSharedPassword,
            });
          } catch {
            // Keep the import successful even if one welcome email fails after commit.
          }
        }),
    );

    return NextResponse.json({
      partial: rowErrors.length > 0,
      createdCount: created.length,
      skippedCount: skippedRows.length,
      adjustedUsernameCount: created.filter((entry) => adjustedRowNumbers.has(entry.rowNumber)).length,
      created: created.map((entry) => ({
        rowNumber: entry.rowNumber,
        id: entry.id,
        username: entry.username,
        email: entry.email,
        name: entry.name,
        temporaryPassword: entry.temporaryPassword,
      })),
      skipped: skippedRows,
      warningRows,
      rowErrors,
      failedRows,
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({
        error: "One of the usernames was claimed while the import was running. Please try again.",
      }, { status: 409 });
    }
    throw error;
  }
}
