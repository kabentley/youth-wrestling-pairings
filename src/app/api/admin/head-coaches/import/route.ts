import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { describeWelcomeEmailResult, sendWelcomeEmail } from "@/lib/welcomeEmail";

export const runtime = "nodejs";

const ImportRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  team: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  username: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  password: z.string().optional().default(""),
});

const ImportSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(500),
  sharedPassword: z.string().optional().default(""),
});

const MIN_USERNAME_LEN = 6;
const MAX_USERNAME_LEN = 32;

type TeamLookupRow = {
  id: string;
  name: string;
  symbol: string;
};

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeUsernameToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildGeneratedUsernameBase(firstName: string, lastName: string) {
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
}

function withUsernameSuffix(base: string, suffix: number) {
  if (suffix <= 0) return base;
  const suffixText = String(suffix);
  const maxBaseLen = Math.max(1, MAX_USERNAME_LEN - suffixText.length);
  return `${base.slice(0, maxBaseLen)}${suffixText}`;
}

function generateTemporaryPassword() {
  const digits = "0123456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

async function nextAvailableUsername(firstName: string, lastName: string) {
  const base = buildGeneratedUsernameBase(firstName, lastName);
  if (!base) {
    return "";
  }
  for (let suffix = 0; suffix <= 500; suffix += 1) {
    const candidate = withUsernameSuffix(base, suffix);
    const existing = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }
  return `${base.slice(0, Math.max(1, MAX_USERNAME_LEN - 3))}${Date.now() % 1000}`;
}

function buildTeamLookup(teams: TeamLookupRow[]) {
  const lookup = new Map<string, TeamLookupRow>();
  for (const team of teams) {
    const keys = [
      team.symbol,
      team.name,
      `${team.symbol} - ${team.name}`,
      `${team.symbol}-${team.name}`,
    ];
    for (const key of keys) {
      const normalized = normalizeLookupKey(key);
      if (normalized) {
        lookup.set(normalized, team);
      }
    }
  }
  return lookup;
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = ImportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid head coach import file." }, { status: 400 });
  }

  const { rows, sharedPassword } = parsed.data;
  const teams = await db.team.findMany({
    orderBy: [{ symbol: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      symbol: true,
    },
  });
  const teamLookup = buildTeamLookup(teams);
  const seenTeamIds = new Set<string>();
  const league = await db.league.findFirst({
    select: { name: true },
  });
  const leagueName = league?.name?.trim() ?? null;

  const results: Array<{
    rowNumber: number;
    team: string;
    coachName: string;
    email: string | null;
    username: string | null;
    temporaryPassword: string | null;
    status: "created" | "existing" | "error";
    note: string;
  }> = [];

  let createdCount = 0;
  let assignedExistingCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const team = teamLookup.get(normalizeLookupKey(row.team));
    const coachName = `${row.firstName} ${row.lastName}`.trim();

    if (!team) {
      results.push({
        rowNumber: row.rowNumber,
        team: row.team,
        coachName,
        email: row.email.trim().toLowerCase() || null,
        username: null,
        temporaryPassword: null,
        status: "error",
        note: "Team not found.",
      });
      errorCount += 1;
      continue;
    }

    if (seenTeamIds.has(team.id)) {
      results.push({
        rowNumber: row.rowNumber,
        team: team.symbol,
        coachName,
        email: row.email.trim().toLowerCase() || null,
        username: row.username || null,
        temporaryPassword: null,
        status: "error",
        note: "Team appears more than once in this import.",
      });
      errorCount += 1;
      continue;
    }
    seenTeamIds.add(team.id);

    const providedUsername = row.username.trim().toLowerCase();
    const resolvedUsername = providedUsername || await nextAvailableUsername(row.firstName, row.lastName);
    if (!resolvedUsername) {
      results.push({
        rowNumber: row.rowNumber,
        team: team.symbol,
        coachName,
        email: row.email.trim().toLowerCase() || null,
        username: null,
        temporaryPassword: null,
        status: "error",
        note: "Unable to generate a username for this coach.",
      });
      errorCount += 1;
      continue;
    }

    const providedPassword = row.password.trim();
    const tempPassword = providedPassword || sharedPassword.trim() || generateTemporaryPassword();

    try {
      const outcome = await db.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { username: resolvedUsername },
          select: {
            id: true,
            role: true,
          },
        });

        if (existingUser && existingUser.role !== "COACH") {
          throw new Error("USERNAME_NOT_COACH");
        }

        let userId = existingUser?.id ?? "";
        let created = false;

        if (existingUser) {
          const nextEmail = row.email.trim().toLowerCase();
          const nextPhone = row.phone.trim();
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: coachName,
              email: nextEmail || undefined,
              phone: nextPhone || undefined,
              teamId: team.id,
            },
          });
        } else {
          const passwordHash = await bcrypt.hash(tempPassword, 10);
          const createdUser = await tx.user.create({
            data: {
              username: resolvedUsername,
              name: coachName,
              email: row.email.trim().toLowerCase(),
              phone: row.phone.trim(),
              role: "COACH",
              teamId: team.id,
              passwordHash,
              emailVerified: new Date(),
              mustResetPassword: true,
            },
            select: { id: true },
          });
          userId = createdUser.id;
          created = true;
        }

        const existingHeadCoachTeam = await tx.team.findFirst({
          where: {
            headCoachId: userId,
            id: { not: team.id },
          },
          select: { id: true },
        });
        if (existingHeadCoachTeam) {
          await tx.team.update({
            where: { id: existingHeadCoachTeam.id },
            data: { headCoachId: null },
          });
        }

        await tx.team.update({
          where: { id: team.id },
          data: { headCoachId: userId },
        });

        return { created, userId };
      });

      let note = outcome.created
        ? "Created account and assigned as head coach."
        : "Assigned existing coach account as head coach.";

      if (outcome.created && row.email.trim()) {
        try {
          const welcomeResult = await sendWelcomeEmail({
            request: req,
            email: row.email.trim().toLowerCase(),
            username: resolvedUsername,
            userId: outcome.userId,
            tempPassword,
            teamId: team.id,
            teamName: team.name,
            teamLabel: `${team.name} (${team.symbol})`,
            leagueName,
          });
          note = `${note} ${describeWelcomeEmailResult(welcomeResult)}`;
        } catch {
          note = `${note} Welcome email could not be sent.`;
        }
      }

      results.push({
        rowNumber: row.rowNumber,
        team: team.symbol,
        coachName,
        email: row.email.trim().toLowerCase() || null,
        username: resolvedUsername,
        temporaryPassword: outcome.created ? tempPassword : null,
        status: outcome.created ? "created" : "existing",
        note,
      });
      if (outcome.created) {
        createdCount += 1;
      } else {
        assignedExistingCount += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      results.push({
        rowNumber: row.rowNumber,
        team: team.symbol,
        coachName,
        email: row.email.trim().toLowerCase() || null,
        username: resolvedUsername,
        temporaryPassword: null,
        status: "error",
        note: message === "USERNAME_NOT_COACH"
          ? "Username already belongs to a non-coach account."
          : "Unable to import this row.",
      });
      errorCount += 1;
    }
  }

  return NextResponse.json({
    summary: {
      created: createdCount,
      assignedExisting: assignedExistingCount,
      errors: errorCount,
    },
    results,
  });
}
