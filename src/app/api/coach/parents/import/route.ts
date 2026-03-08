import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  username: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  kids: z.array(z.string().trim().min(1)).max(20).optional().default([]),
});

const ImportParentsSchema = z.object({
  password: z.string().trim().min(1),
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

const validateExplicitUsername = (username: string) => {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return "Username is required.";
  if (normalized.includes("@")) return "Username may not contain @.";
  if (normalized.startsWith("oauth-")) return "Choose a different username.";
  if (normalized.length < MIN_USERNAME_LEN) return `Username must be at least ${MIN_USERNAME_LEN} characters.`;
  if (normalized.length > MAX_USERNAME_LEN) return `Username must be at most ${MAX_USERNAME_LEN} characters.`;
  return null;
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

const resolveUsername = async (
  row: ImportParentRow,
  usedUsernames: Set<string>,
) => {
  const explicitUsername = row.username.trim().toLowerCase();
  if (explicitUsername) {
    const explicitError = validateExplicitUsername(explicitUsername);
    if (explicitError) return { error: explicitError };
  }

  const base = explicitUsername || buildGeneratedUsernameBase(row.firstName, row.lastName);
  if (!base) {
    return { error: "Unable to generate a username from the provided name." };
  }

  for (let suffix = 0; suffix <= 500; suffix += 1) {
    const candidate = withUsernameSuffix(base, suffix);
    if (usedUsernames.has(candidate)) continue;
    const existing = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (existing) continue;
    return {
      username: candidate,
      adjusted: explicitUsername ? candidate !== explicitUsername : suffix > 0,
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
  const rowErrors: string[] = [];
  const plannedRows: Array<{
    rowNumber: number;
    firstName: string;
    lastName: string;
    username: string;
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
  const usedUsernames = new Set<string>();
  const existingTeamUsers = await db.user.findMany({
    where: { teamId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      phone: true,
    },
  });
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

    const resolved = await resolveUsername(row, usedUsernames);
    if (!resolved.username) {
      rowErrors.push(`Row ${row.rowNumber}: ${resolved.error ?? "Unable to determine username."}`);
      continue;
    }

    usedUsernames.add(resolved.username);
      plannedRows.push({
        rowNumber: row.rowNumber,
        firstName,
        lastName,
        username: resolved.username,
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

  const passwordHash = await bcrypt.hash(payload.password.trim(), 10);

  try {
    const created = await db.$transaction(async (tx) => {
      const createdUsers: Array<{
        rowNumber: number;
        id: string;
        username: string;
        email: string;
        name: string | null;
      }> = [];
      for (const row of plannedRows) {
        const createdUser = await tx.user.create({
          data: {
            username: row.username,
            email: row.email,
            phone: row.phone,
            name: `${row.firstName} ${row.lastName}`,
            role: "PARENT",
            teamId,
            passwordHash,
            mustResetPassword: true,
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
