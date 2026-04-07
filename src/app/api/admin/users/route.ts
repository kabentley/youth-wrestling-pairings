import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { extractLastNameCandidates, lastNameSimilarity, normalizeSurnameToken } from "@/lib/surnameMatching";
import {
  buildFullName,
  getUserFullName,
  LAST_NAME_SUFFIX_VALIDATION_MESSAGE,
  lastNameHasDisallowedSuffix,
  resolveStoredUserName,
} from "@/lib/userName";
import { describeWelcomeEmailResult, sendWelcomeEmail } from "@/lib/welcomeEmail";

const UserRoleSchema = z.enum(["ADMIN", "COACH", "PARENT", "TABLE_WORKER"]);

const CreateSchema = z.object({
  username: z.string().trim().min(6),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal("")),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  role: UserRoleSchema.default("COACH"),
  teamId: z.string().nullable().optional(),
  password: z.string().min(1),
}).superRefine((value, ctx) => {
  if (!value.firstName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["firstName"],
      message: "First name is required.",
    });
  }
  if (!value.lastName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastName"],
      message: "Last name is required.",
    });
  }
  if (value.lastName && lastNameHasDisallowedSuffix(value.lastName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastName"],
      message: LAST_NAME_SUFFIX_VALIDATION_MESSAGE,
    });
  }
});

type SearchUserRow = {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
  teamId: string | null;
  lastLoginAt: Date | null;
};

const LAST_NAME_MATCH_THRESHOLD = 0.88;

function normalizeFuzzyText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function findAutoLinkedWrestlers(teamId: string, fullName: string) {
  const candidates = extractLastNameCandidates(fullName);
  if (candidates.length === 0) return [] as Array<{ id: string; fullName: string }>;
  const wrestlers = await db.wrestler.findMany({
    where: { teamId, active: true },
    select: { id: true, first: true, last: true },
    orderBy: [{ last: "asc" }, { first: "asc" }],
  });
  return wrestlers
    .filter((wrestler) => {
      const wrestlerLast = normalizeSurnameToken(wrestler.last);
      if (!wrestlerLast) return false;
      const score = candidates.reduce((best, candidate) => {
        const next = lastNameSimilarity(candidate, wrestlerLast);
        return next > best ? next : best;
      }, 0);
      return score >= LAST_NAME_MATCH_THRESHOLD;
    })
    .map((wrestler) => ({
      id: wrestler.id,
      fullName: `${wrestler.first} ${wrestler.last}`.trim(),
    }));
}

function fuzzyMatch(haystackRaw: string, queryRaw: string) {
  const haystack = normalizeFuzzyText(haystackRaw);
  const query = normalizeFuzzyText(queryRaw);
  if (!query) return true;
  if (!haystack) return false;
  if (haystack.includes(query)) return true;
  let queryIndex = 0;
  for (let i = 0; i < haystack.length && queryIndex < query.length; i += 1) {
    if (haystack[i] === query[queryIndex]) queryIndex += 1;
  }
  return queryIndex === query.length;
}

function fuzzyFieldScore(fieldRaw: string | null | undefined, tokenRaw: string) {
  const field = normalizeFuzzyText(fieldRaw ?? "");
  const token = normalizeFuzzyText(tokenRaw);
  if (!field || !token) return 0;
  if (field === token) return 120;
  if (field.startsWith(token)) return 90;
  if (field.includes(token)) return 65;
  if (fuzzyMatch(field, token)) return 35;
  return 0;
}

function fuzzyUserScore(user: SearchUserRow, queryRaw: string) {
  const query = queryRaw.trim();
  if (!query) return 1;
  const tokens = query.split(/\s+/).map(normalizeFuzzyText).filter(Boolean);
  if (tokens.length === 0) return 1;

  const fullName = getUserFullName(user) ?? "";
  const fields = [user.username, user.email, fullName, user.firstName ?? "", user.lastName ?? "", user.phone ?? ""];
  let score = 0;
  for (const token of tokens) {
    let bestForToken = 0;
    for (const field of fields) {
      const fieldScore = fuzzyFieldScore(field, token);
      if (fieldScore > bestForToken) {
        bestForToken = fieldScore;
      }
    }
    if (bestForToken === 0) return 0;
    score += bestForToken;
  }

  const combined = `${user.username} ${user.email} ${fullName} ${user.firstName ?? ""} ${user.lastName ?? ""} ${user.phone ?? ""}`.trim();
  if (fuzzyMatch(combined, query)) {
    score += 20;
  }
  return score;
}

export async function GET(req: Request) {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const querySchema = z.object({
    q: z.string().trim().optional().default(""),
    teamId: z.string().trim().optional().default(""),
    role: z.union([z.literal(""), UserRoleSchema]).optional().default(""),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(200).default(25),
  });
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    teamId: searchParams.get("teamId") ?? "",
    role: searchParams.get("role") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "25",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }
  const { q, page, pageSize, teamId, role } = parsed.data;
  const where = {
    ...(teamId ? { teamId } : {}),
    ...(role ? { role } : {}),
  };

  const [allUsers, adminCount] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        teamId: true,
        lastLoginAt: true,
      },
      orderBy: { username: "asc" },
    }) as Promise<SearchUserRow[]>,
    db.user.count({ where: { role: "ADMIN" } }),
  ]);

  const filtered = q.trim().length === 0
    ? allUsers
    : allUsers
      .map((user) => ({ user, score: fuzzyUserScore(user, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.user.username.localeCompare(b.user.username);
      })
      .map((row) => row.user);

  const total = filtered.length;
  const pageStart = (page - 1) * pageSize;
  const items = filtered
    .slice(pageStart, pageStart + pageSize)
    .map((user) => ({
      ...user,
      name: getUserFullName(user),
    }));

  return NextResponse.json({ items, total, page, pageSize, adminCount });
}

export async function POST(req: Request) {
  await requireAdmin();
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const resolvedName = resolveStoredUserName({
    firstName: body.firstName,
    lastName: body.lastName,
  });
  const email = body.email ? body.email.trim().toLowerCase() : "";
  const phone = body.phone ? body.phone.trim() : "";
  if (body.role === "COACH" && !body.teamId) {
    return NextResponse.json({ error: "Coaches must be assigned a team" }, { status: 400 });
  }
  if ((body.role === "PARENT" || body.role === "TABLE_WORKER") && !body.teamId) {
    return NextResponse.json({ error: "Parents and table workers must be assigned a team" }, { status: 400 });
  }
  const tempPassword = body.password.trim();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const autoLinkedWrestlers =
    body.role === "PARENT" && body.teamId
      ? await findAutoLinkedWrestlers(body.teamId, buildFullName(resolvedName.firstName, resolvedName.lastName) ?? "")
      : [];
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username: body.username.toLowerCase(),
        email,
        phone: phone === "" ? "" : phone,
        firstName: resolvedName.firstName,
        lastName: resolvedName.lastName,
        passwordHash,
        role: body.role,
        emailVerified: new Date(),
        ...(body.teamId ? { team: { connect: { id: body.teamId } } } : {}),
        mustResetPassword: true,
      },
      select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true, teamId: true, lastLoginAt: true },
    });
    if (autoLinkedWrestlers.length > 0) {
      await tx.userChild.createMany({
        data: autoLinkedWrestlers.map((wrestler) => ({
          userId: created.id,
          wrestlerId: wrestler.id,
        })),
      });
    }
    return created;
  });
  let welcomeEmailStatus: "not_applicable" | "sent" | "skipped" | "logged" | "failed" = "not_applicable";
  let welcomeEmailNote: string | null = email
    ? null
    : "User created without an email address. No welcome email was sent.";
  if (email) {
    try {
      const team = body.teamId
        ? await db.team.findUnique({ where: { id: body.teamId }, select: { name: true, symbol: true } })
        : null;
      const welcomeResult = await sendWelcomeEmail({
        request: req,
        email,
        username: user.username,
        fullName: resolvedName.fullName,
        userId: user.id,
        tempPassword,
        teamId: body.teamId ?? null,
        teamName: team?.name ?? null,
        teamLabel: team ? `${team.name} (${team.symbol})`.trim() : null,
        linkedWrestlerNames: autoLinkedWrestlers.map((wrestler) => wrestler.fullName),
      });
      welcomeEmailStatus = welcomeResult.status;
      welcomeEmailNote = describeWelcomeEmailResult(welcomeResult);
    } catch (error) {
      console.error("Failed to send admin-created welcome email", error);
      welcomeEmailStatus = "failed";
      welcomeEmailNote = "Welcome email could not be sent.";
    }
  }
  return NextResponse.json({
    ...user,
    name: getUserFullName(user),
    welcomeEmailStatus,
    welcomeEmailNote,
  });
}
