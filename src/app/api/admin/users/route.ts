import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const UserRoleSchema = z.enum(["ADMIN", "COACH", "PARENT", "TABLE_WORKER"]);

const CreateSchema = z.object({
  username: z.string().trim().min(6),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(120),
  role: UserRoleSchema.default("COACH"),
  teamId: z.string().nullable().optional(),
  password: z.string().min(1),
});

type SearchUserRow = {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  name: string | null;
  role: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
  teamId: string | null;
  lastLoginAt: Date | null;
};

function normalizeFuzzyText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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

  const fields = [user.username, user.email, user.name ?? "", user.phone ?? ""];
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

  const combined = `${user.username} ${user.email} ${user.name ?? ""} ${user.phone ?? ""}`.trim();
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
      select: { id: true, username: true, email: true, phone: true, name: true, role: true, teamId: true, lastLoginAt: true },
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
  const items = filtered.slice(pageStart, pageStart + pageSize);

  return NextResponse.json({ items, total, page, pageSize, adminCount });
}

export async function POST(req: Request) {
  await requireAdmin();
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
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
  const user = await db.user.create({
    data: {
      username: body.username.toLowerCase(),
      email,
      phone: phone === "" ? "" : phone,
      name: body.name,
      passwordHash,
      role: body.role,
      ...(body.teamId ? { team: { connect: { id: body.teamId } } } : {}),
      mustResetPassword: true,
    },
    select: { id: true, username: true, email: true, name: true, role: true, teamId: true, lastLoginAt: true },
  });
  if (email) {
    try {
      const team = body.teamId
        ? await db.team.findUnique({ where: { id: body.teamId }, select: { name: true, symbol: true } })
        : null;
      await sendWelcomeEmail(req, {
        email,
        username: user.username,
        tempPassword,
        teamLabel: team ? `${team.name} (${team.symbol})`.trim() : null,
      });
    } catch {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "User created, but the welcome email could not be sent." }, { status: 201 });
      }
    }
  }
  return NextResponse.json(user);
}

async function sendWelcomeEmail(
  req: Request,
  {
    email,
    username,
    tempPassword,
    teamLabel,
  }: { email: string; username: string; tempPassword: string; teamLabel: string | null },
) {
  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const link = `${origin}/auth/signin`;
  const league = await db.league.findFirst({ select: { name: true } });
  const leagueName = league?.name?.trim() ?? "the league";
  const teamLine = teamLabel ? `Team: ${teamLabel}\n` : "";
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Temp password for ${email} (${username}): ${tempPassword}`);
      return;
    }
    throw new Error("WELCOME_DELIVERY_FAILED");
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(key);
  await sgMail.default.send({
    to: email,
    from,
    subject: `Welcome to ${leagueName}`,
    text: `Welcome! Your account has been created.\n\nUsername: ${username}\nTemporary password: ${tempPassword}\n${teamLine}\nSign in here: ${link}\nYou will be prompted to reset your password after signing in.`,
  });
}
