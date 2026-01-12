import crypto from "crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const CreateSchema = z.object({
  username: z.string().trim().min(6),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal("")),
  name: z.string().optional(),
  role: z.enum(["ADMIN", "COACH", "PARENT", "TABLE_WORKER"]).default("COACH"),
  teamId: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const querySchema = z.object({
    q: z.string().trim().optional().default(""),
    teamId: z.string().trim().optional().default(""),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(200).default(50),
  });
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    teamId: searchParams.get("teamId") ?? "",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "50",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }
  const { q, page, pageSize, teamId } = parsed.data;
  const where = {
    ...(teamId ? { teamId } : {}),
    ...(q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total, adminCount] = await Promise.all([
    db.user.findMany({
      where,
      select: { id: true, username: true, email: true, phone: true, name: true, role: true, teamId: true, lastLoginAt: true },
      orderBy: { username: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
    db.user.count({ where: { role: "ADMIN" } }),
  ]);

  return NextResponse.json({ items, total, page, pageSize, adminCount });
}

export async function POST(req: Request) {
  await requireAdmin();
  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const email = body.email.trim().toLowerCase();
  const phone = body.phone ? body.phone.trim() : "";
  if (body.role === "ADMIN" && body.teamId) {
    return NextResponse.json({ error: "Admins cannot be assigned a team" }, { status: 400 });
  }
  if (body.role === "COACH" && !body.teamId) {
    return NextResponse.json({ error: "Coaches must be assigned a team" }, { status: 400 });
  }
  if ((body.role === "PARENT" || body.role === "TABLE_WORKER") && !body.teamId) {
    return NextResponse.json({ error: "Parents and table workers must be assigned a team" }, { status: 400 });
  }
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const user = await db.user.create({
    data: {
      username: body.username.toLowerCase(),
      email,
      phone: phone === "" ? "" : phone,
      name: body.name,
      passwordHash,
      role: body.role,
      ...(body.role === "ADMIN"
        ? {}
        : body.teamId
          ? { team: { connect: { id: body.teamId } } }
          : {}),
      mustResetPassword: true,
    },
    select: { id: true, username: true, email: true, name: true, role: true, teamId: true, lastLoginAt: true },
  });
  try {
    const team = body.teamId
      ? await db.team.findUnique({ where: { id: body.teamId }, select: { name: true, symbol: true } })
      : null;
    await sendWelcomeEmail(req, {
      email,
      username: user.username,
      tempPassword,
      teamLabel: team ? `${team.name} (${team.symbol ?? ""})`.trim() : null,
    });
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "User created, but the welcome email could not be sent." }, { status: 201 });
    }
  }
  return NextResponse.json(user);
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
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
  const leagueName = league?.name?.trim() || "the league";
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
