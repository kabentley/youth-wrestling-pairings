import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { LAST_NAME_SUFFIX_VALIDATION_MESSAGE, lastNameHasDisallowedSuffix, resolveStoredUserName } from "@/lib/userName";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";

const BodySchema = z.object({
  username: z.string().trim().min(6).max(32),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional().or(z.literal("")),
  teamId: z.string().trim().min(1),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  password: z.string().min(8).max(100).regex(/[^A-Za-z0-9]/, "Password must include a symbol."),
}).superRefine((value, ctx) => {
  if (lastNameHasDisallowedSuffix(value.lastName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastName"],
      message: LAST_NAME_SUFFIX_VALIDATION_MESSAGE,
    });
  }
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
  const existing = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });

  return NextResponse.json({ available: !existing });
}

export async function POST(req: Request) {
  const league = await db.league.findFirst({
    select: { allowParentSelfSignup: true },
  });
  if (!league?.allowParentSelfSignup) {
    return NextResponse.json({ error: "Parent self-signup is disabled." }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const username = normalizeUsername(body.username);
  const email = body.email.trim().toLowerCase();
  const phone = body.phone ? body.phone.trim() : "";
  const teamId = body.teamId.trim();
  const resolvedName = resolveStoredUserName({
    firstName: body.firstName,
    lastName: body.lastName,
  });
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, symbol: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

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
          firstName: resolvedName.firstName,
          lastName: resolvedName.lastName,
          passwordHash,
          emailVerified: new Date(),
          role: "PARENT",
        },
      });
      try {
        await sendWelcomeEmail({
          request: req,
          email,
          username,
          fullName: resolvedName.fullName,
          userId: existing.id,
          teamId,
          teamName: team.name,
          teamLabel: `${team.name} (${team.symbol})`,
          mustResetPassword: false,
        });
      } catch (error) {
        console.error("Failed to send self-signup welcome email", error);
      }
      return NextResponse.json({ ok: true, reused: true });
    }
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(body.password, 10);
  let createdUserId = "";
  try {
    const createdUser = await db.user.create({
      data: {
        username,
        email,
        phone: phone === "" ? "" : phone,
        teamId,
        firstName: resolvedName.firstName,
        lastName: resolvedName.lastName,
        passwordHash,
        emailVerified: new Date(),
        role: "PARENT",
      },
      select: { id: true },
    });
    createdUserId = createdUser.id;
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    throw err;
  }

  try {
    await sendWelcomeEmail({
      request: req,
      email,
      username,
      fullName: resolvedName.fullName,
      userId: createdUserId,
      teamId,
      teamName: team.name,
      teamLabel: `${team.name} (${team.symbol})`,
      mustResetPassword: false,
    });
  } catch (error) {
    console.error("Failed to send self-signup welcome email", error);
  }

  return NextResponse.json({ ok: true });
}
