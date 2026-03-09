import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

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

const normalizeUsernameToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeNameToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const buildGeneratedUsernameBase = (firstName: string, lastName: string) => {
  const first = normalizeUsernameToken(firstName);
  const last = normalizeUsernameToken(lastName);
  const initial = first.slice(0, 1);
  let base = `${initial}${last}`;
  if (!base) return "";
  if (base.startsWith("oauth")) {
    base = `u${base}`;
  }
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
    select: { id: true, headCoachId: true },
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
  const wrestlerNameMap = new Map<string, string>();
  for (const wrestler of teamWrestlers) {
    wrestlerNameMap.set(
      `${wrestler.first.trim().toLowerCase()} ${wrestler.last.trim().toLowerCase()}`,
      wrestler.id,
    );
  }

  for (const row of payload.rows) {
    const firstName = row.firstName.trim();
    const lastName = row.lastName.trim();
    if (!firstName) {
      rowErrors.push(`Row ${row.rowNumber}: First name is required.`);
      continue;
    }
    if (!lastName) {
      rowErrors.push(`Row ${row.rowNumber}: Last name is required.`);
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
      continue;
    }
    const normalizedPhone = normalizeOptionalPhone(row.phone);
    const phoneError = validateOptionalPhone(normalizedPhone);
    if (phoneError) {
      rowErrors.push(`Row ${row.rowNumber}: ${phoneError}`);
      continue;
    }
    const wrestlerIds: string[] = [];
    const unknownKids: string[] = [];
    for (const kidName of row.kids) {
      const normalizedKid = kidName.trim().toLowerCase().replace(/\s+/g, " ");
      if (!normalizedKid) continue;
      const wrestlerId = wrestlerNameMap.get(normalizedKid);
      if (!wrestlerId) {
        unknownKids.push(kidName.trim());
        continue;
      }
      if (!wrestlerIds.includes(wrestlerId)) {
        wrestlerIds.push(wrestlerId);
      }
    }
    if (unknownKids.length > 0) {
      rowErrors.push(
        `Row ${row.rowNumber}: Wrestler${unknownKids.length === 1 ? "" : "s"} not found on this team: ${unknownKids.join(", ")}.`,
      );
      continue;
    }

    const resolved = await resolveUsername(row, reservedUsernames);
    if (!resolved.username) {
      rowErrors.push(`Row ${row.rowNumber}: ${resolved.error ?? "Unable to determine username."}`);
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

  if (rowErrors.length > 0) {
    return NextResponse.json({
      error: "Import file has problems.",
      rowErrors,
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
    const created = await db.$transaction(async (tx) => {
      const createdUsers: Array<{
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
        const createdUser = await tx.user.create({
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
                  userId: createdUser.id,
                  wrestlerId,
                },
              }),
            ),
          );
        }
        createdUsers.push({
          rowNumber: row.rowNumber,
          ...createdUser,
          temporaryPassword: row.temporaryPassword,
        });
      }
      return createdUsers;
    });

    return NextResponse.json({
      createdCount: created.length,
      skippedCount: skippedRows.length,
      adjustedUsernameCount: plannedRows.filter((row) => row.adjustedUsername).length,
      created: created.map((entry) => ({
        rowNumber: entry.rowNumber,
        id: entry.id,
        username: entry.username,
        email: entry.email,
        name: entry.name,
        temporaryPassword: entry.temporaryPassword,
      })),
      skipped: skippedRows,
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
