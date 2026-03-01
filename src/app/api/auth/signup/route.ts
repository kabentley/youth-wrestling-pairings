import crypto from "crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const BodySchema = z.object({
  username: z.string().trim().min(6).max(32),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal("")),
  teamId: z.string().trim().min(1),
  name: z.string().trim().max(100).optional(),
  password: z.string().min(8).max(100).regex(/[^A-Za-z0-9]/, "Password must include a symbol."),
});

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUsername = (searchParams.get("username") ?? "").trim();

  if (!rawUsername) {
    return NextResponse.json({ available: null });
  }
  if (rawUsername.includes("@")) {
    return NextResponse.json({ available: false, reason: "Username cannot include @." });
  }
  if (rawUsername.length < 6 || rawUsername.length > 32) {
    return NextResponse.json({ available: false, reason: "Username must be 6-32 characters." });
  }

  const username = normalizeUsername(rawUsername);
  if (username.startsWith("oauth-")) {
    return NextResponse.json({ available: false, reason: "Choose a different username." });
  }

  const existing = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });

  return NextResponse.json({ available: !existing });
}

function normalizeNullableString(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const username = normalizeUsername(body.username);
  const email = body.email.trim().toLowerCase();
  const phone = body.phone ? body.phone.trim() : "";
  const teamId = body.teamId.trim();
  const normalizedName = normalizeNullableString(body.name);

  const existing = await db.user.findUnique({
    where: { username },
    select: { id: true, email: true, emailVerified: true },
  });
  if (existing) {
    const sameEmail = existing.email.trim().toLowerCase() === email;
    if (sameEmail && !existing.emailVerified) {
      const passwordHash = await bcrypt.hash(body.password, 10);
      await db.user.update({
        where: { id: existing.id },
        data: {
          email,
          phone: phone === "" ? "" : phone,
          teamId,
      name: normalizedName,
          passwordHash,
          role: "PARENT",
        },
      });
      await sendVerificationEmail(req, email);
      return NextResponse.json({ ok: true, reused: true });
    }
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }
  const team = await db.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  const passwordHash = await bcrypt.hash(body.password, 10);
  try {
    await db.user.create({
      data: {
        username,
        email,
        phone: phone === "" ? "" : phone,
        teamId,
        name: normalizedName,
        passwordHash,
        role: "PARENT",
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    throw err;
  }

  await sendVerificationEmail(req, email);

  return NextResponse.json({ ok: true });
}

async function sendVerificationEmail(req: Request, email: string) {
  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await db.verificationToken.deleteMany({ where: { identifier: email } });
  await db.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  const link = `${origin}/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Verify email link for ${email}: ${link}`);
      return;
    }
    return;
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(key);
  await sgMail.default.send({
    to: email,
    from,
    subject: "Verify your email",
    text: `Verify your email address by visiting: ${link}`,
  });
}
